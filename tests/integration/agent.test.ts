// OTONOM SEO AJANI uçtan uca: anahtar kelime ölçümü → karar → işlem; sorgu kümeleme,
// cannibalization, PAGE_NOT_NEEDED; yeni sayfa: üret → kalite kapısı → yayınla →
// sitemap/IndexNow/denetim → geri al; uydurma ve [DOĞRULANMALI] engeli; modlar;
// kuyruk/worker/yeniden deneme; günlük rapor; sağlık skoru.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { runKeywordAgent, BUCKET_LABELS, type KeywordDecision } from "@/lib/autopilot/agent-keywords";
import { decidePage, findPageNeeds, groupQueries, pendingNewPage } from "@/lib/autopilot/page-decision";
import { AUTOPILOT_USER, aiHooks, approveAction, executeAction, rollbackAction } from "@/lib/autopilot/execute";
import { loadSiteState } from "@/lib/seo/analyzer";
import { changedPathsSince } from "@/lib/seo/indexnow";
import { runAutopilot } from "@/lib/autopilot/run";
import { buildDailyReport, renderDailyText, sendDailyEmail } from "@/lib/autopilot/daily";
import { computeSeoHealth, overallScore, weightOf } from "@/lib/autopilot/health";
import { pageInventory } from "@/lib/autopilot/inventory";
import { enqueueJob, processQueue, registerJob, MAX_ATTEMPTS } from "@/lib/jobs/runner";
import "@/lib/jobs/registry";
import { normalizeKeyword } from "@/lib/text/slug";
import { goodAiPage } from "../fixtures/ai-page";

const BASE = "https://webtasarimajansi.net";
const DAY = 86400_000;
const realHooks = { ...aiHooks };
let runId: string;
const created: string[] = [];

// [sorgu, sayfa, pozisyon, günlük gösterim, günlük tık]
const QUERIES: [string, string, number, number, number][] = [
  ["kurumsal site tasarımı", "/kurumsal-web-tasarim", 6.2, 4, 0],
  ["e ticaret altyapısı seçimi", "/e-ticaret-web-tasarim", 15, 6, 0],
  ["web sitesi bakımı nedir", "/web-tasarim", 24, 3, 0],
  ["web sitesi bakımı nasıl yapılır", "/web-tasarim", 26, 2, 0],
  ["web tasarım şirketi", "/web-tasarim", 18, 3, 0],
  ["web tasarım firması", "/web-tasarim", 17, 2, 0],
  ["kurumsal kimlik tasarımı", "/kurumsal-web-tasarim", 14, 2, 0],
  ["kurumsal kimlik tasarımı", "/kurumsal-firma-web-sitesi", 16, 2, 0],
  ["adapazarı web tasarım", "/web-tasarim", 12, 3, 0],
  ["pizza tarifi", "/blog/web-tasarim-nedir", 40, 3, 0],
];

async function seedGsc() {
  const end = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 3));
  const q: object[] = [], pages = new Map<string, { i: number; c: number }>(), totals: object[] = [];
  for (let d = 0; d < 56; d++) {
    const date = new Date(end.getTime() - d * DAY);
    let ti = 0, tc = 0;
    for (const [query, path, pos, imp, clk] of QUERIES) {
      q.push({ date, query: normalizeKeyword(query), page: BASE + path, impressions: imp, clicks: clk, ctr: clk / imp, position: pos });
      ti += imp; tc += clk;
      const k = `${date.toISOString()}|${path}`;
      const e = pages.get(k) ?? { i: 0, c: 0 };
      pages.set(k, { i: e.i + imp, c: e.c + clk });
    }
    totals.push({ date, impressions: ti, clicks: tc, ctr: tc / ti, position: 15 });
  }
  await db.gscQueryDaily.createMany({ data: q as never, skipDuplicates: true });
  await db.gscDailyTotal.createMany({ data: totals as never });
  await db.gscPageDaily.createMany({ data: [...pages].map(([k, v]) => ({ date: new Date(k.split("|")[0]), page: BASE + k.split("|")[1], impressions: v.i, clicks: v.c, ctr: v.c / v.i, position: 15 })), skipDuplicates: true });
}

async function cleanGsc() {
  await db.gscQueryDaily.deleteMany(); await db.gscPageDaily.deleteMany(); await db.gscDailyTotal.deleteMany();
}

/** Sahte canlı site: gerçek favicon dosyaları, robots, sitemap, llms. */
function fakeSite(opts: { favicon404?: boolean } = {}): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith("/favicon.ico")) return opts.favicon404 ? new Response("yok", { status: 404 }) : new Response(readFileSync("src/app/favicon.ico"), { status: 200, headers: { "content-type": "image/x-icon" } });
    if (u.endsWith("/apple-icon.png")) return new Response(readFileSync("src/app/apple-icon.png"), { status: 200, headers: { "content-type": "image/png" } });
    if (u.endsWith("/manifest.webmanifest")) return new Response("{}", { status: 200, headers: { "content-type": "application/manifest+json" } });
    if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\nDisallow: /yonetim\n", { status: 200 });
    if (u.endsWith("/sitemap.xml")) return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/</loc></url></urlset>`, { status: 200 });
    if (u.endsWith("/llms.txt")) return new Response(`# x\n- [a](${BASE}/web-tasarim): b\n`, { status: 200 });
    if (u.endsWith("/llms-full.txt")) return new Response("x".repeat(3000), { status: 200 });
    if (u.includes("indexnow")) return new Response("", { status: 200 });
    return new Response(`<html><head><link rel="canonical" href="${u}"></head><body><h1>x</h1></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

async function newPageAction(primary: string, queries: string[], path = "/blog/web-sitesi-bakimi-nedir") {
  return db.autopilotAction.create({ data: { runId, type: "NEW_PAGE", risk: "CONTROLLED", status: "planned", score: 50, title: `Yeni sayfa: ${path} (${Date.now()})`, reason: "test", query: primary,
    proposal: { pagePath: path, decision: "NEW_PAGE", pageType: "BLOG_POST", pageId: null, group: { primary, queries, impressions: 140, intent: "INFORMATIONAL", location: null } } } });
}

beforeAll(async () => {
  await cleanGsc();
  await seedGsc();
  await saveSetting("autopilot", {});
  runId = (await db.autopilotRun.create({ data: { weekKey: "TEST-AGENT", trigger: "test" } })).id;
  const kurumsal = await db.page.findUniqueOrThrow({ where: { path: "/kurumsal-web-tasarim" } });
  const eticaret = await db.page.findUniqueOrThrow({ where: { path: "/e-ticaret-web-tasarim" } });
  for (const [phrase, target] of [["kurumsal site tasarımı", kurumsal.id], ["e ticaret altyapısı seçimi", eticaret.id], ["veri olmayan test kelimesi", null]] as const) {
    const k = await db.keyword.upsert({ where: { normalized: normalizeKeyword(phrase) }, create: { phrase, normalized: normalizeKeyword(phrase), targetPageId: target, source: "manual" }, update: { targetPageId: target } });
    created.push(k.id);
  }
  aiHooks.available = () => false;
});

afterAll(async () => {
  Object.assign(aiHooks, realHooks);
  const applied = await db.autopilotAction.findMany({ where: { runId, status: "applied" }, orderBy: { appliedAt: "desc" } });
  for (const a of applied) await rollbackAction(AUTOPILOT_USER, a.id).catch(() => undefined);
  await db.page.deleteMany({ where: { path: "/blog/web-sitesi-bakimi-nedir" } });
  await db.autopilotRun.deleteMany({ where: { OR: [{ weekKey: "TEST-AGENT" }, { trigger: "test" }] } });
  await db.keyword.deleteMany({ where: { id: { in: created } } });
  await db.keyword.deleteMany({ where: { source: "discovered" } });
  await db.jobRun.deleteMany({ where: { triggeredBy: { startsWith: "test" } } });
  await db.emailLog.deleteMany({ where: { kind: "daily" } });
  await cleanGsc();
  await saveSetting("autopilot", {});
});

describe("anahtar kelime → karar → otomatik işlem", () => {
  it("4–10: sayfayı analiz eder ve title/meta/içerik işlemi üretir; ölçüm ve karar kelimeye yazılır", async () => {
    const r = await runKeywordAgent();
    expect(r.hasData).toBe(true);
    const k = await db.keyword.findUniqueOrThrow({ where: { normalized: normalizeKeyword("kurumsal site tasarımı") } });
    const d = k.decision as KeywordDecision;
    expect(d.bucket).toBe("OPTIMIZE_PAGE");
    expect(d.current?.impressions).toBe(4 * 28);
    expect(d.previous?.impressions).toBe(4 * 28);
    expect(d.current?.position).toBeCloseTo(6.2, 1);
    expect(d.trend).toBe("stable");
    expect(d.targetPath).toBe("/kurumsal-web-tasarim");
    const types = r.candidates.filter((c) => c.query === normalizeKeyword("kurumsal site tasarımı")).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(["TITLE", "META"]));
    for (const c of r.candidates) { expect(c.evidence).toBeTruthy(); expect(c.recommendedAction).toBeTruthy(); }
  });

  it("11–30: içerik genişletme; sorgular gruplanır; rakip verisi uydurulmaz", async () => {
    const r = await runKeywordAgent();
    const k = await db.keyword.findUniqueOrThrow({ where: { normalized: normalizeKeyword("e ticaret altyapısı seçimi") } });
    expect((k.decision as KeywordDecision).bucket).toBe("EXPAND_CONTENT");
    const c = r.candidates.find((x) => x.type === "CONTENT" && x.pagePath === "/e-ticaret-web-tasarim")!;
    expect(c.risk).toBe("CONTROLLED");
    expect(c.reason).toContain("Rakip verisi doğrulanamadı");
  });

  it("veri yoksa karar verilmez (tahmin yok)", async () => {
    await runKeywordAgent();
    const k = await db.keyword.findUniqueOrThrow({ where: { normalized: normalizeKeyword("veri olmayan test kelimesi") } });
    expect((k.decision as KeywordDecision).bucket).toBe("NO_DATA");
    expect(BUCKET_LABELS.NO_DATA).toBe("Veri yok");
  });
});

describe("kümeleme, cannibalization ve sayfa kararı", () => {
  it("aynı niyetteki sorgular tek kümede; bilgi soruları kelime örtüşmesiyle birleşir", () => {
    const agg = (i: number) => ({ impressions: i, clicks: 0, ctr: 0, position: 10, pages: new Map([["x", i]]) });
    const g = groupQueries([
      { query: "web tasarım şirketi", agg: agg(80), location: null }, { query: "web tasarım firması", agg: agg(60), location: null },
      { query: "web sitesi bakımı nedir", agg: agg(84), location: null }, { query: "web sitesi bakımı nasıl yapılır", agg: agg(56), location: null },
    ]);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.key === "topic:ajans")!.queries).toHaveLength(2);
    expect(g.find((x) => x.primary === "web sitesi bakımı nedir")!.queries).toHaveLength(2);
  });

  it("gerçek veriden kararlar: PAGE_NOT_NEEDED, CANNIBALIZATION, FILL_LOCATION_DRAFT, NEW_PAGE; alakasız sorgu için sayfa yok", async () => {
    const { hasData, decisions } = await findPageNeeds();
    expect(hasData).toBe(true);
    const by = (q: string) => decisions.find((d) => d.group.queries.includes(normalizeKeyword(q)));
    expect(by("web tasarım şirketi")!.decision).toBe("PAGE_NOT_NEEDED");
    expect(by("web tasarım şirketi")!.path).toBe("/web-tasarim-ajansi");
    expect(by("web tasarım firması")).toBe(by("web tasarım şirketi")); // aynı küme → tek karar
    expect(by("kurumsal kimlik tasarımı")!.decision).toBe("CANNIBALIZATION");
    expect(by("adapazarı web tasarım")!.decision).toBe("FILL_LOCATION_DRAFT");
    expect(by("adapazarı web tasarım")!.path).toBe("/web-tasarim/sakarya/adapazari");
    const nw = by("web sitesi bakımı nedir")!;
    expect(nw.decision).toBe("NEW_PAGE");
    expect(nw.path).toBe("/blog/web-sitesi-bakimi-nedir");
    expect(nw.group.queries).toEqual(expect.arrayContaining([normalizeKeyword("web sitesi bakımı nasıl yapılır")]));
    const pizza = by("pizza tarifi");
    expect(pizza === undefined || pizza.decision === "PAGE_NOT_NEEDED").toBe(true);
    expect(decisions.filter((d) => d.decision === "NEW_PAGE")).toHaveLength(1); // keyword başına sayfa yok
  });

  it("aynı niyeti karşılayan yayındaki sayfa varsa yeni sayfa açılmaz", async () => {
    const state = await loadSiteState();
    const d = await decidePage({ key: "q:x", primary: "web tasarım fiyatları nasıl belirlenir", queries: ["web tasarım fiyatları nasıl belirlenir"], impressions: 90, clicks: 0, position: 12, pages: new Map(), intent: "INFORMATIONAL", location: null }, state);
    expect(d.decision).toBe("PAGE_NOT_NEEDED");
  });
});

describe("yeni sayfa motoru: üret → kalite kapısı → yayın → geri al", () => {
  it("lokasyon: gerçek işletme/yerel bilgi yoksa yapay zekâ çağrılmadan insan doğrulamasına düşer", async () => {
    let called = 0;
    aiHooks.available = () => true;
    aiHooks.page = async () => { called++; return goodAiPage; };
    const loc = await db.page.findUniqueOrThrow({ where: { path: "/web-tasarim/sakarya/adapazari" } });
    const a = await db.autopilotAction.create({ data: { runId, type: "NEW_PAGE", risk: "CONTROLLED", status: "planned", score: 40, title: "lokasyon", reason: "t", proposal: { pagePath: loc.path, decision: "FILL_LOCATION_DRAFT", pageType: loc.type, pageId: loc.id, group: { primary: "adapazarı web tasarım", queries: ["adapazarı web tasarım"], impressions: 84, intent: "COMMERCIAL", location: { provinceId: loc.provinceId, districtId: loc.districtId } } } } });
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    expect(r.status).toBe("needs_approval");
    expect(r.note).toMatch(/İnsan doğrulaması gerekiyor: .*Gerçek işletme bilgisi/);
    expect(called).toBe(0);
    expect((await db.page.findUniqueOrThrow({ where: { id: loc.id } })).status).not.toBe("PUBLISHED");
  });

  it("yapay zekâ anahtarı yoksa sayfa uydurulmaz", async () => {
    aiHooks.available = () => false;
    const a = await newPageAction("web sitesi bakımı nedir", ["web sitesi bakımı nedir"]);
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    expect(r.status).toBe("needs_approval");
    expect(r.note).toMatch(/Yapay zekâ anahtarı yok/);
    expect(await db.page.findUnique({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).toBeNull();
  });

  it("uydurma müşteri/fiyat/istatistik içeren yapay zekâ çıktısı yayınlanmaz (TASLAK kalır)", async () => {
    aiHooks.available = () => true;
    aiHooks.page = async () => ({ ...goodAiPage, body: `${goodAiPage.body}\n\n## Neden biz?\n\nBugüne kadar 500+ mutlu müşteriye hizmet verdik; referanslarımız arasında büyük markalar var. Ortalama bakım ücreti 2.500 TL'dir.` });
    const a = await newPageAction("web sitesi bakımı nedir", ["web sitesi bakımı nedir"]);
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    expect(r.status).toBe("needs_approval");
    expect(r.note).toMatch(/Sahte iddia/);
    expect((await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).status).toBe("DRAFT");
  });

  it("[DOĞRULANMALI] içeren içerik yayınlanmaz", async () => {
    aiHooks.page = async () => ({ ...goodAiPage, intro: `${goodAiPage.intro} [DOĞRULANMALI: bakım paketlerinin içeriği]` });
    const a = await newPageAction("web sitesi bakımı nedir", ["web sitesi bakımı nedir"]);
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    expect(r.status).toBe("needs_approval");
    expect(r.note).toMatch(/DOĞRULANMALI/);
    expect((await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).status).toBe("DRAFT");
  });

  it("AUTONOMOUS: kalite kapısını geçen sayfa yayınlanır; sitemap, canonical, schema, IndexNow, denetim logu, deney; mükerrer sayfa açılmaz; geri alınır", async () => {
    aiHooks.page = async () => goodAiPage;
    const since = new Date(Date.now() - 1000);
    const a = await newPageAction("web sitesi bakımı nedir", ["web sitesi bakımı nedir", "web sitesi bakımı nasıl yapılır"]);
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    const act = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(r.status, `${r.note}\n${JSON.stringify((act.proposal as { gate?: unknown }).gate, null, 1)}`).toBe("applied");
    const page = await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } });
    expect(page.status).toBe("PUBLISHED");
    expect(page.robotsIndex && !page.autoNoindex).toBe(true); // sitemap'e girer
    const post = (act.after as { postPublish: { label: string; status: string }[] }).postPublish;
    expect(post.every((c) => c.status === "PASS")).toBe(true);
    const parentPath = (act.after as { parentPath: string }).parentPath;
    const parent = await db.page.findUniqueOrThrow({ where: { path: parentPath } });
    expect((parent.relatedLinks as { path: string }[]).some((l) => l.path === page.path)).toBe(true); // orphan değil
    expect(await changedPathsSince(since)).toEqual(expect.arrayContaining([page.path])); // IndexNow'a gidecek
    expect(await db.auditLog.count({ where: { action: "autopilot.page.publish", entityId: page.id } })).toBeGreaterThan(0);
    expect(await db.experiment.count({ where: { actionId: a.id } })).toBe(1); // Search Console takibi
    expect(await db.pageVersion.count({ where: { pageId: page.id } })).toBeGreaterThanOrEqual(3); // önceki sürümler saklı
    // Mükerrer sayfa önleme
    expect(await pendingNewPage(page.path)).toBe(true);
    const dup = await newPageAction("web sitesi bakımı nedir", ["web sitesi bakımı nedir"]);
    expect((await executeAction(dup.id, { allowControlled: true, model: "x" })).status).toBe("skipped");
    expect(await db.page.count({ where: { path: { startsWith: "/blog/web-sitesi-bakimi" } } })).toBe(1);
    // Geri alma: sayfa silinmez, taslağa alınır; üst sayfadaki link kalkar
    await rollbackAction(AUTOPILOT_USER, a.id);
    expect((await page && (await db.page.findUniqueOrThrow({ where: { id: page.id } })).status)).toBe("DRAFT");
    expect(((await db.page.findUniqueOrThrow({ where: { path: parentPath } })).relatedLinks as { path: string }[] | null ?? []).some((l) => l.path === page.path)).toBe(false);
  });

  it("ASSIST: taslak hazırlanır, yayın onay bekler; onaylanınca yayınlanır", async () => {
    await saveSetting("autopilot", { mode: "ASSIST" });
    const a = await newPageAction("web sitesi bakımı nedir", ["web sitesi bakımı nedir"]);
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    expect(r.status).toBe("needs_approval");
    expect(r.note).toMatch(/ASSIST/);
    expect((await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).status).toBe("DRAFT");
    const admin = { ...AUTOPILOT_USER, id: "test-onay", name: "Test Onaylayan" };
    const ok = await approveAction(admin, a.id, "x");
    expect(ok.status).toBe("applied");
    expect((await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).status).toBe("PUBLISHED");
    await rollbackAction(AUTOPILOT_USER, a.id);
    await saveSetting("autopilot", {});
  });
});

describe("ajan modları", () => {
  it("OBSERVE: ölçer ama hiçbir işlem oluşturmaz/uygulamaz", async () => {
    await saveSetting("autopilot", { mode: "OBSERVE" });
    aiHooks.available = () => false;
    const r = await runAutopilot({ trigger: "test", fetchImpl: fakeSite(), skipStages: [1, 6], sendEmail: false });
    expect(await db.autopilotAction.count({ where: { runId: r.id } })).toBe(0);
    expect(r.stages.find((s) => s.n === 13)!.message).toMatch(/OBSERVE/);
    expect(r.stages.find((s) => s.n === 11)!.message).toMatch(/anahtar kelime: \d+ ölçüldü/);
    await saveSetting("autopilot", {});
  });
});

describe("sağlık skoru (deterministik) ve favicon", () => {
  it("favicon eksikse skor düşer ve düşüş favicon kontrolüne bağlanır; düzelince geri gelir", async () => {
    const bad = overallScore(await computeSeoHealth({ fetchImpl: fakeSite({ favicon404: true }) }));
    const good = overallScore(await computeSeoHealth({ fetchImpl: fakeSite() }));
    const fav = bad.deductions.find((d) => d.label === "Favicon")!;
    expect(fav.status).toBe("FAIL");
    expect(Math.abs(fav.points - (100 * weightOf("technical", "Favicon")) / bad.possible)).toBeLessThan(0.6); // ağırlık / mümkün × 100
    expect(good.deductions.find((d) => d.label === "Favicon")).toBeUndefined();
    expect(good.score!).toBeGreaterThan(bad.score!);
    // Aynı girdi → aynı skor (deterministik); düşüşler toplamı = 100 − skor
    const again = overallScore(await computeSeoHealth({ fetchImpl: fakeSite() }));
    expect(again.score).toBe(good.score);
    expect(Math.round(good.deductions.reduce((s, d) => s + d.points, 0) * 10)).toBe((100 - good.score!) * 10); // gösterilen düşüşler toplamı = 100 − skor
    expect(Math.round(bad.deductions.reduce((s, d) => s + d.points, 0) * 10)).toBe((100 - bad.score!) * 10);
    for (const nv of good.notVerifiable) expect(good.deductions.some((d) => d.label === nv.label)).toBe(false);
  });
});

describe("sayfa envanteri", () => {
  it("gerçek sayıları ve kategori bazında gerçek nedenleri verir", async () => {
    const inv = await pageInventory([{ decision: "NEW_PAGE" }, { decision: "PAGE_NOT_NEEDED" }]);
    expect(inv.totals.published).toBe(await db.page.count({ where: { status: "PUBLISHED" } }));
    expect(inv.totals.draft).toBe(await db.page.count({ where: { status: "DRAFT" } }));
    const loc = inv.rows.find((r) => r.category === "Lokasyon")!;
    expect(loc.draft).toBeGreaterThan(1000);
    expect(loc.reasons.join(" ")).toMatch(/İşletme adı\/adresi doğrulanmadı/);
    expect(inv.rows.find((r) => r.category === "Rehber (blog)")!.potential).toBe(1);
  });
});

describe("kuyruk, worker, yeniden deneme, bağımlılık", () => {
  it("aynı iş kuyrukta iki kez olmaz; hata olursa geri çekilmeyle yeniden denenir; hak bitince durur", async () => {
    await db.jobRun.deleteMany({ where: { kind: { in: ["indexnow", "daily", "autopilot"] }, status: { in: ["queued", "running"] } } });
    let calls = 0;
    registerJob("indexnow", async () => { calls++; throw new Error("geçici hata"); });
    const a = await enqueueJob("indexnow", "test-kuyruk");
    const b = await enqueueJob("indexnow", "test-kuyruk");
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    let now = Date.now();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const out = await processQueue({ now: () => new Date(now) });
      expect(out.map((o) => o.status)).toEqual(["error"]);
      expect(Boolean(out[0].retryAt)).toBe(attempt < MAX_ATTEMPTS);
      expect(await processQueue({ now: () => new Date(now) })).toEqual([]); // geri çekilme süresi dolmadan tekrar yok
      now += 60 * 60_000;
    }
    expect(calls).toBe(MAX_ATTEMPTS);
    expect(await db.jobRun.count({ where: { kind: "indexnow", status: "queued" } })).toBe(0);
  });

  it("ajan veri hattından önce çalışmaz; yarıda kalan iş kurtarılır", async () => {
    const order: string[] = [];
    registerJob("daily", async () => { order.push("daily"); return { message: "ok" }; });
    registerJob("autopilot", async () => { order.push("autopilot"); return { message: "ok" }; });
    await enqueueJob("autopilot", "test-sira");
    await enqueueJob("daily", "test-sira");
    await processQueue({});
    expect(order).toEqual(["daily", "autopilot"]);
    const stale = await db.jobRun.create({ data: { kind: "daily", status: "running", triggeredBy: "test-stale", startedAt: new Date(Date.now() - 3 * 3600_000) } });
    await processQueue({});
    expect((await db.jobRun.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("error");
    expect(order.filter((x) => x === "daily")).toHaveLength(1); // geri çekilme süresi dolmadan yeniden çalışmaz
    await processQueue({ now: () => new Date(Date.now() + 10 * 60_000) });
    expect(order.filter((x) => x === "daily")).toHaveLength(2); // kurtarılıp yeniden çalıştı
  });
});

describe("günlük rapor", () => {
  it("bölümleri içerir, iyileşme iddiası yapmaz ve günde bir kez gönderilir", async () => {
    await db.emailLog.deleteMany({ where: { kind: "daily" } });
    const r = await buildDailyReport();
    const text = renderDailyText(r);
    for (const s of ["ORGANİK PERFORMANS", "BUGÜN AJANIN YAPTIĞI", "SAĞLIK", "YENİ SAYFALAR", "BEKLEYENLER", "SİSTEM"]) expect(text).toContain(s);
    expect(r.system.map((x) => x.name)).toEqual(["Search Console", "Crawler", "Sitemap", "IndexNow", "Yapay zekâ", "E-posta (SMTP)", "Zamanlayıcı", "Worker"]);
    expect(text).not.toMatch(/arttı|%\d+ artış/);
    expect(text).toMatch(/etki 28 gün sonra|ölçüm süresi dolan/);
    const first = await sendDailyEmail();
    expect(first.status).toBe("logged");
    expect((await sendDailyEmail()).status).toBe("duplicate");
    expect(await db.emailLog.count({ where: { kind: "daily" } })).toBe(1);
  });
});
