import "server-only";
// RAKİP TARAYICI: nazik, sınırlı, önbellekli. robots.txt'ye uyar (Crawl-delay dahil),
// sitemap'ten başlar, derinlik sınırıyla iç linkleri izler. Önbellek: son taramadan
// `cacheHours` geçmediyse sayfa yeniden istenmez; geçtiyse koşullu GET (ETag /
// Last-Modified) → 304 ise önceki gözlem kullanılır. Her tarama önceki gözlemle
// karşılaştırılır (yeni / silinen / taşınan sayfa, title/H1/uzunluk/schema değişimi).
// Rakip metni saklanmaz: yalnızca yapı sinyalleri (title, H1/H2, schema, sayılar, hash).

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import type { CompetitorSettings } from "../settings-schema";
import { parseHtml } from "../crawler/parse";
import { ROBOTS_UA_TOKEN, safeFetch, type NetPolicy } from "./net";
import { categorize, headingsOf, parseRobots, robotsAllowed, type Places, type Robots } from "./classify";

type Prev = Awaited<ReturnType<typeof db.competitorPage.findMany>>[number];
export type ChangeRow = { kind: string; url: string; before: string | null; after: string | null };
export type CrawlStats = {
  pages: number; fetched: number; notModified: number; cacheHits: number; blockedByRobots: number; errors: number; truncated: number;
  sitemapFound: boolean; sitemapUrls: number; robotsFound: boolean; crawlDelay: number | null; https: boolean; homeStatus: number | null;
  categories: Record<string, number>; services: string[]; locations: string[]; schemaTypes: string[]; changes: number; firstCrawl: boolean; durationMs: number;
};

const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|pdf|zip|ico|css|js|xml|txt|json|mp4|webm|mp3|woff2?|ttf|eot|docx?|xlsx?)$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function normPath(u: string): string {
  const x = new URL(u);
  return (x.pathname.replace(/\/+$/, "") || "/") + (x.search && !/utm_|fbclid|gclid/i.test(x.search) ? x.search : "");
}

async function loadPlaces(): Promise<{ places: Places; sectors: string[] }> {
  const [provinces, districts, sectors] = await Promise.all([
    db.province.findMany({ select: { slug: true } }),
    db.district.findMany({ select: { slug: true, province: { select: { slug: true } } } }),
    db.sector.findMany({ select: { slug: true } }),
  ]);
  return { places: { provinces: provinces.map((p) => p.slug), districts: districts.map((d) => ({ slug: d.slug, province: d.province.slug })) }, sectors: sectors.map((s) => s.slug.replace(/-web-(tasarimi|sitesi)$/, "")) };
}

async function sitemapUrls(start: string[], origin: string, o: { policy: NetPolicy; settings: CompetitorSettings }, cap: number): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const queue = [...start];
  const seen = new Set<string>();
  while (queue.length && seen.size < 10 && out.size < cap) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const r = await safeFetch(sm, { policy: o.policy, timeoutMs: o.settings.timeoutMs, maxBytes: o.settings.maxBytes * 2 });
      if (r.status !== 200) continue;
      for (const m of r.body.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)) queue.push(m[1]);
      for (const m of r.body.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
        const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(m[1])?.[1];
        const mod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[1])?.[1] ?? null;
        if (loc && new URL(loc, origin).origin === origin) out.set(new URL(loc, origin).toString(), mod);
        if (out.size >= cap) break;
      }
    } catch { /* erişilemeyen sitemap atlanır */ }
  }
  return out;
}

export async function crawlCompetitor(competitorId: string, opts: { policy?: NetPolicy; now?: Date; settings?: Partial<CompetitorSettings>; baseOverride?: string } = {}) {
  const t0 = Date.now();
  const now = opts.now ?? new Date();
  const policy = opts.policy ?? {};
  const settings = { ...(await getSettingsFresh()).competitors, ...(opts.settings ?? {}) };
  const c = await db.competitor.findUniqueOrThrow({ where: { id: competitorId } });
  const prev = await db.competitorPage.findMany({ where: { competitorId } });
  const prevByPath = new Map(prev.map((p) => [p.path, p]));
  const { places, sectors } = await loadPlaces();

  // Ana sayfa: https öncelikli, olmazsa http; son adres (yönlendirme sonrası) kanonik köken
  let home;
  let err: string | null = null;
  for (const base of opts.baseOverride ? [opts.baseOverride] : [`https://${c.domain}`, `http://${c.domain}`]) {
    try {
      home = await safeFetch(`${base}/`, { policy, timeoutMs: settings.timeoutMs, maxBytes: settings.maxBytes });
      break;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }
  if (!home) {
    await db.competitor.update({ where: { id: competitorId }, data: { lastCrawlAt: now, lastStatus: null, lastError: err, status: "error" } });
    const snap = await db.competitorSnapshot.create({ data: { competitorId, status: "error", error: err } });
    return { snapshotId: snap.id, ok: false, error: err, stats: null, changes: [] as ChangeRow[] };
  }
  const origin = new URL(home.finalUrl).origin;
  const sameSite = (u: URL) => u.origin === origin || u.hostname.replace(/^www\./, "") === new URL(origin).hostname.replace(/^www\./, "");

  // robots.txt (bulunamazsa her şey serbest; ama yine de nazik tarama)
  let robots: Robots = parseRobots(null, ROBOTS_UA_TOKEN);
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { policy, timeoutMs: settings.timeoutMs, maxBytes: 500_000 });
    robots = parseRobots(r.status === 200 ? r.body : null, ROBOTS_UA_TOKEN);
  } catch { /* robots okunamadı */ }
  const delay = Math.min(10_000, Math.max(settings.delayMs, (robots.crawlDelay ?? 0) * 1000));
  const sm = await sitemapUrls(robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`], origin, { policy, settings }, 5000);

  // Kuyruk: ana sayfa → sitemap URL'leri → linkler (derinlik sınırlı), robots'a uygun olanlar
  const queue: { url: string; depth: number }[] = [];
  const seen = new Set<string>();
  const stats: CrawlStats = { pages: 0, fetched: 0, notModified: 0, cacheHits: 0, blockedByRobots: 0, errors: 0, truncated: 0, sitemapFound: sm.size > 0, sitemapUrls: sm.size, robotsFound: robots.found, crawlDelay: robots.crawlDelay, https: origin.startsWith("https:"), homeStatus: home.status, categories: {}, services: [], locations: [], schemaTypes: [], changes: 0, firstCrawl: prev.length === 0, durationMs: 0 };
  const push = (raw: string, depth: number) => {
    let u: URL;
    try { u = new URL(raw, origin); } catch { return; }
    if (!sameSite(u) || !/^https?:$/.test(u.protocol) || ASSET.test(u.pathname)) return;
    u.hash = "";
    const path = normPath(u.toString());
    if (seen.has(path) || seen.size >= settings.maxPages || depth > settings.maxDepth + 1) return;
    if (!robotsAllowed(robots, new URL(path, origin).pathname)) { stats.blockedByRobots++; seen.add(path); return; }
    seen.add(path);
    queue.push({ url: new URL(path, origin).toString(), depth });
  };
  push(home.finalUrl, 0);
  for (const u of sm.keys()) push(u, 1);

  const observed = new Map<string, Omit<Prev, "id" | "competitorId" | "firstSeenAt">>();
  const firstFetch = new Set<string>();
  const cutoff = now.getTime() - settings.cacheHours * 3600_000;
  while (queue.length) {
    const batch = queue.splice(0, settings.concurrency);
    await Promise.all(batch.map(async ({ url, depth }) => {
      const path = normPath(url);
      const old = prevByPath.get(path);
      const lastmod = sm.get(url) ?? null;
      const fresh = old && old.status === 200 && old.fetchedAt.getTime() > cutoff && !(lastmod && new Date(lastmod).getTime() > old.fetchedAt.getTime());
      if (fresh && url !== home!.finalUrl) {
        stats.cacheHits++;
        observed.set(path, { ...old, inSitemap: sm.has(url), depth, lastSeenAt: now, removedAt: null });
        for (const l of old.links) push(l, depth + 1);
        return;
      }
      try {
        const cond: Record<string, string> = {};
        if (old?.etag) cond["if-none-match"] = old.etag;
        if (old?.lastModified) cond["if-modified-since"] = old.lastModified;
        const r = url === home!.finalUrl && !old ? home! : await safeFetch(url, { policy, timeoutMs: settings.timeoutMs, maxBytes: settings.maxBytes, headers: cond });
        if (r !== home) await sleep(delay);
        if (r.status === 304 && old) {
          stats.notModified++;
          observed.set(path, { ...old, inSitemap: sm.has(url), depth, lastSeenAt: now, fetchedAt: now, removedAt: null });
          for (const l of old.links) push(l, depth + 1);
          return;
        }
        stats.fetched++;
        if (r.truncated) stats.truncated++;
        firstFetch.add(path);
        const isHtml = /html/i.test(r.headers["content-type"] ?? "");
        const p = parseHtml(r.finalUrl, isHtml ? r.body : "", { status: r.status, contentType: r.headers["content-type"] ?? null, xRobotsTag: r.headers["x-robots-tag"] ?? null, loadMs: r.ms, redirectChain: r.chain });
        const links = [...new Set(p.links.filter((l) => { try { return sameSite(new URL(l.href)); } catch { return false; } }).map((l) => normPath(l.href)))].slice(0, 300);
        const cat = categorize(new URL(r.finalUrl).pathname, p.title ?? "", p.h1[0] ?? "", places, sectors);
        observed.set(path, {
          url, path, status: r.status, finalUrl: r.finalUrl, title: p.title?.slice(0, 300) ?? null, metaDescription: p.metaDescription?.slice(0, 400) ?? null, canonical: p.canonical,
          robotsMeta: p.robotsMeta, h1: p.h1.map((x) => x.slice(0, 200)).slice(0, 5), h2: isHtml ? headingsOf(r.body) : [], wordCount: p.wordCount, contentHash: p.contentHash,
          schemaTypes: [...new Set(p.schemaTypes)].slice(0, 20), internalLinks: links.length, links, imagesNoAlt: p.images.filter((i) => !i.alt?.trim()).length, images: p.images.length,
          inSitemap: sm.has(url), depth, category: cat.category, topics: cat.topics, etag: r.headers.etag || null, lastModified: r.headers["last-modified"] || null,
          lastSeenAt: now, fetchedAt: now, removedAt: r.status === 404 || r.status === 410 ? now : null,
        });
        if (r.status === 200 && isHtml) for (const l of links) push(l, depth + 1);
      } catch {
        stats.errors++;
      }
    }));
  }

  // ── FARK (önceki gözlemle) ──
  const changes: ChangeRow[] = [];
  if (prev.length) {
    const removed: { path: string; hash: string | null; title: string | null }[] = [];
    for (const [path, o] of observed) {
      const b = prevByPath.get(path);
      if (!b) continue;
      if (b.status === 200 && (o.status === 404 || o.status === 410)) removed.push({ path, hash: b.contentHash, title: b.title });
      if (!firstFetch.has(path) || o.status !== 200 || b.status !== 200) continue;
      if ((b.title ?? "") !== (o.title ?? "")) changes.push({ kind: "TITLE", url: path, before: b.title, after: o.title });
      if ((b.h1[0] ?? "") !== (o.h1[0] ?? "")) changes.push({ kind: "H1", url: path, before: b.h1[0] ?? null, after: o.h1[0] ?? null });
      if (Math.abs(o.wordCount - b.wordCount) >= 100 && Math.abs(o.wordCount - b.wordCount) / Math.max(1, b.wordCount) >= 0.2) changes.push({ kind: "LENGTH", url: path, before: String(b.wordCount), after: String(o.wordCount) });
      const newSchema = o.schemaTypes.filter((s) => !b.schemaTypes.includes(s));
      if (newSchema.length) changes.push({ kind: "SCHEMA", url: path, before: b.schemaTypes.join(", ") || null, after: newSchema.join(", ") });
    }
    // Sitemap'te listelenen ama artık listelenmeyen ve bu taramada görülmeyen sayfa → kaldırıldı (sitemap)
    for (const b of prev) {
      if (b.removedAt || observed.has(b.path)) continue;
      if (b.inSitemap && stats.sitemapFound && !sm.has(b.url)) removed.push({ path: b.path, hash: b.contentHash, title: b.title });
    }
    const added = [...observed.values()].filter((o) => !prevByPath.has(o.path) && o.status === 200);
    for (const r of removed) {
      // Aynı içerik farklı adreste → URL değişikliği (ÇIKARIM: içerik özeti eşleşmesi)
      const moved = r.hash ? added.find((a) => a.contentHash === r.hash) : undefined;
      if (moved) { changes.push({ kind: "URL_CHANGE", url: moved.path, before: r.path, after: moved.path }); added.splice(added.indexOf(moved), 1); }
      else changes.push({ kind: "REMOVED_PAGE", url: r.path, before: r.title, after: null });
    }
    for (const a of added) changes.push({ kind: "NEW_PAGE", url: a.path, before: null, after: a.title });
    const prevTopics = new Set(prev.filter((p) => !p.removedAt && p.status === 200).flatMap((p) => p.topics));
    const prevLoc = new Set(prev.filter((p) => !p.removedAt && p.category === "location").map((p) => p.path));
    for (const t of new Set(added.flatMap((a) => a.topics))) if (!prevTopics.has(t)) changes.push({ kind: "NEW_SERVICE", url: added.find((a) => a.topics.includes(t))!.path, before: null, after: t });
    for (const a of added) if (a.category === "location" && !prevLoc.has(a.path)) changes.push({ kind: "NEW_LOCATION", url: a.path, before: null, after: a.title });
  }

  // ── KAYIT ──
  for (const o of observed.values()) {
    await db.competitorPage.upsert({ where: { competitorId_url: { competitorId, url: o.url } }, create: { ...o, competitorId, firstSeenAt: now }, update: o });
  }
  const goneFromSitemap = changes.filter((x) => x.kind === "REMOVED_PAGE").map((x) => x.url).filter((p) => !observed.has(p));
  if (goneFromSitemap.length) await db.competitorPage.updateMany({ where: { competitorId, path: { in: goneFromSitemap } }, data: { removedAt: now } });
  const live = [...observed.values()].filter((o) => o.status === 200 && !o.removedAt);
  stats.pages = live.length;
  for (const o of live) stats.categories[o.category ?? "other"] = (stats.categories[o.category ?? "other"] ?? 0) + 1;
  stats.services = [...new Set(live.flatMap((o) => o.topics))].sort();
  stats.locations = live.filter((o) => o.category === "location").map((o) => o.path).sort();
  stats.schemaTypes = [...new Set(live.flatMap((o) => o.schemaTypes))].sort();
  stats.changes = changes.length;
  stats.durationMs = Date.now() - t0;
  const snap = await db.competitorSnapshot.create({ data: { competitorId, status: stats.errors && !live.length ? "error" : stats.errors ? "partial" : "ok", data: stats as object, error: stats.errors ? `${stats.errors} sayfa okunamadı` : null } });
  if (changes.length) await db.competitorChange.createMany({ data: changes.map((x) => ({ ...x, competitorId, snapshotId: snap.id })) });
  await db.competitor.update({ where: { id: competitorId }, data: { lastCrawlAt: now, lastStatus: home.status, lastError: stats.errors ? `${stats.errors} sayfa okunamadı` : null, status: "active" } });
  return { snapshotId: snap.id, ok: true, error: null, stats, changes };
}
