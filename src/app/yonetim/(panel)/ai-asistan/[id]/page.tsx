import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { siteUrl } from "@/lib/env";
import type { AiOutput } from "@/lib/ai/types";
import { Badge, Card, Notice, PageTitle, fmtDate } from "@/components/admin/ui";
import { FixReview } from "@/components/admin/FixReview";
import { rejectFixAction, rollbackFixAction } from "../fix-actions";

export const metadata = { title: "Çözüm önerisi" };

export default async function FixDetail(props: PageProps<"/yonetim/ai-asistan/[id]">) {
  await requireUser("seo");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const s = await db.aiSuggestion.findUnique({ where: { id }, include: { page: { select: { id: true, path: true } } } });
  if (!s || s.kind !== "fix" || !s.page) notFound();
  const out = s.output as unknown as Extract<AiOutput, { kind: "fix" }>;
  const input = s.input as { focusQuery?: string | null; category?: string | null; queries?: number | string };
  const d = out.data;
  const pending = s.status === "PENDING";
  return (
    <>
      <PageTitle
        title={`Çözüm önerisi — ${s.page.path}`}
        desc={<span>{input.focusQuery ? <>Odak sorgu: <b>“{input.focusQuery}”</b> · </> : null}Kaynak: {s.provider === "kural" ? "kural tabanlı (sayfa + analiz + Search Console verisi)" : s.provider} · Search Console sorgusu: {input.queries === "veri yok" ? "Henüz veri yok" : input.queries} · {fmtDate(s.createdAt, true)}</span>}
        actions={<div className="flex gap-2"><Link href={`/yonetim/sayfalar/${s.page.id}`} className="rounded-full border border-line px-4 py-2">Sayfayı aç</Link><Link href="/yonetim/ai-asistan" className="rounded-full border border-line px-4 py-2">← Öneriler</Link></div>}
      />
      {sp.uygulandi && <div className="mb-4"><Notice tone="ok">Uygulandı; değişiklik sürüm geçmişine ve SEO değişiklik loguna kaydedildi.</Notice></div>}
      {sp.geri && <div className="mb-4"><Notice tone="ok">Geri alındı: sayfa öneri uygulanmadan önceki sürüme döndürüldü (yeni sürüm olarak).</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="mb-4 flex items-center gap-2">
        <Badge tone={pending ? "warn" : s.status === "APPROVED" ? "ok" : "muted"}>{pending ? "Onay bekliyor" : s.status === "APPROVED" ? "Uygulandı" : "Reddedildi"}</Badge>
        {out.applied && <span className="text-xs text-muted">Uygulanan alanlar: {out.applied.fields.join(", ")} · {fmtDate(out.applied.at, true)}{out.applied.rolledBack ? " · geri alındı" : ""}</span>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="MEVCUT vs ÖNERİLEN">
          <FixReview id={s.id} path={s.page.path} siteUrl={siteUrl()} current={out.current} proposed={{ seoTitle: d.seoTitle, metaDescription: d.metaDescription, h1: d.h1, faq: d.faq }} pending={pending} />
          {pending && <form action={rejectFixAction} className="mt-3"><input type="hidden" name="id" value={s.id} /><button className="rounded-full border border-line px-4 py-2 text-bad">Reddet</button></form>}
          {out.applied && !out.applied.rolledBack && (
            <form action={rollbackFixAction} className="mt-3"><input type="hidden" name="id" value={s.id} /><button className="rounded-full border border-line px-4 py-2">Geri al (rollback)</button></form>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="İçerik eksikleri">
            {d.contentGaps.length ? <ul className="list-disc space-y-1 pl-5 text-[13px]">{d.contentGaps.map((g, i) => <li key={i}>{g}</li>)}</ul> : <p className="text-muted">Tespit edilmedi.</p>}
          </Card>
          <Card title="Önerilen başlıklar">
            {d.headings.length ? <ul className="space-y-1 font-mono text-xs">{d.headings.map((h, i) => <li key={i}>{h}</li>)}</ul> : <p className="text-muted">Öneri yok (sorgu verisi veya eksik bölüm bulunmadı).</p>}
            <p className="mt-2 text-xs text-muted">Başlıklar içerik yazımı gerektirdiği için otomatik eklenmez; sayfa editöründen kendi metninizle ekleyin.</p>
          </Card>
          <Card title="Internal link önerileri (bu sayfaya link verebilecek sayfalar)">
            {d.internalLinks.length ? <ul className="space-y-1 text-[13px]">{d.internalLinks.map((l, i) => <li key={i}><b>{l.source}</b> → “{l.anchor}” <span className="text-muted">— {l.reason}</span></li>)}</ul> : <p className="text-muted">Uygun kaynak sayfa bulunamadı.</p>}
          </Card>
          <Card title="Schema">
            <ul className="list-disc space-y-1 pl-5 text-[13px]">{d.schema.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Card>
          <p className="text-xs text-muted">{d.rationale}</p>
        </div>
      </div>
    </>
  );
}
