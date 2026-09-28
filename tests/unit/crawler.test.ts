import { describe, expect, it } from "vitest";
import { detectIssues, healthScore, parseHtml } from "@/lib/crawler/parse";
import { checkRobotsRules, robotsMatch, buildRobotsTxt } from "@/lib/seo/robots";
import { validateDomain } from "@/lib/competitors/net";
import { categorize } from "@/lib/competitors/classify";

const html = (o: { title?: string; h1?: string[]; canonical?: string; robots?: string; body?: string; links?: string[] }) => `<!doctype html><html><head>
${o.title ? `<title>${o.title}</title>` : ""}<meta name="viewport" content="width=device-width">
${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ""}${o.robots ? `<meta name="robots" content="${o.robots}">` : ""}
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"}]}</script></head>
<body><main>${(o.h1 ?? []).map((h) => `<h1>${h}</h1>`).join("")}<p>${o.body ?? ""}</p>${(o.links ?? []).map((l) => `<a href="${l}">x</a>`).join("")}<img src="/a.webp"></main></body></html>`;

describe("crawler", () => {
  const B = "https://x.net";
  const meta = { status: 200, contentType: "text/html", xRobotsTag: null, loadMs: 100 };
  it("HTML'den SEO öğelerini çıkarır", () => {
    const p = parseHtml(`${B}/a`, html({ title: "Başlık", h1: ["A"], canonical: `${B}/a`, body: "kelime ".repeat(50), links: ["/b", "https://dis.com"] }), meta);
    expect(p.title).toBe("Başlık");
    expect(p.h1).toEqual(["A"]);
    expect(p.schemaTypes).toContain("WebPage");
    expect(p.links.map((l) => l.href)).toContain(`${B}/b`);
    expect(p.images[0].alt).toBeNull();
  });
  it("kritik sorunları önem derecesiyle bulur", () => {
    const pages = [
      parseHtml(`${B}/`, html({ title: "Ana sayfa başlığı yeterince uzun", h1: ["Ana"], canonical: `${B}/`, body: "k ".repeat(300), links: ["/a", "/kirik"] }), meta),
      parseHtml(`${B}/a`, html({ title: "Aynı başlık", h1: ["A", "B"], body: "kısa" }), meta),
      parseHtml(`${B}/c`, html({ title: "Aynı başlık", h1: [], robots: "noindex" }), meta),
      parseHtml(`${B}/kirik`, "", { ...meta, status: 404, contentType: "text/html" }),
    ];
    const issues = detectIssues(pages, { sitemapUrls: new Set([`${B}/c`]), host: "x.net", inlinks: new Map([[`${B}/a`, 1]]) });
    const codes = issues.map((i) => `${i.code}:${i.severity}`);
    expect(codes).toContain("BROKEN_INTERNAL_LINK:HIGH");
    expect(codes).toContain("H1_MULTIPLE:MEDIUM");
    expect(codes).toContain("H1_MISSING:HIGH");
    expect(codes).toContain("NOINDEX_IN_SITEMAP:HIGH");
    expect(codes).toContain("CANONICAL_MISSING:MEDIUM");
    expect(codes).toContain("THIN_CONTENT:MEDIUM");
    expect(healthScore(pages.length, issues)).toBeLessThan(100);
  });
});

describe("robots.txt güvenlik kilidi", () => {
  it("siteyi kapatan kuralı reddeder, bot özel kuralına izin verir", () => {
    expect(checkRobotsRules("User-agent: *\nDisallow: /", ["/"]).errors.length).toBe(1);
    expect(checkRobotsRules("User-agent: Googlebot\nDisallow: /*", ["/"]).errors.length).toBe(1);
    expect(checkRobotsRules("User-agent: GPTBot\nDisallow: /", ["/"]).errors).toEqual([]);
    expect(checkRobotsRules("User-agent: *\nDisallow: /web-tasarim", ["/", "/web-tasarim", "/web-tasarim/a", "/b", "/c"]).warnings.length +
      checkRobotsRules("User-agent: *\nDisallow: /web-tasarim", ["/", "/web-tasarim", "/web-tasarim/a", "/b", "/c"]).errors.length).toBeGreaterThan(0);
    expect(checkRobotsRules("Bozuk satır", []).errors.length).toBe(1);
  });
  it("joker eşleşme", () => {
    expect(robotsMatch("/*?", "/a?b")).toBe(true);
    expect(robotsMatch("/a$", "/ab")).toBe(false);
    expect(buildRobotsTxt("https://x.net", "")).toContain("Sitemap: https://x.net/sitemap.xml");
  });
});

describe("rakip analizi yardımcıları", () => {
  it("alan adını normalleştirir ve URL'leri sınıflandırır", () => {
    expect(validateDomain("https://www.Ornek.com/abc")).toBe("ornek.com");
    expect(() => validateDomain("olmaz")).toThrow();
    const places = { provinces: ["sakarya", "ankara"], districts: [] };
    const cat = (p: string) => categorize(p, "", "", places, []);
    expect(cat("/web-tasarim-sakarya").category).toBe("location");
    expect(cat("/web-tasarim-sakarya").places.provinces).toEqual(["sakarya"]);
    expect(cat("/blog/x").category).toBe("blog");
    expect(cat("/kurumsal-web-tasarim").category).toBe("service");
    expect(cat("/hakkimizda").category).toBe("about");
  });
});
