import "server-only";
// TÜRKİYE GENELİ OTONOM SEO MOTORU — haftalık döngü:
// ANALİZ → KARAR → UYGULA → ÖLÇ → ÖĞREN → TEKRARLA (23 aşama).
// Her aşama AutopilotRun.stages'e yazılır; bir aşamanın hatası diğerlerini
// durdurmaz ama çalıştırma "partial" olarak kaydedilir (sessiz başarı yok).

import { loadAiKey } from "../ai/key";
import { db } from "../db";
import { siteUrl } from "../env";
import { getSettingsFresh } from "../settings";
import { syncGsc, gscConnected } from "../gsc/sync";
import { runCrawl } from "../crawler/crawl";
import { loadSiteState, runFullAnalysis } from "../seo/analyzer";
import { linkStats, orphans, weaklyLinked } from "../seo/links";
import { runOpportunities, toLinkPages } from "../seo/opportunities";
import { locationDemand } from "../seo/location-demand";
import { computeQuickWins } from "../seo/quick-wins";
import { checkSitemap } from "../seo/sitemap-check";
import { submitIndexNow } from "../seo/indexnow";
import { refreshPublic } from "../admin/pages";
import { notifyAppRevalidate } from "../jobs/notify";
import { claudeAvailable } from "../ai/claude";
import { sendMail } from "../email/send";
import { discoverKeywords } from "./discovery";
import { ensureTopicClusters } from "./clusters";
import { RECOMMENDED_ACTION, generateCandidates, scoreCandidate, selectTop, type Candidate } from "./decide";
import { applyProposal, createProposal } from "../proposals/lifecycle";
import { evaluateExperiments } from "./experiments";
import { learningStats } from "./learning";
import { addDays, lastDataDay, pageMetrics } from "./metrics";
import { computeSeoHealth, type SeoHealth } from "./health";
import { runKeywordAgent } from "./agent-keywords";
import { findPageNeeds, pendingNewPage } from "./page-decision";
import { agentMode } from "../settings-schema";
import { normalizeKeyword } from "../text/slug";
import { buildWeeklyReport, renderReportHtml, renderReportText, weeklySubject } from "./report";

export const STAGES = [
  "Search Console senkronizasyonu", "Anahtar kelime keşfi", "Kümeleme", "Arama niyeti", "Sayfa performansı",
  "Teknik denetim (tarama)", "İçerik denetimi", "İç link denetimi", "Lokasyon talebi", "Trend ve deney ölçümü",
  "Fırsat üretimi", "Skorlama", "Strateji (en değerli 10 işlem)", "Çözüm üretimi", "Risk sınıflandırma",
  "Kalite kapısı", "Güvenli otomatik uygulama", "Sitemap güncelleme", "IndexNow", "Deney kaydı",
  "Sonuç anlık görüntüsü", "Haftalık rapor", "E-posta",
] as const;

export type StageLog = { n: number; name: string; status: "ok" | "skipped" | "error"; message: string; ms: number };


/** ISO hafta anahtarı (Türkiye saati, UTC+3). */
export function weekKey(d = new Date()): string {
  const t = new Date(d.getTime() + 3 * 3600_000);
  const day = (t.getUTCDay() + 6) % 7; // Pazartesi = 0
  const thursday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day + 3));
  const firstThu = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThu.getTime()) / 86400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type RunOptions = {
  trigger?: "schedule" | "manual" | "cli" | "test";
  fetchImpl?: typeof fetch;
  skipStages?: number[]; // test/geliştirme: ör. canlı tarama
  sendEmail?: boolean;
  now?: Date;
  crawlFetch?: typeof fetch | null; // uygulama hattının tarama kontrolü (test: null = doğrulanamaz)
};

export async function runAutopilot(opts: RunOptions = {}) {
  await loadAiKey(true);
  const now = opts.now ?? new Date();
  const f = opts.fetchImpl ?? fetch;
  const settings = await getSettingsFresh();
  const ap = settings.autopilot;
  const wk = weekKey(now);
  const run = await db.autopilotRun.create({ data: { weekKey: wk, trigger: opts.trigger ?? "manual" } });
  const stages: StageLog[] = [];
  const ctx: {
    candidates: Candidate[]; selected: Candidate[]; hasGsc: boolean; changedPaths: string[]; experiments: number;
    exec: Record<string, number>; plan: Candidate[];
    pageDecisions: { decision: string; primary: string; queries: number; impressions: number; path: string | null; reason: string }[];
    keywordDecisions: Record<string, number>; healthBefore: SeoHealth | null;
    toPropose: { c: Candidate; canAuto: boolean; proposal: Record<string, unknown>; noAutoReason: string | null }[];
  } = { candidates: [], selected: [], hasGsc: false, changedPaths: [], experiments: 0, exec: {}, plan: [], pageDecisions: [], keywordDecisions: {}, healthBefore: null, toPropose: [] };
  const mode = agentMode(ap);

  const stage = async (n: number, fn: () => Promise<{ message: string; status?: "ok" | "skipped" }>) => {
    const t0 = Date.now();
    if (opts.skipStages?.includes(n)) {
      stages.push({ n, name: STAGES[n - 1], status: "skipped", message: "Bu çalıştırmada atlandı", ms: 0 });
      return;
    }
    try {
      const r = await fn();
      stages.push({ n, name: STAGES[n - 1], status: r.status ?? "ok", message: r.message, ms: Date.now() - t0 });
    } catch (e) {
      stages.push({ n, name: STAGES[n - 1], status: "error", message: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
    }
    await db.autopilotRun.update({ where: { id: run.id }, data: { stages: stages as object } });
  };

  // ── ANALİZ ──
  await stage(1, async () => {
    if (!(await gscConnected())) return { status: "skipped", message: "Search Console bağlı değil — gerçek Google verisi yok" };
    return syncGsc({ fetchImpl: opts.fetchImpl });
  });
  await stage(2, async () => {
    const r = await discoverKeywords();
    return { message: `${r.seeded} çekirdek kelime, ${r.added.length} yeni keşif, ${r.updated} güncelleme` };
  });
  await stage(3, async () => {
    await ensureTopicClusters();
    const [topics, locs, assigned] = await Promise.all([
      db.keywordCluster.count({ where: { kind: "TOPIC" } }), db.keywordCluster.count({ where: { kind: "LOCATION" } }), db.keyword.count({ where: { clusterId: { not: null } } }),
    ]);
    return { message: `${topics} konu kümesi, ${locs} lokasyon kümesi, ${assigned} kelime kümelendi` };
  });
  await stage(4, async () => {
    const g = await db.keyword.groupBy({ by: ["intent"], _count: true, where: { status: "ACTIVE" } });
    return { message: g.map((x) => `${x.intent}: ${x._count}`).join(", ") || "Kelime yok" };
  });
  await stage(5, async () => {
    const end = await lastDataDay();
    if (!end) return { status: "skipped", message: "Search Console verisi yok" };
    const pages = await db.page.findMany({ where: { status: "PUBLISHED" }, select: { path: true } });
    let up = 0, down = 0, withData = 0;
    for (const p of pages) {
      const c = await pageMetrics(p.path, { from: addDays(end, -27), to: end });
      const b = await pageMetrics(p.path, { from: addDays(end, -55), to: addDays(end, -28) });
      if (!c && !b) continue;
      withData++;
      if (c && b && b.clicks >= 5) {
        if (c.clicks > b.clicks * 1.2) up++;
        else if (c.clicks < b.clicks * 0.8) down++;
      }
    }
    return { message: `${withData} sayfada veri; tıklaması artan ${up}, azalan ${down} (28 gün vs önceki 28)` };
  });
  await stage(6, async () => {
    const r = await runCrawl("otopilot", { fetchImpl: opts.fetchImpl });
    return { message: r.message };
  });
  await stage(7, async () => {
    const r = await runFullAnalysis();
    return { message: `${r.analyzed} sayfa analiz edildi` };
  });
  await stage(8, async () => {
    const st = await loadSiteState();
    const stats = linkStats(toLinkPages(st), st.edges);
    return { message: `${orphans(stats).length} orphan, ${weaklyLinked(stats).length} zayıf linkli sayfa` };
  });
  await stage(9, async () => {
    const d = await locationDemand(90);
    if (!d.hasGsc) return { status: "skipped", message: "Search Console verisi yok — lokasyon talebi hesaplanmadı (nüfus talep sayılmaz)" };
    return { message: `${d.rows.length} konumda gerçek arama talebi; sayfası olmayan ${d.rows.filter((r) => r.verdict === "YOK").length}` };
  });
  await stage(10, async () => {
    const [qw, ev] = await Promise.all([computeQuickWins(), evaluateExperiments(now)]);
    const rising = qw.items.filter((i) => i.category === "RISING").length;
    const decl = qw.items.filter((i) => i.category === "DECLINE").length;
    return { message: `${qw.hasData ? `Yükselen ${rising}, düşen ${decl} sorgu` : "Trend için veri yok"}; deney ölçümü: ${ev.interim} ara, ${ev.final} nihai` };
  });

  // ── KARAR ──
  await stage(11, async () => {
    const [g, tasks] = await Promise.all([generateCandidates(), runOpportunities()]);
    // Anahtar kelime ajanı: her kelimeyi ölç → karar → otomatik işlem adayı
    const kw = await runKeywordAgent();
    // Sayfa karar motoru: uygun URL'si olmayan gerçek sorgu kümeleri
    const needs = await findPageNeeds();
    ctx.pageDecisions = needs.decisions.map((d) => ({ decision: d.decision, primary: d.group.primary, queries: d.group.queries.length, impressions: d.group.impressions, path: d.path, reason: d.reason }));
    const learn = await learningStats();
    const pageCands: Candidate[] = [];
    for (const d of needs.decisions) {
      if (d.decision === "PAGE_NOT_NEEDED") continue;
      const human = d.decision === "CANNIBALIZATION" || d.decision === "HUMAN_REQUIRED";
      if (!human && d.path && (await pendingNewPage(d.path))) continue; // mükerrer sayfa önleme
      const risk = human ? "HUMAN" as const : "CONTROLLED" as const;
      const type = human ? "TECH" as const : "NEW_PAGE" as const;
      const sc = scoreCandidate({ impressions: d.group.impressions, position: d.group.position, ctr: d.group.impressions ? d.group.clicks / d.group.impressions : null, trend: null, relevance: 8, intent: d.group.intent, seoScore: null, techIssue: false, risk, learning: learn.get(type)?.multiplier ?? 1 });
      pageCands.push({
        key: `${type}:${d.decision}:${d.path ?? d.group.key}`, type, risk, score: sc.score, parts: sc.parts,
        title: d.decision === "CANNIBALIZATION" ? `“${d.group.primary}” kümesi için hedef sayfa kararı` : d.decision === "HUMAN_REQUIRED" ? `“${d.group.primary}” için yeni hizmet/sektör kararı` : `Yeni sayfa: ${d.path} (“${d.group.primary}”)`,
        reason: d.reason, pageId: d.pageId, pagePath: d.path, query: normalizeKeyword(d.group.primary), clusterId: null,
        payload: {}, evidence: `${d.group.queries.length} sorgu, ${d.group.impressions} gösterim / 28 gün: ${d.group.queries.slice(0, 6).join(", ")}`, recommendedAction: RECOMMENDED_ACTION[type], expectedIntent: d.group.intent,
        extra: type === "NEW_PAGE" ? { pagePath: d.path, decision: d.decision, pageType: d.pageType, pageId: d.pageId, group: { primary: d.group.primary, queries: d.group.queries, impressions: d.group.impressions, intent: d.group.intent, location: d.group.location } } : undefined,
      });
    }
    const uniq = new Map<string, Candidate>();
    for (const c of [...g.candidates, ...kw.candidates, ...pageCands]) if (!uniq.has(c.key) || uniq.get(c.key)!.score < c.score) uniq.set(c.key, c);
    ctx.candidates = [...uniq.values()].sort((a, b) => b.score - a.score);
    ctx.hasGsc = g.hasGsc;
    ctx.keywordDecisions = kw.decisions;
    const nn = ctx.pageDecisions.filter((d) => d.decision === "PAGE_NOT_NEEDED").length;
    return { message: `${ctx.candidates.length} aday işlem · anahtar kelime: ${kw.measured} ölçüldü (${Object.entries(kw.decisions).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}) · sayfa kararı: ${needs.hasData ? `${needs.decisions.length} küme, ${nn} PAGE_NOT_NEEDED` : "Search Console verisi yok"} · ${tasks.message}` };
  });
  await stage(12, async () => {
    const learn = await learningStats();
    const adj = [...learn.values()].filter((l) => l.multiplier !== 1).map((l) => `${l.type} ×${l.multiplier.toFixed(2)}`);
    const top = ctx.candidates[0];
    return { message: `En yüksek skor ${top ? `${top.score} (${top.title})` : "—"}${adj.length ? `; öğrenme çarpanları: ${adj.join(", ")}` : "; öğrenme için henüz yeterli sonuç yok"}${ctx.hasGsc ? "" : "; Search Console verisi olmadığı için yalnızca site içi sinyallerle skorlandı"}` };
  });
  await stage(13, async () => {
    // Haftalık otomatik bütçe: uygulanmış + otomatik uygulanmak üzere bekleyen öneriler
    const applied = await db.autopilotAction.count({ where: { OR: [{ status: "applied" }, { status: "pending_approval", autoApply: true }], run: { weekKey: wk } } });
    const budget = Math.max(0, ap.maxChangesPerWeek - applied);
    // Onay gerektiren işlemler de listede yer alır; otomatik değişiklik bütçesi ayrıca uygulanır
    const alreadyThisWeek = new Set((await db.autopilotAction.findMany({ where: { run: { weekKey: wk } }, select: { title: true } })).map((a) => a.title));
    ctx.selected = selectTop(ctx.candidates.filter((c) => !alreadyThisWeek.has(c.title)), 10);
    if (mode === "OBSERVE") {
      ctx.plan = ctx.candidates.slice(0, 5);
      return { message: `OBSERVE modu: yalnızca ölçüldü; ${ctx.candidates.length} aday işlem kaydedilmedi/uygulanmadı` };
    }
    let autoLeft = budget;
    for (const c of ctx.selected) {
      const isAuto = c.risk === "AUTO" || c.risk === "CONTROLLED";
      const newPage = c.type === "NEW_PAGE"; // yeni sayfa kendi haftalık sınırına tabi (değişiklik bütçesini tüketmez)
      const canAuto = mode === "AUTONOMOUS" && isAuto && (newPage || autoLeft > 0) && (c.risk === "AUTO" ? ap.autoApplySafe : ap.autoApplyControlled);
      if (canAuto && !newPage) autoLeft--;
      const proposal = { pagePath: c.pagePath, payload: c.payload, parts: c.parts, evidence: c.evidence, recommendedAction: c.recommendedAction, expectedIntent: c.expectedIntent, ...(c.extra ?? {}) };
      if (!isAuto) {
        // İnsan kararı (teknik/lokasyon/cannibalization): uygulanabilir değişiklik üretilmez
        await db.autopilotAction.create({
          data: { runId: run.id, type: c.type, risk: c.risk, status: "needs_approval", score: c.score, title: c.title, reason: c.reason, pageId: c.pageId, query: c.query, clusterId: c.clusterId, proposal: proposal as object, qualityNotes: "Yüksek riskli işlem: insan onayı gerekir", riskLevel: "HIGH", category: c.type === "LOCATION" ? "LOCAL" : "TECH", fingerprint: c.key },
        });
        continue;
      }
      ctx.toPropose.push({ c, canAuto, proposal, noAutoReason: canAuto ? null : mode === "ASSIST" ? "ASSIST modu: öneri hazır, onayla uygulanır" : autoLeft <= 0 ? "Haftalık otomatik değişiklik sınırı doldu" : "Bu risk sınıfında otomatik uygulama kapalı" });
    }
    ctx.plan = ctx.candidates.filter((c) => !ctx.selected.includes(c)).slice(0, 5);
    return { message: `${ctx.selected.length} işlem seçildi (haftalık otomatik bütçe ${budget}/${ap.maxChangesPerWeek})` };
  });
  await stage(14, async () => ({
    message: claudeAvailable() ? "Yapay zekâ + kural tabanlı alternatifler üretilecek" : "Yapay zekâ anahtarı yok: yalnızca kural tabanlı ve sayfanın kendi metninden üretim (içerik genişletme onaya kalır)",
  }));
  await stage(15, async () => {
    const r = await db.autopilotAction.groupBy({ by: ["risk"], where: { runId: run.id }, _count: true });
    return { message: r.map((x) => `${x.risk}: ${x._count}`).join(", ") || "İşlem yok" };
  });

  // ── UYGULA ──
  await stage(16, async () => {
    // Uygulamadan ÖNCE sağlık ölçümü (rapordaki önce/sonra karşılaştırması için)
    ctx.healthBefore = await computeSeoHealth({ fetchImpl: f }).catch(() => null);
    // Her öneri HAZIRLANIR (somut değişiklik + kalite kapısı) ve onay penceresine girer.
    // Pencere 0 ise otomatik uygulanabilir öneri hemen aynı uygulama hattından geçer.
    const windowH = ap.approvalWindowHours;
    for (const { c, canAuto, proposal, noAutoReason } of ctx.toPropose.sort((a, b) => b.c.score - a.c.score)) {
      const r = await createProposal(
        { key: c.key, type: c.type, risk: c.risk, title: c.title, reason: c.reason, score: c.score, runId: run.id, pageId: c.pageId, query: c.query, clusterId: c.clusterId, proposal, allowAuto: canAuto, noAutoReason },
        { model: settings.integrations.aiModel, windowHours: windowH },
      );
      ctx.exec[r.status] = (ctx.exec[r.status] ?? 0) + 1;
      if (windowH === 0 && r.status === "pending_approval" && r.id && (await db.autopilotAction.findUnique({ where: { id: r.id }, select: { autoApply: true } }))?.autoApply) {
        const ap2 = await applyProposal(r.id, { via: "autopilot", fetchImpl: opts.crawlFetch });
        ctx.exec[ap2.status] = (ctx.exec[ap2.status] ?? 0) + 1;
        if (ap2.ok) ctx.changedPaths.push(...(ap2.changedPaths ?? []));
      }
    }
    const pendingAuto = ctx.exec.pending_approval ?? 0;
    return { message: `${ctx.toPropose.length} öneri hazırlandı: ${Object.entries(ctx.exec).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}${windowH > 0 && pendingAuto ? ` · ${windowH} saat içinde onaylanmayan düşük/orta riskli öneriler otomatik uygulanır` : ""}` };
  });
  await stage(17, async () => {
    const n = ctx.exec.applied ?? 0;
    if (n) {
      refreshPublic(ctx.changedPaths);
      await notifyAppRevalidate();
    }
    return { message: n ? `${n} güvenli değişiklik uygulandı (sürüm geçmişi + geri alma kaydı)` : "Uygulanan değişiklik yok", status: n ? "ok" : "skipped" };
  });
  await stage(18, async () => {
    const r = await checkSitemap(f);
    if (r.urls === 0) throw new Error("Sitemap okunamadı veya boş");
    return { message: `Sitemap dinamik: ${r.urls} URL, ${r.problems.length} sorun` };
  });
  await stage(19, async () => {
    const paths = [...new Set(ctx.changedPaths)];
    if (!paths.length) return { status: "skipped", message: "Bildirilecek değişiklik yok" };
    const r = await submitIndexNow(paths, f, { trigger: "autopilot" });
    if (r.status === "failed") throw new Error(r.message);
    return { status: r.ok ? "ok" : "skipped", message: r.message };
  });

  // ── ÖLÇ / ÖĞREN ──
  await stage(20, async () => {
    ctx.experiments = await db.experiment.count({ where: { action: { runId: run.id } } });
    const running = await db.experiment.count({ where: { status: "running" } });
    return { message: `${ctx.experiments} yeni deney; toplam ${running} deney ölçülüyor (7. gün ara, 28. gün nihai)` };
  });
  let report: Awaited<ReturnType<typeof buildWeeklyReport>> | null = null;
  let health: SeoHealth | null = null;
  await stage(21, async () => {
    // SEO sağlık anlık görüntüsü (10 kategori) + varsa Search Console toplamları
    health = await computeSeoHealth({ fetchImpl: f });
    const counts = (st: string) => health!.categories.filter((c) => c.status === st).length;
    const end = await lastDataDay();
    const t = end ? await db.gscDailyTotal.aggregate({ where: { date: { gte: addDays(end, -27), lte: end } }, _sum: { clicks: true, impressions: true } }) : null;
    return { message: `Sağlık: ${counts("PASS")} PASS, ${counts("WARNING")} WARNING, ${counts("FAIL")} FAIL, ${counts("NOT_VERIFIABLE")} doğrulanamaz · ${t ? `son 28 gün ${t._sum.clicks ?? 0} tıklama, ${t._sum.impressions ?? 0} gösterim` : "Search Console verisi yok"}` };
  });
  await stage(22, async () => {
    report = await buildWeeklyReport({ runId: run.id, now, health, plan: ctx.plan.map((c) => ({ title: c.title, type: c.type, score: c.score, reason: c.reason })) });
    return { message: report.hasData ? "Rapor hazır" : "Rapor hazır — Henüz gerçek Google verisi alınamadı." };
  });
  await stage(23, async () => {
    if (!report) throw new Error("Rapor oluşturulamadı");
    if (opts.sendEmail === false) return { status: "skipped", message: "Bu çalıştırmada e-posta gönderilmedi" };
    if (!settings.email.enabled) return { status: "skipped", message: "Haftalık e-posta kapalı (Ayarlar → SEO E-posta)" };
    if (opts.trigger === "schedule") return { status: "skipped", message: "Zamanlanmış çalıştırma: raporlar ayrı işlerle gönderilir (günlük rapor her gün, haftalık rapor seçilen gün)" };
    const o = { notifyRising: settings.email.notifyRising, notifyFalling: settings.email.notifyFalling };
    const r = await sendMail("weekly", await weeklySubject(report), renderReportHtml(report, o, `${siteUrl()}/yonetim/autopilot`), renderReportText(report, o));
    if (r.status === "failed") throw new Error(`E-posta gönderilemedi: ${r.error}`);
    return { status: r.status === "not_configured" ? "skipped" : "ok", message: r.status === "sent" ? `Gönderildi: ${settings.email.recipient}` : r.status === "logged" ? "Kaydedildi (EMAIL_TRANSPORT=log)" : `Gönderilemedi: ${r.error} — rapor panelde okunabilir` };
  });

  const errors = stages.filter((s) => s.status === "error");
  await db.autopilotRun.update({
    where: { id: run.id },
    data: { status: errors.length ? "partial" : "ok", finishedAt: new Date(), stages: stages as object, summary: { ...(report ?? {}), healthBefore: ctx.healthBefore, pageDecisions: ctx.pageDecisions, keywordDecisions: ctx.keywordDecisions, mode } as object },
  });
  return { id: run.id, weekKey: wk, stages, errors: errors.length, exec: ctx.exec };
}
