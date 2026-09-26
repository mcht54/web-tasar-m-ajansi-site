import "server-only";
import { db } from "../db";
import { getSecret, getSettingsFresh } from "../settings";
import { siteUrl } from "../env";
import { GscClient, parseServiceAccount } from "./client";
import { oauthConfig, oauthConnection, oauthTokenSource } from "./oauth";
import { normalizeKeyword } from "../text/slug";

export const GSC_SECRET = "gsc.serviceAccount";

/** Bağlantı: önce panelden kurulan OAuth, yoksa servis hesabı JSON'u. */
export async function gscClient(fetchImpl?: typeof fetch): Promise<GscClient | null> {
  const [secret, settings, conn, cfg] = await Promise.all([getSecret(GSC_SECRET), getSettingsFresh(), oauthConnection(), oauthConfig()]);
  if (!settings.integrations.gscProperty) return null;
  if (conn && cfg) return new GscClient(oauthTokenSource(conn, cfg), settings.integrations.gscProperty, fetchImpl);
  if (!secret) return null;
  return new GscClient(parseServiceAccount(secret), settings.integrations.gscProperty, fetchImpl);
}

/** Search Console bağlı mı (OAuth veya servis hesabı)? */
export async function gscConnected(): Promise<boolean> {
  const [secret, conn] = await Promise.all([getSecret(GSC_SECRET), oauthConnection()]);
  return Boolean(secret || conn);
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/**
 * Search Console verisini çeker ve GÜNLÜK olarak saklar (geçmiş korunur).
 * İlk senkronda API'nin izin verdiği ~16 ay alınır; sonrasında yalnızca son 10 gün
 * yeniden yazılır (Google son günlerin verisini birkaç gün içinde kesinleştirir).
 */
export async function syncGsc(opts: { days?: number; fetchImpl?: typeof fetch } = {}) {
  const client = await gscClient(opts.fetchImpl);
  if (!client) return { status: "skipped" as const, message: "Search Console bağlı değil (Ayarlar > SEO Entegrasyonları)" };
  const hasData = (await db.gscDailyTotal.count()) > 0;
  const days = opts.days ?? (hasData ? 10 : 480);
  const end = addDays(new Date(), -1);
  const start = addDays(end, -(days - 1));
  const range = { startDate: day(start), endDate: day(end) };
  const [totals, pages, queries, devices, countries] = await Promise.all([
    client.searchAnalytics({ ...range, dimensions: ["date"] }),
    client.searchAnalytics({ ...range, dimensions: ["date", "page"] }),
    client.searchAnalytics({ ...range, dimensions: ["date", "query", "page"] }),
    client.searchAnalytics({ ...range, dimensions: ["date", "device"] }),
    client.searchAnalytics({ ...range, dimensions: ["date", "country"] }),
  ]);
  const dim = (dimension: string, rows: typeof devices) =>
    rows.map((r) => ({ date: new Date(r.keys[0]), dimension, value: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  const inRange = { gte: new Date(range.startDate), lte: new Date(range.endDate) };
  await db.$transaction([
    db.gscDailyTotal.deleteMany({ where: { date: inRange } }),
    db.gscPageDaily.deleteMany({ where: { date: inRange } }),
    db.gscQueryDaily.deleteMany({ where: { date: inRange } }),
    db.gscDimDaily.deleteMany({ where: { date: inRange } }),
    db.gscDimDaily.createMany({ data: [...dim("device", devices), ...dim("country", countries)], skipDuplicates: true }),
    db.gscDailyTotal.createMany({
      data: totals.map((r) => ({ date: new Date(r.keys[0]), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    }),
    db.gscPageDaily.createMany({
      data: pages.map((r) => ({ date: new Date(r.keys[0]), page: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
      skipDuplicates: true,
    }),
    db.gscQueryDaily.createMany({
      data: queries.map((r) => ({
        date: new Date(r.keys[0]), query: normalizeKeyword(r.keys[1]), page: r.keys[2],
        clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      })),
      skipDuplicates: true,
    }),
  ]);
  return {
    status: "ok" as const,
    message: `${range.startDate} – ${range.endDate}: ${totals.length} gün, ${pages.length} sayfa, ${queries.length} sorgu, ${devices.length} cihaz, ${countries.length} ülke satırı`,
    stats: { days, totals: totals.length, pages: pages.length, queries: queries.length, devices: devices.length, countries: countries.length },
  };
}

/**
 * Anahtar kelime sıralamasını Search Console'dan günceller. Kaynak, sorgunun
 * o günkü gösterim ağırlıklı ortalama pozisyonudur (canlı SERP değil).
 * Gösterim yoksa o gün için pozisyon NULL — tahmin yazılmaz.
 */
export async function updateRanksFromGsc(daysBack = 95) {
  const keywords = await db.keyword.findMany({ where: { status: "ACTIVE" } });
  if (!keywords.length) return { status: "skipped" as const, message: "Takip edilen anahtar kelime yok" };
  if ((await db.gscQueryDaily.count()) === 0) return { status: "skipped" as const, message: "Search Console verisi yok — önce senkronize edin" };
  const since = addDays(new Date(), -daysBack);
  const rows = await db.gscQueryDaily.findMany({
    where: { date: { gte: since }, query: { in: keywords.map((k) => k.normalized) } },
    select: { date: true, query: true, page: true, clicks: true, impressions: true, position: true },
  });
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.query}|${day(r.date)}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  let written = 0;
  for (const kw of keywords) {
    const snaps: { date: Date; position: number; clicks: number; impressions: number; url: string }[] = [];
    for (const [k, list] of byKey) {
      if (!k.startsWith(`${kw.normalized}|`)) continue;
      const impressions = list.reduce((s, r) => s + r.impressions, 0);
      if (!impressions) continue;
      const position = list.reduce((s, r) => s + r.position * r.impressions, 0) / impressions;
      const best = [...list].sort((a, b) => b.impressions - a.impressions)[0];
      snaps.push({ date: list[0].date, position, clicks: list.reduce((s, r) => s + r.clicks, 0), impressions, url: best.page });
    }
    for (const s of snaps) {
      await db.rankSnapshot.upsert({
        where: { keywordId_date_source: { keywordId: kw.id, date: s.date, source: "GSC" } },
        create: { keywordId: kw.id, date: s.date, source: "GSC", position: s.position, clicks: s.clicks, impressions: s.impressions, ctr: s.clicks / s.impressions, url: s.url },
        update: { position: s.position, clicks: s.clicks, impressions: s.impressions, ctr: s.clicks / s.impressions, url: s.url },
      });
      written++;
    }
    const latest = await db.rankSnapshot.findMany({ where: { keywordId: kw.id, source: "GSC" }, orderBy: { date: "desc" }, take: 2 });
    if (latest.length) {
      await db.keyword.update({
        where: { id: kw.id },
        data: {
          currentPosition: latest[0].position,
          previousPosition: latest[1]?.position ?? kw.currentPosition,
          lastCheckedAt: latest[0].date,
          serpUrl: latest[0].url,
        },
      });
    }
  }
  return { status: "ok" as const, message: `${keywords.length} kelime, ${written} günlük kayıt güncellendi`, stats: { keywords: keywords.length, written } };
}

/** İndekslenebilir sayfaların Google indeks durumunu URL Inspection ile kontrol eder (günlük kota: 2000). */
export async function inspectIndexStatus(limit = 50, fetchImpl?: typeof fetch) {
  const client = await gscClient(fetchImpl);
  if (!client) return { status: "skipped" as const, message: "Search Console bağlı değil" };
  const base = siteUrl();
  const pages = await db.page.findMany({ where: { status: "PUBLISHED", robotsIndex: true, autoNoindex: false }, select: { path: true } });
  const urls = pages.map((p) => (p.path === "/" ? `${base}/` : base + p.path));
  const known = new Map((await db.gscIndexStatus.findMany({ select: { url: true, checkedAt: true } })).map((r) => [r.url, r.checkedAt.getTime()]));
  // En uzun süredir kontrol edilmeyenler önce
  const queue = urls.sort((a, b) => (known.get(a) ?? 0) - (known.get(b) ?? 0)).slice(0, limit);
  let done = 0;
  for (const url of queue) {
    const r = await client.inspectUrl(url);
    const s = (r.inspectionResult?.indexStatusResult ?? {}) as Record<string, string | undefined>;
    const data = {
      verdict: s.verdict ?? null, coverageState: s.coverageState ?? null, indexingState: s.indexingState ?? null,
      robotsTxtState: s.robotsTxtState ?? null, lastCrawlTime: s.lastCrawlTime ? new Date(s.lastCrawlTime) : null,
      googleCanonical: s.googleCanonical ?? null, checkedAt: new Date(), raw: s as object,
    };
    await db.gscIndexStatus.upsert({ where: { url }, create: { url, ...data }, update: data });
    done++;
  }
  return { status: "ok" as const, message: `${done} URL'nin indeks durumu kontrol edildi`, stats: { checked: done } };
}
