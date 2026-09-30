// AUTOPILOT CYCLE uçtan uca (TEST veritabanı): seed + rakip fikstürü → evren → fırsat → karar →
// öneri (48 saat) → süre dolunca otomatik uygulama → ölçüm planı → cycle özeti → zamanlayıcı
// devamlılığı; mükerrer öneri yok; Autopilot KAPALI; eşzamanlılık; NO_OPPORTUNITY; yeniden deneme.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { aiHooks } from "@/lib/autopilot/execute";
import { clock, applyProposal, createProposal, rejectProposal, rollbackProposal, runAutoApply } from "@/lib/proposals/lifecycle";
import { cycleHooks, runAutopilotCycle } from "@/lib/autopilot/cycle";
import { activeSeeds } from "@/lib/autopilot/discovery";
import { competitorPhrase, decideOpportunity, expandSeed, expandUniverse, findOpportunities, scoreOpportunity, seedCore, type OppInput } from "@/lib/autopilot/universe";
import { dueJobs } from "@/lib/autopilot/scheduler";
import { LEASE_MS, QUEUE_ONLY_KINDS, enqueueJob, processQueue, recoverStaleJobs, runJob } from "@/lib/jobs/runner";
import "@/lib/jobs/registry";
import { normalizeKeyword } from "@/lib/text/slug";
import type { SessionUser } from "@/lib/auth/session";
import { darkModeAiPage } from "../fixtures/ai-dark-mode";

const H = 3600_000;
const BASE = "https://webtasarimajansi.net";
const SEEDS = ["web tasarım", "web tasarım Sakarya", "web tasarım Adapazarı"];
const TOPIC = "web tasarımda karanlık mod nasıl uygulanır";
const BLOG_PATH = "/blog/web-tasarimda-karanlik-mod-nasil-uygulanir";
const COMPETITORS = ["rakip-a.test", "rakip-b.test", "rakip-c.test"];
const realHooks = { ...aiHooks };
const realNow = clock.now;
let admin: SessionUser;
const seedBefore = new Map<string, string | null>(); // normalized → önceki source (null = testte oluşturuldu)
let otherSeeds: string[] = [];
let preIds = new Set<string>(); // testten önce var olan öneriler (temizlikte dokunulmaz) // test DB'de önceden olan seed'ler: test boyunca durdurulur, sonra geri açılır

const noAi = async () => { throw new Error("test: yapay zekâ bu adımda kullanılmaz"); };

function mockAi() {
  aiHooks.available = () => true;
  aiHooks.page = async () => darkModeAiPage;
  aiHooks.section = noAi as never;
  aiHooks.snippets = noAi as never;
  aiHooks.intro = noAi as never;
  aiHooks.faq = noAi as never;
}

async function markScansFresh() {
  // İçerik/eksik alan taramaları "son 20 saatte çalıştı" → cycle önbellekle atlar (gerçek yapay zekâ çağrısı yok)
  await db.jobRun.createMany({ data: ["content-opportunity-scan", "page-completeness-scan"].map((kind) => ({ kind, status: "ok", message: "test", finishedAt: new Date(), triggeredBy: "test" })) });
}

async function cleanupActions() {
  // Bu testte oluşan TÜM öneriler (cycle'ın çalıştırdığı eksik alan/içerik taramaları dahil) geri alınır ve silinir
  const ours = (await db.autopilotAction.findMany({ select: { id: true, status: true, type: true, source: true } })).filter((a) => !preIds.has(a.id) || ["universe", "test-cycle"].includes(a.source));
  for (const a of ours.filter((x) => x.status === "applied")) await rollbackProposal(admin, a.id).catch(() => undefined);
  await db.experiment.deleteMany({ where: { actionId: { in: ours.map((a) => a.id) } } });
  await db.autopilotAction.deleteMany({ where: { id: { in: ours.map((a) => a.id) } } });
}

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "cycle@example.com" }, create: { email: "cycle@example.com", name: "Cycle Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await saveSetting("autopilot", { maxActionsPerCycle: 10, maxChangesPerWeek: 50, instantApply: false });
  await db.autopilotAction.deleteMany({ where: { source: { in: ["universe", "test-cycle"] } } });
  preIds = new Set((await db.autopilotAction.findMany({ select: { id: true } })).map((a) => a.id));
  await db.page.deleteMany({ where: { path: BLOG_PATH } });
  await db.competitor.deleteMany({ where: { domain: { in: COMPETITORS } } });
  await db.keyword.deleteMany({ where: { source: { in: ["universe", "competitor"] } } });
  await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
  // Seed kelimeler (panel: Anahtar Kelimeler → "Otopilot seed"). Önceden var olan diğer seed'ler bu test boyunca durdurulur
  const others = await db.keyword.findMany({ where: { source: "seed", status: "ACTIVE", normalized: { notIn: SEEDS.map(normalizeKeyword) } }, select: { id: true } });
  otherSeeds = others.map((o) => o.id);
  await db.keyword.updateMany({ where: { id: { in: otherSeeds } }, data: { status: "PAUSED" } });
  for (const phrase of SEEDS) {
    const normalized = normalizeKeyword(phrase);
    const k = await db.keyword.findUnique({ where: { normalized } });
    seedBefore.set(normalized, k ? k.source : null);
    if (k) await db.keyword.update({ where: { id: k.id }, data: { source: "seed", status: "ACTIVE" } });
    else await db.keyword.create({ data: { phrase, normalized, source: "seed" } });
  }
  // Rakip fikstürü: üç rakipte sitede olmayan "karanlık mod" rehberi; ikisinde Sakarya lokasyon sayfası
  const now = new Date();
  for (const [i, domain] of COMPETITORS.entries()) {
    const c = await db.competitor.create({ data: { domain, name: `Rakip ${"ABC"[i]}`, lastCrawlAt: now } });
    const page = (path: string, title: string, h1: string, category: string, h2: string[]) =>
      db.competitorPage.create({ data: { competitorId: c.id, url: `https://${domain}${path}`, path, status: 200, title, h1: [h1], h2, wordCount: 900, schemaTypes: ["Article"], links: [], topics: [], category, firstSeenAt: now, fetchedAt: now } });
    await page("/blog/karanlik-mod", `Web Tasarımda Karanlık Mod Nasıl Uygulanır? | Rakip ${"ABC"[i]}`, "Web Tasarımda Karanlık Mod Nasıl Uygulanır?", "blog", ["Renk değişkenleri", "Sistem tercihi", "Kontrast"]);
    if (i < 2) await page("/sakarya-web-tasarim", `Web Tasarım Sakarya | Rakip ${"ABC"[i]}`, "Web Tasarım Sakarya", "location", ["Sakarya'da web tasarım"]);
  }
});

afterEach(() => {
  Object.assign(aiHooks, realHooks);
  clock.now = realNow;
  cycleHooks.defaults = undefined;
  cycleHooks.beforeStep = undefined;
});

afterAll(async () => {
  Object.assign(aiHooks, realHooks);
  clock.now = realNow;
  await cleanupActions();
  await db.page.deleteMany({ where: { path: BLOG_PATH } });
  await db.competitor.deleteMany({ where: { domain: { in: COMPETITORS } } });
  await db.keyword.deleteMany({ where: { source: { in: ["universe", "competitor"] } } });
  await db.keyword.updateMany({ where: { id: { in: otherSeeds } }, data: { status: "ACTIVE" } });
  for (const [normalized, prev] of seedBefore) {
    if (prev === null) await db.keyword.deleteMany({ where: { normalized } });
    else await db.keyword.update({ where: { normalized }, data: { source: prev, status: "ACTIVE" } });
  }
  await db.gscQueryDaily.deleteMany({ where: { query: { in: ["web sitesi kontrast denetimi fiyatı", "web tasarım süreci"] } } });
  await db.jobRun.deleteMany({ where: { OR: [{ triggeredBy: "test" }, { kind: "autopilot-cycle" }, { status: { in: ["queued", "running"] } }] } });
  await saveSetting("autopilot", {});
});

describe("seed + anahtar kelime evreni", () => {
  it("seed kelimeler veritabanından gelir (sabit liste yok); durdurulan seed kullanılmaz", async () => {
    const seeds = (await activeSeeds()).map((s) => s.normalized);
    expect(seeds).toEqual(expect.arrayContaining(SEEDS.map(normalizeKeyword)));
    const k = await db.keyword.findUniqueOrThrow({ where: { normalized: normalizeKeyword("web tasarım Adapazarı") } });
    await db.keyword.update({ where: { id: k.id }, data: { status: "PAUSED" } });
    expect((await activeSeeds()).some((s) => s.id === k.id)).toBe(false);
    await db.keyword.update({ where: { id: k.id }, data: { status: "ACTIVE" } });
  });

  it("çekirdek + deterministik varyasyonlar + rakip başlık ifadesi (marka/yıl ayıklanır)", () => {
    expect(seedCore("web tasarım Sakarya", ["Sakarya", "Adapazarı"])).toBe("web tasarım");
    expect(expandSeed("web tasarım")).toEqual(expect.arrayContaining(["web tasarım fiyatları", "web tasarım nedir", "web tasarım nasıl yapılır"]));
    expect(competitorPhrase("Web Tasarımda Karanlık Mod Nasıl Uygulanır? | Rakip A", ["rakip", "a"])).toBe(TOPIC);
    expect(competitorPhrase("2026 Kurumsal Web Tasarım – RakipA", ["rakipa"])).toBe("kurumsal web tasarım");
  });

  it("evren: rakip sinyali ve seed varyasyonları eklenir; hacim uydurulmaz; idempotent", async () => {
    const r = await expandUniverse();
    expect(r.seeds).toBe(3);
    expect(r.added.some((a) => a.phrase === TOPIC && a.source === "competitor")).toBe(true);
    expect(r.added.some((a) => a.source === "universe")).toBe(true);
    const k = await db.keyword.findUniqueOrThrow({ where: { normalized: TOPIC } });
    expect(k.notes).toMatch(/rakip-a\.test/);
    expect(k.currentPosition).toBeNull(); // pozisyon/hacim uydurulmaz
    expect((await expandUniverse()).added).toHaveLength(0);
  });
});

describe("skor ve karar (deterministik)", () => {
  const base: OppInput = { phrase: "x", intent: "INFORMATIONAL", hasLocation: false, coverage: "none", cannibalPaths: [], duplicateOf: null, competitorDomains: 0, seedRel: 0, gsc: null, titleHasPhrase: false, targetContextIn: null };
  it("rakip tek başına yeni sayfa nedeni değildir; seed ilişkisi + 2 rakip → blog; ticari niyet → landing", () => {
    expect(decideOpportunity({ ...base, competitorDomains: 3, seedRel: 0 }).decision).toBe("NONE");
    expect(decideOpportunity({ ...base, competitorDomains: 1, seedRel: 1 }).decision).toBe("NONE");
    const blog = decideOpportunity({ ...base, phrase: "web tasarım nasıl yapılır", competitorDomains: 2, seedRel: 1 });
    expect(blog.decision).toBe("NEW_BLOG");
    expect(decideOpportunity({ ...base, phrase: "web sitesi bakım paketi", intent: "COMMERCIAL", competitorDomains: 2, seedRel: 1 }).decision).toBe("NEW_LANDING");
  });
  it("Search Console: sorgu var + sayfa yok → D; görünür ama title hedeflemiyor → C; mevcut sayfa zayıf → optimizasyon", () => {
    expect(decideOpportunity({ ...base, intent: "COMMERCIAL", gsc: { impressions: 300, clicks: 1, position: 14 } })).toMatchObject({ decision: "NEW_LANDING", gap: "D_QUERY_NO_LANDING" });
    expect(decideOpportunity({ ...base, coverage: "strong", gsc: { impressions: 300, clicks: 2, position: 6 } })).toMatchObject({ decision: "OPTIMIZE_TITLE", gap: "C_VISIBLE_NOT_OPTIMIZED" });
    expect(decideOpportunity({ ...base, coverage: "weak", competitorDomains: 2 })).toMatchObject({ decision: "OPTIMIZE_TITLE", gap: "B_COMPETITOR_STRONGER" });
    expect(decideOpportunity({ ...base, coverage: "weak", titleHasPhrase: true }).decision).toBe("OPTIMIZE_CONTENT");
    expect(decideOpportunity({ ...base, coverage: "none", competitorDomains: 2, seedRel: 1, duplicateOf: "/web-tasarim" }).decision).toBe("OPTIMIZE_CONTENT");
  });
  it("iç link, cannibalization ve doorway (konumlu sayfa şablonla açılmaz)", () => {
    expect(decideOpportunity({ ...base, coverage: "strong", titleHasPhrase: true, targetContextIn: 0, seedRel: 1 }).decision).toBe("INTERNAL_LINK");
    expect(decideOpportunity({ ...base, cannibalPaths: ["/a", "/b"] })).toMatchObject({ decision: "CANNIBALIZATION", gap: "E_CANNIBALIZATION" });
    expect(decideOpportunity({ ...base, hasLocation: true, competitorDomains: 2, seedRel: 1 }).decision).toBe("LOCATION_HUMAN");
  });
  it("skor: bilinmeyen talep 0 katkı; GSC pozisyon 4–10 potansiyeli; riskler düşer; öğrenme çarpanı", () => {
    const s0 = scoreOpportunity({ ...base, competitorDomains: 2, seedRel: 1 });
    expect(s0.parts.demand).toBe(0);
    expect(s0.demandKnown).toBe(false);
    const s1 = scoreOpportunity({ ...base, coverage: "strong", gsc: { impressions: 500, clicks: 2, position: 6 } });
    expect(s1.parts.currentPotential).toBeGreaterThanOrEqual(15);
    expect(scoreOpportunity({ ...base, hasLocation: true, competitorDomains: 2, seedRel: 1 }).score).toBeLessThan(s0.score);
    expect(scoreOpportunity({ ...base, competitorDomains: 2, seedRel: 1, learning: 1.3 }).score).toBeGreaterThan(s0.score);
  });
});

describe("birleşik fırsat motoru (gerçek veri: site + rakip + GSC)", () => {
  it("rakip keyword gap → blog kararı; konumlu seed → insan kararı; GSC sorgusu sayfasız → landing; iki sayfa aynı sorguda → cannibalization", async () => {
    const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 3));
    await db.keyword.create({ data: { phrase: "web sitesi kontrast denetimi fiyatı", normalized: "web sitesi kontrast denetimi fiyatı", source: "discovered" } });
    await db.keyword.upsert({ where: { normalized: "web tasarım süreci" }, create: { phrase: "web tasarım süreci", normalized: "web tasarım süreci", source: "discovered" }, update: { status: "ACTIVE" } });
    await db.gscQueryDaily.createMany({ data: [
      { date: day, query: "web sitesi kontrast denetimi fiyatı", page: `${BASE}/web-tasarim`, impressions: 400, clicks: 1, ctr: 0.0025, position: 14 },
      { date: day, query: "web tasarım süreci", page: `${BASE}/web-tasarim`, impressions: 60, clicks: 1, ctr: 0.02, position: 9 },
      { date: day, query: "web tasarım süreci", page: `${BASE}/web-tasarim-ajansi`, impressions: 60, clicks: 1, ctr: 0.02, position: 11 },
    ] });
    try {
      const { opportunities, hasGsc } = await findOpportunities();
      expect(hasGsc).toBe(true);
      const topic = opportunities.find((o) => o.phrase === TOPIC);
      expect(topic, JSON.stringify(opportunities.slice(0, 5).map((o) => [o.phrase, o.decision, o.score]))).toBeTruthy();
      expect(topic).toMatchObject({ decision: "NEW_BLOG", coverage: "none", competitorDomains: 3, seedRel: 1, newPath: BLOG_PATH });
      expect(topic!.score).toBeGreaterThanOrEqual(30);
      expect(topic!.parts.demand).toBe(0); // GSC'de bu sorgu yok: talep uydurulmaz
      const loc = opportunities.find((o) => o.phrase === normalizeKeyword("web tasarım Sakarya"));
      if (loc && loc.coverage === "none") expect(loc.decision).toBe("LOCATION_HUMAN");
      const gscOpp = opportunities.find((o) => o.phrase === "web sitesi kontrast denetimi fiyatı");
      expect(gscOpp).toMatchObject({ decision: "NEW_LANDING", gap: "D_QUERY_NO_LANDING" });
      expect(gscOpp!.parts.demand).toBeGreaterThan(0);
      const can = opportunities.find((o) => o.phrase === "web tasarım süreci");
      expect(can?.decision).toBe("CANNIBALIZATION");
      expect(can?.cannibalPaths.sort()).toEqual(["/web-tasarim", "/web-tasarim-ajansi"]);
    } finally {
      await db.gscQueryDaily.deleteMany({ where: { query: { in: ["web sitesi kontrast denetimi fiyatı", "web tasarım süreci"] } } });
      await db.keyword.deleteMany({ where: { normalized: { in: ["web sitesi kontrast denetimi fiyatı", "web tasarım süreci"] } } });
    }
  });
});

describe("KABUL: seed + rakip → fırsat → öneri → 48 saat → otomatik uygula → ölçüm → sonraki cycle", () => {
  let actionId = "";
  const T0 = new Date();
  // Test saatini ileri alınca (t+49 saat) BAŞKA testlerden kalan bekleyen öneriler de "süresi doldu" sayılmasın:
  // bu blok boyunca onay pencereleri ileri alınır, sonra aynen geri yüklenir
  let parked: { id: string; expiresAt: Date | null }[] = [];
  beforeAll(async () => {
    parked = await db.autopilotAction.findMany({ where: { status: "pending_approval", id: { in: [...preIds] } }, select: { id: true, expiresAt: true } });
    await db.autopilotAction.updateMany({ where: { id: { in: parked.map((p) => p.id) } }, data: { expiresAt: new Date(Date.now() + 3650 * 24 * H) } });
  });
  afterAll(async () => {
    for (const p of parked) await db.autopilotAction.update({ where: { id: p.id }, data: { expiresAt: p.expiresAt } });
  });

  it("cycle 1: fırsatı bulur, blog kararı verir, taslak + 48 saatlik öneri oluşturur (yayına almaz)", async () => {
    mockAi();
    await markScansFresh();
    clock.now = () => T0;
    const s = await runAutopilotCycle({ now: T0, skipAgentRun: true, autoApplyFetch: null });
    expect(s.outcome, JSON.stringify(s.steps, null, 1)).toBe("OK");
    expect(s.errors, JSON.stringify(s.steps.filter((x) => x.status === "error"))).toBe(0);
    expect(s.steps.find((x) => x.name === "İçerik ve eksik alan taraması")?.message).toMatch(/son 20 saatte çalıştı/);
    const a = await db.autopilotAction.findFirstOrThrow({ where: { source: "universe", type: "NEW_PAGE", fingerprint: { startsWith: `NEW_PAGE:universe:${BLOG_PATH}` } } });
    actionId = a.id;
    expect(a.status, `${a.qualityNotes} ${a.error}`).toBe("pending_approval");
    expect(a.autoApply).toBe(true);
    expect(a.riskLevel).toBe("MEDIUM");
    expect(a.expiresAt!.getTime() - T0.getTime()).toBe(48 * H);
    const prop = a.proposal as { pageType: string; decision: string; gapType: string; parts: Record<string, number>; evidence: string };
    expect(prop.pageType).toBe("BLOG_POST");
    expect(prop.gapType).toBe("A_COMPETITOR_ONLY");
    expect(prop.evidence).toMatch(/GSC talebi: bilinmiyor/);
    expect(a.score).toBeGreaterThanOrEqual(30);
    // Taslak güvenliği: sayfa taslak, yayında değil (sitemap yalnızca yayındaki sayfalardan)
    expect((await db.page.findUniqueOrThrow({ where: { path: BLOG_PATH } })).status).toBe("DRAFT");
    // Konumlu seed için sayfa açılmadı, insan kararı
    const loc = await db.autopilotAction.findFirst({ where: { source: "universe", type: "LOCATION" } });
    if (loc) expect(loc.status).toBe("needs_approval");
    expect(await db.autopilotAction.count({ where: { source: "universe", type: "NEW_PAGE", proposal: { path: ["pagePath"], string_contains: "sakarya" } } })).toBe(0);
    // Diğer tüm yeni öneriler reddedilir (yalnızca kabul senaryosunun önerisi ilerlesin) — "reddedildi" davranışı
    const others = await db.autopilotAction.findMany({ where: { status: "pending_approval", id: { not: actionId } } });
    for (const o of others) await rejectProposal(admin, o.id);
    expect(await db.autopilotAction.count({ where: { id: { in: others.map((o) => o.id) }, status: "rejected" } })).toBe(others.length);
  });

  it("aynı senaryoda tekrar cycle: mükerrer öneri oluşmaz (bekleyen + reddedilenler yeniden üretilmez)", async () => {
    mockAi();
    clock.now = () => new Date(T0.getTime() + H);
    const before = await db.autopilotAction.count({ where: { source: { in: ["universe", "competitor"] } } });
    await runAutopilotCycle({ now: new Date(T0.getTime() + H), skipAgentRun: true, autoApplyFetch: null });
    expect(await db.autopilotAction.count({ where: { fingerprint: { startsWith: `NEW_PAGE:universe:${BLOG_PATH}` } } })).toBe(1);
    const rejectedKeys = (await db.autopilotAction.findMany({ where: { status: "rejected", source: "universe" }, select: { fingerprint: true } })).map((r) => r.fingerprint!.split("#")[0]);
    const recreated = await db.autopilotAction.count({ where: { source: "universe", status: "pending_approval", id: { not: actionId }, OR: rejectedKeys.map((k) => ({ fingerprint: { startsWith: k } })) } });
    expect(recreated).toBe(0);
    // Yeni önerileri (bütçedeki sonraki fırsatlar) reddet: kabul senaryosu tek öneriyle sürsün
    for (const o of await db.autopilotAction.findMany({ where: { status: "pending_approval", id: { not: actionId } } })) await rejectProposal(admin, o.id);
    expect(await db.autopilotAction.count({ where: { source: { in: ["universe", "competitor"] } } })).toBeGreaterThanOrEqual(before);
  });

  it("47 saat: uygulanmaz; 48 saat + Autopilot AÇIK: cycle otomatik uygular, deney ve 7/14/28 ölçüm planı", async () => {
    mockAi();
    const t47 = new Date(T0.getTime() + 47 * H);
    clock.now = () => t47;
    expect((await runAutoApply({ now: t47, fetchImpl: null })).applied).toBe(0);
    expect((await db.page.findUniqueOrThrow({ where: { path: BLOG_PATH } })).status).toBe("DRAFT");
    const t49 = new Date(T0.getTime() + 49 * H);
    clock.now = () => t49;
    const s = await runAutopilotCycle({ now: t49, skipAgentRun: true, autoApplyFetch: null });
    expect(s.autoApplied, JSON.stringify(s.steps, null, 1)).toBeGreaterThanOrEqual(1);
    const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(a.status, `${a.error} ${JSON.stringify(a.validation)}`).toBe("applied");
    expect(a.appliedVia).toBe("auto_48h");
    expect((await db.page.findUniqueOrThrow({ where: { path: BLOG_PATH } })).status).toBe("PUBLISHED");
    const exp = await db.experiment.findUniqueOrThrow({ where: { actionId } });
    expect(exp.pagePath).toBe(BLOG_PATH);
    expect(exp.query).toBe(TOPIC);
    const plan = (exp.baseline as { plan: { day: number; measureAfter: string }[] }).plan;
    expect(plan.map((p) => p.day)).toEqual([7, 14, 28]);
    expect(exp.status).toBe("running");
    // İdempotency: aynı öneri tekrar uygulanmaz
    expect((await runAutoApply({ now: t49, fetchImpl: null })).applied).toBe(0);
    expect((await applyProposal(actionId, { via: "manual", user: admin, fetchImpl: null })).status).not.toBe("applied");
    // Sonraki cycle: yayındaki sayfa artık konuyu kapsıyor → aynı konu için yeni sayfa önerisi yok
    await runAutopilotCycle({ now: new Date(t49.getTime() + H), skipAgentRun: true, autoApplyFetch: null });
    expect(await db.autopilotAction.count({ where: { type: "NEW_PAGE", proposal: { path: ["pagePath"], equals: BLOG_PATH } } })).toBe(1);
  });

  it("cycle özeti kaydedilir; zamanlayıcı cycleHours sonra yenisini başlatır (kuyruk → worker)", async () => {
    mockAi();
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    await db.jobRun.deleteMany({ where: { kind: "autopilot-cycle" } });
    const now = new Date();
    expect(await dueJobs(now)).toContain("autopilot-cycle");
    await enqueueJob("autopilot-cycle", "zamanlayıcı");
    const done = await processQueue({ maxJobs: 5 });
    const job = done.find((d) => d.kind === "autopilot-cycle");
    expect(job?.status, job?.message).toBe("ok");
    const row = await db.jobRun.findUniqueOrThrow({ where: { id: job!.id } });
    const stats = row.stats as { outcome: string; nextCycleAt: string; steps: unknown[] };
    expect(["OK", "NO_OPPORTUNITY"]).toContain(stats.outcome);
    expect(stats.steps.length).toBeGreaterThanOrEqual(6);
    expect(await dueJobs(new Date(now.getTime() + 2 * H))).not.toContain("autopilot-cycle"); // cycle yeni bitti
    expect(await dueJobs(new Date(now.getTime() + 6 * H + 1000))).toContain("autopilot-cycle"); // sonraki cycle
    // AutopilotRun'a da yazılır
    const run = await db.autopilotRun.findFirstOrThrow({ where: { trigger: "cycle" }, orderBy: { startedAt: "desc" } });
    expect((run.summary as { cycle?: { outcome: string } }).cycle?.outcome).toBeTruthy();
  });
});

describe("eşzamanlılık, hata kurtarma, NO_OPPORTUNITY, Autopilot KAPALI", () => {
  it("iki cycle aynı anda çalışmaz; öneri üreten iş çalışırken cycle başlamaz", async () => {
    mockAi();
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    cycleHooks.beforeStep = async (name) => { if (name === "Rakip taraması") await gate; };
    const first = runJob("autopilot-cycle", "test");
    await new Promise((r) => setTimeout(r, 300));
    const second = await runJob("autopilot-cycle", "test");
    expect(second.status).toBe("skipped");
    expect(second.message).toMatch(/zaten çalışıyor/);
    release();
    expect((await first).status).toBe("ok");
    cycleHooks.beforeStep = undefined;
    // Kuyruk: içerik taraması ÇALIŞIRKEN cycle sahiplenilmez; bitince sahiplenilir
    await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
    const busy = await db.jobRun.create({ data: { kind: "content-opportunity-scan", status: "running", triggeredBy: "test" } });
    await enqueueJob("autopilot-cycle", "zamanlayıcı");
    expect((await processQueue({ maxJobs: 1 })).some((d) => d.kind === "autopilot-cycle")).toBe(false);
    await db.jobRun.update({ where: { id: busy.id }, data: { status: "ok", finishedAt: new Date() } });
    expect((await processQueue({ maxJobs: 1 })).find((d) => d.kind === "autopilot-cycle")?.status).toBe("ok");
  });

  it("panel tetiklemesi yalnızca kuyruğa alır: panel + zamanlayıcı + retry yarışında tek kayıt, tek cycle", async () => {
    mockAi();
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    expect(QUEUE_ONLY_KINDS).toEqual(expect.arrayContaining(["autopilot", "autopilot-cycle"]));
    await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
    // Panel (runJobAction bu kinds için enqueueJob çağırır), zamanlayıcı ve yeniden deneme aynı anda
    const r = await Promise.all([enqueueJob("autopilot-cycle", "Panel Kullanıcısı"), enqueueJob("autopilot-cycle", "zamanlayıcı"), enqueueJob("autopilot-cycle", "yeniden deneme", { attempts: 2 })]);
    expect(new Set(r.map((x) => x.id)).size).toBe(1);
    expect(r.filter((x) => x.created)).toHaveLength(1);
    expect(await db.jobRun.count({ where: { kind: "autopilot-cycle", status: "queued" } })).toBe(1);
    // İki worker aynı anda: yalnızca biri sahiplenip çalıştırır
    let runs = 0;
    cycleHooks.beforeStep = (name) => { if (name === "Rakip taraması") runs++; };
    const [w1, w2] = await Promise.all([processQueue({ maxJobs: 1 }), processQueue({ maxJobs: 1 })]);
    expect([...w1, ...w2].filter((d) => d.kind === "autopilot-cycle")).toHaveLength(1);
    expect(runs).toBe(1);
    // Kuyrukta/çalışırken panelden tekrar istemek yeni kayıt açmaz
    const a = await enqueueJob("autopilot-cycle", "Panel Kullanıcısı");
    const b = await enqueueJob("autopilot-cycle", "Panel Kullanıcısı");
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(false);
    await db.jobRun.deleteMany({ where: { kind: "autopilot-cycle", status: "queued" } });
  });

  it("1 saati (ve 2 saati) aşan ama kirası canlı cycle sürerken ikinci cycle başlamaz; süreç ölürse kira dolar ve kurtarılır", async () => {
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
    // 3 saattir çalışan, kalp atışıyla kirası tazelenen cycle
    const long = await db.jobRun.create({ data: { kind: "autopilot-cycle", status: "running", triggeredBy: "test", startedAt: new Date(Date.now() - 3 * H), runAfter: new Date(Date.now() + LEASE_MS) } });
    expect((await runJob("autopilot-cycle", "Panel Kullanıcısı")).status).toBe("skipped"); // doğrudan çalıştırma da reddedilir
    expect(await recoverStaleJobs()).toBe(0); // canlı iş "bayat" sayılmaz
    const q = await enqueueJob("autopilot-cycle", "zamanlayıcı");
    expect(q.created).toBe(false); // çalışan varken kuyruğa ikinci cycle girmez
    expect((await processQueue({ maxJobs: 1 })).some((d) => d.kind === "autopilot-cycle")).toBe(false);
    expect((await db.jobRun.findUniqueOrThrow({ where: { id: long.id } })).status).toBe("running");
    // Süreç çöktü: kalp atışı durdu, kira doldu → kurtarılır ve (hakkı varsa) yeniden kuyruğa girer
    await db.jobRun.update({ where: { id: long.id }, data: { runAfter: new Date(Date.now() - 1000) } });
    expect(await recoverStaleJobs()).toBe(1);
    expect((await db.jobRun.findUniqueOrThrow({ where: { id: long.id } })).status).toBe("error");
    // Değişiklik uygulayan ajan işi otomatik yeniden kuyruğa alınmaz; sonrakini zamanlayıcı başlatır
    expect(await db.jobRun.count({ where: { kind: "autopilot-cycle", status: "queued" } })).toBe(0);
  });

  it("çalışan işe başlarken kira verilir (kalp atışı bunu tazeler)", async () => {
    mockAi();
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let lease: Date | null = null;
    cycleHooks.beforeStep = async (name) => {
      if (name !== "Rakip taraması") return;
      lease = (await db.jobRun.findFirstOrThrow({ where: { kind: "autopilot-cycle", status: "running" } })).runAfter;
      await gate;
    };
    await enqueueJob("autopilot-cycle", "Panel Kullanıcısı");
    const worker = processQueue({ maxJobs: 1 });
    for (let i = 0; i < 50 && !lease; i++) await new Promise((r) => setTimeout(r, 100));
    expect(lease).toBeTruthy();
    expect(lease!.getTime()).toBeGreaterThan(Date.now());
    release();
    expect((await worker).find((d) => d.kind === "autopilot-cycle")?.status).toBe("ok");
  });

  it("kritik olmayan bir aşama hatası diğer aşamaları durdurmaz; iş hata olarak kaydedilir ve YENİDEN DENENMEZ (sonrakini zamanlayıcı başlatır)", async () => {
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    cycleHooks.beforeStep = (name) => { if (name === "Fırsat motoru (seed + rakip + GSC)") throw new Error("test: geçici hata"); };
    await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
    await enqueueJob("autopilot-cycle", "zamanlayıcı");
    const [r] = await processQueue({ maxJobs: 1 });
    expect(r.kind).toBe("autopilot-cycle");
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/test: geçici hata/);
    expect(r.message).toMatch(/48 saat otomatik uygulama/); // sonraki aşamalar yine çalıştı (özet satırında)
    expect(r.retryAt).toBeUndefined();
    expect(await db.jobRun.count({ where: { kind: "autopilot-cycle", status: "queued" } })).toBe(0);
    expect((await db.jobRun.findUniqueOrThrow({ where: { id: r.id } })).message).toMatch(/yeniden denenmez/);
  });

  it("fırsat yoksa NO_OPPORTUNITY kaydedilir ve zamanlayıcı sonraki cycle'ı yine planlar", async () => {
    await db.competitor.updateMany({ where: { domain: { in: COMPETITORS } }, data: { status: "paused" } });
    const paused = (await db.keyword.findMany({ where: { source: { in: ["seed", "universe", "competitor"] }, status: "ACTIVE" }, select: { id: true } })).map((k) => k.id);
    await db.keyword.updateMany({ where: { id: { in: paused } }, data: { status: "PAUSED" } });
    try {
      const s = await runAutopilotCycle({ skipAgentRun: true, autoApplyFetch: null });
      expect(s.outcome, JSON.stringify(s.steps, null, 1)).toBe("NO_OPPORTUNITY");
      expect(s.proposals.total).toBe(0);
      expect(s.nextCycleAt).toBeTruthy();
      await db.jobRun.deleteMany({ where: { kind: "autopilot-cycle" } });
      expect(await dueJobs(new Date())).toContain("autopilot-cycle");
    } finally {
      await db.competitor.updateMany({ where: { domain: { in: COMPETITORS } }, data: { status: "active" } });
      await db.keyword.updateMany({ where: { id: { in: paused } }, data: { status: "ACTIVE" } });
    }
  });

  it("Autopilot KAPALI: cycle çalışmaz, planlanmaz, 48 saat dolsa da otomatik uygulama yok; elle onay/red çalışır", async () => {
    // Yayındaki test sayfası için gerçek bir title önerisi (kural tabanlı; yapay zekâ yok)
    aiHooks.available = () => false;
    const page = await db.page.findUniqueOrThrow({ where: { path: BLOG_PATH } });
    const T = new Date();
    clock.now = () => T;
    const make = (key: string) => createProposal({ key, type: "TITLE", risk: "AUTO", source: "test-cycle", title: `test ${key}`, reason: "test", score: 50, pageId: page.id, query: "karanlık mod rehberi", allowAuto: true }, { model: "x", windowHours: 48 });
    const p1 = await make(`TITLE:test-off-1:${page.id}`);
    const p2 = await make(`TITLE:test-off-2:${page.id}`);
    expect(p1.status, p1.note).toBe("pending_approval");
    await saveSetting("autopilot", { enabled: false, maxActionsPerCycle: 10, maxChangesPerWeek: 50, instantApply: false });
    try {
      expect((await runAutopilotCycle({ skipAgentRun: true })).outcome).toBe("OFF");
      await db.jobRun.deleteMany({ where: { kind: "autopilot-cycle" } });
      expect(await dueJobs(new Date())).not.toContain("autopilot-cycle");
      expect(await dueJobs(new Date())).not.toContain("autopilot");
      const later = new Date(T.getTime() + 49 * H);
      clock.now = () => later;
      const s = await runAutoApply({ now: later, fetchImpl: null });
      expect(s.applied).toBe(0);
      expect(s.off).toMatch(/Autopilot kapalı/);
      expect((await db.autopilotAction.findUniqueOrThrow({ where: { id: p1.id! } })).status).toBe("pending_approval");
      // Elle onay ve red mevcut davranışla çalışır
      const manual = await applyProposal(p1.id!, { via: "manual", user: admin, fetchImpl: null });
      expect(manual.status, manual.note).toBe("applied");
      await rejectProposal(admin, p2.id!);
      expect((await db.autopilotAction.findUniqueOrThrow({ where: { id: p2.id! } })).status).toBe("rejected");
    } finally {
      await saveSetting("autopilot", { maxActionsPerCycle: 10, maxChangesPerWeek: 50, instantApply: false });
    }
  });
});
