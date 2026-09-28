// Otonom SEO motoru uçtan uca: veri yokken dürüst rapor → Search Console verisiyle
// haftalık döngü (karar → güvenli uygulama → sürüm → deney → e-posta) → ölçüm →
// öğrenme → geri alma → kritik alarmlar. Sahte Google API ve sahte site ile.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { db } from "@/lib/db";
import { deleteSecret, saveSetting, setSecret } from "@/lib/settings";
import { GSC_SECRET } from "@/lib/gsc/sync";
import { runAutopilot } from "@/lib/autopilot/run";
import { aiHooks, executeAction, rollbackAction, AUTOPILOT_USER } from "@/lib/autopilot/execute";
import { evaluateExperiments } from "@/lib/autopilot/experiments";
import { learningStats } from "@/lib/autopilot/learning";
import { runAlarms } from "@/lib/autopilot/alarms";
import { NO_DATA_TEXT } from "@/lib/autopilot/report";
import { dueJobs } from "@/lib/autopilot/scheduler";
import { runAutoApply } from "@/lib/proposals/lifecycle";

const BASE = "https://webtasarimajansi.net";
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

// [sorgu, sayfa, pozisyon, günlük gösterim (son 28), günlük tık (son 28), günlük gösterim (önceki 28), günlük tık (önceki 28)]
const SCENARIOS: [string, string, number, number, number, number, number][] = [
  ["kurumsal web sitesi", "/kurumsal-web-tasarim", 6.5, 40, 0.2, 38, 1.2],
  ["web tasarım fiyatları", "/web-tasarim-fiyatlari", 5.5, 30, 0.3, 28, 0.3],
  ["sakarya web tasarım", "/web-tasarim", 9, 20, 0.5, 18, 0.5],
  ["web sitesi yaptırma", "/web-sitesi-yaptirma", 13, 25, 0, 20, 0],
];

function fakeGoogle(scenarios = SCENARIOS): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("oauth2")) return Response.json({ access_token: "tok", expires_in: 3600 });
    const body = JSON.parse(String(init?.body ?? "{}"));
    const dims: string[] = body.dimensions;
    if (body.startRow > 0) return Response.json({ rows: [] });
    const m = new Map<string, { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>();
    for (let d = 1; d <= 70; d++) {
      // Gerçek API gibi istenen tarih aralığına uy
      if ((body.startDate && day(d) < body.startDate) || (body.endDate && day(d) > body.endDate)) continue;
      const current = d <= 28;
      for (const [q, page, pos, iNow, cNow, iPrev, cPrev] of scenarios) {
        const imp = current ? iNow : iPrev;
        const clk = Math.round((current ? cNow : cPrev) * 10) / 10 >= 1 ? Math.round(current ? cNow : cPrev) : d % Math.max(1, Math.round(1 / Math.max(0.01, current ? cNow : cPrev))) === 0 ? 1 : 0;
        const keys = dims.map((k) => (k === "date" ? day(d) : k === "query" ? q : k === "page" ? BASE + page : k === "device" ? "MOBILE" : "tur"));
        const key = keys.join("|");
        const e = m.get(key);
        if (e) { e.position = (e.position * e.impressions + pos * imp) / (e.impressions + imp); e.clicks += clk; e.impressions += imp; e.ctr = e.clicks / e.impressions; }
        else m.set(key, { keys, clicks: clk, impressions: imp, ctr: clk / imp, position: pos });
      }
    }
    return Response.json({ rows: [...m.values()] });
  }) as typeof fetch;
}

/** Sahte canlı site: robots, sitemap, ana sayfa, IndexNow; Google isteklerini sahte API'ye yollar. */
function fakeWorld(google = fakeGoogle()): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("googleapis.com") || u.includes("oauth2")) return google(url, init);
    if (u.includes("indexnow")) return new Response("", { status: 200 });
    if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
    if (u.endsWith("/sitemap.xml")) return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/</loc></url></urlset>`, { status: 200, headers: { "content-type": "application/xml" } });
    return new Response(`<!doctype html><html><head><title>Ana sayfa</title><link rel="canonical" href="${BASE}/"></head><body><h1>Web</h1></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

async function cleanAll() {
  // Otomatik değişiklikleri geri al (test DB'deki seed sayfaları eski hâline dönsün)
  const applied = await db.autopilotAction.findMany({ where: { status: "applied" }, orderBy: { appliedAt: "desc" } });
  for (const a of applied) await rollbackAction(AUTOPILOT_USER, a.id).catch(() => undefined);
  await db.experiment.deleteMany();
  await db.autopilotAction.deleteMany();
  await db.autopilotRun.deleteMany();
  await db.emailLog.deleteMany();
  await db.alarmState.deleteMany();
  await db.gscQueryDaily.deleteMany();
  await db.gscPageDaily.deleteMany();
  await db.gscDailyTotal.deleteMany();
  await db.gscDimDaily.deleteMany();
  await db.rankSnapshot.deleteMany();
  await db.seoTask.deleteMany();
  await db.keyword.deleteMany({ where: { source: "discovered" } });
}

const realHooks = { ...aiHooks };

beforeAll(async () => {
  await cleanAll();
  await saveSetting("email", {});
  await saveSetting("autopilot", {});
  aiHooks.available = () => false; // testte gerçek API çağrısı yok
});

afterAll(async () => {
  Object.assign(aiHooks, realHooks);
  await cleanAll();
  await deleteSecret(GSC_SECRET);
  await saveSetting("integrations", {});
  await saveSetting("email", {});
  await saveSetting("autopilot", {});
});

describe("Search Console yokken otopilot", () => {
  it("23 aşamayı çalıştırır, uydurma yapmaz ve dürüst rapor e-postası üretir", async () => {
    const r = await runAutopilot({ trigger: "test", fetchImpl: fakeWorld(), skipStages: [6] });
    expect(r.stages).toHaveLength(23);
    expect(r.stages.find((s) => s.n === 1)?.status).toBe("skipped");
    expect(r.stages.filter((s) => s.status === "error")).toEqual([]);
    // GSC yokken title/CTR işlemi seçilemez (odak sorgu yok)
    const actions = await db.autopilotAction.findMany({ where: { runId: r.id } });
    expect(actions.some((a) => a.type === "TITLE")).toBe(false);
    for (const a of actions) {
      if (a.risk === "HUMAN") expect(a.status).toBe("needs_approval");
      if (a.status === "applied") {
        expect(a.versionBeforeId).toBeTruthy();
        expect(a.versionAfterId).toBeTruthy();
      }
    }
    const mail = await db.emailLog.findFirstOrThrow({ where: { kind: "weekly" }, orderBy: { createdAt: "desc" } });
    expect(mail.status).toBe("logged");
    expect(mail.to).toBe("mchttasarim@gmail.com");
    expect(mail.text).toContain(NO_DATA_TEXT);
    expect(mail.text).not.toMatch(/Önceki \| Şimdi[\s\S]*\d+,\d+ \| \d+,\d+/); // pozisyon tablosu yok
    expect(mail.html).toContain("Gelecek hafta planı");
  });
});

describe("Search Console verisiyle haftalık döngü", () => {
  let runId: string;
  it("GSC'den keşif, CTR fırsatı için title/meta seçer ve kalite kapısından geçirip uygular", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await setSecret(GSC_SECRET, JSON.stringify({ type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
    await saveSetting("integrations", { gscProperty: "sc-domain:webtasarimajansi.net" });
    // Haftalık bütçe: ilk çalıştırma bütçeyi doldurduysa yeni otomatik değişiklik yapılmaz
    const usedThisWeek = await db.autopilotAction.count({ where: { status: "applied" } });
    if (usedThisWeek >= 10) {
      const blocked = await runAutopilot({ trigger: "test", fetchImpl: fakeWorld(), skipStages: [6], sendEmail: false });
      const acts = await db.autopilotAction.findMany({ where: { runId: blocked.id } });
      expect(acts.filter((a) => a.status === "applied")).toEqual([]);
      expect(acts.some((a) => a.qualityNotes?.includes("Haftalık otomatik değişiklik sınırı doldu"))).toBe(true);
      await db.autopilotAction.deleteMany({ where: { runId: blocked.id } });
    }
    await saveSetting("autopilot", { maxChangesPerWeek: 40 });
    const r = await runAutopilot({ trigger: "test", fetchImpl: fakeWorld(), skipStages: [6] });
    runId = r.id;
    expect(r.stages.find((s) => s.n === 1)?.status, r.stages[0].message).toBe("ok");
    expect(r.stages.filter((s) => s.status === "error")).toEqual([]);
    // Keşif: GSC sorgusu anahtar kelime olarak eklendi, küme ve niyet atandı
    const kw = await db.keyword.findUnique({ where: { normalized: "web sitesi yaptırma" }, include: { cluster: true } });
    expect(kw?.cluster?.targetPageId).toBeTruthy();
    const actions = await db.autopilotAction.findMany({ where: { runId } });
    expect(actions.length).toBeLessThanOrEqual(10);
    let title = actions.find((a) => a.type === "TITLE" && a.query === "kurumsal web sitesi");
    expect(title, JSON.stringify(actions.map((a) => [a.type, a.query, a.status, a.qualityNotes]))).toBeTruthy();
    // 48 saatlik onay: döngü değişikliği hazırlar (somut title + kalite kapısı), hemen uygulamaz
    expect(title!.status, title!.qualityNotes ?? "").toBe("pending_approval");
    expect(title!.autoApply).toBe(true);
    expect(title!.expiresAt!.getTime() - title!.createdAt.getTime()).toBe(48 * 3600_000);
    const untouched = await db.page.findUniqueOrThrow({ where: { id: title!.pageId! } });
    expect(untouched.seoTitle ?? "").not.toContain("kurumsal web sitesi");
    // Onay gelmeden 48 saat dolar → otomatik uygulama
    const s = await runAutoApply({ now: new Date(Date.now() + 49 * 3600_000), fetchImpl: null, max: 100 });
    expect(s.applied).toBeGreaterThan(0);
    title = await db.autopilotAction.findUniqueOrThrow({ where: { id: title!.id } });
    expect(title.status, title.error ?? "").toBe("applied");
    expect(title.appliedVia).toBe("auto_48h");
    const page = await db.page.findUniqueOrThrow({ where: { id: title!.pageId! } });
    expect(page.seoTitle?.toLocaleLowerCase("tr")).toContain("kurumsal web sitesi");
    expect(page.seoTitle!.length).toBeLessThanOrEqual(60);
    // Sürüm geçmişi ve alan logu
    const v = await db.pageVersion.findUniqueOrThrow({ where: { id: title!.versionAfterId! } });
    expect(v.userName).toBe("SEO Otopilot");
    expect(await db.seoChangeLog.count({ where: { pageId: page.id, userName: "SEO Otopilot", field: "Title" } })).toBeGreaterThan(0);
    // Deney kaydı ve taban ölçüm
    const exp = await db.experiment.findUniqueOrThrow({ where: { actionId: title!.id } });
    expect((exp.baseline as { query: { impressions: number } }).query.impressions).toBeGreaterThan(0);
    // Haftalık sınır
    expect(actions.filter((a) => a.status === "applied").length).toBeLessThanOrEqual(10);
  });

  it("haftalık e-posta gerçek veriyle tüm bölümleri içerir", async () => {
    const mail = await db.emailLog.findFirstOrThrow({ where: { kind: "weekly" }, orderBy: { createdAt: "desc" } });
    expect(mail.text).not.toContain(NO_DATA_TEXT);
    for (const s of ["GENEL PERFORMANS", "EN ÖNEMLİ ANAHTAR KELİMELER", "TÜRKİYE GENELİ WEB TASARIM KELİMELERİ", "YÜKSELENLER", "DÜŞENLER", "YENİ KEŞFEDİLEN", "LOKASYON PERFORMANSI", "SİSTEM BU HAFTA NE YAPTI", "ÖNCEKİ DEĞİŞİKLİKLERİN SONUCU", "GELECEK HAFTA PLANI"]) {
      expect(mail.text.toLocaleUpperCase("tr")).toContain(s);
    }
    expect(mail.text).toContain("kurumsal web sitesi");
    expect(mail.text).toContain("Sakarya"); // gerçek gösterimi olan konum
    expect(mail.text).not.toContain("İstanbul |"); // verisi olmayan konum listelenmez
    expect(mail.subject).toMatch(/tıklama/);
  });

  it("insan onayı gerektiren işlemler asla otomatik uygulanmaz", async () => {
    const human = await db.autopilotAction.findMany({ where: { risk: "HUMAN" } });
    for (const a of human) expect(["needs_approval", "approved", "rejected"]).toContain(a.status);
    const loc = await db.autopilotAction.findFirst({ where: { type: "LOCATION" } });
    if (loc) {
      const r = await executeAction(loc.id, { allowControlled: true, model: "x" });
      expect(r.status).toBe("needs_approval");
    }
  });

  it("kontrollü içerik: uydurma sayı içeren yapay zekâ bölümü reddedilir", async () => {
    const page = await db.page.findUniqueOrThrow({ where: { path: "/kurumsal-web-tasarim" } });
    const run = await db.autopilotRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    const a = await db.autopilotAction.create({ data: { runId: run.id, type: "CONTENT", risk: "CONTROLLED", status: "planned", score: 50, title: "test içerik", reason: "kapsam", pageId: page.id, proposal: {} } });
    aiHooks.available = () => true;
    aiHooks.section = async () => ({ heading: "Müşteri sonuçlarımız", markdown: `${"Kurumsal web sitesi sürecinde ilerleyiş adım adım planlanır. ".repeat(12)} 2019'dan beri 850 müşteriye hizmet verdik.`, rationale: "" });
    const r = await executeAction(a.id, { allowControlled: true, model: "x" });
    aiHooks.available = () => false;
    Object.assign(aiHooks, { section: realHooks.section });
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/Sayfada olmayan sayılar/);
    expect((await db.page.findUniqueOrThrow({ where: { id: page.id } })).body).toBe(page.body);
  });

  it("ölçüm → öğrenme: nihai deney sonucu 'gözlenen değişim' olarak yazılır, çarpan güncellenir", async () => {
    // Deneyleri 40 gün önce uygulanmış gibi göster
    await db.experiment.updateMany({ where: { status: "running" }, data: { appliedAt: new Date(Date.now() - 40 * 86400_000) } });
    const ev = await evaluateExperiments();
    expect(ev.final).toBeGreaterThan(0);
    const done = await db.experiment.findFirstOrThrow({ where: { status: "evaluated", type: "TITLE" } });
    expect((done.result as { summary: string }).summary).toMatch(/^(Gözlenen değişim|Karşılaştırma için yeterli)/);
    const learn = await learningStats();
    expect(learn.get("TITLE")).toBeTruthy();
  });

  it("geri alma: yalnızca değişen alan eski hâline döner, deney kapanır", async () => {
    const a = await db.autopilotAction.findFirstOrThrow({ where: { runId, type: "TITLE", status: "applied" } });
    const before = (a.before as { value: string | null }).value;
    await rollbackAction(AUTOPILOT_USER, a.id);
    const page = await db.page.findUniqueOrThrow({ where: { id: a.pageId! } });
    expect(page.seoTitle).toBe(before);
    expect((await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("rolled_back");
    expect((await db.experiment.findUniqueOrThrow({ where: { actionId: a.id } })).status).toBe("rolled_back");
    await expect(rollbackAction(AUTOPILOT_USER, a.id)).rejects.toThrow();
  });

  it("iç link: anchor hedefin kendi konusu; aynı sayfadaki iki linkten biri tek başına geri alınır", async () => {
    const run = await db.autopilotRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    const src = await db.page.findUniqueOrThrow({ where: { path: "/seo-hizmeti" } });
    const before = src.relatedLinks;
    const mk = (target: string) => db.autopilotAction.create({ data: { runId: run.id, type: "INTERNAL_LINK", risk: "AUTO", status: "planned", score: 40, title: `test link ${target}`, reason: "test", pageId: src.id, proposal: { payload: { source: "/seo-hizmeti", target, anchor: "" } } } });
    const a1 = await mk("/kurumsal-web-tasarim");
    const a2 = await mk("/e-ticaret-web-tasarim");
    expect((await executeAction(a1.id, { allowControlled: false, model: "x" })).status).toBe("applied");
    expect((await executeAction(a2.id, { allowControlled: false, model: "x" })).status).toBe("applied");
    for (const [path] of [["/kurumsal-web-tasarim"], ["/e-ticaret-web-tasarim"]]) {
      const t = await db.page.findUniqueOrThrow({ where: { path } });
      const links = (await db.page.findUniqueOrThrow({ where: { id: src.id } })).relatedLinks as { path: string; anchor: string }[];
      const anchor = links.find((l) => l.path === path)!.anchor;
      expect([t.primaryKeyword, t.h1, t.name]).toContain(anchor);
    }
    await rollbackAction(AUTOPILOT_USER, a1.id);
    const after = (await db.page.findUniqueOrThrow({ where: { id: src.id } })).relatedLinks as { path: string }[];
    expect(after.map((l) => l.path)).toEqual(["/e-ticaret-web-tasarim"]);
    await rollbackAction(AUTOPILOT_USER, a2.id);
    expect((await db.page.findUniqueOrThrow({ where: { id: src.id } })).relatedLinks).toEqual(before);
  });

  it("aynı hafta tekrar çalışınca aynı işlemleri yeniden seçmez", async () => {
    const titles = new Set((await db.autopilotAction.findMany({ where: { runId } })).map((a) => a.title));
    const r = await runAutopilot({ trigger: "test", fetchImpl: fakeWorld(), skipStages: [6], sendEmail: false });
    const again = await db.autopilotAction.findMany({ where: { runId: r.id } });
    expect(again.filter((a) => titles.has(a.title))).toEqual([]);
  });
});

describe("kritik alarmlar", () => {
  it("tıklamada ciddi düşüşte bir kez e-posta gönderir, 24 saat tekrar etmez", async () => {
    await db.gscDailyTotal.deleteMany();
    const last = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 2));
    for (let i = 0; i < 14; i++) {
      const date = new Date(last.getTime() - i * 86400_000);
      await db.gscDailyTotal.create({ data: { date, clicks: i < 7 ? 1 : 10, impressions: 500, ctr: 0.01, position: 8 } });
    }
    const r1 = await runAlarms({ fetchImpl: fakeWorld() });
    expect(r1.checks.find((c) => c.key === "clicks_drop")?.active).toBe(true);
    expect(r1.sent).toContain("clicks_drop");
    expect(r1.mail?.status).toBe("logged");
    const mail = await db.emailLog.findFirstOrThrow({ where: { kind: "alarm" }, orderBy: { createdAt: "desc" } });
    expect(mail.subject).toContain("Organik tıklamalarda ciddi düşüş");
    const r2 = await runAlarms({ fetchImpl: fakeWorld() });
    expect(r2.sent).not.toContain("clicks_drop");
  });

  it("sitemap bozuk ve site noindex ise alarm verir", async () => {
    const broken = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/sitemap.xml")) return new Response("", { status: 500 });
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      return new Response(`<html><head><meta name="robots" content="noindex"></head></html>`, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await runAlarms({ fetchImpl: broken });
    const idx = r.checks.find((c) => c.key === "indexability")!;
    expect(idx.active).toBe(true);
    expect(idx.detail).toMatch(/robots\.txt/);
    expect(idx.detail).toMatch(/noindex/);
    expect(r.checks.find((c) => c.key === "sitemap")?.active).toBe(true);
  });
});

describe("zamanlayıcı", () => {
  it("rapor gününde ve saatinden sonra haftalık raporu, her gece ajan döngüsünü, saatte bir alarmı planlar", async () => {
    await saveSetting("email", { day: 0, hour: 23 });
    await db.jobRun.deleteMany({ where: { kind: { in: ["alarms"] } } });
    await db.emailLog.deleteMany({ where: { kind: "weekly" } });
    await db.autopilotRun.deleteMany({ where: { trigger: "schedule" } });
    // Pazar 23:30 İstanbul = 20:30 UTC
    const sunday = new Date("2026-09-27T20:30:00Z");
    expect(await dueJobs(sunday)).toContain("weekly-email");
    expect(await dueJobs(sunday)).toContain("autopilot"); // ajan artık her gece çalışır
    expect(await dueJobs(sunday)).toContain("alarms");
    // Cumartesi: haftalık rapor yok, gece ajan döngüsü var
    const saturday = await dueJobs(new Date("2026-09-26T20:30:00Z"));
    expect(saturday).not.toContain("weekly-email");
    expect(saturday).toContain("autopilot");
    // Gece 02:00'den önce (İstanbul 01:30 = 22:30 UTC önceki gün) ajan döngüsü başlamaz
    expect(await dueJobs(new Date("2026-09-26T22:30:00Z"))).not.toContain("autopilot");
  });
});
