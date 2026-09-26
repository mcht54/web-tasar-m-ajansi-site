import "server-only";
// Kritik alarmlar: organik tıklama ciddi düştü, indekslenebilirlik bozuldu,
// sitemap bozuldu, Search Console bağlantısı koptu, tarayıcı ciddi hata buldu.
// Aynı alarm 24 saatte bir kez gönderilir (AlarmState). Düzelen alarm kapanır.

import { db } from "../db";
import { siteUrl } from "../env";
import { escapeHtml } from "../text/markdown";
import { getSettingsFresh } from "../settings";
import { gscConnected } from "../gsc/sync";
import { checkSitemap } from "../seo/sitemap-check";
import { robotsAllows } from "../seo/robots";
import { sendMail } from "../email/send";
import { addDays, lastDataDay } from "./metrics";

export type AlarmKey = "clicks_drop" | "indexability" | "sitemap" | "gsc_connection" | "crawler";
export const ALARM_LABELS: Record<AlarmKey, string> = {
  clicks_drop: "Organik tıklamalarda ciddi düşüş",
  indexability: "İndekslenebilirlik bozuldu",
  sitemap: "Sitemap bozuldu",
  gsc_connection: "Search Console bağlantısı kayboldu",
  crawler: "Tarayıcı ciddi hata buldu",
};
export type AlarmCheck = { key: AlarmKey; active: boolean; detail: string };

const RESEND_MS = 24 * 3600_000;

export async function checkClicksDrop(): Promise<AlarmCheck> {
  const end = await lastDataDay();
  if (!end) return { key: "clicks_drop", active: false, detail: "Search Console verisi yok" };
  const sum = async (from: Date, to: Date) => (await db.gscDailyTotal.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { clicks: true } }))._sum.clicks ?? 0;
  const now = await sum(addDays(end, -6), end);
  const prev = await sum(addDays(end, -13), addDays(end, -7));
  const drop = prev ? (prev - now) / prev : 0;
  const active = prev >= 20 && drop >= 0.4;
  return { key: "clicks_drop", active, detail: `Son 7 gün ${now} tıklama, önceki 7 gün ${prev} (${prev ? `%${Math.round(-drop * 100)}` : "—"})` };
}

export async function checkIndexability(fetchImpl: typeof fetch = fetch): Promise<AlarmCheck> {
  const problems: string[] = [];
  const { seo } = await getSettingsFresh();
  if (!seo.allowIndexing) problems.push("Site genelinde indeksleme kapalı (Ayarlar → SEO)");
  const home = await db.page.findUnique({ where: { path: "/" }, select: { status: true, robotsIndex: true, autoNoindex: true } });
  if (!home || home.status !== "PUBLISHED" || !home.robotsIndex || home.autoNoindex) problems.push("Ana sayfa yayında/indekslenebilir değil");
  const services = await db.page.count({ where: { type: "SERVICE", status: "PUBLISHED", OR: [{ robotsIndex: false }, { autoNoindex: true }] } });
  if (services) problems.push(`${services} hizmet sayfası NOINDEX`);
  const base = siteUrl();
  try {
    const r = await fetchImpl(`${base}/robots.txt`, { cache: "no-store" });
    if (!r.ok) problems.push(`robots.txt HTTP ${r.status}`);
    else if (!robotsAllows(await r.text(), "Googlebot", "/").allowed) problems.push("robots.txt Googlebot'u ana sayfadan engelliyor");
    const h = await fetchImpl(`${base}/`, { cache: "no-store" });
    if (!h.ok) problems.push(`Ana sayfa HTTP ${h.status}`);
    else {
      const html = await h.text();
      if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html) || /noindex/i.test(h.headers.get("x-robots-tag") ?? "")) problems.push("Canlı ana sayfada noindex var");
    }
  } catch (e) {
    problems.push(`Site erişilemedi: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { key: "indexability", active: problems.length > 0, detail: problems.join("; ") || "Sorun yok" };
}

export async function checkSitemapAlarm(fetchImpl: typeof fetch = fetch): Promise<AlarmCheck> {
  try {
    const r = await checkSitemap(fetchImpl);
    if (r.urls === 0) return { key: "sitemap", active: true, detail: "Sitemap okunamadı veya boş" };
    // Birkaç tekil sorun alarm değildir; yarıdan fazlası sorunluysa sitemap bozuk sayılır
    const broken = r.problems.length >= Math.max(3, r.urls / 2);
    return { key: "sitemap", active: broken, detail: `${r.urls} URL, ${r.problems.length} sorun` };
  } catch (e) {
    return { key: "sitemap", active: true, detail: `Sitemap kontrolü başarısız: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function checkGscConnection(): Promise<AlarmCheck> {
  if (!(await gscConnected())) return { key: "gsc_connection", active: false, detail: "Search Console henüz bağlanmadı" };
  const last = await db.jobRun.findFirst({ where: { kind: { in: ["gsc-sync", "daily"] } }, orderBy: { startedAt: "desc" } });
  const lastOk = await db.gscDailyTotal.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const problems: string[] = [];
  if (last?.kind === "gsc-sync" && last.status === "error") problems.push(`Son eşitleme hatası: ${last.message ?? ""}`);
  if (last?.kind === "daily" && last.status === "error" && /Search Console: HATA/.test(last.message ?? "")) problems.push("Günlük işte Search Console adımı başarısız");
  if (!lastOk) problems.push("Bağlantı var ama hiç veri alınamadı");
  else if (Date.now() - lastOk.date.getTime() > 7 * 86400_000) problems.push(`Son veri günü ${lastOk.date.toISOString().slice(0, 10)} (7 günden eski)`);
  return { key: "gsc_connection", active: problems.length > 0, detail: problems.join("; ") || "Bağlantı sağlıklı" };
}

export async function checkCrawler(): Promise<AlarmCheck> {
  const last = await db.crawlRun.findFirst({ orderBy: { startedAt: "desc" } });
  if (!last) return { key: "crawler", active: false, detail: "Henüz tarama yok" };
  const problems: string[] = [];
  if (last.status === "error") problems.push(`Tarama hatası: ${last.message ?? ""}`);
  if (last.healthScore != null && last.healthScore < 60) problems.push(`Sağlık skoru ${last.healthScore}`);
  const critical = await db.crawlIssue.count({ where: { runId: last.id, severity: "CRITICAL" } });
  if (critical >= 3) problems.push(`${critical} kritik tarama sorunu`);
  return { key: "crawler", active: problems.length > 0, detail: problems.join("; ") || `Sağlık ${last.healthScore ?? "—"}` };
}

/** Tüm alarmları kontrol eder, yeni/tekrar gönderilecek olanları tek e-postada yollar. */
export async function runAlarms(opts: { fetchImpl?: typeof fetch; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const f = opts.fetchImpl ?? fetch;
  const checks = await Promise.all([checkClicksDrop(), checkIndexability(f), checkSitemapAlarm(f), checkGscConnection(), checkCrawler()]);
  const toSend: AlarmCheck[] = [];
  for (const c of checks) {
    const st = await db.alarmState.findUnique({ where: { key: c.key } });
    if (c.active && (!st?.active || !st.lastSentAt || now.getTime() - st.lastSentAt.getTime() >= RESEND_MS)) toSend.push(c);
    await db.alarmState.upsert({
      where: { key: c.key },
      create: { key: c.key, active: c.active, detail: c.detail },
      update: { active: c.active, detail: c.detail, ...(c.active ? {} : { lastSentAt: null }) },
    });
  }
  const { email } = await getSettingsFresh();
  let mail = null;
  if (toSend.length && email.enabled && email.criticalAlarms) {
    const subject = `KRİTİK SEO ALARMI: ${toSend.map((c) => ALARM_LABELS[c.key]).join(", ")}`;
    const text = ["Kritik SEO alarmı", "", ...toSend.map((c) => `• ${ALARM_LABELS[c.key]}: ${c.detail}`), "", `Panel: ${siteUrl()}/yonetim/autopilot`].join("\n");
    const html = `<!doctype html><html lang="tr"><body style="font-family:Arial,sans-serif"><h1 style="font-size:20px;color:#b91c1c">Kritik SEO alarmı</h1><ul>${toSend.map((c) => `<li><strong>${escapeHtml(ALARM_LABELS[c.key])}</strong>: ${escapeHtml(c.detail)}</li>`).join("")}</ul><p><a href="${escapeHtml(siteUrl())}/yonetim/autopilot">Otopilot panelini aç</a></p></body></html>`;
    mail = await sendMail("alarm", subject, html, text);
    for (const c of toSend) await db.alarmState.update({ where: { key: c.key }, data: { lastSentAt: now } });
  }
  return { checks, sent: toSend.map((c) => c.key), mail };
}
