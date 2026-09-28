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
import { acquireCrawlLock, leaseFor, releaseCrawlLock } from "./lock";

type Prev = Awaited<ReturnType<typeof db.competitorPage.findMany>>[number];
export type ChangeRow = { kind: string; url: string; before: string | null; after: string | null };
export type CrawlStats = {
  pages: number; fetched: number; notModified: number; cacheHits: number; blockedByRobots: number; errors: number; truncated: number;
  sitemapFound: boolean; sitemapUrls: number; robotsFound: boolean; crawlDelay: number | null; https: boolean; homeStatus: number | null;
  categories: Record<string, number>; services: string[]; locations: string[]; schemaTypes: string[]; changes: number; firstCrawl: boolean; durationMs: number;
  // Yönlendirme kaynakları (sayfa değil) ve aynı içerikli 200 sayfalar (kopya): kayıt korunur, sayılmaz
  redirects: { from: string; to: string; status: number; external: boolean }[];
  redirectsDeduped: number; redirectsExternal: number;
  duplicates: { path: string; of: string }[];
  budgetReached: boolean;
};

const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|pdf|zip|ico|css|js|xml|txt|json|mp4|webm|mp3|woff2?|ttf|eot|docx?|xlsx?)$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Yönlendirme kaynağı gibi içerik taşımayan kayıt iskeleti. */
function emptyObs(url: string, path: string, now: Date) {
  return {
    url, path, status: 0, finalUrl: null as string | null, title: null, metaDescription: null, canonical: null, robotsMeta: null, h1: [] as string[], h2: [] as string[], wordCount: 0, contentHash: null,
    schemaTypes: [] as string[], internalLinks: 0, links: [] as string[], imagesNoAlt: 0, images: 0, inSitemap: false, depth: 0, duplicateOf: null, category: null, topics: [] as string[],
    etag: null, lastModified: null, lastSeenAt: now, fetchedAt: now, removedAt: null,
  };
}

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

export type CrawlOptions = { policy?: NetPolicy; now?: Date; settings?: Partial<CompetitorSettings>; baseOverride?: string };
export type CrawlOutcome = { snapshotId: string | null; ok: boolean; locked?: boolean; error: string | null; stats: CrawlStats | null; changes: ChangeRow[] };

/**
 * Rakibi tarar. Önce veritabanında atomik kilit alınır (lock.ts); alınamazsa HİÇBİR HTTP
 * isteği yapılmaz ve "taranıyor" döner. Kilit tarama sonunda (hata olsa da) bırakılır.
 */
export async function crawlCompetitor(competitorId: string, opts: CrawlOptions = {}): Promise<CrawlOutcome> {
  const settings = { ...(await getSettingsFresh()).competitors, ...(opts.settings ?? {}) };
  const lock = await acquireCrawlLock(competitorId, leaseFor(settings));
  if (!lock.acquired) return { snapshotId: null, ok: false, locked: true, error: lock.reason, stats: null, changes: [] };
  try {
    return await runCrawl(competitorId, lock.snapshotId, settings, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.competitorSnapshot.update({ where: { id: lock.snapshotId }, data: { status: "error", error: msg } });
    await db.competitor.update({ where: { id: competitorId }, data: { lastError: msg, status: "error" } });
    return { snapshotId: lock.snapshotId, ok: false, error: msg, stats: null, changes: [] };
  } finally {
    await releaseCrawlLock(competitorId, lock.owner);
  }
}

/** Yalnızca 200 ve başka sayfanın kopyası olmayan kayıtlar "canlı sayfa"dır. */
export const LIVE_PAGE = { status: 200, removedAt: null, duplicateOf: null } as const;

const MIN_DUP_WORDS = 150; // bu uzunluğun altındaki sayfalarda içerik özeti eşleşmesi tek başına güvenilmez

async function runCrawl(competitorId: string, snapshotId: string, settings: CompetitorSettings, opts: CrawlOptions): Promise<CrawlOutcome> {
  const t0 = Date.now();
  const now = opts.now ?? new Date();
  const policy = opts.policy ?? {};
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
    // Başarısız tarama: lastCrawlAt (son BAŞARILI tarama) değişmez
    await db.competitor.update({ where: { id: competitorId }, data: { lastStatus: null, lastError: err, status: "error" } });
    await db.competitorSnapshot.update({ where: { id: snapshotId }, data: { status: "error", error: err } });
    return { snapshotId, ok: false, error: err, stats: null, changes: [] };
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
  const stats: CrawlStats = { pages: 0, fetched: 0, notModified: 0, cacheHits: 0, blockedByRobots: 0, errors: 0, truncated: 0, sitemapFound: sm.size > 0, sitemapUrls: sm.size, robotsFound: robots.found, crawlDelay: robots.crawlDelay, https: origin.startsWith("https:"), homeStatus: home.status, categories: {}, services: [], locations: [], schemaTypes: [], changes: 0, firstCrawl: prev.length === 0, durationMs: 0, redirects: [], redirectsDeduped: 0, redirectsExternal: 0, duplicates: [], budgetReached: false };
  const push = (raw: string, depth: number) => {
    let u: URL;
    try { u = new URL(raw, origin); } catch { return; }
    if (!sameSite(u) || !/^https?:$/.test(u.protocol) || ASSET.test(u.pathname)) return;
    u.hash = "";
    const path = normPath(u.toString());
    // Kuyruk sınırı geniş tutulur (yönlendirme kaynakları sayfa değildir); bütçe canlı sayfaya uygulanır
    if (seen.has(path) || seen.size >= settings.maxPages * 3 || depth > settings.maxDepth + 1) return;
    if (!robotsAllowed(robots, new URL(path, origin).pathname)) { stats.blockedByRobots++; seen.add(path); return; }
    seen.add(path);
    queue.push({ url: new URL(path, origin).toString(), depth });
  };
  push(home.finalUrl, 0);
  for (const u of sm.keys()) push(u, 1);

  type Obs = Omit<Prev, "id" | "competitorId" | "firstSeenAt">;
  const observed = new Map<string, Obs>();
  const firstFetch = new Set<string>();
  const byHash = new Map<string, string>(); // içerik özeti → ilk (asıl) sayfa yolu
  const cutoff = now.getTime() - settings.cacheHours * 3600_000;
  const liveCount = () => [...observed.values()].filter((o) => o.status === 200 && !o.removedAt && !o.duplicateOf).length;
  // Bu taramada indirilmiş adresler: yönlendirme bunlardan birine giderse tekrar indirilmez
  const fetchedPaths = new Set<string>();
  const followIf = (u: URL) => sameSite(u) && !fetchedPaths.has(normPath(u.toString()));
  const canonPath = (c: string | null) => { try { return c ? normPath(new URL(c, origin).toString()) : null; } catch { return null; } };

  /** 200 sayfa kaydı: aynı içerik güçlü sinyallerle eşleşirse kopya olarak işaretlenir. */
  const store = (path: string, o: Obs): boolean => {
    if (o.status === 200 && o.contentHash && o.wordCount >= MIN_DUP_WORDS) {
      const first = byHash.get(o.contentHash);
      const firstObs = first ? observed.get(first) : undefined;
      // Güçlü sinyal: aynı özet + yeterli uzunluk + (canonical aynı hedefe veya asıl sayfaya işaret)
      if (first && firstObs && first !== path && (canonPath(o.canonical) === first || (canonPath(o.canonical) && canonPath(o.canonical) === canonPath(firstObs.canonical)))) {
        observed.set(path, { ...o, duplicateOf: first });
        stats.duplicates.push({ path, of: first });
        return false;
      }
      if (!first) byHash.set(o.contentHash, path);
    }
    observed.set(path, { ...o, duplicateOf: null });
    return o.status === 200;
  };

  while (queue.length) {
    if (liveCount() >= settings.maxPages) { stats.budgetReached = true; break; }
    const batch = queue.splice(0, settings.concurrency);
    await Promise.all(batch.map(async ({ url, depth }) => {
      const path = normPath(url);
      if (observed.has(path)) return; // yönlendirme hedefi olarak zaten kaydedildi
      const old = prevByPath.get(path);
      const lastmod = sm.get(url) ?? null;
      const fresh = old && old.status === 200 && !old.duplicateOf && old.fetchedAt.getTime() > cutoff && !(lastmod && new Date(lastmod).getTime() > old.fetchedAt.getTime());
      if (fresh && url !== home!.finalUrl) {
        stats.cacheHits++;
        fetchedPaths.add(path);
        store(path, { ...old, inSitemap: sm.has(url), depth, lastSeenAt: now, removedAt: null });
        for (const l of old.links) push(l, depth + 1);
        return;
      }
      // Önbellek süresi içindeki yönlendirme kaynağı yeniden istenmez (hedefi ayrıca taranır)
      if (old && old.status >= 300 && old.status < 400 && old.finalUrl && old.fetchedAt.getTime() > cutoff) {
        stats.cacheHits++;
        observed.set(path, { ...old, inSitemap: sm.has(url), depth, lastSeenAt: now });
        try { if (sameSite(new URL(old.finalUrl))) push(old.finalUrl, depth); } catch { /* geçersiz hedef */ }
        return;
      }
      try {
        const cond: Record<string, string> = {};
        if (old?.etag && old.status === 200) cond["if-none-match"] = old.etag;
        if (old?.lastModified && old.status === 200) cond["if-modified-since"] = old.lastModified;
        const r = url === home!.finalUrl && !old ? home! : await safeFetch(url, { policy, timeoutMs: settings.timeoutMs, maxBytes: settings.maxBytes, headers: cond, followIf });
        if (r !== home) await sleep(delay);
        if (r.status === 304 && old) {
          stats.notModified++;
          fetchedPaths.add(path);
          store(path, { ...old, inSitemap: sm.has(url), depth, lastSeenAt: now, fetchedAt: now, removedAt: null });
          for (const l of old.links) push(l, depth + 1);
          return;
        }
        stats.fetched++;
        if (r.truncated) stats.truncated++;
        firstFetch.add(path);
        // ── Gerçek HTTP yönlendirmesi (301/302/307/308): kaynak adres korunur (3xx kaydı), sayfa son adreste
        const finalPath = normPath(r.finalUrl);
        if (!r.chain.length) fetchedPaths.add(path);
        if (r.chain.length && finalPath !== path) {
          // Durdurulan yönlendirme: dış site mi, yoksa bu taramada zaten indirilmiş adres mi?
          const external = Boolean(r.stoppedAt) && !sameSite(new URL(r.stoppedAt!));
          stats.redirects.push({ from: path, to: external ? r.finalUrl : finalPath, status: r.chain[0].status, external });
          observed.set(path, { ...emptyObs(url, path, now), status: r.chain[0].status, finalUrl: r.finalUrl, inSitemap: sm.has(url), depth });
          // Zincirdeki ara adresler de istendi: yönlendirme kaydı olarak işaretlenir (kuyrukta tekrar istenmez)
          for (const hop of r.chain.slice(1)) {
            const hp = normPath(hop.url);
            fetchedPaths.add(hp);
            if (!observed.has(hp)) observed.set(hp, { ...emptyObs(hop.url, hp, now), status: hop.status, finalUrl: r.finalUrl, inSitemap: sm.has(hop.url), depth });
          }
          if (external) { stats.redirectsExternal++; return; }
          seen.add(finalPath);
          if (r.stoppedAt || observed.has(finalPath)) { stats.redirectsDeduped++; return; } // aynı son adres ikinci kez taranmaz
          fetchedPaths.add(finalPath);
        }
        const target = r.chain.length ? finalPath : path;
        const isHtml = /html/i.test(r.headers["content-type"] ?? "");
        const p = parseHtml(r.finalUrl, isHtml ? r.body : "", { status: r.status, contentType: r.headers["content-type"] ?? null, xRobotsTag: r.headers["x-robots-tag"] ?? null, loadMs: r.ms, redirectChain: r.chain });
        const links = [...new Set(p.links.filter((l) => { try { return sameSite(new URL(l.href)); } catch { return false; } }).map((l) => normPath(l.href)))].slice(0, 300);
        const cat = categorize(new URL(r.finalUrl).pathname, p.title ?? "", p.h1[0] ?? "", places, sectors, p.schemaTypes);
        const isLive = store(target, {
          url: r.chain.length ? new URL(target, origin).toString() : url, path: target, status: r.status, finalUrl: r.finalUrl, title: p.title?.slice(0, 300) ?? null, metaDescription: p.metaDescription?.slice(0, 400) ?? null, canonical: p.canonical,
          robotsMeta: p.robotsMeta, h1: p.h1.map((x) => x.slice(0, 200)).slice(0, 5), h2: isHtml ? headingsOf(r.body) : [], wordCount: p.wordCount, contentHash: p.contentHash,
          schemaTypes: [...new Set(p.schemaTypes)].slice(0, 20), internalLinks: links.length, links, imagesNoAlt: p.images.filter((i) => !i.alt?.trim()).length, images: p.images.length,
          inSitemap: sm.has(url) || sm.has(new URL(target, origin).toString()), depth, category: cat.category, topics: cat.topics, etag: r.headers.etag || null, lastModified: r.headers["last-modified"] || null,
          lastSeenAt: now, fetchedAt: now, removedAt: r.status === 404 || r.status === 410 ? now : null, duplicateOf: null,
        });
        if (target !== path) firstFetch.add(target);
        // Kopya sayfanın linkleri izlenmez (tarama bütçesi)
        if (isLive && isHtml) for (const l of links) push(l, depth + 1);
      } catch (e) {
        stats.errors++;
        // Yönlendirme döngüsü: döngüdeki adresler kaydedilir (kuyruktan tekrar istenip döngü yinelenmez)
        const chain = (e as { chain?: { url: string; status: number }[] }).chain ?? [];
        for (const hop of chain) {
          const hp = normPath(hop.url);
          fetchedPaths.add(hp);
          if (!observed.has(hp)) observed.set(hp, { ...emptyObs(hop.url, hp, now), status: hop.status, finalUrl: null, inSitemap: sm.has(hop.url), depth });
        }
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
      // Önceden sayfa sanılan adres artık gerçek HTTP yönlendirmesi: kayıt korunur (3xx), canlı sayılmaz
      if (b.status === 200 && o.status >= 300 && o.status < 400) changes.push({ kind: "REDIRECTED", url: path, before: String(b.status), after: o.finalUrl });
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
  const live = [...observed.values()].filter((o) => o.status === 200 && !o.removedAt && !o.duplicateOf);
  stats.pages = live.length;
  stats.redirects = stats.redirects.slice(0, 200);
  stats.duplicates = stats.duplicates.slice(0, 200);
  for (const o of live) stats.categories[o.category ?? "other"] = (stats.categories[o.category ?? "other"] ?? 0) + 1;
  stats.services = [...new Set(live.flatMap((o) => o.topics))].sort();
  stats.locations = live.filter((o) => o.category === "location").map((o) => o.path).sort();
  stats.schemaTypes = [...new Set(live.flatMap((o) => o.schemaTypes))].sort();
  stats.changes = changes.length;
  stats.durationMs = Date.now() - t0;
  const failed = Boolean(stats.errors && !live.length);
  await db.competitorSnapshot.update({ where: { id: snapshotId }, data: { status: failed ? "error" : stats.errors ? "partial" : "ok", data: stats as object, error: stats.errors ? `${stats.errors} sayfa okunamadı` : null } });
  if (changes.length) await db.competitorChange.createMany({ data: changes.map((x) => ({ ...x, competitorId, snapshotId })) });
  // lastCrawlAt = son BAŞARIYLA TAMAMLANAN taramanın bitişi (başlangıç: crawlStartedAt)
  const finishedAt = new Date(now.getTime() + (Date.now() - t0));
  await db.competitor.update({
    where: { id: competitorId },
    data: { ...(failed ? { status: "error" } : { lastCrawlAt: finishedAt, status: "active" }), lastStatus: home.status, lastError: stats.errors ? `${stats.errors} sayfa okunamadı` : null },
  });
  return { snapshotId, ok: !failed, error: failed ? `${stats.errors} sayfa okunamadı` : null, stats, changes };
}
