import "server-only";
// Canlı sitemap doğrulaması: sitemap'teki her URL gerçekten 200 dönüyor mu,
// noindex değil mi, canonical kendisini mi gösteriyor, doğrulanmamış içerik yok mu?

import { siteUrl } from "../env";
import { fetchFollow, fetchSitemapUrls } from "../crawler/crawl";
import { isNoindex, normUrl, parseHtml } from "../crawler/parse";

export type SitemapProblem = { url: string; problem: string };

export async function checkSitemap(fetchImpl: typeof fetch = fetch, base = siteUrl()) {
  const urls = await fetchSitemapUrls(`${base}/sitemap.xml`, fetchImpl);
  const problems: SitemapProblem[] = [];
  const canonicalBase = urls[0]?.match(/^https?:\/\/[^/]+/)?.[0] ?? base;
  for (const u of urls) {
    const local = u.replace(canonicalBase, base);
    try {
      const r = await fetchFollow(local, fetchImpl);
      if (r.chain.length) problems.push({ url: u, problem: `Yönlendiriyor (${r.chain.map((c) => c.status).join("→")})` });
      if (r.status !== 200) {
        problems.push({ url: u, problem: `HTTP ${r.status}` });
        continue;
      }
      const p = parseHtml(local, r.body ?? "", { status: r.status, contentType: r.contentType, xRobotsTag: r.xRobotsTag, loadMs: r.ms });
      if (isNoindex(p)) problems.push({ url: u, problem: "NOINDEX sayfa sitemap'te" });
      if (p.canonical && normUrl(p.canonical) !== normUrl(u)) problems.push({ url: u, problem: `Canonical başka URL: ${p.canonical}` });
      if ((r.body ?? "").includes("[DOĞRULANMALI")) problems.push({ url: u, problem: "Doğrulanmamış [DOĞRULANMALI] içerik" });
    } catch (e) {
      problems.push({ url: u, problem: `Erişilemedi: ${e instanceof Error ? e.message : e}` });
    }
  }
  return { urls: urls.length, problems };
}
