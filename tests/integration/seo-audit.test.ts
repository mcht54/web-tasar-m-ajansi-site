// SEO denetimi sonrası entegrasyon testleri: 10 kategorili sağlık skoru (sahte veri
// yok), yalnızca değişen URL'lerin IndexNow'a gitmesi, iş kilidi, işlem
// sahiplenme (idempotency), elle düzenlenen alanın korunması ve tarih doğruluğu.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { computeSeoHealth } from "@/lib/autopilot/health";
import { changedPathsSince } from "@/lib/seo/indexnow";
import { pageInputSchema, savePage, snapshotOf } from "@/lib/admin/pages";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import { AUTOPILOT_USER, approveAction, executeAction, rollbackAction } from "@/lib/autopilot/execute";
import { registerJob, runJob } from "@/lib/jobs/runner";
import "@/lib/jobs/registry";
import type { SessionUser } from "@/lib/auth/session";

const BASE = "https://webtasarimajansi.net";
let editor: SessionUser;
let runId: string;

/** Sahte canlı site: robots/sitemap/llms ve sayfalar (kendi canonical'ı ile). */
function fakeSite(opts: { robots?: string; llms?: string } = {}): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith("/robots.txt")) return new Response(opts.robots ?? "User-agent: *\nAllow: /\nDisallow: /yonetim\nDisallow: /api/\n", { status: 200 });
    if (u.endsWith("/sitemap.xml")) return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/</loc></url><url><loc>${BASE}/web-tasarim</loc></url></urlset>`, { status: 200, headers: { "content-type": "application/xml" } });
    if (u.endsWith("/llms.txt")) return new Response(opts.llms ?? `# Site\n\n- [Web Tasarım](${BASE}/web-tasarim): açıklama\n`, { status: 200 });
    if (u.endsWith("/llms-full.txt")) return new Response("x".repeat(5000), { status: 200 });
    return new Response(`<!doctype html><html><head><title>t</title><link rel="canonical" href="${u}"></head><body><h1>h</h1></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

async function page(path: string) {
  return db.page.findUniqueOrThrow({ where: { path } });
}
async function input(path: string, patch: Record<string, unknown>) {
  const p = await page(path);
  const cur = snapshotOf(p as unknown as Record<string, unknown>);
  return pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), ...patch });
}

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "seo-audit@example.com" }, create: { email: "seo-audit@example.com", name: "Denetim Editörü", role: "ADMIN", passwordHash: "x" }, update: {} });
  editor = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await saveSetting("integrations", {});
  runId = (await db.autopilotRun.create({ data: { weekKey: "TEST-W00", trigger: "test" } })).id;
});

afterAll(async () => {
  await db.autopilotRun.deleteMany({ where: { weekKey: "TEST-W00" } });
  await db.indexNowSubmission.deleteMany({ where: { trigger: "test-audit" } });
});

describe("SEO sağlık skoru (10 kategori)", () => {
  it("Search Console yokken Google 'doğrulanamaz'; skor uydurulmaz; performans alan verisi olmadan PASS değil", async () => {
    const h = await computeSeoHealth({ fetchImpl: fakeSite() });
    expect(h.categories.map((c) => c.key)).toEqual(["technical", "indexability", "content", "links", "structured", "performance", "local", "google", "bing", "ai"]);
    const g = h.categories.find((c) => c.key === "google")!;
    expect(g.status).toBe("NOT_VERIFIABLE");
    expect(g.score).toBeNull();
    expect(JSON.stringify(g.checks)).toContain("Gerçek Google verisi alınamadı");
    expect(h.categories.find((c) => c.key === "performance")!.status).toBe("NOT_VERIFIABLE");
    expect(h.categories.find((c) => c.key === "bing")!.status).not.toBe("PASS"); // Bing dizin verisi yok
    for (const c of h.categories) if (c.status === "NOT_VERIFIABLE") expect(c.score).toBeNull();
    const ai = h.categories.find((c) => c.key === "ai")!;
    expect(ai.checks.find((x) => x.label === "llms.txt")!.status).toBe("PASS");
    expect(ai.checks.find((x) => x.label === "AI arama botları")!.status).toBe("PASS");
    expect(h.categories.find((c) => c.key === "indexability")!.checks.find((x) => x.label === "robots.txt erişimi")!.status).toBe("PASS");
  });

  it("robots.txt Googlebot'u engellerse ve AI botları kapalıysa FAIL/WARNING verir", async () => {
    const h = await computeSeoHealth({ fetchImpl: fakeSite({ robots: "User-agent: Googlebot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n" }) });
    const idx = h.categories.find((c) => c.key === "indexability")!;
    expect(idx.status).toBe("FAIL");
    expect(idx.checks.find((x) => x.label === "robots.txt erişimi")!.evidence).toMatch(/Googlebot → \//);
    expect(h.categories.find((c) => c.key === "ai")!.checks.find((x) => x.label === "AI arama botları")!.status).toBe("WARNING");
  });

  it("kopya title ve kopya H1 yakalanır; site erişilemezse sitemap/llms doğrulanamaz sayılır", async () => {
    const a = await page("/seo-hizmeti"), b = await page("/google-ads-yonetimi");
    await db.page.update({ where: { id: b.id }, data: { seoTitle: a.seoTitle, h1: a.h1 } });
    try {
      const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
      const h = await computeSeoHealth({ fetchImpl: down });
      const content = h.categories.find((c) => c.key === "content")!;
      expect(content.status).toBe("FAIL");
      expect(content.checks.find((x) => x.label === "Kopya title")!.evidence).toContain("/google-ads-yonetimi");
      expect(content.checks.find((x) => x.label === "Kopya H1")!.status).toBe("WARNING");
      const idx = h.categories.find((c) => c.key === "indexability")!;
      expect(idx.checks.find((x) => x.label === "Sitemap")!.status).toBe("NOT_VERIFIABLE");
      expect(h.categories.find((c) => c.key === "ai")!.checks.find((x) => x.label === "llms.txt")!.status).toBe("NOT_VERIFIABLE");
    } finally {
      await db.page.update({ where: { id: b.id }, data: { seoTitle: b.seoTitle, h1: b.h1 } });
    }
  });
});

describe("IndexNow: yalnızca gerçekten değişen URL'ler", () => {
  it("analiz yazımları değişiklik sayılmaz; alan logu olan sayfa bir kez bildirilir", async () => {
    const since = new Date();
    // Analiz benzeri yazım (updatedAt değişir ama içerik değişmez)
    await db.page.update({ where: { path: "/otel-web-tasarimi" }, data: { seoScore: 77 } });
    expect(await changedPathsSince(since)).toEqual([]);
    // Gerçek içerik değişikliği
    const r = await savePage(editor, (await page("/otel-web-tasarimi")).id, await input("/otel-web-tasarimi", { metaDescription: `Otel web tasarımında oda sayfaları, rezervasyon motoru ve fotoğraf galerisi nasıl kurgulanır? Doğrudan rezervasyonu artıran öneriler (${Date.now()}).` }));
    expect(r.ok).toBe(true);
    expect(await changedPathsSince(since)).toEqual(["/otel-web-tasarimi"]);
    // Başarıyla bildirildikten sonra tekrar gönderilmez (sonsuz tekrar yok)
    await db.indexNowSubmission.create({ data: { urls: [`${BASE}/otel-web-tasarimi`], status: "ok", message: "test", trigger: "test-audit" } });
    expect(await changedPathsSince(since)).toEqual([]);
  });

  it("yayından kaldırılan sayfa da bildirilir (silinme/kaldırılma sinyali)", async () => {
    const since = new Date();
    const p = await page("/restoran-web-tasarimi");
    await savePage(editor, p.id, await input("/restoran-web-tasarimi", { status: "DRAFT" }));
    try {
      expect(await changedPathsSince(since)).toContain("/restoran-web-tasarimi");
    } finally {
      await savePage(editor, p.id, await input("/restoran-web-tasarimi", { status: "PUBLISHED" }));
    }
  });
});

describe("eşzamanlılık ve tekrar güvenliği", () => {
  it("aynı iş aynı anda iki kez başlatılamaz (atomik kilit)", async () => {
    let calls = 0;
    registerJob("indexnow", async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 400));
      return { message: "test" };
    });
    const [a, b] = await Promise.all([runJob("indexnow", "test-1"), runJob("indexnow", "test-2")]);
    expect([a.status, b.status].sort()).toEqual(["ok", "skipped"]);
    expect(calls).toBe(1);
  });

  it("aynı otopilot işlemi iki kez uygulanamaz (yeniden deneme / iki worker)", async () => {
    const src = await page("/mimarlik-web-tasarimi");
    const a = await db.autopilotAction.create({ data: { runId, type: "INTERNAL_LINK", risk: "AUTO", status: "planned", score: 30, title: "idempotency", reason: "test", pageId: src.id, proposal: { payload: { source: src.path, target: "/kurumsal-web-tasarim", anchor: "" } } } });
    const versionsBefore = await db.pageVersion.count({ where: { pageId: src.id } });
    const [r1, r2] = await Promise.all([executeAction(a.id, { allowControlled: false, model: "x" }), executeAction(a.id, { allowControlled: false, model: "x" })]);
    expect([r1.status, r2.status].sort()).toEqual(["applied", "skipped"]);
    const links = (await page(src.path)).relatedLinks as { path: string }[];
    expect(links.filter((l) => l.path === "/kurumsal-web-tasarim")).toHaveLength(1);
    expect(await db.pageVersion.count({ where: { pageId: src.id } })).toBeLessThanOrEqual(versionsBefore + 2);
    await rollbackAction(AUTOPILOT_USER, a.id);
  });

  it("elle düzenlenen alanın üzerine otomatik yazılmaz; onaylanınca uygulanır", async () => {
    const p = await page("/insaat-firmasi-web-tasarimi");
    const original = p.metaDescription;
    const manual = `İnşaat firmaları için projeleri, satıştaki daireleri ve kurumsal güveni öne çıkaran web tasarımı: editörün elle yazdığı açıklama ${Date.now() % 1000}.`;
    await savePage(editor, p.id, await input(p.path, { metaDescription: manual }));
    const a = await db.autopilotAction.create({ data: { runId, type: "META", risk: "AUTO", status: "planned", score: 30, title: "manual-guard", reason: "test", pageId: p.id, query: null, proposal: {} } });
    const r = await executeAction(a.id, { allowControlled: false, model: "x" });
    expect(r.status).toBe("needs_approval");
    expect(r.note).toMatch(/elle düzenlenmiş/);
    expect((await page(p.path)).metaDescription).toBe(manual);
    const approved = await approveAction(editor, a.id, "x");
    expect(["applied", "skipped"]).toContain(approved.status); // kalite kapısı yine uygulanır
    if (approved.status === "applied") await rollbackAction(editor, a.id);
    await savePage(editor, p.id, await input(p.path, { metaDescription: original }));
  });
});

describe("tarih doğruluğu", () => {
  it("blog yazılarının yayın tarihi oluşturulma tarihinden önce değil (geriye tarih yok)", async () => {
    const posts = await db.page.findMany({ where: { type: "BLOG_POST", status: "PUBLISHED" }, select: { path: true, publishedAt: true, createdAt: true } });
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) expect(p.publishedAt!.getTime(), p.path).toBeGreaterThanOrEqual(p.createdAt.getTime() - 60_000);
  });
});
