import "server-only";
// GÜNLÜK SEO AJANI RAPORU. Yalnızca gerçek veri: Search Console yoksa "veri yok";
// değişikliğin etkisi hemen iddia edilmez — yalnızca ölçüm süresi dolmuş deneyler
// "gözlenen değişim" olarak yazılır.

import { loadAiKey } from "../ai/key";
import { db } from "../db";
import { siteUrl } from "../env";
import { escapeHtml } from "../text/markdown";
import { getSettingsFresh } from "../settings";
import { gscConnected } from "../gsc/sync";
import { claudeAvailable } from "../ai/claude";
import { sendMail } from "../email/send";
import { addDays, lastDataDay, pct } from "./metrics";
import { overallScore, type SeoHealth } from "./health";
import { NO_DATA_TEXT } from "./report";
import { pageInventory, type Inventory } from "./inventory";

export const HEARTBEAT_SCHEDULER = "heartbeat:scheduler";
export const HEARTBEAT_WORKER = "heartbeat:worker";

type Perf = { clicks: number; impressions: number; ctr: number | null; position: number | null };
export type DailyReport = {
  date: string;
  performance: { window: string; now: Perf; prev: Perf; clicksPct: number | null; impressionsPct: number | null } | null;
  did: { optimizedPages: number; newPages: { path: string; title: string }[]; internalLinks: number; technicalFixes: number; indexNowUrls: number; indexNowNote: string; applied: { title: string; note: string | null }[] };
  health: { before: number | null; after: number | null; fixed: string[]; worsened: string[] } | null;
  pending: string[];
  results: string[];
  system: { name: string; ok: boolean | null; note: string }[];
  inventory: Inventory["totals"];
};

/** Türkiye günü (UTC+3) başlangıcı. */
export function istanbulMidnight(d = new Date()): Date {
  const t = new Date(d.getTime() + 3 * 3600_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 3 * 3600_000);
}

async function perf(from: Date, to: Date): Promise<Perf> {
  const rows = await db.gscDailyTotal.findMany({ where: { date: { gte: from, lte: to } } });
  const i = rows.reduce((s, r) => s + r.impressions, 0), c = rows.reduce((s, r) => s + r.clicks, 0);
  return { clicks: c, impressions: i, ctr: i ? c / i : null, position: i ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / i : null };
}

function healthDiff(before: SeoHealth | null, after: SeoHealth | null) {
  if (!after) return null;
  const idx = (h: SeoHealth | null) => new Map((h?.categories ?? []).flatMap((c) => c.checks.map((x) => [`${c.label} · ${x.label}`, x.status] as const)));
  const b = idx(before), a = idx(after);
  const rank = { FAIL: 0, WARNING: 1, PASS: 2, NOT_VERIFIABLE: -1 } as const;
  const fixed = [...a].filter(([k, v]) => b.has(k) && rank[b.get(k)!] >= 0 && rank[v] > rank[b.get(k)!]).map(([k]) => k);
  const worsened = [...a].filter(([k, v]) => b.has(k) && rank[v] >= 0 && rank[v] < rank[b.get(k)!]).map(([k]) => k);
  return { before: before ? overallScore(before).score : null, after: overallScore(after).score, fixed, worsened };
}

export async function buildDailyReport(now = new Date()): Promise<DailyReport> {
  await loadAiKey();
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [end, applied, pending, subs, run, settings, gsc, crawl, evaluated, beats, inv] = await Promise.all([
    lastDataDay(),
    db.autopilotAction.findMany({ where: { status: "applied", appliedAt: { gte: since } }, orderBy: { appliedAt: "asc" } }),
    db.autopilotAction.findMany({ where: { status: "needs_approval" }, orderBy: { score: "desc" }, take: 30, select: { title: true, qualityNotes: true } }),
    db.indexNowSubmission.findMany({ where: { createdAt: { gte: since } } }),
    db.autopilotRun.findFirst({ where: { startedAt: { gte: new Date(now.getTime() - 36 * 3600_000) }, finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
    getSettingsFresh(), gscConnected(),
    db.crawlRun.findFirst({ orderBy: { startedAt: "desc" } }),
    db.experiment.findMany({ where: { evaluatedAt: { gte: since } }, include: { action: { select: { title: true } } } }),
    db.alarmState.findMany({ where: { key: { in: [HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER] } } }),
    pageInventory(),
  ]);
  let performance: DailyReport["performance"] = null;
  if (end) {
    const now7 = await perf(addDays(end, -6), end), prev7 = await perf(addDays(end, -13), addDays(end, -7));
    performance = { window: `${addDays(end, -6).toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)} (önceki 7 günle)`, now: now7, prev: prev7, clicksPct: pct(now7.clicks, prev7.clicks), impressionsPct: pct(now7.impressions, prev7.impressions) };
  }
  const newPageActs = applied.filter((a) => a.type === "NEW_PAGE");
  const newPages = await Promise.all(newPageActs.map(async (a) => {
    const p = a.pageId ? await db.page.findUnique({ where: { id: a.pageId }, select: { path: true, h1: true, name: true, status: true } }) : null;
    return p && p.status === "PUBLISHED" ? { path: p.path, title: p.h1 ?? p.name } : null;
  }));
  const okUrls = subs.filter((s) => s.status === "ok").reduce((n, s) => n + s.urls.length, 0);
  const summary = (run?.summary ?? null) as { health?: SeoHealth | null; healthBefore?: SeoHealth | null } | null;
  const beat = (k: string) => beats.find((b) => b.key === k)?.updatedAt ?? null;
  const fresh = (d: Date | null, mins: number) => (d ? now.getTime() - d.getTime() <= mins * 60_000 : false);
  const lastSitemap = summary?.health?.categories.find((c) => c.key === "indexability")?.checks.find((x) => x.label === "Sitemap");
  const system: DailyReport["system"] = [
    { name: "Search Console", ok: gsc ? Boolean(end && now.getTime() - end.getTime() < 7 * 86400_000) : false, note: !gsc ? "Bağlı değil — gerçek Google verisi alınamadı" : end ? `Son veri günü ${end.toISOString().slice(0, 10)}` : "Bağlı ama veri yok" },
    { name: "Crawler", ok: crawl ? crawl.status === "ok" && fresh(crawl.startedAt, 48 * 60) : false, note: crawl ? `${crawl.startedAt.toISOString().slice(0, 16).replace("T", " ")} · ${crawl.pagesCrawled} sayfa · sağlık ${crawl.healthScore ?? "—"}` : "Henüz tarama yok" },
    { name: "Sitemap", ok: lastSitemap ? lastSitemap.status === "PASS" : null, note: lastSitemap?.evidence ?? "Henüz doğrulanmadı" },
    { name: "IndexNow", ok: !settings.integrations.indexNow ? false : subs.some((s) => s.status === "failed") ? false : subs.some((s) => s.status === "ok") ? true : null, note: !settings.integrations.indexNow ? "Ayarlardan kapalı" : subs.length ? subs.map((s) => `${s.status}: ${s.message}`).slice(-1)[0] : "Son 24 saatte gönderim yok" },
    { name: "Yapay zekâ", ok: claudeAvailable(), note: claudeAvailable() ? settings.integrations.aiModel : "ANTHROPIC_API_KEY yok — içerik üretimi ve yeni sayfa kapalı" },
    { name: "E-posta (SMTP)", ok: Boolean(settings.email.smtpHost), note: settings.email.smtpHost ? settings.email.recipient : "SMTP tanımlı değil — rapor panelde" },
    { name: "Zamanlayıcı", ok: fresh(beat(HEARTBEAT_SCHEDULER), 20), note: beat(HEARTBEAT_SCHEDULER) ? `Son sinyal ${beat(HEARTBEAT_SCHEDULER)!.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Sinyal yok" },
    { name: "Worker", ok: fresh(beat(HEARTBEAT_WORKER), 20), note: beat(HEARTBEAT_WORKER) ? `Son sinyal ${beat(HEARTBEAT_WORKER)!.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Sinyal yok" },
  ];
  return {
    date: now.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }),
    performance,
    did: {
      optimizedPages: new Set(applied.filter((a) => ["TITLE", "META", "CONTENT"].includes(a.type)).map((a) => a.pageId)).size,
      newPages: newPages.filter(Boolean) as { path: string; title: string }[],
      internalLinks: applied.filter((a) => a.type === "INTERNAL_LINK").length,
      technicalFixes: applied.filter((a) => ["BROKEN_LINK", "TECH"].includes(a.type)).length,
      indexNowUrls: okUrls,
      indexNowNote: subs.length ? `${subs.length} gönderim: ${[...new Set(subs.map((s) => s.status))].join(", ")}${subs.every((s) => s.status === "skipped") ? ` (${subs[0].message})` : ""}` : "gönderim yok",
      applied: applied.map((a) => ({ title: a.title, note: a.qualityNotes })),
    },
    health: summary?.health ? healthDiff(summary.healthBefore ?? null, summary.health) : null,
    pending: pending.map((p) => `${p.title}${p.qualityNotes ? ` — ${p.qualityNotes}` : ""}`),
    results: evaluated.map((e) => `${e.action?.title ?? e.type}: ${(e.result as { summary?: string } | null)?.summary ?? "ölçüldü"}`),
    system,
    inventory: inv.totals,
  };
}

const n = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const sign = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);
const mark = (ok: boolean | null) => (ok === true ? "✓" : ok === false ? "✗" : "–");

function sections(r: DailyReport): { title: string; lines: string[] }[] {
  const p = r.performance;
  return [
    { title: "Organik performans", lines: p ? [
      `Dönem: ${p.window}`,
      `Tıklama: ${n(p.now.clicks)} (${sign(p.clicksPct)})`,
      `Gösterim: ${n(p.now.impressions)} (${sign(p.impressionsPct)})`,
      `CTR: ${p.now.ctr == null ? "—" : `%${(p.now.ctr * 100).toFixed(2).replace(".", ",")}`}`,
      `Ortalama pozisyon: ${p.now.position == null ? "—" : p.now.position.toFixed(1).replace(".", ",")}${p.prev.position != null ? ` (önceki ${p.prev.position.toFixed(1).replace(".", ",")})` : ""}`,
    ] : [NO_DATA_TEXT] },
    { title: "Bugün ajanın yaptığı", lines: [
      `${r.did.optimizedPages} sayfa optimize edildi`, `${r.did.newPages.length} yeni içerik yayınlandı`, `${r.did.internalLinks} iç link eklendi`,
      `${r.did.technicalFixes} teknik sorun düzeltildi`, `${r.did.indexNowUrls} URL IndexNow'a kabul edildi (${r.did.indexNowNote}; kabul ≠ indekslendi)`,
      ...r.did.applied.map((a) => `✓ ${a.title}${a.note ? ` — ${a.note}` : ""}`),
    ] },
    { title: "Sağlık", lines: r.health ? [
      `Önce: ${r.health.before ?? "—"} · Sonra: ${r.health.after ?? "—"}`,
      ...(r.health.fixed.length ? r.health.fixed.map((f) => `Düzeldi: ${f}`) : ["Bu çalıştırmada durumu değişen kontrol yok"]),
      ...r.health.worsened.map((f) => `Kötüleşti: ${f}`),
    ] : ["Son 36 saatte ajan çalışması yok"] },
    { title: "Yeni sayfalar", lines: r.did.newPages.length ? r.did.newPages.map((x) => `${x.title} — ${siteUrl()}${x.path}`) : ["Bugün yeni sayfa yayınlanmadı"] },
    { title: "Bekleyenler (yalnızca ajanın güvenle yapamayacakları)", lines: r.pending.length ? r.pending.slice(0, 15) : ["Yok"] },
    { title: "Önceki değişikliklerin ölçülen sonucu", lines: r.results.length ? r.results : ["Bugün ölçüm süresi dolan değişiklik yok (etki 28 gün sonra, gerçek Search Console verisiyle raporlanır)"] },
    { title: "Sayfalar", lines: [`Yayında ${r.inventory.published} · taslak ${r.inventory.draft} · NOINDEX ${r.inventory.noindex} · yönlendirme ${r.inventory.redirects}`] },
    { title: "Sistem", lines: r.system.map((s) => `${mark(s.ok)} ${s.name} — ${s.note}`) },
  ];
}

export function renderDailyText(r: DailyReport): string {
  return [`SEO AJANI RAPORU — ${r.date}`, "", ...sections(r).flatMap((s) => [s.title.toLocaleUpperCase("tr-TR"), ...s.lines, ""])].join("\n");
}

export function renderDailyHtml(r: DailyReport): string {
  const e = escapeHtml;
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif"><div style="max-width:720px;margin:0 auto;background:#fff;padding:24px">
<h1 style="font-size:22px;margin:0 0 4px;color:#111827">SEO Ajanı Raporu</h1><p style="margin:0;color:#6b7280;font-size:13px">${e(r.date)} · Kaynak: Google Search Console ve sistem kayıtları</p>
${sections(r).map((s) => `<h2 style="font-size:16px;margin:24px 0 6px;color:#111827">${e(s.title)}</h2>${s.lines.map((l) => `<p style="margin:3px 0;font-size:14px;color:#1f2937">${e(l)}</p>`).join("")}`).join("")}
<p style="margin:24px 0 0;font-size:13px"><a href="${e(siteUrl())}/yonetim/autopilot" style="color:#0f6e46">SEO ajanı panelini aç</a></p></div></body></html>`;
}

/** Günde bir kez gönderir (aynı gün ikinci kez gönderilmez). */
export async function sendDailyEmail(opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  if (!opts.force) {
    const sent = await db.emailLog.findFirst({ where: { kind: "daily", createdAt: { gte: istanbulMidnight(now) }, status: { in: ["sent", "logged", "not_configured"] } } });
    if (sent) return { id: sent.id, status: "duplicate" as const, error: null };
  }
  const r = await buildDailyReport(now);
  return sendMail("daily", `SEO Ajanı Raporu — ${r.date}`, renderDailyHtml(r), renderDailyText(r));
}
