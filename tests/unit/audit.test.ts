import { describe, expect, it } from "vitest";
import { AI_ENGINES, buildRobotsTxt, robotsAllows } from "@/lib/seo/robots";
import { clusterAudit, linkStats, orphans, overLinked, type LinkPage } from "@/lib/seo/links";
import type { Edge } from "@/lib/seo/graph";
import { qwScore } from "@/lib/seo/priority";
import { PLACEHOLDER_RE, unverifiedCount } from "@/lib/seo/analyzer-shared";

describe("AI bot izinleri (robots.txt ayrıştırması)", () => {
  it("varsayılan ayarda tüm AI motorları izinli, yönetim paneli kapalı", () => {
    const txt = buildRobotsTxt("https://x.net", "");
    for (const e of AI_ENGINES) expect(robotsAllows(txt, e.bot, "/").allowed, e.bot).toBe(true);
    expect(robotsAllows(txt, "GPTBot", "/yonetim/ayarlar").allowed).toBe(false);
    expect(robotsAllows(txt, "Googlebot", "/api/x").allowed).toBe(false);
  });
  it("eğitim botları kapatılınca GPTBot/ClaudeBot/Google-Extended engellenir, arama botları açık kalır", () => {
    const txt = buildRobotsTxt("https://x.net", "", { search: true, training: false });
    expect(robotsAllows(txt, "GPTBot", "/").allowed).toBe(false);
    expect(robotsAllows(txt, "ClaudeBot", "/").allowed).toBe(false);
    expect(robotsAllows(txt, "Google-Extended", "/").allowed).toBe(false);
    expect(robotsAllows(txt, "OAI-SearchBot", "/").allowed).toBe(true);
    expect(robotsAllows(txt, "PerplexityBot", "/").allowed).toBe(true);
    expect(robotsAllows(txt, "Googlebot", "/web-tasarim").allowed).toBe(true);
  });
  it("en uzun eşleşen kural kazanır", () => {
    const txt = "User-agent: *\nDisallow: /a\nAllow: /a/b\n";
    expect(robotsAllows(txt, "X", "/a/b/c").allowed).toBe(true);
    expect(robotsAllows(txt, "X", "/a/c").allowed).toBe(false);
  });
});

const lp = (o: Partial<LinkPage> & Pick<LinkPage, "path" | "type" | "name">): LinkPage => ({
  id: o.path, published: true, primaryKeyword: null, provinceId: null, serviceId: null, sectorId: null, text: "", importance: 2, ...o,
});

describe("iç link küme denetimi", () => {
  const pages = [
    lp({ path: "/web-tasarim", type: "SERVICE", name: "Web Tasarım", serviceId: "s1", primaryKeyword: "web tasarım" }),
    lp({ path: "/web-tasarim/sakarya", type: "CITY", name: "Sakarya Web Tasarım", serviceId: "s1", provinceId: 54 }),
    lp({ path: "/web-tasarim/sakarya/serdivan", type: "DISTRICT", name: "Serdivan Web Tasarım", serviceId: "s1", provinceId: 54 }),
    lp({ path: "/blog/x", type: "BLOG_POST", name: "Yazı", text: "Web tasarım süreci hakkında bilgiler" }),
    lp({ path: "/yalniz", type: "SERVICE", name: "Yalnız" }),
  ];
  const edges: Edge[] = [
    { from: "/web-tasarim", to: "/web-tasarim/sakarya", anchor: "Sakarya", kind: "template" },
    { from: "/web-tasarim/sakarya", to: "/web-tasarim", anchor: "Web Tasarım", kind: "template" },
    { from: "/blog/x", to: "/web-tasarim/sakarya", anchor: "x", kind: "body" },
  ];
  it("eksik küme bağlantılarını nedeniyle önerir", () => {
    const r = clusterAudit(pages, edges);
    expect(r.counts["service-location"]).toEqual({ possible: 2, existing: 1 });
    const s = r.suggestions.find((x) => x.source === "/web-tasarim" && x.target === "/web-tasarim/sakarya/serdivan");
    expect(s?.reason).toMatch(/aynı konu kümesine ait/);
    expect(r.suggestions.some((x) => x.relation === "blog-service" && x.target === "/web-tasarim")).toBe(true);
  });
  it("orphan ve çok link alan sayfaları bulur", () => {
    const stats = linkStats(pages, edges);
    expect(orphans(stats).map((s) => s.path)).toEqual(expect.arrayContaining(["/yalniz", "/web-tasarim/sakarya/serdivan"]));
    expect(overLinked(stats)).toEqual([]);
  });
});

describe("fırsat skoru ve içerik güvenliği", () => {
  it("skor yalnızca gerçek metriklerden; pozisyon 4–10 en yüksek", () => {
    expect(qwScore(1000, 6, 0.01)).toBeGreaterThan(qwScore(1000, 25, 0.01));
    expect(qwScore(0, null, null)).toBe(0);
    expect(qwScore(10_000_000, 5, 0)).toBeLessThanOrEqual(100);
  });
  it("yer tutucu ve doğrulanmamış işaretleri yakalar", () => {
    expect(PLACEHOLDER_RE.test("Lorem ipsum dolor")).toBe(true);
    expect(PLACEHOLDER_RE.test("Merhaba {{isletme_adi}}")).toBe(true);
    expect(PLACEHOLDER_RE.test("Normal metin")).toBe(false);
    expect(unverifiedCount("a [DOĞRULANMALI: x] b [DOĞRULANMALI: y]", null)).toBe(2);
  });
});
