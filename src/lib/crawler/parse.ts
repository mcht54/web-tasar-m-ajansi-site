// HTML ayrıştırma ve sorun tespiti (ağ ve DB'den bağımsız; testlenebilir).

import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { wordCount } from "../text/analyze";

export type ParsedPage = {
  url: string;
  status: number;
  redirectChain: { url: string; status: number }[];
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  h1: string[];
  h2Count: number;
  wordCount: number;
  contentHash: string | null;
  links: { href: string; text: string; nofollow: boolean }[];
  images: { src: string; alt: string | null }[];
  schemaTypes: string[];
  schemaErrors: string[];
  hasViewport: boolean;
  loadMs: number | null;
  bytes: number | null;
};

export function parseHtml(
  url: string,
  html: string,
  meta: { status: number; contentType: string | null; xRobotsTag: string | null; loadMs: number | null; redirectChain?: { url: string; status: number }[] },
): ParsedPage {
  const root = parse(html, { blockTextElements: { script: true, style: true, noscript: false } });
  const attr = (sel: string, a: string) => root.querySelector(sel)?.getAttribute(a)?.trim() ?? null;
  const schemaTypes: string[] = [];
  const schemaErrors: string[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const collect = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(collect);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          if (o["@type"]) schemaTypes.push(...([] as string[]).concat(o["@type"] as string));
          if (o["@graph"]) collect(o["@graph"]);
        }
      };
      collect(data);
    } catch {
      schemaErrors.push("JSON-LD ayrıştırılamadı");
    }
  }
  // Görünür metin: script/style/nav/footer hariç ana içerik
  const main = root.querySelector("main") ?? root.querySelector("body") ?? root;
  const clone = parse(main.toString());
  clone.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
  const text = clone.textContent.replace(/\s+/g, " ").trim();
  const base = new URL(url);
  const links = root.querySelectorAll("a[href]").map((a) => {
    const href = a.getAttribute("href")!.trim();
    let abs = href;
    try {
      abs = new URL(href, base).toString();
    } catch {
      /* geçersiz href olduğu gibi kalır */
    }
    return { href: abs, text: a.textContent.replace(/\s+/g, " ").trim(), nofollow: /nofollow/i.test(a.getAttribute("rel") ?? "") };
  });
  return {
    url,
    status: meta.status,
    redirectChain: meta.redirectChain ?? [],
    contentType: meta.contentType,
    title: root.querySelector("title")?.textContent.trim() || null,
    metaDescription: attr('meta[name="description"]', "content"),
    canonical: attr('link[rel="canonical"]', "href"),
    robotsMeta: attr('meta[name="robots"]', "content"),
    xRobotsTag: meta.xRobotsTag,
    h1: root.querySelectorAll("h1").map((h) => h.textContent.replace(/\s+/g, " ").trim()),
    h2Count: root.querySelectorAll("h2").length,
    wordCount: wordCount(text),
    contentHash: text ? createHash("sha1").update(text.toLowerCase()).digest("hex") : null,
    links,
    images: root.querySelectorAll("img").map((i) => ({ src: i.getAttribute("src") ?? "", alt: i.getAttribute("alt") ?? null })),
    schemaTypes: [...new Set(schemaTypes)],
    schemaErrors,
    hasViewport: !!root.querySelector('meta[name="viewport"]'),
    loadMs: meta.loadMs,
    bytes: Buffer.byteLength(html),
  };
}

export function isNoindex(p: Pick<ParsedPage, "robotsMeta" | "xRobotsTag">): boolean {
  return /noindex/i.test(p.robotsMeta ?? "") || /noindex/i.test(p.xRobotsTag ?? "");
}

export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    let s = x.toString();
    if (x.pathname !== "/" && s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}

export type Issue = { url: string; code: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; message: string; detail?: Record<string, unknown> };

export const ISSUE_LABELS: Record<string, string> = {
  HTTP_5XX: "Sunucu hatası (5xx)", HTTP_4XX: "Sayfa bulunamadı (4xx)", REDIRECT_CHAIN: "Yönlendirme zinciri",
  BROKEN_INTERNAL_LINK: "Kırık iç link", BROKEN_EXTERNAL_LINK: "Kırık dış link", TITLE_MISSING: "Title yok",
  TITLE_LENGTH: "Title uzunluğu", DUP_TITLE: "Tekrarlanan title", META_MISSING: "Meta description yok",
  DUP_META: "Tekrarlanan meta description", H1_MISSING: "H1 yok", H1_MULTIPLE: "Birden fazla H1",
  CANONICAL_MISSING: "Canonical yok", CANONICAL_OTHER: "Canonical başka URL'de", NOINDEX_IN_SITEMAP: "Sitemap'te NOINDEX sayfa",
  NOT_IN_SITEMAP: "İndekslenebilir ama sitemap'te yok", THIN_CONTENT: "Zayıf içerik", DUP_CONTENT: "Kopya içerik",
  IMG_NO_ALT: "ALT'sız görsel", ORPHAN: "Orphan sayfa", NO_SCHEMA: "Schema yok", SCHEMA_INVALID: "Bozuk schema",
  NO_VIEWPORT: "Mobil viewport yok", SLOW: "Yavaş yanıt", LARGE_HTML: "Büyük HTML", ROBOTS_BLOCKED: "robots.txt engelliyor",
  SITEMAP_NON_200: "Sitemap'te 200 olmayan URL",
};

/** Taranan sayfalar kümesinden sorun listesi üretir. */
export function detectIssues(
  pages: ParsedPage[],
  opts: { sitemapUrls: Set<string>; host: string; brokenExternal?: Map<string, number>; robotsBlocked?: Set<string>; inlinks: Map<string, number> },
): Issue[] {
  const issues: Issue[] = [];
  const add = (url: string, code: string, severity: Issue["severity"], message: string, detail?: Record<string, unknown>) =>
    issues.push({ url, code, severity, message, detail });
  const statusOf = new Map(pages.map((p) => [normUrl(p.url), p.status]));
  const html = pages.filter((p) => p.status === 200 && (p.contentType ?? "").includes("text/html"));
  const indexable = html.filter((p) => !isNoindex(p) && (!p.canonical || normUrl(p.canonical) === normUrl(p.url)));

  for (const p of pages) {
    const u = normUrl(p.url);
    if (p.status >= 500) add(u, "HTTP_5XX", "CRITICAL", `Sunucu ${p.status} döndü`);
    else if (p.status >= 400) add(u, "HTTP_4XX", opts.sitemapUrls.has(u) ? "CRITICAL" : "HIGH", `Sayfa ${p.status} döndü`);
    if (p.redirectChain.length >= 2) add(u, "REDIRECT_CHAIN", "HIGH", `${p.redirectChain.length} adımlı yönlendirme zinciri`, { chain: p.redirectChain });
    if (opts.sitemapUrls.has(u) && (p.status !== 200 || p.redirectChain.length > 0))
      add(u, "SITEMAP_NON_200", "HIGH", `Sitemap'teki URL ${p.redirectChain.length ? "yönlendiriyor" : p.status + " döndü"}`);
    if (opts.robotsBlocked?.has(u)) add(u, "ROBOTS_BLOCKED", opts.sitemapUrls.has(u) ? "HIGH" : "MEDIUM", "robots.txt bu URL'nin taranmasını engelliyor");
  }

  for (const p of html) {
    const u = normUrl(p.url);
    const noindex = isNoindex(p);
    if (!p.title) add(u, "TITLE_MISSING", "HIGH", "Title etiketi yok");
    else if (p.title.length > 65 || p.title.length < 20) add(u, "TITLE_LENGTH", "LOW", `Title ${p.title.length} karakter`);
    if (!p.metaDescription) add(u, "META_MISSING", "MEDIUM", "Meta description yok");
    if (p.h1.length === 0) add(u, "H1_MISSING", "HIGH", "H1 yok");
    else if (p.h1.length > 1) add(u, "H1_MULTIPLE", "MEDIUM", `${p.h1.length} adet H1`, { h1: p.h1 });
    if (!p.canonical) add(u, "CANONICAL_MISSING", "MEDIUM", "Canonical etiketi yok");
    else if (normUrl(p.canonical) !== u) add(u, "CANONICAL_OTHER", "LOW", `Canonical: ${p.canonical}`);
    if (noindex && opts.sitemapUrls.has(u)) add(u, "NOINDEX_IN_SITEMAP", "HIGH", "NOINDEX sayfa sitemap'te");
    if (!noindex && opts.sitemapUrls.size && !opts.sitemapUrls.has(u) && (!p.canonical || normUrl(p.canonical) === u))
      add(u, "NOT_IN_SITEMAP", "MEDIUM", "İndekslenebilir sayfa sitemap'te yok");
    if (!noindex && p.wordCount < 200) add(u, "THIN_CONTENT", "MEDIUM", `Ana içerikte ${p.wordCount} kelime`);
    const noAlt = p.images.filter((i) => !i.alt?.trim()).length;
    if (noAlt) add(u, "IMG_NO_ALT", "LOW", `${noAlt} görselde ALT yok`);
    if (!p.schemaTypes.length) add(u, "NO_SCHEMA", "LOW", "Yapılandırılmış veri yok");
    if (p.schemaErrors.length) add(u, "SCHEMA_INVALID", "HIGH", p.schemaErrors.join("; "));
    if (!p.hasViewport) add(u, "NO_VIEWPORT", "HIGH", "Viewport meta etiketi yok (mobil uyum)");
    if (p.loadMs != null && p.loadMs > 1500) add(u, "SLOW", "MEDIUM", `Yanıt ${p.loadMs} ms`);
    if ((p.bytes ?? 0) > 300 * 1024) add(u, "LARGE_HTML", "LOW", `HTML ${Math.round((p.bytes ?? 0) / 1024)} KB`);
    if (!noindex && u !== normUrl(`https://${opts.host}/`) && u !== normUrl(`http://${opts.host}/`) && (opts.inlinks.get(u) ?? 0) === 0)
      add(u, "ORPHAN", "MEDIUM", "Hiçbir taranan sayfa bu sayfaya link vermiyor");
    for (const l of p.links) {
      let host: string;
      try {
        host = new URL(l.href).host;
      } catch {
        continue;
      }
      const target = normUrl(l.href);
      if (host === opts.host) {
        const st = statusOf.get(target);
        if (st && st >= 400) add(u, "BROKEN_INTERNAL_LINK", "HIGH", `Kırık iç link: ${target} (${st})`, { target });
      } else if (opts.brokenExternal?.has(target)) {
        add(u, "BROKEN_EXTERNAL_LINK", "MEDIUM", `Kırık dış link: ${target} (${opts.brokenExternal.get(target)})`, { target });
      }
    }
  }

  // Tekrarlar (yalnızca indekslenebilir sayfalar arasında anlamlı)
  const dup = (key: (p: ParsedPage) => string | null, code: string, sev: Issue["severity"], label: string) => {
    const m = new Map<string, string[]>();
    for (const p of indexable) {
      const k = key(p);
      if (k) m.set(k, [...(m.get(k) ?? []), normUrl(p.url)]);
    }
    for (const [, urls] of m) if (urls.length > 1) for (const u of urls) add(u, code, sev, `${label} ${urls.length} sayfada aynı`, { urls });
  };
  dup((p) => p.title, "DUP_TITLE", "MEDIUM", "Title");
  dup((p) => p.metaDescription, "DUP_META", "LOW", "Meta description");
  dup((p) => (p.wordCount >= 50 ? p.contentHash : null), "DUP_CONTENT", "HIGH", "İçerik");
  return issues;
}

/** 0–100 sağlık skoru: sayfa başına ağırlıklı sorun yükü. */
export function healthScore(pageCount: number, issues: Issue[]): number {
  if (!pageCount) return 0;
  const w = { CRITICAL: 1, HIGH: 0.4, MEDIUM: 0.15, LOW: 0.03 };
  const load = issues.reduce((s, i) => s + w[i.severity], 0) / pageCount;
  return Math.max(0, Math.round(100 * Math.exp(-load)));
}
