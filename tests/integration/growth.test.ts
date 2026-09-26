// Gerçek SEO büyüme zinciri: Search Console → API → DB → lokasyon → hızlı kazanım
// → fırsat motoru → ÇÖZÜM ÖNER → uygula → sürüm → geri al. Sahte Google API ile.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { db } from "@/lib/db";
import { saveSetting, setSecret, deleteSecret } from "@/lib/settings";
import { GSC_SECRET, syncGsc } from "@/lib/gsc/sync";
import { computeQuickWins } from "@/lib/seo/quick-wins";
import { locationDemand } from "@/lib/seo/location-demand";
import { runOpportunities } from "@/lib/seo/opportunities";
import { applyFix, generateFix, rollbackFix } from "@/lib/ai/service";
import { buildFixContext } from "@/lib/ai/fix";
import { savePage, pageInputSchema, snapshotOf } from "@/lib/admin/pages";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import { locationGate } from "@/lib/seo/location-quality";
import { processIndexNowRetries, submitIndexNow } from "@/lib/seo/indexnow";
import { runJob } from "@/lib/jobs/runner";
import type { SessionUser } from "@/lib/auth/session";

const BASE = "https://webtasarimajansi.net";
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

// Sorgu senaryoları: [sorgu, sayfa, pozisyon, günlük gösterim (şimdi), günlük tık (şimdi), günlük gösterim (önce), günlük tık (önce)]
const SCENARIOS: [string, string, number, number, number, number, number][] = [
  ["sakarya web tasarım", "/web-tasarim", 6.8, 44, 1, 40, 1],
  ["adapazarı web tasarım", "/web-tasarim", 9.5, 12, 0, 10, 0],
  ["serdivan web tasarım", "/web-tasarim", 14, 15, 0, 12, 0],
  ["istanbul web tasarım", "/web-tasarim", 15.5, 30, 0, 28, 0],
  ["web tasarım fiyatları", "/web-tasarim-fiyatlari", 5.2, 20, 0, 18, 0],
  ["kurumsal web sitesi", "/kurumsal-web-tasarim", 7, 20, 0.2, 20, 1.5],
  ["e-ticaret sitesi nasıl kurulur", "/blog/e-ticaret-sitesi-nasil-kurulur", 8, 10, 0, 0, 0],
  ["web tasarım ajansı", "/web-tasarim-ajansi", 12, 18, 0, 17, 0],
  ["web tasarım ajansı", "/web-tasarim", 16, 14, 0, 12, 0],
];

function fakeGoogle(): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("oauth2")) return Response.json({ access_token: "tok", expires_in: 3600 });
    const body = JSON.parse(String(init?.body ?? "{}"));
    const dims: string[] = body.dimensions;
    if (body.startRow > 0) return Response.json({ rows: [] });
    const rows: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] = [];
    for (let d = 1; d <= 56; d++) {
      const current = d <= 28;
      for (const [q, page, pos, iNow, cNow, iPrev, cPrev] of SCENARIOS) {
        const imp = current ? iNow : iPrev;
        if (!imp) continue;
        const clk = Math.round((current ? cNow : cPrev) * (d % 2 === 0 ? 1 : 1)); // deterministik
        const keys = dims.map((k) => (k === "date" ? day(d) : k === "query" ? q : k === "page" ? BASE + page : k === "device" ? "MOBILE" : "tur"));
        rows.push({ keys, clicks: clk, impressions: imp, ctr: clk / imp, position: pos });
      }
    }
    // Aynı anahtar kombinasyonunu toplayarak döndür (API davranışı)
    const m = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const k = r.keys.join("|");
      const e = m.get(k);
      if (e) { e.clicks += r.clicks; e.position = (e.position * e.impressions + r.position * r.impressions) / (e.impressions + r.impressions); e.impressions += r.impressions; }
      else m.set(k, { ...r });
    }
    return Response.json({ rows: [...m.values()] });
  }) as typeof fetch;
}

let admin: SessionUser;

async function cleanGsc() {
  await db.gscQueryDaily.deleteMany();
  await db.gscPageDaily.deleteMany();
  await db.gscDailyTotal.deleteMany();
  await db.gscDimDaily.deleteMany();
  await db.rankSnapshot.deleteMany();
  await db.seoTask.deleteMany();
}

beforeAll(async () => {
  await cleanGsc();
  const u = await db.user.upsert({ where: { email: "growth@example.com" }, create: { email: "growth@example.com", name: "Büyüme Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
});

afterAll(async () => {
  await cleanGsc();
  await deleteSecret(GSC_SECRET);
  await saveSetting("integrations", {});
  await db.aiSuggestion.deleteMany();
});

describe("Search Console verisi yokken", () => {
  it("hiçbir yerde sıfır veya tahmin üretmez", async () => {
    const qw = await computeQuickWins();
    expect(qw.hasData).toBe(false);
    expect(qw.items).toEqual([]);
    const demand = await locationDemand(90);
    expect(demand.hasGsc).toBe(false);
    expect(demand.rows).toEqual([]);
    const page = await db.page.findUniqueOrThrow({ where: { path: "/web-tasarim" } });
    const ctx = await buildFixContext(page.id, null, null);
    expect(ctx.queries).toBeNull(); // "veri yok", boş liste değil
  });
});

describe("Search Console → DB → lokasyon → fırsat → çözüm zinciri", () => {
  it("senkron: sorgu, sayfa, cihaz, ülke ve tarih günlük saklanır", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await setSecret(GSC_SECRET, JSON.stringify({ type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
    await saveSetting("integrations", { gscProperty: "sc-domain:webtasarimajansi.net" });
    const r = await syncGsc({ days: 60, fetchImpl: fakeGoogle() });
    expect(r.status).toBe("ok");
    expect(await db.gscDimDaily.count({ where: { dimension: "device" } })).toBeGreaterThan(50);
    expect(await db.gscDimDaily.count({ where: { dimension: "country" } })).toBeGreaterThan(50);
    const q = await db.gscQueryDaily.findFirstOrThrow({ where: { query: "sakarya web tasarım" } });
    expect(q.page).toBe(`${BASE}/web-tasarim`);
    expect(await db.gscQueryDaily.groupBy({ by: ["date"], _count: true }).then((x) => x.length)).toBeGreaterThanOrEqual(50);
  });

  it("sorgular doğru il/ilçeye eşleşir", async () => {
    const { rows, hasGsc } = await locationDemand(90);
    expect(hasGsc).toBe(true);
    const by = (p: string) => rows.find((r) => r.path === p);
    expect(by("/web-tasarim/sakarya")?.queries.map((q) => q.query)).toEqual(["sakarya web tasarım"]);
    expect(by("/web-tasarim/sakarya/adapazari")?.queries[0].query).toBe("adapazarı web tasarım");
    expect(by("/web-tasarim/sakarya/serdivan")?.impressions).toBeGreaterThan(400);
    expect(by("/web-tasarim/istanbul")).toBeTruthy();
    const sakarya = by("/web-tasarim/sakarya")!;
    expect(sakarya.verdict).toBe("TASLAK");
    expect(sakarya.ctr).not.toBeNull();
    expect(sakarya.opportunity).toBeGreaterThan(0);
    // "web tasarım fiyatları" konumsuz: hiçbir konuma yazılmamalı
    expect(rows.some((r) => r.queries.some((q) => q.query === "web tasarım fiyatları"))).toBe(false);
  });

  it("hızlı kazanım motoru altı kategoriyi gerçek veriden bulur", async () => {
    const qw = await computeQuickWins();
    expect(qw.hasData).toBe(true);
    const cats = (q: string) => qw.items.filter((i) => i.query === q).map((i) => i.category);
    expect(cats("sakarya web tasarım")).toContain("FIRST_PAGE");
    expect(cats("istanbul web tasarım")).toContain("CONTENT");
    expect(cats("web tasarım fiyatları")).toContain("CTR");
    expect(cats("kurumsal web sitesi")).toContain("DECLINE");
    expect(cats("e-ticaret sitesi nasıl kurulur")).toContain("RISING");
    expect(cats("web tasarım ajansı")).toContain("CANNIBAL");
    const sak = qw.items.find((i) => i.query === "sakarya web tasarım" && i.category === "FIRST_PAGE")!;
    expect(sak.location?.name).toBe("Sakarya");
    expect(sak.impressions).toBe(44 * 28);
    for (const i of qw.items) expect(i.reason).not.toMatch(/kesinlikle|garanti/i);
  });

  it("fırsat motoru görev üretir; görevler sayfaya ve sorguya bağlıdır", async () => {
    await runOpportunities();
    const first = await db.seoTask.findUnique({ where: { fingerprint: "qw:first:sakarya web tasarım" } });
    expect(first?.title).toContain("İlk sayfa fırsatı");
    expect(first?.pageId).toBeTruthy();
    const ctr = await db.seoTask.findUnique({ where: { fingerprint: "qw:ctr:web tasarım fiyatları" } });
    expect(ctr?.code).toBe("QW_CTR");
    const loc = await db.seoTask.findUnique({ where: { fingerprint: "loc-demand:/web-tasarim/sakarya/serdivan" } });
    expect(loc?.title).toMatch(/Serdivan.*taslak/);
    expect(await db.seoTask.count({ where: { code: "CANNIBAL_SERP", status: "OPEN" } })).toBeGreaterThanOrEqual(1);
  });

  it("ÇÖZÜM ÖNER gerçek sorguları kullanır, [DOĞRULANMALI] alan uygulanamaz, uygula + geri al çalışır", async () => {
    const page = await db.page.findUniqueOrThrow({ where: { path: "/web-tasarim-fiyatlari" } });
    const s = await generateFix(admin, page.id, "web tasarım fiyatları", "CTR");
    const out = s.output as { data: { metaDescription: string; contentGaps: string[] }; current: { seoTitle: string } };
    expect(s.provider).toBe("kural");
    expect(out.current.seoTitle).toBeTruthy();
    await expect(applyFix(admin, s.id, { metaDescription: "[DOĞRULANMALI: yaz]" })).rejects.toThrow(/DOĞRULANMALI/);
    const before = await db.pageVersion.count({ where: { pageId: page.id } });
    const newMeta = `Web tasarım fiyatlarını belirleyen kalemleri ve teklif karşılaştırma yöntemini örneklerle anlatan test açıklaması ${Date.now().toString(36)}.`;
    await applyFix(admin, s.id, { metaDescription: newMeta });
    expect((await db.page.findUniqueOrThrow({ where: { id: page.id } })).metaDescription).toBe(newMeta);
    // Seed sayfasının ilk düzenlemesi: önce "değişiklik öncesi durum", sonra yeni sürüm (+2)
    expect(await db.pageVersion.count({ where: { pageId: page.id } })).toBeGreaterThanOrEqual(before + 1);
    expect(await db.pageVersion.count({ where: { pageId: page.id, note: "Değişiklik öncesi durum (otomatik)" } })).toBeLessThanOrEqual(1);
    expect(await db.seoChangeLog.count({ where: { pageId: page.id, after: newMeta } })).toBe(1);
    await rollbackFix(admin, s.id);
    expect((await db.page.findUniqueOrThrow({ where: { id: page.id } })).metaDescription).toBe(page.metaDescription);
    await expect(rollbackFix(admin, s.id)).rejects.toThrow(/zaten/);
  });
});

describe("yayın kapısı", () => {
  it("[DOĞRULANMALI] içeren sayfa hiçbir türde yayınlanamaz", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: "/hakkimizda" } });
    const snap = snapshotOf(p as unknown as Record<string, unknown>);
    const r = await savePage(admin, p.id, pageInputSchema.parse({ ...snap, faq: parseFaq(snap.faq), status: "PUBLISHED" }));
    expect(r.ok).toBe(false);
    expect((await db.page.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("DRAFT");
  });

  it("lokasyon sayfası kalite kapısını geçmeden yayınlanamaz, içerik taslak olarak kaydedilir", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: "/web-tasarim/sakarya" } });
    const snap = snapshotOf(p as unknown as Record<string, unknown>);
    const body = "## Sakarya\n\nKısa bir metin.";
    const r = await savePage(admin, p.id, pageInputSchema.parse({ ...snap, faq: [], body, intro: "Sakarya web tasarım.", status: "PUBLISHED" }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/YAYINA HAZIR DEĞİL/);
    const after = await db.page.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.body).toBe(body);
    const gate = await locationGate(p.id);
    expect(gate!.ready).toBe(false);
    const failed = gate!.items.filter((i) => i.critical && i.status === "FAIL").map((i) => i.key);
    expect(failed).toEqual(expect.arrayContaining(["thin", "local", "business", "doorway", "meta"]));
    // Search Console talebi bilgi olarak görünür (kritik değil)
    expect(gate!.items.find((i) => i.key === "demand")?.critical).toBe(false);
    await db.page.update({ where: { id: p.id }, data: { body: null, intro: null } });
  });
});

describe("IndexNow", () => {
  it("başarılı gönderim kaydedilir; 429 başarısız sayılır ve yeniden deneme planlanır", async () => {
    await db.indexNowSubmission.deleteMany();
    const ok = await submitIndexNow(["/web-tasarim"], (async () => new Response(null, { status: 200 })) as unknown as typeof fetch, { trigger: "test" });
    expect(ok.status).toBe("ok");
    const limited = await submitIndexNow(["/web-tasarim"], (async () => new Response(null, { status: 429 })) as unknown as typeof fetch, { trigger: "test" });
    expect(limited.ok).toBe(false);
    expect(limited.status).toBe("retry");
    expect(limited.message).toMatch(/HTTP 429.*yeniden deneme planlandı/);
    const rec = await db.indexNowSubmission.findFirstOrThrow({ where: { status: "retry" } });
    expect(rec.nextRetryAt).not.toBeNull();
    const bad = await submitIndexNow(["/x"], (async () => new Response(null, { status: 403 })) as unknown as typeof fetch);
    expect(bad.status).toBe("failed");
    // zamanı gelen deneme işlenir
    await db.indexNowSubmission.update({ where: { id: rec.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
    const r = await processIndexNowRetries((async () => new Response(null, { status: 202 })) as unknown as typeof fetch);
    expect(r).toEqual({ due: 1, ok: 1, failed: 0 });
    expect(await db.auditLog.count({ where: { action: { startsWith: "indexnow." } } })).toBeGreaterThanOrEqual(4);
  });
});

describe("otomasyon dürüstlüğü", () => {
  it("başarısız iş 'başarılı' gösterilmez", async () => {
    const prev = process.env.SITE_URL;
    process.env.SITE_URL = "http://127.0.0.1:9"; // kapalı port: sitemap okunamaz
    const r = await runJob("sitemap-check", "test");
    process.env.SITE_URL = prev;
    expect(r.status).toBe("error");
    expect((await db.jobRun.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("error");
  });
});
