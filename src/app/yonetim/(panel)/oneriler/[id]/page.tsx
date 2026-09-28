import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { CATEGORY_LABELS, EXPECTED_IMPACT, RISK_LEVEL_LABELS, STATUS_LABELS, remainingText, type Category, type RiskLevel } from "@/lib/proposals/policy";
import { describeChanges } from "@/lib/proposals/view";
import { Badge, Card, Notice, PageTitle, Table, fmtDate } from "@/components/admin/ui";
import { Countdown } from "@/components/admin/Countdown";
import { applyNowAction, rejectProposalAction, rollbackProposalAction } from "../actions";

export const metadata = { title: "Öneri ayrıntısı" };

const STEP_LABELS: Record<string, string> = {
  validation: "Doğrulama", snapshot: "Anlık görüntü", apply: "Uygulama", test: "Veritabanı testi", seo: "SEO doğrulama",
  crawl: "Tarama kontrolü", rollback_point: "Geri alma noktası", error: "Hata", auto_rollback: "Otomatik geri alma",
};
const STEP_TONE = { ok: "ok", fail: "bad", not_verifiable: "muted", skipped: "muted" } as const;

export default async function ProposalDetail(props: PageProps<"/yonetim/oneriler/[id]">) {
  await requireUser("seo");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const a = await db.autopilotAction.findUnique({ where: { id } });
  if (!a) notFound();
  const audits = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } });
  const views = describeChanges(a.proposedChanges);
  const steps = (a.validation ?? []) as { step: string; status: keyof typeof STEP_TONE; note: string; at: string }[];
  const prop = (a.proposal ?? {}) as { evidence?: string; recommendedAction?: string };
  const now = new Date();
  const back = `/yonetim/oneriler/${id}`;
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  return (
    <>
      <PageTitle title={a.title} desc={<>{CATEGORY_LABELS[a.category as Category] ?? a.category} · kaynak: {a.source} · oluşturuldu {fmtDate(a.createdAt, true)}</>} actions={<Link href="/yonetim/oneriler" className="rounded-full border border-line px-4 py-2">← Öneriler</Link>} />
      {typeof sp.ok === "string" && <div className="mb-4"><Notice tone="ok">{sp.ok}</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={a.status === "applied" ? "ok" : a.status === "failed" ? "bad" : "warn"}>{STATUS_LABELS[a.status] ?? a.status}</Badge>
        <Badge>Risk: {RISK_LEVEL_LABELS[(a.riskLevel ?? "HIGH") as RiskLevel]}</Badge>
        <Badge>Otomatik uygulanabilir: {a.autoApply ? "Evet" : "Hayır"}</Badge>
        {a.status === "pending_approval" && a.expiresAt && a.autoApply && a.expiresAt > now && <span className="text-sm">Kalan süre: <Countdown expiresAt={a.expiresAt.toISOString()} initial={remainingText(a.expiresAt, now) ?? ""} /></span>}
        {a.status === "applied" && a.appliedVia === "auto_48h" && <span className="text-sm text-ok">48 saatlik onay süresi doldu — otomatik uygulandı ({fmtDate(a.appliedAt!, true)})</span>}
        {a.attempts > 0 && <span className="text-xs text-muted">Deneme: {a.attempts}</span>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Gerekçe">
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[140px_1fr]">
              <dt className="text-muted">Neden?</dt><dd>{a.reason}</dd>
              {prop.evidence && <><dt className="text-muted">Kanıt</dt><dd>{prop.evidence}</dd></>}
              {prop.recommendedAction && <><dt className="text-muted">Önerilen işlem</dt><dd>{prop.recommendedAction}</dd></>}
              <dt className="text-muted">SEO etkisi</dt><dd>{a.expectedImpact ?? EXPECTED_IMPACT[a.type] ?? "—"}</dd>
              {a.qualityNotes && <><dt className="text-muted">Notlar</dt><dd>{a.qualityNotes}</dd></>}
              {a.error && <><dt className="text-muted">Hata</dt><dd className="text-bad">{a.error}</dd></>}
            </dl>
          </Card>
          <Card title="Değişiklikler (önce → sonra)">
            <div id="degisiklikler" className="space-y-4">
              {views.length === 0 && <p className="text-muted">Bu öneride uygulanacak somut değişiklik yok.</p>}
              {views.map((v, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-2" data-change={v.field}>
                  <div><p className="text-xs text-muted">{v.path} · {v.label} — MEVCUT</p><pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 text-xs">{v.before}</pre></div>
                  <div><p className="text-xs text-muted">ÖNERİLEN</p><pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-accent/40 bg-accent-soft/40 p-3 text-xs">{v.after}</pre></div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              {a.status === "pending_approval" && (
                <>
                  <form action={applyNowAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full bg-ink px-5 py-2 font-semibold text-paper">Şimdi Uygula</button></form>
                  <form action={rejectProposalAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full border border-line px-5 py-2">Reddet</button></form>
                </>
              )}
              {a.status === "applied" && <form action={rollbackProposalAction}>{hidden("id", a.id)}{hidden("back", back)}<button className="rounded-full border border-line px-5 py-2">Rollback (geri al)</button></form>}
              {a.pageId && <Link href={`/yonetim/sayfalar/${a.pageId}`} className="rounded-full border border-line px-5 py-2">Sayfa ve sürüm geçmişi</Link>}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Uygulama hattı">
            {steps.length === 0 ? <p className="text-muted text-sm">Henüz uygulanmadı.</p> : (
              <ol className="space-y-2 text-[13px]" data-steps>
                {steps.map((s, i) => <li key={i}><Badge tone={STEP_TONE[s.status] ?? "muted"}>{STEP_LABELS[s.step] ?? s.step}</Badge> <span className="text-muted">{s.note}</span></li>)}
              </ol>
            )}
          </Card>
          <Card title="Denetim logu">
            <Table head={["Zaman", "İşlem", "Kim"]} empty="Kayıt yok.">
              {audits.map((l) => <tr key={l.id}><td className="text-xs">{fmtDate(l.createdAt, true)}</td><td className="text-xs">{l.action}</td><td className="text-xs">{l.user?.name ?? "Sistem / otopilot"}</td></tr>)}
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
