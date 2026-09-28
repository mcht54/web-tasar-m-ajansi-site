// Rakip istihbaratı: GERÇEK yerel HTTP sunucusuna karşı tarama, SSRF, robots, önbellek, fark,
// fırsat → öneri → 48 saat yaşam döngüsü. Yapay zekâ yalnızca test kancasıyla taklit edilir.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { db } from "@/lib/db";
import { deleteSecret, saveSetting, setSecret } from "@/lib/settings";
import { GSC_SECRET } from "@/lib/gsc/sync";
import { isBlockedIp, safeFetch, validateDomain } from "@/lib/competitors/net";
import { parseRobots, robotsAllowed, categorize } from "@/lib/competitors/classify";
import { crawlCompetitor } from "@/lib/competitors/crawl";
import { competitorFindings, UNKNOWN_METRICS } from "@/lib/competitors/insights";
import { competitorDiscovery, runCompetitorOpportunities } from "@/lib/competitors/jobs";
import { aiHooks } from "@/lib/autopilot/execute";
import { applyProposal, rejectProposal, rollbackProposal, runAutoApply } from "@/lib/proposals/lifecycle";
import { startCompetitorSite } from "../fixtures/competitor-site";
import type { SessionUser } from "@/lib/auth/session";

const H = 3600_000;
let site: Awaited<ReturnType<typeof startCompetitorSite>>;
let competitorId: string;
let admin: SessionUser;
const policy = { allowHosts: ["127.0.0.1"] };
const fast = { delayMs: 250, timeoutMs: 2000, maxDepth: 2, maxPages: 60, cacheHours: 72 };
const realHooks = { ...aiHooks };
const SECTION = {
  heading: "Kampanya sonuçlarının düzenli takibi",
  markdown: "Google Ads yönetiminde kampanyanın hangi aramalarda göründüğü ve bu aramalardan gelen ziyaretçinin sitede ne yaptığı düzenli olarak izlenir. Ölçüm kurulmadan yapılan bütçe değişiklikleri tahmine dayanır. Bu nedenle önce dönüşüm hedefleri tanımlanır, ardından reklam grupları bu hedeflere göre ayrılır. Düşük performanslı aramalar belirlenip hariç tutulur, iyi çalışan aramalar ayrı reklam gruplarında değerlendirilir. Raporlar sade tutulur; işletme sahibinin reklamın ne getirdiğini görmesi amaçlanır.",
  rationale: "t",
};

beforeAll(async () => {
  site = await startCompetitorSite();
  const u = await db.user.upsert({ where: { email: "competitors@example.com" }, create: { email: "competitors@example.com", name: "Rakip Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await db.competitor.deleteMany({ where: { domain: { in: ["rakip-test.example", "sinir-test.example"] } } });
  competitorId = (await db.competitor.create({ data: { domain: "rakip-test.example", name: "Test Rakip" } })).id;
  await saveSetting("autopilot", {});
  await saveSetting("business", {});
});

afterEach(() => {
  Object.assign(aiHooks, realHooks);
});

afterAll(async () => {
  await site.close();
  await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
  await db.competitor.deleteMany({ where: { domain: { in: ["rakip-test.example", "sinir-test.example"] } } });
  await deleteSecret(GSC_SECRET);
  await saveSetting("integrations", {});
  await saveSetting("autopilot", {});
});

describe("güvenlik: alan adı doğrulama ve SSRF", () => {
  it("geçersiz / IP / yerel alan adları reddedilir; geçerli alan adı normalize edilir", () => {
    expect(validateDomain("https://www.Rakip-Ornek.com.tr/hizmet?x=1")).toBe("rakip-ornek.com.tr");
    for (const bad of ["127.0.0.1", "localhost", "intranet.local", "servis.internal", "metadata.google.internal", "[::1]", "yok", "a b.com"]) expect(() => validateDomain(bad)).toThrow();
  });
  it("özel/iç ağ IP aralıkları engellenir", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isBlockedIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "93.184.215.14", "2606:4700::1111"]) expect(isBlockedIp(ip), ip).toBe(false);
  });
  it("izin listesi olmadan gerçek yerel sunucuya istek atılamaz; metadata adresine yönlendirme izin listesiyle bile engellenir", async () => {
    await expect(safeFetch(`${site.origin}/`)).rejects.toThrow(/port|SSRF/);
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(/SSRF/);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/SSRF/);
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/şema/);
    await expect(safeFetch(`${site.origin}/metadata-yonlendir`, { policy })).rejects.toThrow(/SSRF/);
    const ok = await safeFetch(`${site.origin}/`, { policy });
    expect(ok.status).toBe(200);
  });
  it("Brotli ve gzip sıkıştırılmış yanıtlar eksiksiz okunur; boyut sınırı uygulanır", async () => {
    for (const p of ["/sikistirilmis-br", "/sikistirilmis-gzip"]) {
      const r = await safeFetch(`${site.origin}${p}`, { policy });
      expect(r.body, p).toContain("<title>Sıkıştırılmış Sayfa</title>");
      expect(r.body.length).toBeGreaterThan(5000);
      expect(r.truncated).toBe(false);
    }
    const small = await safeFetch(`${site.origin}/sikistirilmis-br`, { policy, maxBytes: 1000 });
    expect(small.truncated).toBe(true);
    expect(small.body.length).toBeLessThanOrEqual(1000 + 65536);
  });

  it("zaman aşımı uygulanır", async () => {
    await expect(safeFetch(`${site.origin}/yavas`, { policy, timeoutMs: 300 })).rejects.toThrow(/Zaman aşımı/);
  });
});

describe("robots ve sınıflandırma (saf)", () => {
  it("robots: en uzun eşleşme kazanır; kendi grubumuz varsa o uygulanır", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\nAllow: /hizmet\n\nUser-agent: wta-competitor-crawler\nDisallow: /gizli\nCrawl-delay: 2\n", "wta-competitor-crawler");
    expect(robotsAllowed(r, "/hizmet")).toBe(true);
    expect(robotsAllowed(r, "/gizli/x")).toBe(false);
    expect(r.crawlDelay).toBe(2);
    const star = parseRobots("User-agent: *\nDisallow: /\nAllow: /hizmet\n", "baska-bot");
    expect(robotsAllowed(star, "/hizmet/seo")).toBe(true);
    expect(robotsAllowed(star, "/blog")).toBe(false);
  });
  it("sayfa türü ve hizmet konusu çıkarımı", () => {
    const places = { provinces: ["sakarya"], districts: [{ slug: "serdivan", province: "sakarya" }] };
    expect(categorize("/web-tasarim/sakarya/serdivan", "", "", places, []).category).toBe("location");
    expect(categorize("/google-ads-yonetimi", "Google Ads Yönetimi", "", places, []).topics).toContain("/google-ads-yonetimi");
    expect(categorize("/blog/x", "", "", places, []).category).toBe("blog");
    expect(categorize("/iletisim", "", "", places, []).category).toBe("contact");
  });
});

describe("tarama: robots, sınır, önbellek, fark", () => {
  it("ilk tarama: robots'a uyulur, sayfalar ve istatistik kaydedilir, değişiklik günlüğü boş (temel kayıt)", async () => {
    const r = await crawlCompetitor(competitorId, { policy, baseOverride: site.origin, settings: fast });
    expect(r.ok, r.error ?? "").toBe(true);
    expect(site.state.hits.get("/gizli/panel") ?? 0).toBe(0); // robots ile yasak yol hiç istenmedi
    expect(r.stats!.blockedByRobots).toBeGreaterThan(0);
    expect(r.stats!.robotsFound).toBe(true);
    expect(r.stats!.sitemapFound).toBe(true);
    expect(r.stats!.firstCrawl).toBe(true);
    expect(r.changes).toEqual([]);
    const pages = await db.competitorPage.findMany({ where: { competitorId } });
    const ads = pages.find((p) => p.path === "/google-ads-yonetimi")!;
    expect(ads.h2.length).toBe(7);
    expect(ads.schemaTypes).toContain("Service");
    expect(ads.category).toBe("service");
    expect(pages.find((p) => p.path === "/web-tasarim/sakarya/serdivan")?.category).toBe("location");
    expect(JSON.stringify(pages)).not.toMatch(/açıklama cümlesi/); // rakip metni saklanmaz
  });

  it("önbellek: süre dolmadan yeniden tarama sayfaları tekrar indirmez", async () => {
    const before = site.state.hits.get("/google-ads-yonetimi") ?? 0;
    const r = await crawlCompetitor(competitorId, { policy, baseOverride: site.origin, settings: fast });
    expect(r.stats!.cacheHits).toBeGreaterThan(0);
    expect(site.state.hits.get("/google-ads-yonetimi")).toBe(before);
  });

  it("önbellek süresi dolunca koşullu GET → 304", async () => {
    const r = await crawlCompetitor(competitorId, { policy, baseOverride: site.origin, settings: { ...fast, cacheHours: 1 }, now: new Date(Date.now() + 2 * H) });
    expect(r.stats!.notModified).toBeGreaterThan(0);
    expect(site.state.notModified).toBeGreaterThan(0);
  });

  it("sayfa sınırı uygulanır", async () => {
    const other = await db.competitor.create({ data: { domain: "sinir-test.example" } });
    const r = await crawlCompetitor(other.id, { policy, baseOverride: site.origin, settings: { ...fast, maxPages: 3 } });
    expect(r.stats!.pages).toBeLessThanOrEqual(3);
    await db.competitor.delete({ where: { id: other.id } });
  });

  it("fark: yeni sayfa, silinen sayfa, URL değişikliği, title değişikliği, yeni hizmet", async () => {
    site.state.version = 2;
    const r = await crawlCompetitor(competitorId, { policy, baseOverride: site.origin, settings: { ...fast, cacheHours: 1 }, now: new Date(Date.now() + 10 * 24 * H) });
    const kinds = r.changes.map((c) => `${c.kind}:${c.url}`);
    expect(kinds).toContain("NEW_PAGE:/sosyal-medya-yonetimi");
    expect(kinds).toContain("REMOVED_PAGE:/grafik-tasarim");
    expect(kinds).toContain("URL_CHANGE:/rehber/web-sitesi-fiyatlari");
    expect(kinds).toContain("TITLE:/seo");
    expect(kinds).toContain("NEW_SERVICE:/sosyal-medya-yonetimi");
    expect(await db.competitorChange.count({ where: { competitorId } })).toBe(r.changes.length);
    expect((await db.competitorPage.findFirst({ where: { competitorId, path: "/grafik-tasarim" } }))?.removedAt).toBeTruthy();
  });
});

describe("fırsatlar: gap türleri, dürüst veri", () => {
  it("Search Console bağlı değil: talep 'bilinmiyor' (null); keşif aday uydurmaz", async () => {
    const { findings, hasGsc } = await competitorFindings({ competitorId });
    expect(hasGsc).toBe(false);
    for (const f of findings) expect(f.signals.gscDemand).toBeNull();
    const d = await competitorDiscovery();
    expect(d.available).toBe(false);
    expect(d.candidates).toEqual([]);
    expect(d.reason).toMatch(/SERP/);
  });

  it("içerik genişletme (mevcut sayfa), hizmet boşluğu (doğrulanmamış → uygulanmaz), teknik fark, lokal (yalnızca bilgi)", async () => {
    const { findings } = await competitorFindings({ competitorId });
    const by = (t: string) => findings.filter((f) => f.type === t);
    const exp = by("CONTENT_EXPANSION").find((f) => f.proposal?.path === "/google-ads-yonetimi");
    expect(exp, JSON.stringify(findings.map((f) => f.key))).toBeTruthy();
    expect(exp!.actionable).toBe(true);
    expect(exp!.proposal!.kind).toBe("CONTENT"); // yeni URL değil, mevcut sayfa
    const social = by("SERVICE_GAP").find((f) => f.key === "SERVICE_GAP:/sosyal-medya-yonetimi");
    expect(social?.actionable).toBe(false);
    expect(social?.blockedReason).toMatch(/doğrulanmadı/);
    expect(by("TECHNICAL_GAP").some((f) => f.key === "TECHNICAL_GAP:schema:LocalBusiness" && !f.actionable)).toBe(true);
    const local = by("LOCAL_GAP")[0];
    expect(local.actionable).toBe(false);
    expect(local.theirs).toContain("/web-tasarim/sakarya/serdivan");
    // Uydurma veri yok: yalnızca gözlenen/çıkarım; trafik/backlink/sıralama iddiası yok
    for (const f of findings) for (const e of f.evidence) expect(["VERIFIED", "INFERRED"]).toContain(e.quality);
    const text = JSON.stringify(findings);
    expect(text).not.toMatch(/trafik|backlink|daha fazla ziyaret|sıralaması daha/i);
    expect(UNKNOWN_METRICS).toContain("Organik trafik");
  });

  it("Search Console bağlıyken talep sinyali sayı olarak gelir", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await setSecret(GSC_SECRET, JSON.stringify({ type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
    await saveSetting("integrations", { gscProperty: "sc-domain:webtasarimajansi.net" });
    const { findings, hasGsc } = await competitorFindings({ competitorId });
    expect(hasGsc).toBe(true);
    const svc = findings.find((f) => f.type === "SERVICE_GAP" || f.type === "CONTENT_EXPANSION")!;
    expect(typeof svc.signals.gscDemand).toBe("number");
    await deleteSecret(GSC_SECRET);
    await saveSetting("integrations", {});
  });
});

describe("rakip fırsatı → öneri → 48 saat yaşam döngüsü", () => {
  it("öneri oluşur (değer sabit), mükerrer üretilmez; onay → uygulanır → geri alınır", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => SECTION;
    const page = await db.page.findUniqueOrThrow({ where: { path: "/google-ads-yonetimi" } });
    const s = await runCompetitorOpportunities();
    const a = await db.autopilotAction.findFirstOrThrow({ where: { source: "competitor", type: "CONTENT", pageId: page.id } });
    expect(a.status, a.qualityNotes ?? "").toBe("pending_approval");
    expect(a.category).toBe("COMPETITOR");
    expect(a.riskLevel).toBe("MEDIUM");
    expect(a.expiresAt!.getTime() - a.createdAt.getTime()).toBe(48 * H);
    const prop = a.proposal as { competitors: string[]; signals: object; evidenceList: unknown[]; affectedUrl: string; competitorHeadings: string[] };
    expect(prop.competitors).toContain("rakip-test.example");
    expect(prop.affectedUrl).toBe("/google-ads-yonetimi");
    expect(prop.competitorHeadings).toContain("Kampanya kurulumu");
    expect(s.created.pending_approval).toBeGreaterThanOrEqual(1);
    // Yeniden tarama/tarama sonrası: aynı öneri tekrar üretilmez, mevcut öneri değişmez
    const frozen = JSON.stringify(a.proposedChanges);
    const again = await runCompetitorOpportunities();
    expect(again.items.filter((i) => i.title.includes("/google-ads-yonetimi"))).toEqual([]);
    expect(JSON.stringify((await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } })).proposedChanges)).toBe(frozen);
    // Onay → uygulama → geri alma
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status, r.note).toBe("applied");
    expect((await db.page.findUniqueOrThrow({ where: { id: page.id } })).body).toContain(SECTION.heading);
    await rollbackProposal(admin, a.id);
    expect((await db.page.findUniqueOrThrow({ where: { id: page.id } })).body).toBe(page.body);
    await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
  });

  it("ret → uygulanmaz; 48 saat → otomatik uygulanır", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => SECTION;
    const page = await db.page.findUniqueOrThrow({ where: { path: "/google-ads-yonetimi" } });
    await runCompetitorOpportunities();
    const a = await db.autopilotAction.findFirstOrThrow({ where: { source: "competitor", type: "CONTENT", pageId: page.id } });
    await rejectProposal(admin, a.id);
    await runAutoApply({ now: new Date(Date.now() + 49 * H), fetchImpl: null, max: 100 });
    expect((await db.page.findUniqueOrThrow({ where: { id: page.id } })).body).toBe(page.body);
    // Ret 30 gün aynı öneriyi engeller → yeni oluşturmak için kaydı temizle. Önceki senaryodaki
    // elle geri alma bir insan kararıdır (30 gün otomatik uygulama yok); bu senaryo temiz geçmişle
    await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
    await db.seoChangeLog.deleteMany({ where: { pageId: page.id, userName: "Rakip Testi" } });
    await runCompetitorOpportunities();
    const b = await db.autopilotAction.findFirstOrThrow({ where: { source: "competitor", type: "CONTENT", pageId: page.id } });
    expect(b.autoApply).toBe(true);
    await runAutoApply({ now: new Date(Date.now() + 49 * H), fetchImpl: null, max: 100 });
    const applied = await db.autopilotAction.findUniqueOrThrow({ where: { id: b.id } });
    expect(applied.status).toBe("applied");
    expect(applied.appliedVia).toBe("auto_48h");
    await rollbackProposal(admin, b.id);
    await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
  });

  it("kopya koruması: rakip başlığını aynen kullanan bölüm önerilmez; [DOĞRULANMALI] önerilmez", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => ({ ...SECTION, heading: "Kampanya kurulumu" });
    const ads = await db.page.findUniqueOrThrow({ where: { path: "/google-ads-yonetimi" } });
    await runCompetitorOpportunities();
    const a = await db.autopilotAction.findFirstOrThrow({ where: { source: "competitor", type: "CONTENT", pageId: ads.id } });
    expect(a.status).toBe("skipped");
    expect(a.qualityNotes).toMatch(/rakip sayfasının başlığıyla aynı/);
    await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
    aiHooks.section = async () => ({ ...SECTION, markdown: `${SECTION.markdown} [DOĞRULANMALI: müşteri sayısı]` });
    await runCompetitorOpportunities();
    const b = await db.autopilotAction.findFirstOrThrow({ where: { source: "competitor", type: "CONTENT", pageId: ads.id } });
    expect(b.status).toBe("skipped");
    expect(b.qualityNotes).toMatch(/DOĞRULANMALI/);
    await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
  });

  it("yüksek risk / doorway: lokasyon için öneri oluşmaz; hiçbir rakip önerisi yüksek riskli değildir; doğrulanmamış hizmete sayfa açılmaz", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => SECTION;
    await runCompetitorOpportunities();
    const all = await db.autopilotAction.findMany({ where: { source: "competitor" } });
    expect(all.some((a) => a.category === "LOCAL" || (a.proposal as { findingType?: string }).findingType === "LOCAL_GAP")).toBe(false);
    for (const a of all) expect(a.riskLevel).not.toBe("HIGH");
    expect(all.some((a) => a.type === "NEW_PAGE")).toBe(false);
    expect(await db.page.findUnique({ where: { path: "/sosyal-medya-yonetimi" } })).toBeNull();
    await db.autopilotAction.deleteMany({ where: { source: "competitor" } });
  });

  it("cannibalization: rakibin 'teknik SEO' konusu ayrı sayfa değil, mevcut /seo-hizmeti kapsamında değerlendirilir", async () => {
    const { findings } = await competitorFindings({ competitorId });
    expect(findings.some((f) => f.proposal?.kind === "NEW_PAGE" && f.proposal.path === "/teknik-seo")).toBe(false);
  });
});
