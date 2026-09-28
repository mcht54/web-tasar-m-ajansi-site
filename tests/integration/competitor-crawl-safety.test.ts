// Rakip tarama güvenliği (gerçek yerel HTTP sunucusuyla):
// - 8 eşzamanlı tarama → 1 gerçek tarama, 1 kilit sahibi, 1 tarama kaydı, URL başına ≤1 HTTP isteği
//   (dev ortamında gözlenen gerçek olayın regresyonu: adareklam.tr'ye 8 paralel tarama)
// - panelden 8 istek → 1 kuyruk işi; zamanlayıcı + elle tarama yarışı → 1 tarama
// - süresi dolmuş kilidin devralınması; yönlendirme / aynı içerik; lokasyon sınıflandırması; boş değer eşdeğerliği
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { crawlCompetitor } from "@/lib/competitors/crawl";
import { acquireCrawlLock, releaseCrawlLock } from "@/lib/competitors/lock";
import { crawlHooks, requestCompetitorCrawl } from "@/lib/competitors/jobs";
import { categorize } from "@/lib/competitors/classify";
import { processQueue } from "@/lib/jobs/runner";
import { savePage, pageInputSchema, snapshotOf } from "@/lib/admin/pages";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import { AUTOPILOT_USER } from "@/lib/autopilot/execute";
import { startCompetitorSite } from "../fixtures/competitor-site";

let site: Awaited<ReturnType<typeof startCompetitorSite>>;
const policy = { allowHosts: ["127.0.0.1"] };
const fast = { delayMs: 250, timeoutMs: 2000, maxDepth: 2, maxPages: 60, cacheHours: 72, concurrency: 1 };
const DOMAINS = ["kilit-test.example", "kuyruk-test.example", "yaris-test.example", "bayat-test.example", "yonlendirme-test.example"];

async function fresh(domain: string) {
  await db.competitor.deleteMany({ where: { domain } });
  return (await db.competitor.create({ data: { domain } })).id;
}
const hitsSnapshot = () => new Map(site.state.hits);
const newHits = (before: Map<string, number>) => [...site.state.hits].map(([p, n]) => [p, n - (before.get(p) ?? 0)] as const).filter(([, n]) => n > 0);

beforeAll(async () => {
  site = await startCompetitorSite();
  crawlHooks.policy = policy;
  crawlHooks.baseFor = () => site.origin;
  await saveSetting("competitors", fast);
});

beforeEach(async () => {
  await db.jobRun.deleteMany({ where: { kind: { in: ["competitor-crawl", "competitor-opportunity-scan"] } } });
});

afterAll(async () => {
  crawlHooks.policy = undefined;
  crawlHooks.baseFor = undefined;
  await site.close();
  await db.competitor.deleteMany({ where: { domain: { in: DOMAINS } } });
  await db.jobRun.deleteMany({ where: { kind: { in: ["competitor-crawl", "competitor-opportunity-scan"] } } });
  await saveSetting("competitors", {});
});

describe("tarama kilidi (atomik, veritabanı düzeyinde)", () => {
  it("REGRESYON: aynı rakibe 8 eşzamanlı tarama → 1 gerçek tarama, 7 kilitli; URL başına en çok 1 HTTP isteği", async () => {
    const id = await fresh("kilit-test.example");
    const before = hitsSnapshot();
    const results = await Promise.all(Array.from({ length: 8 }, () => crawlCompetitor(id, { policy, baseOverride: site.origin, settings: fast })));
    const ran = results.filter((r) => !r.locked);
    expect(ran).toHaveLength(1);
    expect(ran[0].ok, ran[0].error ?? "").toBe(true);
    expect(results.filter((r) => r.locked)).toHaveLength(7);
    for (const r of results.filter((x) => x.locked)) expect(r.error).toBe("Bu rakip şu anda taranıyor.");
    // Gerçek HTTP: her yol en çok bir kez istendi (8 paralel tarama olsaydı ≥8 olurdu)
    const hits = newHits(before);
    expect(hits.length).toBeGreaterThan(5);
    for (const [path, n] of hits) expect(n, `${path} ${n} kez istendi`).toBeLessThanOrEqual(1);
    // Veritabanı: 1 tarama kaydı (kilit sahibi), sayfa tekrarı yok, kilit bırakıldı
    expect(await db.competitorSnapshot.count({ where: { competitorId: id } })).toBe(1);
    const pages = await db.competitorPage.findMany({ where: { competitorId: id } });
    expect(new Set(pages.map((p) => p.url)).size).toBe(pages.length);
    const c = await db.competitor.findUniqueOrThrow({ where: { id } });
    expect(c.crawlLockUntil).toBeNull();
    expect(c.crawlLockOwner).toBeNull();
    expect(c.lastCrawlAt!.getTime()).toBeGreaterThanOrEqual(c.crawlStartedAt!.getTime()); // bitiş ≥ başlangıç
  }, 60_000);

  it("kilit alınamazsa hiçbir HTTP isteği yapılmaz", async () => {
    const id = await fresh("kilit-test.example");
    const lock = await acquireCrawlLock(id, 60_000);
    expect(lock.acquired).toBe(true);
    const before = hitsSnapshot();
    const r = await crawlCompetitor(id, { policy, baseOverride: site.origin, settings: fast });
    expect(r.locked).toBe(true);
    expect(newHits(before)).toEqual([]);
    if (lock.acquired) await releaseCrawlLock(id, lock.owner);
  });

  it("süresi dolmuş (çökmüş) kilit devralınır; yarıda kalan tarama kaydı kapatılır", async () => {
    const id = await fresh("bayat-test.example");
    const stale = await acquireCrawlLock(id, 60_000);
    expect(stale.acquired).toBe(true);
    // Süreç çöktü: kilit bırakılmadı; kira süresi geçmiş gibi (yalnızca TEST veritabanı)
    await db.$executeRaw`UPDATE "Competitor" SET "crawlLockUntil" = (now() AT TIME ZONE 'utc') - interval '1 minute' WHERE id = ${id}`;
    const r = await crawlCompetitor(id, { policy, baseOverride: site.origin, settings: { ...fast, maxPages: 3 } });
    expect(r.locked).toBeFalsy();
    expect(r.ok, r.error ?? "").toBe(true);
    const snaps = await db.competitorSnapshot.findMany({ where: { competitorId: id }, orderBy: { createdAt: "asc" } });
    expect(snaps).toHaveLength(2);
    expect(snaps[0].status).toBe("error");
    expect(snaps[0].error).toMatch(/yarıda kaldı/);
  });
});

describe("kuyruk / worker (web isteğinde tarama yok)", () => {
  it("panelden 8 eşzamanlı tarama isteği → 1 kuyruk işi; istek HTTP yapmaz; worker tek tarama yapar", async () => {
    const id = await fresh("kuyruk-test.example");
    const before = hitsSnapshot();
    await Promise.all(Array.from({ length: 8 }, () => requestCompetitorCrawl(id, "test")));
    expect(newHits(before)).toEqual([]); // istek yalnızca kayıt/kuyruk
    expect(await db.jobRun.count({ where: { kind: "competitor-crawl", status: { in: ["queued", "running"] } } })).toBe(1);
    expect((await db.competitor.findUniqueOrThrow({ where: { id } })).crawlRequestedAt).toBeTruthy();
    const done = await processQueue({ maxJobs: 1 });
    expect(done.find((d) => d.kind === "competitor-crawl")?.status).toBe("ok");
    expect(await db.competitorSnapshot.count({ where: { competitorId: id } })).toBe(1);
    const c = await db.competitor.findUniqueOrThrow({ where: { id } });
    expect(c.crawlRequestedAt).toBeNull();
    for (const [path, n] of newHits(before)) expect(n, path).toBeLessThanOrEqual(1);
  }, 60_000);

  it("zamanlayıcı + elle tarama yarışı → tek tarama", async () => {
    const id = await fresh("yaris-test.example");
    await requestCompetitorCrawl(id, "test");
    const before = hitsSnapshot();
    const [queue, manual] = await Promise.all([processQueue({ maxJobs: 1 }), crawlCompetitor(id, { policy, baseOverride: site.origin, settings: fast })]);
    const queueRan = queue.some((q) => q.kind === "competitor-crawl" && /sayfa/.test(q.message));
    expect(Number(queueRan) + Number(!manual.locked)).toBe(1);
    expect(await db.competitorSnapshot.count({ where: { competitorId: id } })).toBe(1);
    for (const [path, n] of newHits(before)) expect(n, path).toBeLessThanOrEqual(1);
  }, 60_000);
});

describe("yönlendirme ve aynı içerik", () => {
  it("A→B, A→B→C, iki adres → aynı son adres, döngü, dış site, sitemap tekrarı: kaynak korunur, sayfa tek sayılır", async () => {
    const id = await fresh("yonlendirme-test.example");
    const before = hitsSnapshot();
    const r = await crawlCompetitor(id, { policy, baseOverride: site.origin, settings: fast });
    expect(r.ok, r.error ?? "").toBe(true);
    const pages = await db.competitorPage.findMany({ where: { competitorId: id } });
    const by = (p: string) => pages.find((x) => x.path === p);
    // A→B: kaynak 301 kaydı korunur, son adres canlı sayfa
    expect(by("/eski-ads")?.status).toBe(301);
    expect(by("/eski-ads")?.finalUrl).toBe(`${site.origin}/google-ads-yonetimi`);
    expect(by("/google-ads-yonetimi")?.status).toBe(200);
    // A→B→C
    expect(by("/zincir-a")?.status).toBe(302);
    expect(by("/zincir-a")?.finalUrl).toBe(`${site.origin}/seo`);
    // Şablon adresi ana sayfaya yönlenir (gerçek adareklam.tr vakası): ana sayfa kopyası oluşmaz
    expect(by("/pxl-template/header")?.status).toBe(301);
    expect(pages.filter((p) => p.path === "/" && p.status === 200)).toHaveLength(1);
    // Dış site: izlenmez (istek atılmaz), kaynak kaydı korunur
    expect(by("/dis-site")?.status).toBe(301);
    expect(by("/dis-site")?.finalUrl).toBe("https://example.com/");
    expect(r.stats!.redirectsExternal).toBe(1);
    // Döngü: hata olarak sayılır, sonsuz istek yok
    expect(site.state.hits.get("/dongu-a")! - (before.get("/dongu-a") ?? 0)).toBe(1);
    // Her son adres en çok bir kez indirildi; canlı sayım yönlendirme kaynaklarını içermez
    for (const [path, n] of newHits(before)) expect(n, path).toBeLessThanOrEqual(1); // kaynak, ara adım ve hedef: her yol en çok bir kez
    expect(site.state.hits.get("/google-ads-yonetimi")! - (before.get("/google-ads-yonetimi") ?? 0)).toBe(1);
    const live = pages.filter((p) => p.status === 200 && !p.removedAt && !p.duplicateOf);
    expect(r.stats!.pages).toBe(live.length);
    expect(live.some((p) => p.status >= 300)).toBe(false);
    expect(r.stats!.redirects.some((x) => x.from === "/eski-ads" && x.to === "/google-ads-yonetimi")).toBe(true);
    // Aynı içerik (200): canonical ile işaret eden kopya işaretlenir, kayıt silinmez; zayıf sinyal kopya sayılmaz
    expect(by("/kopya-2")?.duplicateOf).toBe("/kopya-1");
    expect(by("/kopya-1")?.duplicateOf).toBeNull();
    expect(by("/kopya-3")?.duplicateOf).toBeNull();
    expect(r.stats!.duplicates).toContainEqual({ path: "/kopya-2", of: "/kopya-1" });
  }, 60_000);

  it("önceden sayfa sanılan adres yönlendirmeye dönerse REDIRECTED olarak işaretlenir, silinmez", async () => {
    const id = await fresh("yonlendirme-test.example");
    const now = new Date();
    // Eski tarayıcı davranışı: yönlendirme kaynağı 200 sayfa olarak kaydedilmiş (TEST veritabanı)
    await db.competitorPage.create({ data: { competitorId: id, url: `${site.origin}/pxl-template/header`, path: "/pxl-template/header", status: 200, h1: [], h2: [], schemaTypes: [], links: [], topics: [], firstSeenAt: now, fetchedAt: new Date(0) } });
    const r = await crawlCompetitor(id, { policy, baseOverride: site.origin, settings: fast });
    expect(r.changes.some((c) => c.kind === "REDIRECTED" && c.url === "/pxl-template/header")).toBe(true);
    const row = await db.competitorPage.findFirstOrThrow({ where: { competitorId: id, path: "/pxl-template/header" } });
    expect(row.status).toBe(301);
  }, 60_000);
});

describe("lokasyon sınıflandırması (tek sinyal yetmez)", () => {
  const places = { provinces: ["sakarya"], districts: [{ slug: "adapazari", province: "sakarya" }] };
  it("Article + şehir → lokasyon değil; blog + şehir → blog; hizmet + şehir → lokasyon", () => {
    expect(categorize("/sakarya-davetiyeci", "Sakarya Davetiyeci", "", places, [], ["Article", "WebPage"]).category).toBe("blog");
    expect(categorize("/adapazari-kaymakami-ziyaret", "Ziyaret", "", places, [], ["NewsArticle"]).category).toBe("blog");
    expect(categorize("/blog/sakarya-haber", "", "", places, []).category).toBe("blog");
    expect(categorize("/sakarya-is-kiyafetleri", "", "", places, [], ["WebPage"]).category).not.toBe("location"); // hizmet sinyali yok
    expect(categorize("/sakarya/web-tasarim", "Sakarya Web Tasarım", "", places, []).category).toBe("location");
    expect(categorize("/adapazari-reklam-ajansi", "", "", places, [], ["WebPage"]).category).toBe("location");
    expect(categorize("/sakarya-ofis", "", "", places, [], ["LocalBusiness"]).category).toBe("location");
  });
  it("gerçek taramada: Article işaretli şehirli sayfa lokasyon sayılmaz, hizmet+şehir sayılır", async () => {
    const pages = await db.competitorPage.findMany({ where: { competitor: { domain: "yonlendirme-test.example" } } });
    expect(pages.find((p) => p.path === "/sakarya-davetiyeci")?.category).toBe("blog");
    expect(pages.find((p) => p.path === "/sakarya/web-tasarim")?.category).toBe("location");
  });
});

describe("boş değer eşdeğerliği (sahte sürüm yok)", () => {
  it("null → [] SSS değişiklik sayılmaz; gerçek SSS değişikliği sayılır", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: "/otel-web-tasarimi" } });
    const orig = p.faq;
    await db.page.update({ where: { id: p.id }, data: { faq: null as never } });
    const cur = snapshotOf((await db.page.findUniqueOrThrow({ where: { id: p.id } })) as unknown as Record<string, unknown>);
    const versions = await db.pageVersion.count({ where: { pageId: p.id } });
    const same = await savePage(AUTOPILOT_USER, p.id, pageInputSchema.parse({ ...cur, faq: [] }));
    expect(same.ok && same.changed).toEqual([]);
    expect(await db.pageVersion.count({ where: { pageId: p.id } })).toBe(versions);
    const real = await savePage(AUTOPILOT_USER, p.id, pageInputSchema.parse({ ...cur, faq: [{ q: "Gerçek soru?", a: "Gerçek yanıt." }] }));
    expect(real.ok && real.changed).toEqual(["faq"]);
    // eski hâline dön
    const back = snapshotOf((await db.page.findUniqueOrThrow({ where: { id: p.id } })) as unknown as Record<string, unknown>);
    await savePage(AUTOPILOT_USER, p.id, pageInputSchema.parse({ ...back, faq: parseFaq(orig) }));
  });
});
