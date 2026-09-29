// İş kayıt defteri (runner'dan ayrı dosya: döngüsel import olmasın).
import { registerJob } from "./runner";
import { runCrawl } from "../crawler/crawl";
import { inspectIndexStatus, syncGsc, updateRanksFromGsc } from "../gsc/sync";
import { runOpportunities } from "../seo/opportunities";
import { runFullAnalysis } from "../seo/analyzer";
import { changedPathsSince, processIndexNowRetries, submitIndexNow } from "../seo/indexnow";
import { db } from "../db";
import { checkSitemap } from "../seo/sitemap-check";
import { runAutopilot } from "../autopilot/run";
import { runAlarms } from "../autopilot/alarms";
import { sendWeeklyEmail } from "../autopilot/weekly";
import { sendDailyEmail } from "../autopilot/daily";
import { runAutoApply } from "../proposals/lifecycle";
import { runContentScan, type ScanKind } from "../content/scan";
import { runCompletenessScan } from "../content/completeness";
import { competitorDiscovery, crawlDueCompetitors, runCompetitorOpportunities } from "../competitors/jobs";
import { enqueueJob } from "./runner";
import { refreshPublic } from "../admin/pages";
import { cycleHooks, cycleMessage, runAutopilotCycle } from "../autopilot/cycle";
import { runCleanup } from "../maintenance/cleanup";

/** Son 26 saatte gerçekten değişen (alan logu olan) URL'leri IndexNow ile bildirir. */
async function indexNowRecent() {
  const paths = await changedPathsSince(new Date(Date.now() - 26 * 3600_000));
  const retries = await processIndexNowRetries();
  const r = paths.length ? await submitIndexNow(paths, fetch, { trigger: "job" }) : null;
  const message = `${r ? r.message : "Son 26 saatte değişen (ve henüz bildirilmemiş) sayfa yok"} · yeniden deneme: ${retries.due} (başarılı ${retries.ok}, başarısız ${retries.failed})`;
  // Başarısızlık gizlenmez: gönderim başarısızsa iş de hata olarak kaydedilir
  if (r && r.status === "failed") throw new Error(message);
  return { status: (r?.ok ? "ok" : "skipped") as "ok" | "skipped", message };
}

registerJob("crawl", (by) => runCrawl(by));
registerJob("gsc-sync", () => syncGsc());
registerJob("rank-update", () => updateRanksFromGsc());
registerJob("index-inspect", () => inspectIndexStatus());
registerJob("opportunities", () => runOpportunities());
registerJob("indexnow", () => indexNowRecent());
registerJob("sitemap-check", async () => {
  const r = await checkSitemap();
  const msg = `${r.urls} URL denetlendi, ${r.problems.length} sorun`;
  if (r.urls === 0) throw new Error("Sitemap okunamadı veya boş");
  if (r.problems.length) throw new Error(`${msg}: ${r.problems.slice(0, 5).map((p) => `${p.url} (${p.problem})`).join("; ")}`);
  return { message: msg, stats: r };
});
registerJob("daily", async (by) => {
  // Sıra önemli: veri → analiz → görevler. Bir adım başarısız olsa da diğerleri
  // çalışır; ama iş sonunda BAŞARISIZ olarak kaydedilir (sessiz başarı yok).
  const steps: { name: string; status: "ok" | "skipped" | "error"; message: string }[] = [];
  const step = async (name: string, fn: () => Promise<{ message: string; status?: "ok" | "skipped" }>) => {
    try {
      const r = await fn();
      steps.push({ name, status: r.status ?? "ok", message: r.message });
    } catch (e) {
      steps.push({ name, status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };
  await step("Search Console", () => syncGsc());
  await step("Sıralama", () => updateRanksFromGsc());
  await step("İndeks durumu", () => inspectIndexStatus());
  await step("Tarama", () => runCrawl(by));
  await step("Analiz", async () => {
    const r = await runFullAnalysis();
    return { message: `${r.analyzed} sayfa` };
  });
  await step("Fırsatlar", () => runOpportunities());
  await step("IndexNow", () => indexNowRecent());
  await step("Sitemap doğrulama", async () => {
    const r = await checkSitemap();
    if (r.urls === 0) throw new Error("Sitemap okunamadı veya boş");
    if (r.problems.length) throw new Error(`${r.problems.length} sorun: ${r.problems.slice(0, 3).map((p) => p.problem).join("; ")}`);
    return { message: `${r.urls} URL sorunsuz` };
  });
  const summary = steps.map((s) => `${s.name}: ${s.status === "error" ? "HATA — " : s.status === "skipped" ? "atlandı — " : ""}${s.message}`).join(" | ");
  const failed = steps.filter((s) => s.status === "error");
  if (failed.length) throw new Error(`${failed.length} adım başarısız (${failed.map((f) => f.name).join(", ")}) | ${summary}`);
  return { message: summary, stats: { steps } };
});

registerJob("autopilot", async (by) => {
  const r = await runAutopilot({ trigger: by === "zamanlayıcı" || by === "yeniden deneme" ? "schedule" : by === "cli" ? "cli" : "manual" });
  const msg = `${r.weekKey}: ${r.stages.filter((s) => s.status === "ok").length}/23 aşama tamam, uygulanan ${r.exec.applied ?? 0}`;
  if (r.errors) throw new Error(`${msg}; ${r.errors} aşama hatalı: ${r.stages.filter((s) => s.status === "error").map((s) => `${s.name} (${s.message})`).join("; ")}`);
  return { message: msg, stats: { runId: r.id } };
});
// 48 saatlik onay: süresi dolan düşük/orta riskli önerileri uygular. Tek tek öneri
// hataları işi düşürmez (her biri kendi kaydında yeniden denenir / başarısız olur).
registerJob("auto-apply-proposals", async () => {
  const s = await runAutoApply();
  if (s.off) return { status: "skipped", message: `${s.off}${s.recovered ? `, yarıda kalan ${s.recovered}` : ""}${s.expiredManual ? ` · süresi dolmuş ${s.expiredManual} öneri elle onay bekliyor` : ""}`, stats: s };
  const parts = [`süresi dolan ${s.due}`, `uygulanan ${s.applied}`, `yeniden denenecek ${s.retry}`, `başarısız ${s.failed}`, s.skipped ? `atlanan ${s.skipped}` : "", s.recovered ? `yarıda kalan ${s.recovered}` : "", s.expiredManual ? `süresi dolmuş ama insan onayı gereken ${s.expiredManual}` : ""].filter(Boolean);
  if (s.applied) refreshPublic();
  return { status: s.due || s.recovered ? "ok" : "skipped", message: parts.join(", "), stats: s };
});
// İçerik otopilotu: fırsat → öneri (48 saat). Yapay zekâ yoksa öneriler "uygulanamaz" olur.
const contentJob = (kinds: ScanKind[]) => async () => {
  const s = await runContentScan(kinds);
  const created = Object.entries(s.created).map(([k, v]) => `${k} ${v}`).join(", ") || "yeni öneri yok";
  return { status: (s.items.length ? "ok" : "skipped") as "ok" | "skipped", message: s.skippedReason ?? `${created} · bütçe: yeni sayfa ${s.budget.newPagesThisRun}/çalıştırma (${s.budget.newPagesPerWeek}/hafta), yenileme ${s.budget.refreshThisRun}/çalıştırma (${s.budget.refreshPerWeek}/hafta)`, stats: s };
};
registerJob("content-opportunity-scan", contentJob(["refresh"]));
registerJob("service-page-opportunity", contentJob(["service"]));
registerJob("local-seo-opportunity", contentJob(["local"]));
// Rakip istihbaratı: keşif (kaynak yoksa açıkça söyler) → tarama + fark → fırsat taraması
registerJob("competitor-discovery", async () => {
  const d = await competitorDiscovery();
  return { status: "skipped", message: d.available ? `${d.candidates.length} aday` : d.reason, stats: d };
});
registerJob("competitor-crawl", async () => {
  const r = await crawlDueCompetitors();
  if (!r.length) return { status: "skipped", message: "Tarama zamanı gelen rakip yok" };
  // Değişiklik veya ilk tarama varsa fırsat taraması kuyruğa (bağımlılık: bu iş bitmeden başlamaz)
  if (r.some((x) => x.ok)) await enqueueJob("competitor-opportunity-scan", "rakip taraması");
  // Kilitli (başka süreç tarıyor) rakip hata değildir: hiç istek yapılmadan atlanmıştır
  const failed = r.filter((x) => !x.ok && !x.locked);
  const message = r.map((x) => (x.ok ? `${x.domain}: ${x.pages} sayfa, ${x.changes} değişiklik` : x.locked ? `${x.domain}: zaten taranıyor (atlandı)` : `${x.domain}: HATA — ${x.error}`)).join(" · ");
  if (failed.length && failed.length === r.length) throw new Error(message);
  return { message, stats: r };
});
registerJob("competitor-opportunity-scan", async () => {
  const s = await runCompetitorOpportunities();
  const created = Object.entries(s.created).map(([k, v]) => `${k} ${v}`).join(", ") || "yeni öneri yok";
  return { status: s.findings ? "ok" : "skipped", message: s.skippedReason ?? `${s.findings} bulgu (${s.actionable} uygulanabilir) · öneriler: ${created}`, stats: s };
});
// Eksik alan taraması: her eksik alan mevcut 48 saatlik öneri hattına girer (taslak taslak kalır)
registerJob("page-completeness-scan", async () => {
  const s = await runCompletenessScan();
  const created = Object.entries(s.created).map(([k, v]) => `${k} ${v}`).join(", ") || "yeni öneri yok";
  return { status: (s.items.length ? "ok" : "skipped") as "ok" | "skipped", message: s.skippedReason ?? `${s.pages} sayfada ${s.gaps} eksik alan · öneriler: ${created}`, stats: s };
});
// Sürekli otonom döngü: biter, özetini kaydeder; sonrakini zamanlayıcı başlatır (cycleHours).
// Bir aşama hatası diğerlerini durdurmaz ama iş hata olarak kaydedilir → kuyruk yeniden dener.
registerJob("autopilot-cycle", async () => {
  const s = await runAutopilotCycle(cycleHooks.defaults);
  if (s.outcome === "OFF") return { status: "skipped", message: cycleMessage(s), stats: s };
  if (s.errors) throw new Error(`${cycleMessage(s)} | ${s.steps.filter((x) => x.status === "error").map((x) => `${x.name}: ${x.message}`).join(" | ")} | aşamalar: ${s.steps.map((x) => `${x.name}=${x.status}`).join(", ")}`);
  if (s.autoApplied) refreshPublic();
  return { status: "ok", message: cycleMessage(s), stats: s };
});
// Merkezi temizlik: 5 günden eski, referans edilmeyen geçici veri (bkz. maintenance/cleanup.ts)
registerJob("cleanup", async () => {
  const s = await runCleanup();
  const message = `${s.total} kayıt/dosya silindi · ${s.steps.map((x) => `${x.name}: ${x.error ? `HATA — ${x.error}` : x.deleted}`).join(" · ")}`;
  if (s.errors && s.errors === s.steps.length) throw new Error(message);
  return { status: s.total ? "ok" : "skipped", message, stats: s };
});
registerJob("alarms", async () => {
  const r = await runAlarms();
  const active = r.checks.filter((c) => c.active);
  return { message: active.length ? `Aktif alarm: ${active.map((c) => c.key).join(", ")}; gönderilen: ${r.sent.length}` : "Aktif alarm yok", stats: r.checks };
});
registerJob("weekly-email", async () => {
  const r = await sendWeeklyEmail();
  if (r.status === "failed") throw new Error(r.error ?? "E-posta gönderilemedi");
  return { status: r.status === "not_configured" ? "skipped" : "ok", message: r.status === "sent" ? "Haftalık rapor gönderildi" : r.status === "logged" ? "Rapor kaydedildi (log)" : `Gönderilemedi: ${r.error}` };
});
registerJob("daily-email", async () => {
  const r = await sendDailyEmail();
  if (r.status === "failed") throw new Error(r.error ?? "Günlük rapor gönderilemedi");
  return { status: r.status === "sent" || r.status === "logged" ? "ok" : "skipped", message: r.status === "sent" ? "Günlük SEO ajanı raporu gönderildi" : r.status === "logged" ? "Günlük rapor kaydedildi (log)" : r.status === "duplicate" ? "Bugünün raporu zaten gönderilmiş" : `Gönderilemedi: ${r.error}` };
});
