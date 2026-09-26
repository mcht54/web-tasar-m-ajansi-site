import { describe, expect, it } from "vitest";
import { type AnalysisInput, autoNoindexDecision, computeReadiness, computeSeoScore } from "@/lib/seo/score";
import { computePriority, severityFor } from "@/lib/seo/priority";
import { isSelfCanonical, resolveCanonical, resolveRobots, resolveTitle } from "@/lib/seo/meta";
import { buildJsonLd, validateJsonLd } from "@/lib/seo/schema";
import { defaultSettings } from "@/lib/settings-schema";
import { SiteGraph, type PageNode } from "@/lib/seo/graph";
import { buildBreadcrumbs } from "@/lib/seo/breadcrumbs";
import { intentConflicts, serpConflicts } from "@/lib/seo/cannibalization";

const base: AnalysisInput = {
  type: "CITY", path: "/web-tasarim/sakarya", title: "Sakarya Web Tasarım | Web Tasarım Ajansı",
  metaDescription: "Sakarya'daki işletmeler için hızlı, SEO uyumlu ve dönüşüm odaklı web siteleri. Ücretsiz ön analiz ve teklif için bizimle iletişime geçin.",
  h1: "Sakarya Web Tasarım", intro: "Sakarya'da web tasarım hizmeti arayan işletmeler için rehber.",
  bodyText: "kelime ".repeat(700), headings: [{ depth: 2, text: "A" }, { depth: 2, text: "B" }, { depth: 3, text: "C" }],
  bodyLinks: [], images: [], rawMarkdown: "", faqCount: 3, primaryKeyword: "web tasarım sakarya",
  secondaryKeywords: [], wouldBeIndexable: true, noindexReasons: [], selfCanonical: true,
  schemaTypes: ["WebPage", "Service"], schemaErrors: 0, inlinks: 3, navInlinks: 0, outlinks: 5,
  maxSimilarity: { score: 0.1, path: "/web-tasarim/ankara" }, duplicateThreshold: 0.55, cannibalWith: [],
  minWords: 600, perf: null, hasOgImage: false,
};

describe("SEO skoru", () => {
  it("iyi sayfa yüksek puan alır, performans ölçülmediyse NA olur", () => {
    const r = computeSeoScore(base);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.checks.find((c) => c.id === "ttfb")?.status).toBe("NA");
  });
  it("thin content ve kopya içeriği cezalandırır", () => {
    const r = computeSeoScore({ ...base, bodyText: "kısa metin", maxSimilarity: { score: 0.8, path: "/x" } });
    expect(r.checks.find((c) => c.id === "length")?.status).toBe("FAIL");
    expect(r.checks.find((c) => c.id === "duplicate")?.status).toBe("FAIL");
    expect(r.score).toBeLessThan(80);
  });
  it("keyword stuffing yakalanır", () => {
    const r = computeSeoScore({ ...base, bodyText: "web tasarım sakarya ".repeat(50) });
    expect(r.checks.find((c) => c.id === "stuffing")?.status).toBe("FAIL");
  });
  it("programatik sayfa yetersizse otomatik NOINDEX", () => {
    expect(autoNoindexDecision(base, 200).noindex).toBe(true);
    expect(autoNoindexDecision(base, 800).noindex).toBe(false);
    expect(autoNoindexDecision({ ...base, type: "SERVICE" }, 50).noindex).toBe(false);
    expect(autoNoindexDecision({ ...base, maxSimilarity: { score: 0.9, path: "/y" } }, 800).reason).toContain("benzer");
  });
  it("yayına hazırlık listesi PASS/WARNING/FAIL döner", () => {
    const seo = computeSeoScore(base);
    const r = computeReadiness(base, seo);
    expect(r.items.map((i) => i.label)).toContain("Unique Content");
    expect(r.ready).toBe(true);
  });
});

describe("öncelik", () => {
  it("title problemi (yüksek etki, düşük zorluk) → 95", () => {
    expect(computePriority(3, 1)).toBe(95);
    expect(severityFor(95)).toBe("CRITICAL");
    expect(computePriority(1, 3)).toBeLessThan(computePriority(2, 2));
  });
});

describe("meta", () => {
  const s = defaultSettings();
  it("özel title şablonu ezer", () => {
    expect(resolveTitle({ seoTitle: "Özel", name: "X", type: "SERVICE" }, s.seo)).toBe("Özel");
    expect(resolveTitle({ seoTitle: null, name: "Kurumsal", type: "SERVICE" }, s.seo)).toBe("Kurumsal | Web Tasarım Ajansı");
  });
  it("canonical mutlak ve kendi URL'si", () => {
    const b = "https://webtasarimajansi.net";
    expect(resolveCanonical({ canonical: null, path: "/a" }, b)).toBe(`${b}/a`);
    expect(isSelfCanonical({ canonical: "/b", path: "/a" }, b)).toBe(false);
  });
  it("taslak, noindex veya site kapalıysa indekslenemez", () => {
    const p = { path: "/a", type: "SERVICE", status: "PUBLISHED" as const, name: "a", h1: null, seoTitle: null,
      metaDescription: null, intro: null, canonical: null, robotsIndex: true, robotsFollow: true, autoNoindex: false };
    expect(resolveRobots(p, true, true).indexable).toBe(true);
    expect(resolveRobots({ ...p, status: "DRAFT" }, true, true).indexable).toBe(false);
    expect(resolveRobots(p, false, true).indexable).toBe(false);
    expect(resolveRobots({ ...p, autoNoindex: true }, true, true).index).toBe(false);
  });
});

const node = (o: Partial<PageNode> & Pick<PageNode, "path" | "type" | "name">): PageNode => ({
  id: o.path, published: true, anchor: o.name, crumb: o.name, serviceId: null, serviceSlug: null, provinceId: null,
  districtId: null, sectorId: null, region: null, lat: null, lng: null, category: null, publishedAt: null, sortOrder: 0, ...o,
});

describe("site grafiği ve breadcrumb", () => {
  const g = new SiteGraph([
    node({ path: "/", type: "HOME", name: "Ana" }),
    node({ path: "/web-tasarim", type: "SERVICE", name: "Web Tasarım", serviceSlug: "web-tasarim", serviceId: "s1" }),
    node({ path: "/web-tasarim/sakarya", type: "CITY", name: "Sakarya Web Tasarım", crumb: "Sakarya", provinceId: 54 }),
    node({ path: "/web-tasarim/sakarya/adapazari", type: "DISTRICT", name: "Adapazarı Web Tasarım", crumb: "Adapazarı", provinceId: 54, districtId: 1 }),
    node({ path: "/web-tasarim/sakarya/serdivan", type: "DISTRICT", name: "Serdivan", provinceId: 54, districtId: 2, published: false }),
  ]);
  it("il sayfası yalnızca yayımlanmış ilçelere link verir", () => {
    const groups = g.templateLinks(g.get("/web-tasarim/sakarya")!);
    const d = groups.find((x) => x.key === "districts")!;
    expect(d.links.map((l) => l.path)).toEqual(["/web-tasarim/sakarya/adapazari"]);
  });
  it("breadcrumb URL hiyerarşisinden gelir", () => {
    expect(buildBreadcrumbs("/web-tasarim/sakarya/adapazari", "Adapazarı", g).map((c) => c.label)).toEqual([
      "Ana Sayfa", "Web Tasarım", "Sakarya", "Adapazarı",
    ]);
  });
});

describe("schema", () => {
  const s = defaultSettings();
  const input = {
    type: "CITY", path: "/web-tasarim/sakarya", name: "Sakarya", h1: "Sakarya Web Tasarım", description: "d",
    faq: [{ q: "a", a: "b" }], publishedAt: null, updatedAt: new Date("2026-09-25"), authorName: null, imageUrl: null,
    serviceName: "Web Tasarım", provinceName: "Sakarya", districtName: null, sectorName: null, disabled: [],
  };
  const crumbs = [{ label: "Ana Sayfa", path: "/" }, { label: "Sakarya", path: "/web-tasarim/sakarya" }];
  it("şehir sayfasında LocalBusiness üretmez, tek SSS ile FAQPage üretmez", () => {
    const nodes = buildJsonLd(input, { base: "https://x.net", site: s.site, business: s.business, logoUrl: null, crumbs });
    const types = nodes.map((n) => n["@type"]);
    expect(types).toContain("Service");
    expect(types).toContain("BreadcrumbList");
    expect(types).not.toContain("LocalBusiness");
    expect(types).not.toContain("FAQPage");
  });
  it("işletme bilgisi eksikse ana sayfada LocalBusiness yerine Organization", () => {
    const nodes = buildJsonLd({ ...input, type: "HOME", path: "/" }, { base: "https://x.net", site: s.site, business: s.business, logoUrl: null, crumbs: [] });
    expect(nodes.map((n) => n["@type"])).toContain("Organization");
    expect(nodes.map((n) => n["@type"])).not.toContain("LocalBusiness");
    expect(validateJsonLd(nodes).filter((i) => i.level === "error")).toEqual([]);
  });
  it("işletme bilgisi tamsa LocalBusiness adresli üretilir", () => {
    const business = { ...s.business, name: "Ajans", phone: "+90 264 000 00 00", street: "Cadde 1", city: "Sakarya" };
    const nodes = buildJsonLd({ ...input, type: "HOME", path: "/" }, { base: "https://x.net", site: s.site, business, logoUrl: null, crumbs: [] });
    const lb = nodes.find((n) => n["@type"] === "LocalBusiness")!;
    expect(lb.address).toBeTruthy();
  });
});

describe("cannibalization", () => {
  it("aynı ana kelimeyi hedefleyen sayfaları bulur", () => {
    const c = intentConflicts([
      { path: "/web-tasarim/sakarya", primaryKeyword: "Web Tasarım Sakarya" },
      { path: "/web-tasarim/sakarya/adapazari", primaryKeyword: "web tasarim sakarya" },
      { path: "/x", primaryKeyword: "başka" },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].paths).toHaveLength(2);
  });
  it("GSC'de iki URL'nin gösterimi bölüşmesini yakalar", () => {
    const rows = [
      { query: "web tasarım sakarya", page: "/a", impressions: 60, clicks: 2, position: 8 },
      { query: "web tasarım sakarya", page: "/b", impressions: 40, clicks: 1, position: 12 },
      { query: "tek", page: "/a", impressions: 100, clicks: 5, position: 3 },
    ];
    const c = serpConflicts(rows);
    expect(c).toHaveLength(1);
    expect(c[0].query).toBe("web tasarım sakarya");
  });
});
