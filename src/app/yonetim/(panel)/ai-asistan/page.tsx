import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getSettingsFresh } from "@/lib/settings";
import { approveSuggestion, generateSuggestion } from "@/lib/ai/service";
import { claudeAvailable } from "@/lib/ai/claude";
import { loadAiKey } from "@/lib/ai/key";
import { AI_KINDS, type AiKind, type AiOutput } from "@/lib/ai/types";
import { Badge, Card, Notice, PageTitle, fmtDate, inputCls } from "@/components/admin/ui";

export const metadata = { title: "AI Asistanı" };

async function generate(form: FormData) {
  "use server";
  const user = await requireUser("seo");
  const kind = String(form.get("kind")) as AiKind;
  if (!(kind in AI_KINDS)) redirect("/yonetim/ai-asistan");
  let id: string;
  try {
    const s = await generateSuggestion(user, kind, String(form.get("pageId") || "") || null);
    id = s.id;
    await audit(user.id, "ai.generate", "AiSuggestion", s.id, { kind, provider: s.provider });
  } catch (e) {
    redirect(`/yonetim/ai-asistan?hata=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(kind === "fix" ? `/yonetim/ai-asistan/${id}` : `/yonetim/ai-asistan?id=${id}`);
}

async function review(form: FormData) {
  "use server";
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const decision = String(form.get("decision"));
  try {
    if (decision === "approve") await approveSuggestion(user, id, Number(form.get("option") ?? 0));
    else await db.aiSuggestion.update({ where: { id }, data: { status: "REJECTED", reviewedBy: user.name, reviewedAt: new Date() } });
    await audit(user.id, `ai.${decision}`, "AiSuggestion", id);
  } catch (e) {
    redirect(`/yonetim/ai-asistan?id=${id}&hata=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/yonetim/ai-asistan?id=${id}&sonuc=${decision}`);
}

function Output({ o, id, pending }: { o: AiOutput; id: string; pending: boolean }) {
  switch (o.kind) {
    case "fix":
      return <p className="text-[13px]">Bu bir ÇÖZÜM ÖNER kaydı. <Link href={`/yonetim/ai-asistan/${id}`} className="underline">MEVCUT / ÖNERİLEN karşılaştırmasını açın</Link>.</p>;
    case "draft":
      return (
        <div className="space-y-3 text-[13px]">
          <p><b>Title:</b> {o.data.seoTitle} <span className="text-xs text-muted">({o.data.seoTitle.length})</span></p>
          <p><b>Meta:</b> {o.data.metaDescription} <span className="text-xs text-muted">({o.data.metaDescription.length})</span></p>
          <p><b>H1:</b> {o.data.h1}</p>
          <p className="rounded-lg bg-paper p-3">{o.data.intro}</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-xs">{o.data.body}</pre>
          <p><b>SSS:</b> {o.data.faq.map((f) => f.q).join(" · ")}</p>
          <Notice tone="warn"><b>Yayından önce doğrulanacaklar:</b> {o.data.verifyNotes.join(" · ") || "—"} — metindeki [DOĞRULANMALI] işaretleri temizlenmeden sayfa yayına hazır sayılmaz.</Notice>
          {pending && <form action={review}><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="approve" /><button className="rounded-full bg-ink px-3 py-1 text-xs text-paper">Taslağı sayfaya yaz (sayfa taslak kalır)</button></form>}
        </div>
      );
    case "meta":
      return (
        <div className="space-y-3">
          {o.data.options.map((opt, i) => (
            <div key={i} className="rounded-xl border border-line p-3">
              <p className="font-semibold">{opt.seoTitle} <span className="text-xs text-muted">({opt.seoTitle.length})</span></p>
              <p className="text-[13px]">{opt.metaDescription} <span className="text-xs text-muted">({opt.metaDescription.length})</span></p>
              <p className="text-[13px]">H1: {opt.h1}</p>
              <p className="mt-1 text-xs text-muted">{opt.rationale}</p>
              {pending && (
                <form action={review} className="mt-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="approve" /><input type="hidden" name="option" value={i} />
                  <button className="rounded-full bg-ink px-3 py-1 text-xs text-paper">Bu seçeneği sayfaya uygula</button></form>
              )}
            </div>
          ))}
        </div>
      );
    case "brief":
      return (
        <div className="space-y-3 text-[13px]">
          <p><b>Arama niyeti:</b> {o.data.searchIntent}</p>
          <p><b>Hedef kitle:</b> {o.data.audience}</p>
          <ol className="list-decimal pl-5">{o.data.outline.map((s) => <li key={s.h2}><b>{s.h2}</b><ul className="list-disc pl-5 text-muted">{s.points.map((p) => <li key={p}>{p}</li>)}</ul></li>)}</ol>
          <p><b>SSS:</b> {o.data.faq.join(" · ")}</p>
          <Notice tone="warn"><b>Yazarın doğrulaması gerekenler:</b> {o.data.mustVerify.join(" · ")}</Notice>
          <p className="text-muted"><b>Kaçının:</b> {o.data.avoid.join(" · ")}</p>
        </div>
      );
    case "improve":
      return <ul className="space-y-2 text-[13px]">{o.data.suggestions.map((s, i) => <li key={i}><Badge tone={s.priority === "yüksek" ? "bad" : s.priority === "orta" ? "warn" : "muted"}>{s.priority}</Badge> <b>{s.area}:</b> {s.problem} → {s.suggestion}</li>)}</ul>;
    case "links":
      return <ul className="space-y-1 text-[13px]">{o.data.links.map((l) => <li key={l.source}>{l.source} → “{l.anchor}” <span className="text-muted">({l.reasons.join(", ")})</span></li>)}{!o.data.links.length && <li className="text-muted">Uygun kaynak sayfa bulunamadı.</li>}</ul>;
    case "clustering":
      return <div className="space-y-2 text-[13px]">{o.data.clusters.map((c) => <div key={c.name} className="rounded-xl border border-line p-3"><p className="font-semibold">{c.name} <span className="text-xs text-muted">· {c.intent} · {c.suggestedPath}</span></p><p>{c.keywords.join(", ")}</p><p className="text-xs text-muted">{c.note}</p></div>)}</div>;
  }
}

export default async function AiAssistant(props: PageProps<"/yonetim/ai-asistan">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const [settings, pages, suggestions] = await Promise.all([
    getSettingsFresh(),
    db.page.findMany({ where: { OR: [{ status: "PUBLISHED" }, { body: { not: null } }] }, orderBy: { path: "asc" }, select: { id: true, path: true } }),
    db.aiSuggestion.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { page: { select: { path: true, id: true } } } }),
  ]);
  const sel = suggestions.find((s) => s.id === sp.id) ?? null;
  await loadAiKey();
  const claude = settings.integrations.aiProvider === "anthropic" && claudeAvailable();
  return (
    <>
      <PageTitle title="AI SEO Asistanı" desc="Öneriler hiçbir zaman otomatik yayınlanmaz: her öneri “Onay bekliyor” olarak kaydedilir; title/meta/H1 önerisi onaylanınca sürüm ve değişiklik loguyla sayfaya uygulanır." />
      <div className="mb-4">
        <Notice tone={claude ? "ok" : "info"}>
          {claude
            ? `Sağlayıcı: Anthropic Claude (${settings.integrations.aiModel}). Reddedilen isteklerde sunucu tarafı yedek model devrede.`
            : "Yapay zekâ sağlayıcısı kapalı veya ANTHROPIC_API_KEY tanımlı değil — öneriler kural tabanlı üretilir (şablon ve kontrol listesi). Ayarlar > SEO Entegrasyonları'ndan açabilirsiniz."}
        </Notice>
      </div>
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      {sp.sonuc === "approve" && <div className="mb-4"><Notice tone="ok">Onaylandı{sel?.kind === "meta" ? " ve sayfaya uygulandı" : ""}.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card title="Öneri üret">
            <form action={generate} className="space-y-2">
              <select name="kind" defaultValue={typeof sp.tur === "string" ? sp.tur : "meta"} className={inputCls}>{Object.entries(AI_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select name="pageId" defaultValue={typeof sp.sayfa === "string" ? sp.sayfa : ""} className={inputCls}>
                <option value="">Sayfa (kümeleme için gerekmez)</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.path}</option>)}
              </select>
              <button className="rounded-full bg-ink px-4 py-2 text-paper">Üret</button>
            </form>
          </Card>
          <Card title="Geçmiş">
            <ul className="space-y-1.5 text-[13px]">
              {suggestions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`?id=${s.id}`} className={s.id === sel?.id ? "font-semibold" : "underline"}>{AI_KINDS[s.kind as AiKind]} · {s.page?.path ?? "site"}</Link>
                  <Badge tone={s.status === "PENDING" ? "warn" : s.status === "APPROVED" ? "ok" : "muted"}>{s.status === "PENDING" ? "Onay bekliyor" : s.status === "APPROVED" ? "Onaylandı" : "Reddedildi"}</Badge>
                </li>
              ))}
              {!suggestions.length && <li className="text-muted">Henüz öneri yok.</li>}
            </ul>
          </Card>
        </div>
        {sel && (
          <Card title={`${AI_KINDS[sel.kind as AiKind]} · ${sel.page?.path ?? "site geneli"}`} actions={<span className="text-xs text-muted">{sel.provider} · {fmtDate(sel.createdAt, true)} · {sel.createdBy}</span>}>
            <Output o={sel.output as unknown as AiOutput} id={sel.id} pending={sel.status === "PENDING"} />
            {sel.status === "PENDING" && (
              <div className="mt-4 flex gap-2">
                {sel.kind !== "meta" && sel.kind !== "draft" && <form action={review}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="decision" value="approve" /><button className="rounded-full bg-ink px-4 py-2 text-paper">Kabul et</button></form>}
                <form action={review}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="decision" value="reject" /><button className="rounded-full border border-line px-4 py-2">Reddet</button></form>
              </div>
            )}
            {sel.status !== "PENDING" && <p className="mt-4 text-xs text-muted">{sel.status === "APPROVED" ? "Onaylayan" : "Reddeden"}: {sel.reviewedBy} · {fmtDate(sel.reviewedAt, true)}</p>}
          </Card>
        )}
      </div>
    </>
  );
}
