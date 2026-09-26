import "server-only";
import { parse } from "node-html-parser";
import { db } from "../db";
import { siteUrl } from "../env";
import { robotsMatch } from "../seo/robots";
import { type Issue, type ParsedPage, detectIssues, healthScore, isNoindex, normUrl, parseHtml } from "./parse";

export const CRAWLER_UA = "Mozilla/5.0 (compatible; WTA-SEO-Crawler/1.0; +/yonetim)";

type FetchResult = { finalUrl: string; status: number; chain: { url: string; status: number }[]; body: string | null; contentType: string | null; xRobotsTag: string | null; ms: number };

/** Yönlendirmeleri elle takip eder; zinciri kaydeder. */
export async function fetchFollow(url: string, fetchImpl: typeof fetch = fetch, method: "GET" | "HEAD" = "GET"): Promise<FetchResult> {
  const chain: { url: string; status: number }[] = [];
  let current = url;
  const t0 = Date.now();
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetchImpl(current, {
      method, redirect: "manual", headers: { "User-Agent": CRAWLER_UA, Accept: "text/html,application/xhtml+xml,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      chain.push({ url: current, status: res.status });
      current = new URL(loc, current).toString();
      continue;
    }
    const ct = res.headers.get("content-type");
    const body = method === "GET" && ct?.includes("html") ? await res.text() : method === "GET" && ct?.includes("xml") ? await res.text() : null;
    return { finalUrl: current, status: res.status, chain, body, contentType: ct, xRobotsTag: res.headers.get("x-robots-tag"), ms: Date.now() - t0 };
  }
  return { finalUrl: current, status: 310, chain, body: null, contentType: null, xRobotsTag: null, ms: Date.now() - t0 };
}

export async function fetchRobotsDisallow(base: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(`${base}/robots.txt`, { headers: { "User-Agent": CRAWLER_UA } });
    if (!res.ok) return [];
    const rules: string[] = [];
    let applies = false;
    for (const raw of (await res.text()).split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const [k, ...v] = line.split(":");
      const key = k?.trim().toLowerCase();
      const val = v.join(":").trim();
      if (key === "user-agent") applies = val === "*";
      else if (key === "disallow" && applies && val) rules.push(val);
    }
    return rules;
  } catch {
    return [];
  }
}

/** Sitemap veya sitemap index'ten URL'leri toplar (iç içe en fazla 2 seviye). */
export async function fetchSitemapUrls(url: string, fetchImpl: typeof fetch = fetch, depth = 0, cap = 5000): Promise<string[]> {
  if (depth > 2) return [];
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": CRAWLER_UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const xml = parse(await res.text());
    const locs = (sel: string) => xml.querySelectorAll(sel).map((n) => n.textContent.trim()).filter(Boolean);
    const nested = locs("sitemap > loc");
    if (nested.length) {
      const out: string[] = [];
      for (const n of nested.slice(0, 50)) {
        out.push(...(await fetchSitemapUrls(n, fetchImpl, depth + 1, cap - out.length)));
        if (out.length >= cap) break;
      }
      return out;
    }
    return locs("url > loc").slice(0, cap);
  } catch {
    return [];
  }
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export type CrawlOutput = { pages: ParsedPage[]; issues: Issue[]; health: number; sitemapUrls: string[]; depth: Map<string, number>; inlinks: Map<string, number> };

/** Siteyi tarar: sitemap URL'leri + ana sayfadan başlayarak iç linkleri takip eder. */
export async function crawlSite(opts: { base?: string; maxPages?: number; checkExternal?: boolean; fetchImpl?: typeof fetch } = {}): Promise<CrawlOutput> {
  const base = (opts.base ?? siteUrl()).replace(/\/+$/, "");
  const host = new URL(base).host;
  const f = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 1000;
  const [disallow, sitemapList] = await Promise.all([fetchRobotsDisallow(base, f), fetchSitemapUrls(`${base}/sitemap.xml`, f)]);
  const sitemapUrls = new Set(sitemapList.map(normUrl));
  const depth = new Map<string, number>();
  const queue: string[] = [];
  const enqueue = (u: string, d: number) => {
    const n = normUrl(u);
    if (depth.has(n) || depth.size >= maxPages) return;
    try {
      if (new URL(n).host !== host) return;
    } catch {
      return;
    }
    if (/\.(png|jpe?g|gif|webp|avif|svg|pdf|zip|ico|css|js|xml|txt)$/i.test(new URL(n).pathname)) return;
    depth.set(n, d);
    queue.push(n);
  };
  enqueue(`${base}/`, 0);
  for (const u of sitemapUrls) enqueue(u, 1);

  const pages: ParsedPage[] = [];
  const inlinks = new Map<string, number>();
  const externals = new Set<string>();
  const robotsBlocked = new Set<string>();
  while (queue.length) {
    const batch = queue.splice(0, 8);
    const results = await pool(batch, 4, async (u) => {
      const path = new URL(u).pathname;
      if (disallow.some((r) => robotsMatch(r, path))) {
        robotsBlocked.add(u);
        if (!sitemapUrls.has(u)) return null;
      }
      try {
        const r = await fetchFollow(u, f);
        return parseHtml(u, r.body ?? "", { status: r.status, contentType: r.contentType, xRobotsTag: r.xRobotsTag, loadMs: r.ms, redirectChain: r.chain });
      } catch (e) {
        // Bağlantı kurulamadı: 599 olarak kaydedilir (5xx → kritik sorun)
        return { ...parseHtml(u, "", { status: 599, contentType: null, xRobotsTag: null, loadMs: null }), title: `Bağlantı hatası: ${e instanceof Error ? e.message : e}` };
      }
    });
    for (const p of results) {
      if (!p) continue;
      pages.push(p);
      const d = depth.get(normUrl(p.url)) ?? 0;
      const seen = new Set<string>();
      for (const l of p.links) {
        let h: string;
        try {
          h = new URL(l.href).host;
        } catch {
          continue;
        }
        const t = normUrl(l.href);
        if (h === host) {
          if (!seen.has(t) && t !== normUrl(p.url)) {
            inlinks.set(t, (inlinks.get(t) ?? 0) + 1);
            seen.add(t);
          }
          if (!l.nofollow) enqueue(t, d + 1);
        } else if (/^https?:/.test(t)) externals.add(t);
      }
    }
  }

  const brokenExternal = new Map<string, number>();
  if (opts.checkExternal !== false) {
    await pool([...externals].slice(0, 150), 4, async (u) => {
      try {
        let r = await fetchFollow(u, f, "HEAD");
        if (r.status === 405 || r.status === 403) r = await fetchFollow(u, f, "GET");
        if (r.status >= 400) brokenExternal.set(u, r.status);
      } catch {
        brokenExternal.set(u, 0);
      }
    });
  }
  const issues = detectIssues(pages, { sitemapUrls, host, brokenExternal, robotsBlocked, inlinks });
  return { pages, issues, health: healthScore(pages.length, issues), sitemapUrls: [...sitemapUrls], depth, inlinks };
}

/** Taramayı çalıştırıp sonuçları kaydeder. */
export async function runCrawl(triggeredBy = "sistem", opts: Parameters<typeof crawlSite>[0] = {}) {
  const run = await db.crawlRun.create({ data: { baseUrl: opts.base ?? siteUrl(), triggeredBy } });
  try {
    const out = await crawlSite(opts);
    // Form/iletişim/liste gibi yardımcı sayfalarda kısa metin sorun değildir.
    const utility = new Set(
      (await db.page.findMany({ where: { type: { in: ["STATIC", "BLOG_INDEX"] } }, select: { path: true } })).map((p) => p.path),
    );
    out.issues = out.issues.filter((i) => !(i.code === "THIN_CONTENT" && utility.has(new URL(i.url).pathname.replace(/\/$/, "") || "/")));
    out.health = healthScore(out.pages.length, out.issues);
    await db.crawlPage.createMany({
      data: out.pages.map((p) => {
        const u = normUrl(p.url);
        return {
          runId: run.id, url: u, status: p.status, redirectChain: p.redirectChain, contentType: p.contentType,
          title: p.title, metaDescription: p.metaDescription, canonical: p.canonical, robotsMeta: p.robotsMeta,
          xRobotsTag: p.xRobotsTag, h1: p.h1, h2Count: p.h2Count, wordCount: p.wordCount, contentHash: p.contentHash,
          internalLinks: p.links.filter((l) => l.href.includes(new URL(u).host)).length,
          externalLinks: p.links.filter((l) => /^https?:/.test(l.href) && !l.href.includes(new URL(u).host)).length,
          inlinks: out.inlinks.get(u) ?? 0, images: p.images.length, imagesNoAlt: p.images.filter((i) => !i.alt?.trim()).length,
          schemaTypes: p.schemaTypes, hasViewport: p.hasViewport, loadMs: p.loadMs, bytes: p.bytes,
          inSitemap: out.sitemapUrls.includes(u), indexable: p.status === 200 && !isNoindex(p), depth: out.depth.get(u) ?? 0,
        };
      }),
    });
    await db.crawlIssue.createMany({ data: out.issues.map((i) => ({ runId: run.id, url: i.url, code: i.code, severity: i.severity, message: i.message, detail: (i.detail ?? undefined) as object | undefined })) });
    await db.crawlRun.update({
      where: { id: run.id },
      data: { status: "ok", pagesCrawled: out.pages.length, issueCount: out.issues.length, healthScore: out.health, finishedAt: new Date() },
    });
    // Eski taramaları sınırlı tut (son 10)
    const old = await db.crawlRun.findMany({ orderBy: { startedAt: "desc" }, skip: 10, select: { id: true } });
    if (old.length) await db.crawlRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return { status: "ok" as const, message: `${out.pages.length} sayfa tarandı, ${out.issues.length} sorun, sağlık skoru ${out.health}`, stats: { runId: run.id, pages: out.pages.length, issues: out.issues.length, health: out.health } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.crawlRun.update({ where: { id: run.id }, data: { status: "error", message, finishedAt: new Date() } });
    throw e;
  }
}
