import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { detectLocation, loadLocations, locationDemand, populationPotential } from "@/lib/seo/location-demand";
import { buildRobotsTxt } from "@/lib/seo/robots";
import { autoNoindexDecision, computeReadiness, computeSeoScore, type AnalysisInput } from "@/lib/seo/score";
import { indexNowKey, submitIndexNow } from "@/lib/seo/indexnow";

describe("konum tespiti", async () => {
  const { pLocs, dLocs, provinces, districts } = await loadLocations();
  const pid = (n: string) => provinces.find((p) => p.name === n)!.id;
  const did = (n: string, p: string) => districts.find((d) => d.name === n && d.provinceId === pid(p))!.id;
  it("il ve ilçeyi ekli yazımlarla bulur", () => {
    expect(detectLocation("sakaryada web tasarım firması", pLocs, dLocs)).toEqual({ provinceId: pid("Sakarya"), districtId: null });
    expect(detectLocation("serdivan web sitesi yaptırma", pLocs, dLocs)).toEqual({ provinceId: pid("Sakarya"), districtId: did("Serdivan", "Sakarya") });
    expect(detectLocation("İstanbul e-ticaret sitesi", pLocs, dLocs)?.provinceId).toBe(pid("İstanbul"));
  });
  it("aynı adlı ilçeyi yalnızca il adıyla birlikte atar", () => {
    expect(detectLocation("yenişehir web tasarım", pLocs, dLocs)).toBeNull();
    expect(detectLocation("bursa yenişehir web tasarım", pLocs, dLocs)).toEqual({ provinceId: pid("Bursa"), districtId: did("Yenişehir", "Bursa") });
  });
  it("hizmet niyeti olmayan sorguyu saymaz", () => {
    expect(detectLocation("sakarya hava durumu", pLocs, dLocs)).toBeNull();
  });
  it("resmî nüfus verisi yüklü", () => {
    expect(provinces.find((p) => p.name === "Sakarya")!.population).toBeGreaterThan(1_000_000);
    expect(districts.every((d) => d.population != null)).toBe(true);
  });
});

describe("lokasyon talebi (sahte Search Console verisi)", () => {
  const day = (n: number) => new Date(new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10));
  afterAll(async () => {
    await db.gscQueryDaily.deleteMany({ where: { page: { contains: "geo-test" } } });
  });
  it("aramaları konuma yazar ve sayfa durumunu eşleştirir", async () => {
    await db.gscQueryDaily.createMany({
      data: [
        { date: day(3), query: "web tasarım sakarya", page: "https://x.net/geo-test", clicks: 2, impressions: 120, ctr: 0.016, position: 9 },
        { date: day(4), query: "serdivan web sitesi", page: "https://x.net/geo-test", clicks: 0, impressions: 30, ctr: 0, position: 18 },
        { date: day(4), query: "web tasarım nedir", page: "https://x.net/geo-test", clicks: 1, impressions: 50, ctr: 0.02, position: 5 },
      ],
    });
    const { rows, hasGsc, unmatched } = await locationDemand(90);
    expect(hasGsc).toBe(true);
    const sakarya = rows.find((r) => r.path === "/web-tasarim/sakarya")!;
    expect(sakarya.impressions).toBe(120);
    expect(sakarya.verdict).toBe("TASLAK");
    expect(rows.find((r) => r.path === "/web-tasarim/sakarya/serdivan")?.impressions).toBe(30);
    expect(unmatched).toBeGreaterThanOrEqual(1);
  });
  it("veri yokken nüfus potansiyeli sıralı döner", async () => {
    const list = await populationPotential(3);
    expect(list[0].name).toBe("İstanbul");
    expect(list[0].population!).toBeGreaterThan(list[2].population!);
  });
});

describe("GEO", () => {
  it("robots.txt AI botlarına ayara göre izin verir/kapatır", () => {
    const open = buildRobotsTxt("https://x.net", "", { search: true, training: true });
    expect(open).toMatch(/User-agent: OAI-SearchBot[\s\S]*?Allow: \//);
    expect(open).toMatch(/User-agent: GPTBot[\s\S]*?Allow: \//);
    const closed = buildRobotsTxt("https://x.net", "", { search: true, training: false });
    expect(closed).toMatch(/User-agent: GPTBot[\s\S]*?Disallow: \/\n/);
    expect(closed).toMatch(/^User-agent: \*\nAllow: \//);
  });
  it("IndexNow yerel adreste bildirim göndermez; anahtar sabittir", async () => {
    process.env.SITE_URL = "http://localhost:3300";
    const r = await submitIndexNow(["/"], (() => { throw new Error("çağrılmamalı"); }) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(indexNowKey()).toMatch(/^[a-f0-9]{32}$/);
    expect(indexNowKey()).toBe(indexNowKey());
    process.env.SITE_URL = "https://webtasarimajansi.net";
  });
  it("[DOĞRULANMALI] işareti yayına hazırlığı engeller ve il sayfasını NOINDEX yapar", () => {
    const a: AnalysisInput = {
      type: "CITY", path: "/web-tasarim/bolu", title: "Bolu Web Tasarım | Web Tasarım Ajansı", metaDescription: "x".repeat(130),
      h1: "Bolu Web Tasarım", intro: "Bolu'da web tasarım.", bodyText: "kelime ".repeat(700), headings: [{ depth: 2, text: "A" }, { depth: 2, text: "B" }],
      bodyLinks: [], images: [], rawMarkdown: "## A\n\nMetin [DOĞRULANMALI: Bolu'daki öne çıkan sektörler]", faqCount: 3,
      primaryKeyword: "web tasarım bolu", secondaryKeywords: [], wouldBeIndexable: true, noindexReasons: [], selfCanonical: true,
      schemaTypes: ["WebPage"], schemaErrors: 0, inlinks: 3, navInlinks: 0, outlinks: 5, maxSimilarity: { score: 0, path: null },
      duplicateThreshold: 0.55, cannibalWith: [], minWords: 500, perf: null, hasOgImage: false,
    };
    const r = computeReadiness(a, computeSeoScore(a));
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.label === "Doğrulanmış bilgi")?.status).toBe("FAIL");
    expect(autoNoindexDecision(a, 800).noindex).toBe(true);
  });
});
