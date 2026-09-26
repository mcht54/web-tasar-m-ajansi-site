import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { claudeAvailable } from "@/lib/ai/claude";
import { loadAiKey } from "@/lib/ai/key";
import { ACTION_LABELS, RISK_LABELS, SCORE_EXPLANATION, type ActionType, type Risk } from "@/lib/autopilot/decide";
import { learningStats } from "@/lib/autopilot/learning";
import { STAGES } from "@/lib/autopilot/run";
import { NO_DATA_TEXT, renderReportHtml, type WeeklyReport } from "@/lib/autopilot/report";
import { latestReport } from "@/lib/autopilot/weekly";
import { STATUS_LABELS, overallScore, type HealthStatus, type SeoHealth } from "@/lib/autopilot/health";
import { buildDailyReport, renderDailyHtml } from "@/lib/autopilot/daily";
import { pageInventory } from "@/lib/autopilot/inventory";
import { BUCKET_LABELS, type KeywordDecision } from "@/lib/autopilot/agent-keywords";
import { agentMode } from "@/lib/settings-schema";
import { siteUrl } from "@/lib/env";
import { Badge, Card, Notice, PageTitle, Stat, Table, fmtDate } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";
import { approveAutopilotAction, rejectAutopilotAction, rollbackAutopilotAction } from "./actions";

export const metadata = { title: "SEO Otopilot" };

const TABS = [["hafta", "Son döngü"], ["gunluk", "Günlük rapor"], ["kelimeler", "Anahtar kelime kararları"], ["sayfalar", "Sayfa envanteri ve kararları"], ["onay", "İnsan gerektirenler"], ["gecmis", "Uygulananlar"], ["deneyler", "Deneyler"], ["ogrenme", "Öğrenme"], ["rapor", "Haftalık rapor"], ["eposta", "E-posta geçmişi"]] as const;
const MODE_LABELS = { OBSERVE: "OBSERVE — yalnızca ölç", ASSIST: "ASSIST — öneri hazırla", AUTONOMOUS: "AUTONOMOUS — kendisi uygular" } as const;
const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  planned: { label: "Planlandı", tone: "muted" }, applying: { label: "Uygulanıyor", tone: "warn" }, applied: { label: "Uygulandı", tone: "ok" }, needs_approval: { label: "Onay bekliyor", tone: "warn" },
  approved: { label: "Onaylandı", tone: "ok" }, skipped: { label: "Atlandı", tone: "muted" }, failed: { label: "Hata", tone: "bad" },
  rolled_back: { label: "Geri alındı", tone: "muted" }, rejected: { label: "Reddedildi", tone: "muted" },
};
const OUTCOME: Record<string, string> = { positive: "Olumlu değişim gözlendi", neutral: "Belirgin değişim yok", negative: "Olumsuz değişim gözlendi", insufficient: "Yetersiz veri" };

type Row = Awaited<ReturnType<typeof db.autopilotAction.findMany>>[number];

function ActionRow({ a, tab }: { a: Row; tab: string }) {
  const st = STATUS[a.status] ?? { label: a.status, tone: "muted" as const };
  const prop = (a.proposal ?? {}) as { pagePath?: string; evidence?: string; recommendedAction?: string; expectedIntent?: string | null; alternatives?: { text: string; source: string; qc: { ok: boolean; problems: string[] } }[]; section?: { heading: string; markdown: string } };
  const before = a.before as { field: string; value: unknown } | null;
  const after = a.after as { field: string; value: unknown } | null;
  const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  return (
    <tr>
      <td className="font-semibold tabular-nums">{a.score}</td>
      <td>
        <div className="font-medium">{a.title}</div>
        <div className="text-xs text-muted">{a.reason}</div>
        {a.qualityNotes && <div className="mt-1 text-xs">{a.qualityNotes}</div>}
        {(prop.alternatives?.length || prop.section || before || prop.recommendedAction) && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-muted">Ayrıntı</summary>
            {prop.pagePath && <div className="mt-1"><b>Etkilenen URL:</b> {prop.pagePath}</div>}
            {prop.recommendedAction && <div><b>Önerilen işlem:</b> {prop.recommendedAction}</div>}
            {prop.expectedIntent && <div><b>Beklenen niyet:</b> {prop.expectedIntent}</div>}
            {before && after && <div className="mt-1"><b>Önce:</b> {show(before.value)?.slice(0, 400) || "(boş)"}<br /><b>Sonra:</b> {show(after.value)?.slice(0, 400)}</div>}
            {prop.alternatives?.map((x, i) => <div key={i} className={x.qc.ok ? "text-ok" : "text-muted"}>• “{x.text}” ({x.source}) {x.qc.ok ? "— kalite kapısı geçti" : `— ${x.qc.problems.join(", ")}`}</div>)}
            {prop.section && <div className="mt-1 whitespace-pre-wrap rounded bg-paper p-2">## {prop.section.heading}{"\n\n"}{prop.section.markdown}</div>}
          </details>
        )}
      </td>
      <td className="text-xs">{ACTION_LABELS[a.type as ActionType] ?? a.type}</td>
      <td><Badge tone={a.risk === "HUMAN" ? "bad" : a.risk === "CONTROLLED" ? "warn" : "ok"}>{RISK_LABELS[a.risk as Risk] ?? a.risk}</Badge></td>
      <td><Badge tone={st.tone}>{st.label}</Badge>{a.appliedAt && <div className="text-xs text-muted">{fmtDate(a.appliedAt, true)}</div>}</td>
      <td className="whitespace-nowrap">
        {a.pageId && <Link href={`/yonetim/sayfalar/${a.pageId}`} className="mr-2 text-xs underline">Sayfa</Link>}
        {a.status === "needs_approval" && (
          <span className="inline-flex gap-1">
            <form action={approveAutopilotAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="tab" value={tab} /><button className="rounded-full bg-ink px-3 py-1 text-xs text-paper">Onayla</button></form>
            <form action={rejectAutopilotAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="tab" value={tab} /><button className="rounded-full border border-line px-3 py-1 text-xs">Reddet</button></form>
          </span>
        )}
        {a.status === "applied" && (
          <form action={rollbackAutopilotAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="tab" value={tab} /><button className="rounded-full border border-line px-3 py-1 text-xs">Geri al</button></form>
        )}
      </td>
    </tr>
  );
}

export default async function Autopilot(props: PageProps<"/yonetim/autopilot">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const tab = (TABS.some(([k]) => k === sp.sekme) ? sp.sekme : "hafta") as (typeof TABS)[number][0];
  await loadAiKey();
  const [settings, run, pending, gsc] = await Promise.all([
    getSettingsFresh(),
    db.autopilotRun.findFirst({ orderBy: { startedAt: "desc" }, include: { actions: { orderBy: { score: "desc" } } } }),
    db.autopilotAction.count({ where: { status: "needs_approval" } }),
    db.gscDailyTotal.count(),
  ]);
  const stages = (run?.stages ?? []) as { n: number; name: string; status: string; message: string; ms: number }[];
  const head = ["Skor", "İşlem", "Tür", "Risk", "Durum", ""];

  return (
    <>
      <PageTitle
        title="SEO Otopilot"
        desc="Türkiye geneli otonom SEO motoru: her hafta ANALİZ → KARAR → UYGULA → ÖLÇ → ÖĞREN. Sistem en değerli 10 işlemi kendisi seçer; güvenli olanları kalite kapısından geçirip uygular, riskli olanları onaya bırakır. Tüm değişiklikler sürüm geçmişine yazılır ve geri alınabilir."
        actions={<JobButton kind="autopilot" back="/yonetim/autopilot" />}
      />
      {typeof sp.ok === "string" && <div className="mb-4"><Notice tone="ok">{sp.ok}</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      {typeof sp.is === "string" && <div className="mb-4"><Notice>İş arka planda başlatıldı; birkaç dakika sonra sayfayı yenileyin.</Notice></div>}
      {!gsc && <div className="mb-4"><Notice tone="warn"><b>{NO_DATA_TEXT}</b> Search Console bağlanana kadar sistem yalnızca site içi sinyallerle (eksik meta, iç link, kırık link, içerik kapsamı) çalışır; pozisyon, tıklama ve trend gösterilmez.</Notice></div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Son çalıştırma" value={run ? run.weekKey : "—"} hint={run ? `${fmtDate(run.startedAt, true)} · ${run.status === "ok" ? "tamam" : run.status === "partial" ? "kısmi (hatalı aşama var)" : run.status}` : "Henüz çalışmadı"} tone={run?.status === "partial" ? "warn" : undefined} />
        <Stat label="İnsan gerektiren" value={pending} tone={pending ? "warn" : undefined} />
        <Stat label="Ajan modu" value={agentMode(settings.autopilot)} hint={<Link href="/yonetim/ayarlar?sekme=otopilot" className="underline">{MODE_LABELS[agentMode(settings.autopilot)]} · haftalık {settings.autopilot.maxChangesPerWeek} değişiklik, {settings.autopilot.maxNewPagesPerWeek} yeni sayfa</Link>} />
        <Stat label="Yapay zekâ" value={claudeAvailable() ? "Bağlı" : "Yok"} hint={claudeAvailable() ? settings.integrations.aiModel : "Kural tabanlı üretim; içerik genişletme onaya düşer"} />
        <Stat label="Haftalık e-posta" value={settings.email.enabled ? ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][settings.email.day] + ` ${String(settings.email.hour).padStart(2, "0")}:00` : "Kapalı"} hint={<Link href="/yonetim/ayarlar?sekme=eposta" className="underline">{settings.email.recipient}</Link>} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {TABS.map(([k, l]) => <Link key={k} href={`?sekme=${k}`} className={`rounded-full px-3 py-1.5 ${tab === k ? "bg-ink text-paper" : "border border-line"}`}>{l}{k === "onay" && pending ? ` (${pending})` : ""}</Link>)}
      </div>

      {tab === "hafta" && (
        <div className="space-y-6">
          <HealthPanel health={((run?.summary ?? null) as { health?: SeoHealth | null } | null)?.health ?? null} before={((run?.summary ?? null) as { healthBefore?: SeoHealth | null } | null)?.healthBefore ?? null} />
          <Card title={`Bu haftanın en değerli işlemleri${run ? ` — ${run.weekKey}` : ""}`}>
            <p className="mb-3 text-xs text-muted">{SCORE_EXPLANATION}</p>
            <Table head={head} empty="Henüz çalıştırma yok. “Otopilot döngüsünü şimdi çalıştır” ile başlatın.">
              {(run?.actions ?? []).map((a) => <ActionRow key={a.id} a={a} tab="hafta" />)}
            </Table>
          </Card>
          <Card title="23 aşama">
            <ol className="space-y-1 text-[13px]">
              {STAGES.map((name, i) => {
                const s = stages.find((x) => x.n === i + 1);
                return (
                  <li key={name} className="flex gap-2">
                    <span className="w-6 shrink-0 text-right tabular-nums text-muted">{i + 1}.</span>
                    <span className="w-56 shrink-0 font-medium">{name}</span>
                    {s ? <Badge tone={s.status === "ok" ? "ok" : s.status === "error" ? "bad" : "muted"}>{s.status === "ok" ? "tamam" : s.status === "error" ? "hata" : "atlandı"}</Badge> : <Badge tone="muted">—</Badge>}
                    <span className="text-xs text-muted">{s?.message}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      )}

      {tab === "onay" && <PendingTab />}
      {tab === "gunluk" && <DailyTab />}
      {tab === "kelimeler" && <KeywordsTab />}
      {tab === "sayfalar" && <PagesTab decisions={((run?.summary ?? null) as { pageDecisions?: PageDecisionRow[] } | null)?.pageDecisions ?? []} />}
      {tab === "gecmis" && <HistoryTab />}
      {tab === "deneyler" && <ExperimentsTab />}
      {tab === "ogrenme" && <LearningTab />}
      {tab === "rapor" && <ReportTab notifyRising={settings.email.notifyRising} notifyFalling={settings.email.notifyFalling} />}
      {tab === "eposta" && <EmailTab />}
    </>
  );
}

async function PendingTab() {
  const rows = await db.autopilotAction.findMany({ where: { status: "needs_approval" }, orderBy: [{ score: "desc" }], take: 100 });
  return (
    <Card title="İnsan onayı bekleyen işlemler">
      <p className="mb-3 text-xs text-muted">Yeni sayfa, büyük içerik değişikliği, yönlendirme, canonical/NOINDEX ve URL değişikliği gibi yüksek riskli işlemler asla otomatik yapılmaz.</p>
      <Table head={["Skor", "İşlem", "Tür", "Risk", "Durum", ""]} empty="Onay bekleyen işlem yok.">
        {rows.map((a) => <ActionRow key={a.id} a={a} tab="onay" />)}
      </Table>
    </Card>
  );
}

async function HistoryTab() {
  const rows = await db.autopilotAction.findMany({ where: { status: { in: ["applied", "rolled_back"] } }, orderBy: { appliedAt: "desc" }, take: 100 });
  return (
    <Card title="Otomatik uygulanan değişiklikler">
      <Table head={["Skor", "İşlem", "Tür", "Risk", "Durum", ""]} empty="Henüz uygulanan değişiklik yok.">
        {rows.map((a) => <ActionRow key={a.id} a={a} tab="gecmis" />)}
      </Table>
    </Card>
  );
}

async function ExperimentsTab() {
  const rows = await db.experiment.findMany({ orderBy: { appliedAt: "desc" }, take: 100, include: { action: { select: { title: true } } } });
  return (
    <Card title="Deneyler (gözlenen değişim)">
      <p className="mb-3 text-xs text-muted">Taban: uygulamadan önceki 28 gün. Ölçüm: uygulamadan 3 gün sonrasından itibaren (7. gün ara, 28. gün nihai). En az 100 gösterim yoksa “yetersiz veri”. Sonuçlar gözlemdir; değişikliğin tek nedeni olduğu iddia edilmez.</p>
      <Table head={["Uygulama", "İşlem", "Sayfa", "Durum", "Sonuç"]} empty="Henüz deney yok.">
        {rows.map((e) => {
          const r = e.result as { summary?: string; interim?: boolean } | null;
          return (
            <tr key={e.id}>
              <td className="text-xs">{fmtDate(e.appliedAt, true)}</td>
              <td className="text-xs">{e.action?.title ?? e.type}{e.query ? ` · “${e.query}”` : ""}</td>
              <td className="text-xs">{e.pagePath}</td>
              <td className="text-xs">{e.status === "running" ? "ölçülüyor" : e.status === "evaluated" ? "nihai" : "geri alındı"}</td>
              <td className="text-xs">{r?.summary ? <>{e.outcome ? <b>{OUTCOME[e.outcome] ?? e.outcome}. </b> : null}{r.summary}{r.interim ? " (ara ölçüm)" : ""}</> : e.note ?? "Ölçüm için henüz erken"}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

async function LearningTab() {
  const stats = [...(await learningStats()).values()];
  return (
    <Card title="Öğrenme motoru">
      <p className="mb-3 text-xs text-muted">Her işlem türünün geçmiş deney sonuçlarından başarı oranı hesaplanır (Laplace düzeltmeli: (olumlu+1)/(toplam+2)). En az 3 sonuçlanmış deney varsa bu tür işlemlerin skoru 0,7–1,3 çarpanıyla ayarlanır. “Yetersiz veri” sonuçları hesaba katılmaz.</p>
      <Table head={["İşlem türü", "Sonuçlanan", "Olumlu", "Nötr", "Olumsuz", "Yetersiz veri", "Başarı oranı", "Skor çarpanı"]} empty="Henüz sonuçlanmış deney yok; tüm türler eşit ağırlıkta (×1,00).">
        {stats.map((s) => (
          <tr key={s.type}>
            <td>{ACTION_LABELS[s.type as ActionType] ?? s.type}</td>
            <td className="tabular-nums">{s.total}</td><td className="tabular-nums">{s.positive}</td><td className="tabular-nums">{s.neutral}</td><td className="tabular-nums">{s.negative}</td><td className="tabular-nums">{s.insufficient}</td>
            <td className="tabular-nums">%{Math.round(s.rate * 100)}</td>
            <td className="font-semibold tabular-nums">×{s.multiplier.toFixed(2)}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

async function ReportTab(o: { notifyRising: boolean; notifyFalling: boolean }) {
  const report: WeeklyReport = await latestReport();
  const html = renderReportHtml(report, o, `${siteUrl()}/yonetim/autopilot`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><JobButton kind="weekly-email" back="/yonetim/autopilot?sekme=rapor" /></div>
      <Card title="Haftalık rapor önizlemesi (e-postadaki hâli)">
        <iframe title="Haftalık rapor" srcDoc={html} sandbox="" className="h-[900px] w-full rounded-lg border border-line bg-white" />
      </Card>
    </div>
  );
}

async function EmailTab() {
  const rows = await db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, kind: true, to: true, subject: true, status: true, error: true, createdAt: true } });
  const label: Record<string, string> = { sent: "Gönderildi", failed: "Hata", not_configured: "SMTP yok", logged: "Kaydedildi" };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3"><JobButton kind="alarms" back="/yonetim/autopilot?sekme=eposta" /></div>
      <Card title="E-posta geçmişi">
        <Table head={["Tarih", "Tür", "Alıcı", "Konu", "Durum"]} empty="Henüz e-posta yok.">
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="text-xs">{fmtDate(m.createdAt, true)}</td>
              <td className="text-xs">{m.kind === "weekly" ? "Haftalık rapor" : m.kind === "alarm" ? "Kritik alarm" : "Test"}</td>
              <td className="text-xs">{m.to}</td>
              <td className="text-xs">{m.subject}</td>
              <td className="text-xs"><Badge tone={m.status === "sent" ? "ok" : m.status === "failed" ? "bad" : "warn"}>{label[m.status] ?? m.status}</Badge>{m.error ? <div className="text-muted">{m.error.slice(0, 160)}</div> : null}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

const HEALTH_TONE: Record<HealthStatus, "ok" | "warn" | "bad" | "muted"> = { PASS: "ok", WARNING: "warn", FAIL: "bad", NOT_VERIFIABLE: "muted" };

type PageDecisionRow = { decision: string; primary: string; queries: number; impressions: number; path: string | null; reason: string };

async function DailyTab() {
  const r = await buildDailyReport();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><JobButton kind="daily-email" back="/yonetim/autopilot?sekme=gunluk" /></div>
      <Card title="Sistem durumu">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {r.system.map((x) => <li key={x.name} data-system={x.name}><Badge tone={x.ok === true ? "ok" : x.ok === false ? "bad" : "muted"}>{x.ok === true ? "✓" : x.ok === false ? "✗" : "–"}</Badge> <b>{x.name}</b> <span className="text-xs text-muted">{x.note}</span></li>)}
        </ul>
      </Card>
      <Card title="Günlük SEO ajanı raporu (e-postadaki hâli)">
        <iframe title="Günlük rapor" srcDoc={renderDailyHtml(r)} sandbox="" className="h-[900px] w-full rounded-lg border border-line bg-white" />
      </Card>
    </div>
  );
}

async function KeywordsTab() {
  const rows = await db.keyword.findMany({ where: { status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { phrase: "asc" }], take: 300, include: { targetPage: { select: { path: true } }, province: { select: { name: true } }, district: { select: { name: true } } } });
  const fmt = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d).replace(".", ","));
  return (
    <Card title="Anahtar kelime ölçümü ve ajan kararları">
      <p className="mb-3 text-xs text-muted">Her çalıştırmada Search Console&apos;dan ölçülür (son 28 gün / önceki 28 gün). Karar kuralları: 1–3 koru · 4–10 sayfayı optimize et (title, meta, içerik, iç link, schema) · 11–30 içeriği genişlet · uygun URL yoksa sayfa karar motoru. Veri yoksa karar verilmez.</p>
      <Table head={["Kelime", "Niyet", "Konum", "Hedef URL", "Gösterim", "Tık", "CTR", "Poz. (önce → şimdi)", "Trend", "Karar", "Son ölçüm"]} empty="Takip edilen kelime yok.">
        {rows.map((k) => {
          const d = k.decision as KeywordDecision | null;
          return (
            <tr key={k.id}>
              <td className="font-medium">{k.phrase}</td>
              <td className="text-xs">{k.intent}</td>
              <td className="text-xs">{k.district?.name ?? k.province?.name ?? "—"}</td>
              <td className="text-xs">{d?.targetPath ?? k.targetPage?.path ?? "—"}</td>
              <td className="tabular-nums">{d?.current?.impressions ?? "—"}</td>
              <td className="tabular-nums">{d?.current?.clicks ?? "—"}</td>
              <td className="tabular-nums">{d?.current?.ctr == null ? "—" : `%${fmt(d.current.ctr * 100, 2)}`}</td>
              <td className="tabular-nums text-xs">{fmt(d?.previous?.position)} → {fmt(d?.current?.position)}</td>
              <td className="text-xs">{d?.trend === "rising" ? "↑" : d?.trend === "falling" ? "↓" : d?.trend === "stable" ? "→" : "—"}</td>
              <td className="max-w-xs text-xs"><b>{d ? BUCKET_LABELS[d.bucket] : "Henüz ölçülmedi"}</b>{d?.reason && d.reason !== BUCKET_LABELS[d.bucket] ? <div className="text-muted">{d.reason}</div> : null}</td>
              <td className="text-xs">{d ? fmtDate(d.measuredAt, true) : "—"}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

async function PagesTab({ decisions }: { decisions: PageDecisionRow[] }) {
  const inv = await pageInventory(decisions);
  return (
    <div className="space-y-4">
      <Card title="Mevcut sayfalar">
        <div className="grid gap-3 sm:grid-cols-5">
          <Stat label="Yayında" value={inv.totals.published} /><Stat label="Taslak" value={inv.totals.draft} /><Stat label="NOINDEX (yayında)" value={inv.totals.noindex} /><Stat label="Yönlendirme" value={inv.totals.redirects} /><Stat label="Arşiv" value={inv.totals.archived} />
        </div>
      </Card>
      <Card title="SEO için potansiyel sayfalar ve neden oluşturulmadıkları">
        <Table head={["Kategori", "Yayında", "Taslak", "Potansiyel", "Neden (gerçek durum)"]}>
          {inv.rows.map((r) => (
            <tr key={r.category} data-inventory={r.category}>
              <td className="font-medium">{r.category}</td><td className="tabular-nums">{r.published}</td><td className="tabular-nums">{r.draft}</td><td className="tabular-nums">{r.potential}</td>
              <td className="text-xs"><ul className="list-disc pl-4">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Sayfa karar motoru (son çalıştırma)">
        <p className="mb-3 text-xs text-muted">Uygun sayfası olmayan gerçek Search Console sorguları niyete göre kümelenir; keyword başına sayfa açılmaz. PAGE_NOT_NEEDED: mevcut güçlü sayfa karşılıyor.</p>
        <Table head={["Karar", "Ana sorgu", "Sorgu", "Gösterim", "URL", "Gerekçe"]} empty="Karar yok — Search Console verisi olmadan karşılanmamış gerçek sorgu tespit edilemez.">
          {decisions.map((d, i) => (
            <tr key={i}><td className="text-xs font-semibold">{d.decision}</td><td>{d.primary}</td><td className="tabular-nums">{d.queries}</td><td className="tabular-nums">{d.impressions}</td><td className="text-xs">{d.path ?? "—"}</td><td className="max-w-md text-xs">{d.reason}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function HealthPanel({ health, before }: { health: SeoHealth | null; before?: SeoHealth | null }) {
  const o = health ? overallScore(health) : null;
  const b = before ? overallScore(before) : null;
  return (
    <Card title="SEO sağlık özeti (10 kategori)">
      {!health ? (
        <p className="text-sm text-muted">Henüz hesaplanmadı. “Otopilot döngüsünü şimdi çalıştır” ile 21. aşamada hesaplanır.</p>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-line p-4" data-overall-score={o?.score ?? ""}>
            <div className="flex flex-wrap items-baseline gap-3"><span className="text-3xl font-semibold tabular-nums">{o?.score ?? "—"}/100</span>{b && <span className="text-sm text-muted">Bu çalıştırmada uygulamadan önce: {b.score ?? "—"}</span>}</div>
            <p className="mt-1 text-xs text-muted">Deterministik: her kontrolün sabit ağırlığı var; PASS tam, WARNING yarım, FAIL sıfır puan alır. Skor = kazanılan {o?.earned} / mümkün {o?.possible} ağırlık. Veri olmayan {o?.notVerifiable.length ?? 0} kontrol paydaya katılmaz.</p>
            {o && o.deductions.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2" data-deductions>
                {o.deductions.map((d) => <li key={`${d.category}:${d.label}`}><b className="tabular-nums text-bad">−{String(d.points).replace(".", ",")}</b> {d.category} · {d.label} <span className="text-xs text-muted">({d.status}: {d.evidence})</span></li>)}
              </ul>
            )}
            {o && o.notVerifiable.length > 0 && <p className="mt-2 text-xs text-muted">Skora katılmayan (veri yok): {o.notVerifiable.map((x) => `${x.category} · ${x.label}`).join("; ")}</p>}
          </div>
          <p className="mb-3 text-xs text-muted">Hesaplama: {fmtDate(health.generatedAt, true)}. Tek bir Lighthouse skoru değildir; her kategori yalnızca ölçülebilen kontrollerden değerlendirilir. NOT VERIFIABLE = veri yok (kötü anlamına gelmez); skor bu durumda gösterilmez.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {health.categories.map((c) => (
              <details key={c.key} className="rounded-xl border border-line p-3" data-health={c.key}>
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="flex items-center gap-2"><span className="text-xs tabular-nums text-muted">{c.score == null ? "—" : c.score}</span><Badge tone={HEALTH_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge></span>
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {c.checks.map((x) => <li key={x.label}><Badge tone={HEALTH_TONE[x.status]}>{STATUS_LABELS[x.status]}</Badge> <b>{x.label}</b>: {x.evidence}</li>)}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
