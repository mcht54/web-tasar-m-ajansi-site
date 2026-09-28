import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";
import { CATEGORY_LABELS, EXPECTED_IMPACT, RISK_LEVEL_LABELS, STATUS_LABELS, autoApplyBlocker, remainingText, type Category, type RiskLevel } from "@/lib/proposals/policy";
import { describeChanges } from "@/lib/proposals/view";
import { ACTION_LABELS, type ActionType } from "@/lib/autopilot/decide";
import { Badge, Card, Notice, PageTitle, fmtDate } from "@/components/admin/ui";
import { Countdown } from "@/components/admin/Countdown";
import { JobButton } from "@/components/admin/JobButton";
import { applyNowAction, rejectProposalAction, rollbackProposalAction } from "./actions";

export const metadata = { title: "Öneriler" };

const TABS = [
  ["bekleyen", "Onay bekleyen", ["pending_approval", "applying"]],
  ["insan", "İnsan kararı", ["needs_approval"]],
  ["uygulanamaz", "Uygulanamaz", ["blocked"]],
  ["uygulanan", "Uygulanan", ["applied"]],
  ["gecmis", "Geçmiş", ["rejected", "failed", "rolled_back", "skipped"]],
] as const;

const RISK_TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = { LOW: "ok", MEDIUM: "warn", HIGH: "bad", CRITICAL: "bad" };
const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = { pending_approval: "warn", applying: "warn", applied: "ok", failed: "bad", blocked: "muted", needs_approval: "warn" };

type Row = Awaited<ReturnType<typeof db.autopilotAction.findMany>>[number];

export default async function Proposals(props: PageProps<"/yonetim/oneriler">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const tab = TABS.find(([k]) => k === sp.sekme) ?? TABS[0];
  const cat = typeof sp.kategori === "string" && sp.kategori in CATEGORY_LABELS ? sp.kategori : "";
  const where: Prisma.AutopilotActionWhereInput = { status: { in: [...tab[2]] }, ...(cat ? { category: cat } : {}) };
  const [rows, counts, settings] = await Promise.all([
    db.autopilotAction.findMany({ where, orderBy: tab[0] === "bekleyen" ? [{ expiresAt: "asc" }, { score: "desc" }] : [{ appliedAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    db.autopilotAction.groupBy({ by: ["status"], _count: true }),
    getSettingsFresh(),
  ]);
  const count = (ss: readonly string[]) => counts.filter((c) => ss.includes(c.status)).reduce((s, c) => s + c._count, 0);
  const now = new Date();
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ sekme: tab[0], ...(cat ? { kategori: cat } : {}), ...o })}`;
  const back = `/yonetim/oneriler${qs({})}`;
  const windowH = settings.autopilot.approvalWindowHours;
  return (
    <>
      <PageTitle
        title="Öneriler"
        desc={`SEO, içerik, rakip, hizmet, lokal ve performans önerileri tek yerde. Onay bekleyen düşük/orta riskli öneri ${windowH} saat içinde onaylanmaz veya reddedilmezse otomatik uygulanır; yüksek riskli (URL, canonical, index, yönlendirme) öneriler asla otomatik uygulanmaz. Her uygulama sürüm geçmişine ve denetim loguna yazılır, geri alınabilir.`}
        actions={<JobButton kind="auto-apply-proposals" back="/yonetim/oneriler" />}
      />
      {typeof sp.ok === "string" && <div className="mb-4"><Notice tone="ok">{sp.ok}</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      {typeof sp.is === "string" && <div className="mb-4"><Notice>İş arka planda başlatıldı; birkaç saniye sonra sayfayı yenileyin.</Notice></div>}
      <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
        {TABS.map(([k, l, ss]) => <Link key={k} href={`?sekme=${k}${cat ? `&kategori=${cat}` : ""}`} className={`rounded-full px-3 py-1.5 ${tab[0] === k ? "bg-ink text-paper" : "border border-line"}`}>{l} ({count(ss)})</Link>)}
      </div>
      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <Link href={`?sekme=${tab[0]}`} className={`rounded-full px-3 py-1 ${!cat ? "bg-accent text-accent-ink" : "border border-line"}`}>Tüm kategoriler</Link>
        {Object.entries(CATEGORY_LABELS).map(([k, l]) => <Link key={k} href={`?sekme=${tab[0]}&kategori=${k}`} className={`rounded-full px-3 py-1 ${cat === k ? "bg-accent text-accent-ink" : "border border-line"}`}>{l}</Link>)}
      </div>
      <div className="space-y-4">
        {rows.length === 0 && <Card><p className="text-muted">Bu sekmede öneri yok.</p></Card>}
        {rows.map((a) => <ProposalCard key={a.id} a={a} now={now} back={back} />)}
      </div>
    </>
  );
}

function ProposalCard({ a, now, back }: { a: Row; now: Date; back: string }) {
  const prop = (a.proposal ?? {}) as { evidence?: string; recommendedAction?: string; pagePath?: string; findingType?: string };
  const views = describeChanges(a.proposedChanges);
  const blocker = a.status === "pending_approval" ? autoApplyBlocker(a) : null;
  const expired = a.expiresAt ? a.expiresAt.getTime() <= now.getTime() : false;
  const risk = (a.riskLevel ?? "HIGH") as RiskLevel;
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  return (
    <Card>
      <article data-proposal={a.id} data-status={a.status}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[a.status] ?? "muted"}>{STATUS_LABELS[a.status] ?? a.status}</Badge>
              <Badge tone={RISK_TONE[risk]}>Risk: {RISK_LEVEL_LABELS[risk] ?? risk}</Badge>
              <Badge>{CATEGORY_LABELS[a.category as Category] ?? a.category}</Badge>
              <span className="text-xs text-muted">{ACTION_LABELS[a.type as ActionType] ?? a.type} · kaynak: {a.source} · skor {a.score}</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold"><Link href={`/yonetim/oneriler/${a.id}`} className="hover:underline">{a.title}</Link></h2>
          </div>
          <div className="w-60 shrink-0 text-[13px]" data-timer>
            {a.status === "pending_approval" && a.expiresAt && (a.autoApply ? (
              expired
                ? <p className="text-warn">Süre doldu — sıradaki otomatik çalıştırmada uygulanacak{a.nextAttemptAt ? ` (yeniden deneme: ${fmtDate(a.nextAttemptAt, true)})` : ""}</p>
                : <p>Kalan süre: <Countdown expiresAt={a.expiresAt.toISOString()} initial={remainingText(a.expiresAt, now) ?? ""} /><br /><span className="text-xs text-muted">{fmtDate(a.expiresAt, true)} tarihine kadar onaylanmazsa otomatik uygulanacak</span></p>
            ) : (
              <p className="text-muted">{expired ? "Süre doldu — otomatik uygulanmaz; onayınızı bekliyor" : "Otomatik uygulanmaz; onayınız gerekir"}</p>
            ))}
            {a.status === "applied" && <p className="text-ok" data-applied-via={a.appliedVia ?? ""}>{a.appliedVia === "auto_48h" ? "48 saatlik onay süresi doldu — otomatik uygulandı" : a.appliedVia === "manual" ? `Onaylandı ve uygulandı${a.decidedBy ? ` (${a.decidedBy})` : ""}` : "Otopilot uyguladı"}<br /><span className="text-xs text-muted">{a.appliedAt ? fmtDate(a.appliedAt, true) : ""}</span></p>}
            {a.status === "rejected" && <p className="text-muted">Reddedildi{a.decidedBy ? ` (${a.decidedBy})` : ""} · {a.rejectedAt ? fmtDate(a.rejectedAt, true) : ""}</p>}
            {a.status === "failed" && <p className="text-bad">Başarısız: {a.error}</p>}
          </div>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[150px_1fr]">
          {prop.findingType && <><dt className="text-muted">Rakipte var</dt><dd>{prop.evidence?.split(" · ")[0]}</dd><dt className="text-muted">Bizde</dt><dd>{prop.evidence?.split(" · ").slice(1).join(" · ")}</dd></>}
          <dt className="text-muted">Neden?</dt><dd>{a.reason}</dd>
          {prop.evidence && prop.evidence !== a.reason && <><dt className="text-muted">Fırsat</dt><dd>{prop.evidence}</dd></>}
          {views.length > 0 && <><dt className="text-muted">Mevcut durum</dt><dd className="whitespace-pre-wrap">{views.map((v) => `${v.path} · ${v.label}: ${v.before.slice(0, 220)}`).join("\n")}</dd></>}
          <dt className="text-muted">Önerilen değişiklik</dt>
          <dd className="whitespace-pre-wrap">{views.length ? views.map((v) => `${v.label}: ${v.after.slice(0, 260)}`).join("\n") : prop.recommendedAction ?? "—"}</dd>
          <dt className="text-muted">SEO etkisi</dt><dd>{a.expectedImpact ?? EXPECTED_IMPACT[a.type] ?? "—"}</dd>
          <dt className="text-muted">Otomatik uygulanabilir</dt>
          <dd>{a.autoApply ? "Evet" : "Hayır"}{!a.autoApply && a.status === "pending_approval" && (blocker || a.qualityNotes) ? ` — ${blocker ?? a.qualityNotes}` : ""}</dd>
          {(a.status === "blocked" || a.status === "needs_approval") && a.qualityNotes && <><dt className="text-muted">Neden uygulanamıyor</dt><dd className="text-warn">{a.qualityNotes}</dd></>}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {a.status === "pending_approval" && (
            <>
              <form action={applyNowAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full bg-ink px-4 py-1.5 font-semibold text-paper">Şimdi Uygula</button></form>
              <form action={rejectProposalAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full border border-line px-4 py-1.5">Reddet</button></form>
            </>
          )}
          {(a.status === "needs_approval" || a.status === "blocked") && (
            <form action={rejectProposalAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full border border-line px-4 py-1.5">Reddet</button></form>
          )}
          <Link href={`/yonetim/oneriler/${a.id}`} className="rounded-full border border-line px-4 py-1.5">Detay</Link>
          {views.length > 0 && <Link href={`/yonetim/oneriler/${a.id}#degisiklikler`} className="rounded-full border border-line px-4 py-1.5">Değişiklikleri Gör</Link>}
          {a.status === "applied" && (
            <form action={rollbackProposalAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full border border-line px-4 py-1.5">Rollback (geri al)</button></form>
          )}
          {a.pageId && <Link href={`/yonetim/sayfalar/${a.pageId}`} className="rounded-full border border-line px-4 py-1.5">Sayfa</Link>}
        </div>
      </article>
    </Card>
  );
}
