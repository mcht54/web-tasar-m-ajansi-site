import "server-only";
// Rakip analizi: yalnızca herkese açık veri (robots.txt, sitemap, sayfa HTML'i).
// Rakibin trafik/keyword/görünürlük verisi üçüncü taraf sağlayıcı olmadan
// bilinemez; bu alanlar "Doğrulanamadı" olarak döner, tahmin üretilmez.

import { db } from "../db";
import { fetchFollow, fetchSitemapUrls } from "../crawler/crawl";
import { parseHtml } from "../crawler/parse";
import { slugify } from "../text/slug";
import { siteHost, siteUrl } from "../env";

export type SiteProfile = {
  domain: string;
  reachable: boolean;
  robotsFound: boolean;
  sitemapUrls: number | null; // sitemap'te listelenen URL (indekslenen sayfa sayısı değildir)
  categories: { service: number; city: number; blog: number; other: number } | null;
  citiesCovered: number | null;
  sampled: number;
  avgWords: number | null;
  avgInternalLinks: number | null;
  schemaTypes: string[];
  titlePatterns: string[];
  h1Examples: string[];
  pagesWithH1Pct: number | null;
  pagesWithMetaPct: number | null;
  https: boolean;
  homeLoadMs: number | null;
  notVerifiable: string[];
  error?: string;
};

const SERVICE_HINTS = ["web-tasarim", "web-sitesi", "e-ticaret", "seo", "hizmet", "kurumsal", "yazilim", "google-ads", "sosyal-medya", "logo"];
const BLOG_HINTS = ["/blog", "/makale", "/haber", "/rehber", "/yazi", "/icerik"];

export function normalizeDomain(input: string): string {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) throw new Error("Geçerli bir alan adı girin (ör. ornek.com)");
  return s;
}

export function classifyUrls(urls: string[], provinceSlugs: string[]) {
  const cats = { service: 0, city: 0, blog: 0, other: 0 };
  const cities = new Set<string>();
  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u).pathname.toLowerCase();
    } catch {
      continue;
    }
    const segs = path.split(/[/-]/).filter(Boolean);
    const joined = path.replace(/\//g, "-");
    const city = provinceSlugs.find((c) => segs.includes(c) || joined.includes(`-${c}`));
    if (BLOG_HINTS.some((h) => path.startsWith(h))) cats.blog++;
    else if (city) {
      cats.city++;
      cities.add(city);
    } else if (SERVICE_HINTS.some((h) => path.includes(h))) cats.service++;
    else cats.other++;
  }
  return { cats, cities: cities.size };
}

function titlePattern(title: string, brand: string): string {
  return title.replace(new RegExp(brand.split(".")[0], "i"), "{marka}").replace(/\d+/g, "#").slice(0, 80);
}

export async function profileSite(domain: string, fetchImpl: typeof fetch = fetch, sample = 20, baseOverride?: string): Promise<SiteProfile> {
  const notVerifiable = ["Organik trafik", "Sıralandığı anahtar kelimeler", "Görünürlük skoru", "Backlink profili", "Google'da indekslenen gerçek sayfa sayısı"];
  const base = baseOverride ?? `https://${domain}`;
  const provinces = (await db.province.findMany({ select: { slug: true } })).map((p) => p.slug);
  const empty: SiteProfile = {
    domain, reachable: false, robotsFound: false, sitemapUrls: null, categories: null, citiesCovered: null, sampled: 0,
    avgWords: null, avgInternalLinks: null, schemaTypes: [], titlePatterns: [], h1Examples: [], pagesWithH1Pct: null,
    pagesWithMetaPct: null, https: false, homeLoadMs: null, notVerifiable,
  };
  let home;
  try {
    home = await fetchFollow(`${base}/`, fetchImpl);
  } catch (e) {
    return { ...empty, error: `Siteye ulaşılamadı: ${e instanceof Error ? e.message : e}` };
  }
  if (home.status >= 400 || !home.body) return { ...empty, error: `Ana sayfa ${home.status} döndü` };
  const finalBase = new URL(home.finalUrl).origin;
  const robots = await fetchImpl(`${finalBase}/robots.txt`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const sitemapRefs = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  let urls: string[] = [];
  for (const sm of sitemapRefs.length ? sitemapRefs : [`${finalBase}/sitemap.xml`, `${finalBase}/sitemap_index.xml`]) {
    urls.push(...(await fetchSitemapUrls(sm, fetchImpl)));
    if (urls.length) break;
  }
  urls = [...new Set(urls)];
  const { cats, cities } = classifyUrls(urls, provinces);
  // Örnek: ana sayfa + her kategoriden dengeli seçim
  const pick = (f: (u: string) => boolean, n: number) => urls.filter(f).slice(0, n);
  const byCat = (c: keyof typeof cats) => (u: string) => classifyUrls([u], provinces).cats[c] === 1;
  const sampleUrls = [...new Set([home.finalUrl, ...pick(byCat("service"), 6), ...pick(byCat("city"), 6), ...pick(byCat("blog"), 4), ...pick(byCat("other"), 4)])].slice(0, sample);
  const parsed = [];
  for (const u of sampleUrls) {
    try {
      const r = u === home.finalUrl ? home : await fetchFollow(u, fetchImpl);
      if (r.body) parsed.push(parseHtml(u, r.body, { status: r.status, contentType: r.contentType, xRobotsTag: r.xRobotsTag, loadMs: r.ms }));
    } catch {
      /* örnek sayfa atlanır */
    }
  }
  const host = new URL(finalBase).host;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return {
    domain,
    reachable: true,
    robotsFound: Boolean(robots),
    sitemapUrls: urls.length || null,
    categories: urls.length ? cats : null,
    citiesCovered: urls.length ? cities : null,
    sampled: parsed.length,
    avgWords: avg(parsed.map((p) => p.wordCount)),
    avgInternalLinks: avg(parsed.map((p) => p.links.filter((l) => l.href.includes(host)).length)),
    schemaTypes: [...new Set(parsed.flatMap((p) => p.schemaTypes))].sort(),
    titlePatterns: [...new Set(parsed.map((p) => p.title && titlePattern(p.title, domain)).filter(Boolean) as string[])].slice(0, 8),
    h1Examples: parsed.flatMap((p) => p.h1).slice(0, 8),
    pagesWithH1Pct: parsed.length ? Math.round((parsed.filter((p) => p.h1.length === 1).length / parsed.length) * 100) : null,
    pagesWithMetaPct: parsed.length ? Math.round((parsed.filter((p) => p.metaDescription).length / parsed.length) * 100) : null,
    https: finalBase.startsWith("https://"),
    homeLoadMs: home.ms,
    notVerifiable,
  };
}

/** Kendi sitemizin profili aynı yöntemle (adil karşılaştırma için canlı siteden). */
export async function runCompetitorAnalysis(competitorId: string) {
  const c = await db.competitor.findUniqueOrThrow({ where: { id: competitorId } });
  try {
    const [theirs, ours] = await Promise.all([profileSite(c.domain), profileSite(siteHost(), fetch, 20, siteUrl()).catch(() => null)]);
    await db.competitorSnapshot.create({
      data: { competitorId, status: theirs.error ? "error" : "ok", error: theirs.error ?? null, data: { theirs, ours } as object },
    });
    return theirs;
  } catch (e) {
    await db.competitorSnapshot.create({ data: { competitorId, status: "error", error: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}

export { slugify };
