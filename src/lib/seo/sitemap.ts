import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { siteUrl } from "../env";
import { getSettings } from "../settings";
import { PAGES_TAG } from "../site/graph-data";
import { isSelfCanonical } from "./meta";
import { PLACEHOLDER_RE, UNVERIFIED_RE } from "./analyzer-shared";

export const SITEMAP_GROUPS = {
  pages: ["HOME", "STATIC", "BLOG_INDEX"],
  services: ["SERVICE", "SECTOR"],
  locations: ["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"],
  blog: ["BLOG_POST"],
} as const;
export type SitemapGroup = keyof typeof SITEMAP_GROUPS;

/** Yalnızca gerçekten indekslenebilir sayfalar: yayında, noindex değil, kendi canonical'ı. */
export const indexableEntries = unstable_cache(
  async () => {
    const settings = await getSettings();
    if (!settings.seo.allowIndexing) return [];
    const base = siteUrl();
    const [pages, redirects] = await Promise.all([
      db.page.findMany({
        where: { status: "PUBLISHED", robotsIndex: true, autoNoindex: false },
        select: { path: true, type: true, canonical: true, contentUpdatedAt: true, intro: true, body: true, h1: true, seoTitle: true },
        orderBy: { path: "asc" },
      }),
      db.redirect.findMany({ where: { active: true }, select: { fromPath: true } }),
    ]);
    const redirected = new Set(redirects.map((r) => r.fromPath));
    return pages
      // Yönlendirme kaynağı, doğrulanmamış içerik veya yer tutucu içeren URL asla sitemap'e girmez
      .filter((p) => !redirected.has(p.path))
      .filter((p) => ![p.intro, p.body, p.h1, p.seoTitle].some((t) => t && (UNVERIFIED_RE.test(t) || PLACEHOLDER_RE.test(t))))
      .filter((p) => isSelfCanonical(p, base))
      .map((p) => ({ path: p.path, type: p.type as string, lastmod: p.contentUpdatedAt.toISOString() }));
  },
  ["sitemap-entries"],
  { tags: [PAGES_TAG, "settings"], revalidate: 3600 },
);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sitemapXml(group: SitemapGroup): Promise<string> {
  const base = siteUrl();
  const types = SITEMAP_GROUPS[group] as readonly string[];
  const entries = (await indexableEntries()).filter((e) => types.includes(e.type));
  const urls = entries
    .map((e) => `<url><loc>${esc(e.path === "/" ? `${base}/` : base + encodeURI(e.path))}</loc><lastmod>${e.lastmod}</lastmod></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

export async function sitemapIndexXml(): Promise<string> {
  const base = siteUrl();
  const entries = await indexableEntries();
  const parts = (Object.keys(SITEMAP_GROUPS) as SitemapGroup[])
    .map((g) => {
      const list = entries.filter((e) => (SITEMAP_GROUPS[g] as readonly string[]).includes(e.type));
      if (!list.length) return "";
      const last = list.map((e) => e.lastmod).sort().at(-1)!;
      return `<sitemap><loc>${base}/sitemap-${g}.xml</loc><lastmod>${last}</lastmod></sitemap>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${parts}</sitemapindex>\n`;
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
