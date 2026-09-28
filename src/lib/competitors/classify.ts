// Rakip sayfalarının saf işlemesi: robots.txt, sayfa türü (ÇIKARIM), hizmet konusu (ÇIKARIM).
// Metin saklanmaz/kopyalanmaz; yalnızca yapı ve konu sinyali çıkarılır.

import { robotsMatch } from "../seo/robots";
import { foldKeyword } from "../text/slug";
import { SERVICE_CATALOG } from "../content/catalog";

export type Robots = { found: boolean; allow: string[]; disallow: string[]; crawlDelay: number | null; sitemaps: string[] };

/** robots.txt: kendi belirtecimize ait grup varsa o, yoksa "*" grubu uygulanır. */
export function parseRobots(text: string | null, token: string): Robots {
  if (text == null) return { found: false, allow: [], disallow: [], crawlDelay: null, sitemaps: [] };
  const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number | null }[] = [];
  const sitemaps: string[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "sitemap") { if (val) sitemaps.push(val); continue; }
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.disallow.push(val);
    else if (key === "allow" && val) cur.allow.push(val);
    else if (key === "crawl-delay" && Number.isFinite(Number(val))) cur.delay = Number(val);
  }
  const g = groups.find((x) => x.agents.some((a) => a !== "*" && token.toLowerCase().includes(a))) ?? groups.find((x) => x.agents.includes("*"));
  return { found: true, allow: g?.allow ?? [], disallow: g?.disallow ?? [], crawlDelay: g?.delay ?? null, sitemaps };
}

/** En uzun eşleşen kural kazanır; eşitlikte Allow (Google davranışı). */
export function robotsAllowed(r: Robots, path: string): boolean {
  const best = (rules: string[]) => Math.max(-1, ...rules.filter((x) => robotsMatch(x, path)).map((x) => x.length));
  const d = best(r.disallow);
  return d < 0 || best(r.allow) >= d;
}

export type Category = "home" | "service" | "sector" | "location" | "blog" | "about" | "contact" | "other";
export const CATEGORY_LABELS: Record<Category, string> = { home: "Ana sayfa", service: "Hizmet", sector: "Sektör", location: "Lokasyon", blog: "Blog / rehber", about: "Hakkımızda", contact: "İletişim", other: "Diğer" };

const BLOG = /^\/(blog|makale|makaleler|haber|haberler|rehber|yazi|yazilar|icerik|bilgi|kategori|category|tag|etiket)(\/|$)/;
const ABOUT = /(hakkimizda|hakkinda|kurumsal\/?$|about|biz-kimiz|ekibimiz)/;
const CONTACT = /(iletisim|contact|bize-ulasin|teklif-al|teklif-iste)/;

export type Places = { provinces: string[]; districts: { slug: string; province: string }[] };

/** Yoldaki il/ilçe adları (yalnızca tam segment eşleşmesi; "web-tasarim-sakarya" gibi tire ekli biçim dahil). */
export function placesIn(path: string, places: Places): { provinces: string[]; districts: string[] } {
  const segs = path.toLowerCase().split("/").filter(Boolean).flatMap((s) => [s, ...s.split("-")]);
  const joined = `-${path.toLowerCase().replace(/\//g, "-")}-`;
  const provinces = places.provinces.filter((p) => segs.includes(p) || joined.includes(`-${p}-`));
  const districts = places.districts.filter((d) => d.slug.length > 3 && (segs.includes(d.slug) || joined.includes(`-${d.slug}-`)) && (provinces.includes(d.province) || !places.provinces.includes(d.slug))).map((d) => d.slug);
  return { provinces, districts: [...new Set(districts)] };
}

/** Hizmet kataloğundaki konular (yol + title + H1 üzerinden; ÇIKARIM). */
export function topicsOf(text: string): string[] {
  const f = ` ${foldKeyword(text).replace(/[-/]/g, " ")} `;
  return SERVICE_CATALOG.filter((d) => d.patterns.some((p) => f.includes(` ${p}`))).map((d) => d.path);
}

export function categorize(path: string, title: string, h1: string, places: Places, sectors: string[]): { category: Category; topics: string[]; places: { provinces: string[]; districts: string[] } } {
  const p = path.toLowerCase().replace(/\/$/, "") || "/";
  const pl = placesIn(p, places);
  const topics = topicsOf(`${p} ${title} ${h1}`);
  let category: Category;
  if (p === "/" || /^\/(index\.(html?|php))?$/.test(p)) category = "home";
  else if (BLOG.test(p)) category = "blog";
  else if (CONTACT.test(p)) category = "contact";
  else if (ABOUT.test(p)) category = "about";
  else if (pl.provinces.length || pl.districts.length) category = "location";
  else if (sectors.some((s) => p.includes(s))) category = "sector";
  else if (topics.length) category = "service";
  else category = "other";
  return { category, topics, places: pl };
}

/** H2 metinleri (yapı sinyali; en fazla 30, 120 karakter). */
export function headingsOf(html: string, tag: "h2" | "h3" = "h2"): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 120))
    .filter(Boolean).slice(0, 30);
}
