import "server-only";
// AUTOPILOT CYCLE — mevcut modülleri tek döngüde, doğru sırada çalıştıran orkestratör.
// Kendi başına analiz/uygulama yazmaz; yalnızca şu parçaları bağlar:
//
//   1 rakip taraması: zamanı gelenler KUYRUĞA (tarama worker'da, rakip kilidiyle); bu cycle önbellekle devam eder
//   2 anahtar kelime evreni: seed (panel) + rakip başlıkları + deterministik varyasyonlar   (universe.ts)
//   3 site + Search Console + karar: 23 aşamalı ajan (run.ts) — GSC/tarama taze ise atlanır (önbellek)
//   4 rakip fırsatları (competitors/jobs.ts) — rakip taraması sürüyorsa ertelenir
//   5 birleşik fırsat motoru: keyword/content gap, cannibalization, iç link → skor → öneri   (universe.ts)
//   6 içerik yenileme + eksik alan taraması (son 20 saatte çalıştıysa atlanır)
//   7 48 saati dolan öneriler: Autopilot açık + politika izin veriyorsa otomatik uygula    (lifecycle.ts)
//   8 ölçüm (7/14/28 gün) + öğrenme: run.ts aşama 10 / experiments.ts
//   → özet (OK | NO_OPPORTUNITY) → iş biter; sonraki cycle'ı zamanlayıcı başlatır (scheduler.ts).
//
// Tek süreç sonsuza kadar açık kalmaz. Eşzamanlılık iş katmanındadır: "autopilot-cycle" aynı anda
// tek kez çalışır (runJob/processQueue kilidi) ve ilgili tarama işleri sürerken başlamaz (runner.ts).

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { agentMode, autopilotOn } from "../settings-schema";
import { enqueueJob, runJob } from "../jobs/runner";
import { runAutoApply } from "../proposals/lifecycle";
import { runCompetitorOpportunities } from "../competitors/jobs";
import { evaluateExperiments } from "./experiments";
import { runAutopilot, weekKey, type RunOptions } from "./run";
import { expandUniverse, runUniverseOpportunities } from "./universe";

const HOUR = 3600_000;
export const FRESH_HOURS = 20; // GSC senkronu, site taraması ve içerik taramaları bu süre içinde tekrar çekilmez

export type CycleStep = { name: string; status: "ok" | "skipped" | "deferred" | "error"; message: string; ms: number };
export type CycleSummary = {
  outcome: "OK" | "NO_OPPORTUNITY" | "OFF";
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  steps: CycleStep[];
  proposals: { total: number; byStatus: Record<string, number>; byType: Record<string, number> };
  opportunities: number;
  autoApplied: number;
  nextCycleAt: string | null;
  errors: number;
};

export type CycleOptions = {
  now?: Date;
  run?: RunOptions; // 23 aşamalı ajana aktarılır (test: fetchImpl, skipStages, crawlFetch)
  skipAgentRun?: boolean; // yalnızca test: 23 aşamalı ajanı atla
  autoApplyFetch?: typeof fetch | null; // uygulama hattının tarama kontrolü (test: null)
};

/** Yalnızca testler: kuyruktan çalışan cycle'ın seçenekleri ve aşama öncesi kanca (hata enjeksiyonu). Üretimde boş. */
export const cycleHooks: { defaults?: CycleOptions; beforeStep?: (name: string) => void | Promise<void> } = {};

async function lastOk(kinds: string[], since: Date) {
  return db.jobRun.findFirst({ where: { kind: { in: kinds }, status: { in: ["ok", "skipped"] }, finishedAt: { gte: since } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } });
}

/** Önbellek: veri son FRESH_HOURS içinde çekildiyse 23 aşamalı ajanda ilgili aşamalar atlanır. */
async function freshStages(now: Date): Promise<{ skip: number[]; notes: string[] }> {
  const since = new Date(now.getTime() - FRESH_HOURS * HOUR);
  const skip: number[] = [], notes: string[] = [];
  const prevRuns = await db.autopilotRun.findMany({ where: { startedAt: { gte: since } }, select: { stages: true } });
  const stageOk = (n: number) => prevRuns.some((r) => ((r.stages as { n: number; status: string }[] | null) ?? []).some((s) => s.n === n && s.status === "ok"));
  if ((await db.jobRun.findFirst({ where: { kind: { in: ["gsc-sync", "daily"] }, status: "ok", finishedAt: { gte: since } } })) || stageOk(1)) { skip.push(1); notes.push("GSC son 20 saatte senkronlandı (önbellek)"); }
  if ((await db.crawlRun.findFirst({ where: { status: "ok", finishedAt: { gte: since } } })) || stageOk(6)) { skip.push(6); notes.push("Site son 20 saatte tarandı (önbellek)"); }
  return { skip, notes };
}

/** Bir cycle çalıştırır ve özetini döner. Autopilot kapalıysa hiçbir şey yapmaz. */
export async function runAutopilotCycle(opts: CycleOptions = {}): Promise<CycleSummary> {
  const started = opts.now ?? new Date();
  const settings = await getSettingsFresh();
  const ap = settings.autopilot;
  const steps: CycleStep[] = [];
  const base = { runId: null, startedAt: started.toISOString(), proposals: { total: 0, byStatus: {}, byType: {} }, opportunities: 0, autoApplied: 0 };
  if (!autopilotOn(ap)) {
    return { ...base, outcome: "OFF", finishedAt: new Date().toISOString(), steps: [{ name: "Autopilot", status: "skipped", message: "Autopilot kapalı: cycle çalışmadı", ms: 0 }], nextCycleAt: null, errors: 0 };
  }
  // Öneri sayımı: cycle öncesi kayıt kimlikleri (saat/zaman damgasından bağımsız; mükerrerler oluşmadığından sayılmaz)
  const beforeIds = new Set((await db.autopilotAction.findMany({ select: { id: true } })).map((r) => r.id));
  let runId: string | null = null;
  let opportunities = 0;
  let autoApplied = 0;
  const step = async (name: string, fn: () => Promise<{ status?: CycleStep["status"]; message: string }>) => {
    const t0 = Date.now();
    try {
      await cycleHooks.beforeStep?.(name);
      const r = await fn();
      steps.push({ name, status: r.status ?? "ok", message: r.message, ms: Date.now() - t0 });
    } catch (e) {
      // Bir aşamanın hatası cycle'ı durdurmaz; özet "errors" ile kaydedilir
      steps.push({ name, status: "error", message: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
    }
  };

  // 1) Rakip taraması: zamanı gelen varsa kuyruğa (bu cycle beklemez; mevcut önbellekle devam eder)
  let competitorCrawlBusy = false;
  await step("Rakip taraması", async () => {
    const active = await db.competitor.count({ where: { status: { not: "paused" } } });
    if (!active) return { status: "skipped", message: "Takip edilen rakip yok" };
    const nowUtc = new Date();
    competitorCrawlBusy = (await db.competitor.count({ where: { crawlLockUntil: { gt: nowUtc } } })) > 0 || Boolean(await db.jobRun.findFirst({ where: { kind: "competitor-crawl", status: "running" } }));
    const weekAgo = new Date(started.getTime() - 6.5 * 24 * HOUR);
    const due = await db.competitor.count({ where: { status: { not: "paused" }, OR: [{ crawlRequestedAt: { not: null } }, { lastCrawlAt: null }, { lastCrawlAt: { lt: weekAgo } }] } });
    const cached = await db.competitorPage.count({ where: { removedAt: null, status: 200 } });
    if (competitorCrawlBusy) return { status: "deferred", message: `Rakip taraması sürüyor — bu cycle önbellekteki ${cached} rakip sayfasıyla devam eder` };
    if (!due) return { message: `${active} rakip güncel (haftalık tarama); önbellekte ${cached} sayfa` };
    const q = await enqueueJob("competitor-crawl", "autopilot-cycle");
    return { message: `${due} rakibin taraması ${q.created ? "kuyruğa alındı" : "zaten kuyrukta"}; bu cycle önbellekteki ${cached} sayfayla devam eder` };
  });

  // 2) Anahtar kelime evreni
  await step("Anahtar kelime evreni", async () => {
    const u = await expandUniverse();
    if (!u.seeds) return { status: "skipped", message: "Aktif seed kelime yok (Anahtar Kelimeler → Otopilot seed); evren yalnızca Search Console'dan genişler" };
    return { message: `${u.seeds} seed · ${u.added.length} yeni ifade (${u.added.filter((a) => a.source === "competitor").length} rakip sinyali, ${u.added.filter((a) => a.source === "universe").length} varyasyon) · ${u.total} aktif kelime` };
  });

  // 3) Site + GSC + karar + 48 saatlik öneriler (23 aşama)
  await step("Site, Search Console ve karar (23 aşama)", async () => {
    if (opts.skipAgentRun) {
      const run = await db.autopilotRun.create({ data: { weekKey: weekKey(started), trigger: "cycle" } });
      runId = run.id;
      const ev = await evaluateExperiments(started);
      return { status: "skipped", message: `Ajan çalıştırması atlandı (test); ölçüm: ${ev.interim} ara, ${ev.final} nihai` };
    }
    const f = await freshStages(started);
    const r = await runAutopilot({ ...opts.run, trigger: "cycle", sendEmail: false, now: opts.run?.now ?? started, skipStages: [...new Set([...(opts.run?.skipStages ?? []), ...f.skip])] });
    runId = r.id;
    const msg = `${r.stages.filter((s) => s.status === "ok").length}/23 aşama tamam, ${Object.entries(r.exec).map(([k, v]) => `${k} ${v}`).join(", ") || "yeni öneri yok"}${f.notes.length ? ` · ${f.notes.join("; ")}` : ""}`;
    if (r.errors) throw new Error(`${msg}; hatalı aşama: ${r.stages.filter((s) => s.status === "error").map((s) => `${s.name} (${s.message})`).join("; ")}`);
    return { message: msg };
  });

  // 4) Rakip fırsatları (hizmet/içerik/teknik/iç link farkları)
  await step("Rakip fırsatları", async () => {
    if (competitorCrawlBusy) return { status: "deferred", message: "Rakip taraması sürüyor: fırsat taraması tarama bitince (sonraki cycle veya tarama sonrası iş) çalışır" };
    if (!(await db.competitorPage.count({ where: { removedAt: null } }))) return { status: "skipped", message: "Rakip verisi yok" };
    const s = await runCompetitorOpportunities({ now: started });
    return { status: s.skippedReason ? "skipped" : "ok", message: s.skippedReason ?? `${s.findings} bulgu (${s.actionable} uygulanabilir) · öneri: ${Object.entries(s.created).map(([k, v]) => `${k} ${v}`).join(", ") || "yeni yok"}` };
  });

  // 5) Birleşik fırsat motoru
  await step("Fırsat motoru (seed + rakip + GSC)", async () => {
    const s = await runUniverseOpportunities({ now: started, runId });
    opportunities = s.opportunities;
    if (s.skippedReason) return { status: "skipped", message: s.skippedReason };
    return { message: `${s.evaluated} ifade değerlendirildi, ${s.opportunities} fırsat · seçilen: ${s.selected.map((x) => `“${x.phrase}” ${x.decision} (${x.score}) → ${x.status}`).join("; ") || "yok (bütçe/mükerrer/eşik)"}` };
  });

  // 6) İçerik yenileme + eksik alan (iş kaydıyla; son 20 saatte çalıştıysa önbellek)
  await step("İçerik ve eksik alan taraması", async () => {
    const fresh = new Date(started.getTime() - FRESH_HOURS * HOUR);
    const out: string[] = [];
    for (const kind of ["content-opportunity-scan", "page-completeness-scan"] as const) {
      if (await lastOk([kind], fresh)) { out.push(`${kind}: son 20 saatte çalıştı`); continue; }
      const r = await runJob(kind, "autopilot-cycle");
      out.push(`${kind}: ${r.status} — ${r.message}`);
      if (r.status === "error") throw new Error(out.join(" · "));
    }
    return { message: out.join(" · ") };
  });

  // 7) 48 saati dolan öneriler (Autopilot açık + AUTONOMOUS + düşük/orta risk)
  await step("48 saat otomatik uygulama", async () => {
    const s = await runAutoApply({ now: opts.now, fetchImpl: opts.autoApplyFetch });
    autoApplied = s.applied;
    if (s.off) return { status: "skipped", message: s.off };
    return { status: s.due ? "ok" : "skipped", message: `süresi dolan ${s.due}, uygulanan ${s.applied}, yeniden denenecek ${s.retry}, başarısız ${s.failed}` };
  });

  // Özet: bu cycle'da gerçekten oluşturulan öneriler (mükerrerler oluşturulmaz, sayılmaz)
  const created = (await db.autopilotAction.findMany({ select: { id: true, status: true, type: true } })).filter((r) => !beforeIds.has(r.id));
  const byStatus: Record<string, number> = {}, byType: Record<string, number> = {};
  for (const c of created) { byStatus[c.status] = (byStatus[c.status] ?? 0) + 1; byType[c.type] = (byType[c.type] ?? 0) + 1; }
  const finished = new Date();
  const summary: CycleSummary = {
    outcome: created.length ? "OK" : "NO_OPPORTUNITY", runId, startedAt: started.toISOString(), finishedAt: finished.toISOString(), steps,
    proposals: { total: created.length, byStatus, byType }, opportunities, autoApplied,
    nextCycleAt: new Date(Math.max(started.getTime(), finished.getTime()) + ap.cycleHours * HOUR).toISOString(),
    errors: steps.filter((s) => s.status === "error").length,
  };
  if (runId) {
    const run = await db.autopilotRun.findUnique({ where: { id: runId }, select: { summary: true, status: true } });
    await db.autopilotRun.update({ where: { id: runId }, data: { summary: { ...((run?.summary as object | null) ?? {}), cycle: summary, mode: agentMode(ap) } as object, ...(run?.status === "running" ? { status: summary.errors ? "partial" : "ok", finishedAt: finished } : {}) } });
  }
  return summary;
}

/** Cycle özeti tek satır (JobRun mesajı ve panel). */
export function cycleMessage(s: CycleSummary): string {
  if (s.outcome === "OFF") return "Autopilot kapalı: cycle çalışmadı";
  const p = Object.entries(s.proposals.byStatus).map(([k, v]) => `${k} ${v}`).join(", ");
  return `${s.outcome === "NO_OPPORTUNITY" ? "NO_OPPORTUNITY — yeni fırsat yok" : `${s.proposals.total} yeni öneri (${p})`} · ${s.opportunities} fırsat değerlendirildi · otomatik uygulanan ${s.autoApplied}${s.errors ? ` · ${s.errors} aşama hatalı` : ""} · sonraki cycle ${s.nextCycleAt?.slice(0, 16).replace("T", " ")} UTC`;
}
