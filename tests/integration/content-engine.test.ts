// SEO CONTENT ENGINE (harici yapay zekâ YOK) + tam otomatik uygulama + merkezi temizlik.
// Motor gerçek test veritabanı sayfalarıyla çalışır; kancalar taklit EDİLMEZ.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { AUTOPILOT_USER, aiHooks } from "@/lib/autopilot/execute";
import { checkSection } from "@/lib/autopilot/qc";
import { applyProposal, clock, createProposal, rollbackProposal, runAutoApply } from "@/lib/proposals/lifecycle";
import { EngineNoData, engineFaq, engineIntro, enginePage, engineSection, engineSnippets, safeSentence, sectionsOf, sentencesOf } from "@/lib/content-engine/engine";
import { runCleanup } from "@/lib/maintenance/cleanup";
import { dueJobs } from "@/lib/autopilot/scheduler";
import { extractMarkdown } from "@/lib/text/markdown";
import type { SessionUser } from "@/lib/auth/session";

const PATH = "/mimarlik-web-tasarimi";
const H = 3600_000;
const DAY = 86400_000;
const realNow = clock.now;
let admin: SessionUser;
let original: { body: string | null; faq: unknown };

async function page(p = PATH) {
  return db.page.findUniqueOrThrow({ where: { path: p } });
}
const text = (pg: Awaited<ReturnType<typeof page>>) => `${pg.h1 ?? pg.name}\n${pg.intro ?? ""}\n${extractMarkdown(pg.body).text}`;
const published = async () => new Set((await db.page.findMany({ where: { status: "PUBLISHED" }, select: { path: true } })).map((p) => p.path));
const places = async () => (await db.province.findMany({ select: { name: true } })).map((p) => p.name);

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "engine@example.com" }, create: { email: "engine@example.com", name: "Motor Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await saveSetting("autopilot", {});
  const p = await page();
  original = { body: p.body, faq: p.faq };
  // Bu testin önceki çalıştırmalarından kalan "elle düzenleme" kaydı otomatik uygulamayı (doğru olarak) engellerdi
  await db.seoChangeLog.deleteMany({ where: { userId: admin.id } });
});

afterEach(() => {
  clock.now = realNow;
});

afterAll(async () => {
  const p = await page();
  await db.page.update({ where: { id: p.id }, data: { body: original.body, faq: original.faq as object } });
  await db.autopilotAction.deleteMany({ where: { source: "engine-test" } });
  await db.seoChangeLog.deleteMany({ where: { userId: admin.id } });
  await saveSetting("autopilot", {});
});

describe("içerik motoru: yalnızca sitedeki gerçek bilgi", () => {
  it("varsayılan kancalar harici yapay zekâ değil, içerik motorudur", () => {
    expect(aiHooks.available()).toBe(true);
    expect(aiHooks.section).toBe(engineSection);
    expect(aiHooks.page).toBe(enginePage);
  });

  it("güvenli cümle: rakam, iddia, yer adı içeren cümle taşınmaz", async () => {
    const pl = await places();
    expect(safeSentence("Sayfalar telefonda kolay okunacak şekilde düzenlenir.", pl)).toBe(true);
    expect(safeSentence("Bugüne kadar 500 projeyi tamamladık.", pl)).toBe(false);
    expect(safeSentence("Müşterilerimiz bizi çok seviyor.", pl)).toBe(false);
    expect(safeSentence("Sakarya bölgesinde en iyi hizmeti veriyoruz.", pl)).toBe(false);
    expect(sectionsOf("## A\n\nmetin bir.\n\n### B\n\nmetin iki.").map((s) => s.heading)).toEqual(["A", "B"]);
  });

  it("title/meta: sorguyu içerir, uzunluk sınırında, rakam/iddia uydurmaz", async () => {
    const p = await page();
    const r = await engineSnippets({ path: p.path, siteName: "Web Tasarım Ajansı", query: "mimarlık web tasarımı", currentTitle: p.seoTitle ?? p.name, currentDescription: p.metaDescription ?? "", h1: p.h1 ?? p.name, intro: p.intro ?? "", excerpt: extractMarkdown(p.body).text.slice(0, 3000), ctr: null, position: null });
    expect(r.titles.length).toBeGreaterThan(0);
    for (const t of r.titles) {
      expect(t.length).toBeGreaterThanOrEqual(30);
      expect(t.length).toBeLessThanOrEqual(60);
      expect(t.toLocaleLowerCase("tr")).toContain("mimarlık web tasarımı");
    }
    for (const d of r.descriptions) {
      expect(d.length).toBeGreaterThanOrEqual(110);
      expect(d.length).toBeLessThanOrEqual(160);
      expect(d).not.toMatch(/\d/);
    }
  });

  it("giriş ve SSS: sayfanın kendi cümlelerinden yeniden yapılandırılır (yeni olgu yok)", async () => {
    const p = await page();
    const src = text(p);
    const ctx = { path: p.path, h1: p.h1 ?? p.name, query: p.primaryKeyword, intent: "COMMERCIAL", existingFaq: [], text: src };
    const { intro } = await engineIntro(ctx);
    const words = intro.split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(20);
    expect(words).toBeLessThanOrEqual(120);
    for (const s of sentencesOf(intro)) expect(sentencesOf(src)).toContain(s); // her cümle sayfada zaten var
    const { faq } = await engineFaq(ctx);
    expect(faq.length).toBeGreaterThanOrEqual(2);
    const all = sentencesOf(extractMarkdown(p.body).text).join(" ");
    for (const f of faq) {
      expect(f.q.endsWith("?")).toBe(true);
      for (const s of sentencesOf(f.a)) expect(all).toContain(s);
      expect(f.a).not.toMatch(/\d/);
    }
  });

  it("eksik bölüm: ilgili gerçek sayfalara bağlanan bölüm; kalite kapısını geçer", async () => {
    const p = await page();
    const pub = await published();
    const md = extractMarkdown(p.body);
    const links = [...pub].map((x) => ({ path: x, title: x }));
    const r = await engineSection({ path: p.path, query: p.primaryKeyword, h1: p.h1 ?? p.name, headings: md.headings.map((h) => h.text), body: p.body ?? "", gaps: [], links });
    const hrefs = extractMarkdown(r.markdown).links.map((l) => l.href);
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const h of hrefs) expect(pub.has(h)).toBe(true); // yalnızca yayındaki sayfalara
    const before = text(p).split(/\s+/).length;
    const added = `${r.heading} ${r.markdown}`.split(/\s+/).length;
    const qc = checkSection(`## ${r.heading}\n\n${r.markdown}`, { query: p.primaryKeyword, sourceText: text(p), beforeWords: before, addedWords: added, places: await places() });
    expect(qc.problems).toEqual([]);
  });

  it("yeni sayfa: yeterli gerçek içerik varsa birden çok sayfadan yapılandırılır; yoksa 'bilgi yok' (uydurmaz)", async () => {
    const pub = await published();
    const r = await enginePage({ kind: "BLOG_POST", primary: "kurumsal web sitesi", queries: ["kurumsal web sitesi"], intent: "INFORMATIONAL", siteName: "Web Tasarım Ajansı", facts: [], links: [], existingTitles: [] });
    expect(r.h1.toLocaleLowerCase("tr")).toContain("kurumsal web sitesi");
    const md = extractMarkdown(r.body);
    expect(md.headings.filter((h) => h.depth === 2).length).toBeGreaterThanOrEqual(4);
    const hrefs = md.links.map((l) => l.href);
    expect(new Set(hrefs.filter((h) => h !== "/teklif-al")).size).toBeGreaterThanOrEqual(2);
    for (const h of hrefs) expect(pub.has(h), h).toBe(true);
    expect(`${r.intro} ${r.body}`).not.toMatch(/\d/);
    expect(r.verifyNotes).toEqual([]);
    await expect(enginePage({ kind: "BLOG_POST", primary: "kuantum bilgisayar soğutma", queries: [], intent: "INFORMATIONAL", siteName: "x", facts: [], links: [], existingTitles: [] })).rejects.toBeInstanceOf(EngineNoData);
    await expect(enginePage({ kind: "LOCATION", primary: "web tasarım sakarya", queries: [], intent: "LOCAL", siteName: "x", facts: [], links: [], existingTitles: [] })).rejects.toThrow(/Bilgi yok/);
  });
});

describe("tam otomatik: Autopilot AÇIK + AUTONOMOUS → onay beklemeden; KAPALI → 48 saat", () => {
  it("içerik önerisi motorla hazırlanır ve hemen uygulanır; geri alınabilir", async () => {
    await saveSetting("autopilot", {});
    const T = new Date();
    clock.now = () => T;
    const p = await page();
    const r = await createProposal({ key: `CONTENT:engine-test:${Math.random()}`, type: "CONTENT", risk: "CONTROLLED", category: "CONTENT", source: "engine-test", title: "motor içerik testi", reason: "ince içerik", score: 40, pageId: p.id, allowAuto: true }, { model: "x", windowHours: 48 });
    expect(r.status, r.note).toBe("pending_approval");
    const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    expect(a.autoApply, `${a.qualityNotes} | risk ${a.riskLevel}`).toBe(true);
    expect(a.expiresAt!.getTime()).toBe(T.getTime()); // pencere yok
    expect(a.qualityNotes).toMatch(/Tam otomatik/);
    expect((a.proposal as { generation: { provider: string } }).generation.provider).toBe("content-engine");
    const s = await runAutoApply({ now: T, fetchImpl: null });
    expect(s.applied).toBe(1);
    const after = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    expect(after.status).toBe("applied");
    expect((await page()).body!.length).toBeGreaterThan((p.body ?? "").length);
    await rollbackProposal(AUTOPILOT_USER, r.id!);
    expect((await page()).body).toBe(p.body);
    // Aynı öneri tekrar üretilmez / uygulanmaz
    expect((await applyProposal(r.id!, { via: "manual", user: admin, fetchImpl: null })).status).not.toBe("applied");
  });

  it("Autopilot KAPALI: aynı öneri 48 saatlik pencereyle bekler ve otomatik uygulanmaz", async () => {
    await saveSetting("autopilot", { enabled: false });
    try {
      const T = new Date();
      clock.now = () => T;
      const p = await page();
      const r = await createProposal({ key: `CONTENT:engine-test-off:${Math.random()}`, type: "CONTENT", risk: "CONTROLLED", category: "CONTENT", source: "engine-test", title: "motor içerik testi (kapalı)", reason: "ince içerik", score: 40, pageId: p.id, allowAuto: false, noAutoReason: "Autopilot kapalı" }, { model: "x", windowHours: 48 });
      expect(r.status, r.note).toBe("pending_approval");
      const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
      expect(a.expiresAt!.getTime() - T.getTime()).toBe(48 * H);
      expect((await runAutoApply({ now: new Date(T.getTime() + 49 * H), fetchImpl: null })).applied).toBe(0);
    } finally {
      await saveSetting("autopilot", {});
    }
  });
});

describe("merkezi temizlik (5 gün)", () => {
  const old = new Date(Date.now() - 8 * DAY);
  const older = new Date(Date.now() - 9 * DAY);
  let tmp = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "wta-cleanup-"));
    // Tarama: iki eski çalıştırma (en son değil)
    ids.crawlOld = (await db.crawlRun.create({ data: { baseUrl: "x", status: "ok", startedAt: older, finishedAt: older } })).id;
    ids.crawlRunning = (await db.crawlRun.create({ data: { baseUrl: "x", status: "running", startedAt: older } })).id;
    await db.crawlRun.create({ data: { baseUrl: "x", status: "ok", startedAt: new Date(), finishedAt: new Date() } });
    // İş kayıtları: aynı türün eski kaydı silinir, türün son kaydı ve çalışan iş korunur
    ids.jobOld = (await db.jobRun.create({ data: { kind: "test-cleanup-kind", status: "ok", startedAt: older, finishedAt: older } })).id;
    ids.jobLatest = (await db.jobRun.create({ data: { kind: "test-cleanup-kind", status: "ok", startedAt: old, finishedAt: old } })).id;
    ids.jobRunning = (await db.jobRun.create({ data: { kind: "test-cleanup-running", status: "running", startedAt: older } })).id;
    // Otopilot çalıştırmaları: boş eski silinir; haftanın son çalıştırması ve öneri kaydı olan korunur
    ids.runEmpty = (await db.autopilotRun.create({ data: { weekKey: "TEST-CLEAN", status: "ok", startedAt: older } })).id;
    ids.runWeekLatest = (await db.autopilotRun.create({ data: { weekKey: "TEST-CLEAN", status: "ok", startedAt: old } })).id;
    ids.runWithAction = (await db.autopilotRun.create({ data: { weekKey: "TEST-CLEAN-2", status: "ok", startedAt: older } })).id;
    await db.autopilotRun.create({ data: { weekKey: "TEST-CLEAN-2", status: "ok", startedAt: old } });
    await db.autopilotAction.create({ data: { runId: ids.runWithAction, type: "TITLE", risk: "AUTO", status: "applied", score: 1, title: "temizlik testi", reason: "t", source: "engine-test", createdAt: older, proposal: { alternatives: [1], keep: true } } });
    ids.skippedWithAlts = (await db.autopilotAction.create({ data: { type: "TITLE", risk: "AUTO", status: "skipped", score: 1, title: "temizlik testi 2", reason: "t", source: "engine-test", createdAt: older, fingerprint: "TEST-CLEAN-FP", proposal: { alternatives: [1, 2], gate: [1], pagePath: "/x" } } })).id;
    // Rakip snapshot'ları: en eski silinir; değişiklik kaydının işaret ettiği ve en son olan korunur
    const c = await db.competitor.create({ data: { domain: "cleanup-test.example" } });
    ids.snapOld = (await db.competitorSnapshot.create({ data: { competitorId: c.id, status: "ok", createdAt: older } })).id;
    ids.snapRef = (await db.competitorSnapshot.create({ data: { competitorId: c.id, status: "ok", createdAt: older } })).id;
    ids.snapLatest = (await db.competitorSnapshot.create({ data: { competitorId: c.id, status: "ok", createdAt: old } })).id;
    await db.competitorChange.create({ data: { competitorId: c.id, snapshotId: ids.snapRef, kind: "NEW_PAGE", url: "https://cleanup-test.example/a" } });
    // Geçici dosyalar
    for (const f of ["eski.json", "yeni.json", "kilitli.json", "kilitli.json.lock"]) await writeFile(path.join(tmp, f), "{}");
    for (const f of ["eski.json", "kilitli.json"]) await utimes(path.join(tmp, f), older, older);
  });

  afterAll(async () => {
    await db.crawlRun.deleteMany({ where: { baseUrl: "x" } });
    await db.jobRun.deleteMany({ where: { kind: { in: ["test-cleanup-kind", "test-cleanup-running"] } } });
    await db.autopilotAction.deleteMany({ where: { source: "engine-test" } });
    await db.autopilotRun.deleteMany({ where: { weekKey: { in: ["TEST-CLEAN", "TEST-CLEAN-2"] } } });
    await db.competitor.deleteMany({ where: { domain: "cleanup-test.example" } });
    await rm(tmp, { recursive: true, force: true });
  });

  it("yalnızca eski ve referans edilmeyen geçici veriyi siler; korunanlara dokunmaz; idempotent", async () => {
    const [versions, audits, changes] = await Promise.all([db.pageVersion.count(), db.auditLog.count(), db.seoChangeLog.count()]);
    const s = await runCleanup({ tmpDir: tmp });
    expect(s.errors, JSON.stringify(s.steps)).toBe(0);
    const exists = async (m: "crawlRun" | "jobRun" | "autopilotRun" | "competitorSnapshot", id: string) => Boolean(await (db[m] as unknown as { findUnique: (a: object) => Promise<unknown> }).findUnique({ where: { id } }));
    expect(await exists("crawlRun", ids.crawlOld)).toBe(false);
    expect(await exists("crawlRun", ids.crawlRunning)).toBe(true); // çalışan tarama
    expect(await exists("jobRun", ids.jobOld)).toBe(false);
    expect(await exists("jobRun", ids.jobLatest)).toBe(true); // türün son kaydı (zamanlayıcı okur)
    expect(await exists("jobRun", ids.jobRunning)).toBe(true); // çalışan iş
    expect(await exists("autopilotRun", ids.runEmpty)).toBe(false);
    expect(await exists("autopilotRun", ids.runWeekLatest)).toBe(true);
    expect(await exists("autopilotRun", ids.runWithAction)).toBe(true); // öneri kaydı var
    expect(await exists("competitorSnapshot", ids.snapOld)).toBe(false);
    expect(await exists("competitorSnapshot", ids.snapRef)).toBe(true);
    expect(await exists("competitorSnapshot", ids.snapLatest)).toBe(true);
    // Ara çıktı temizlenir, öneri kaydı ve parmak izi kalır (mükerrer önleme); uygulanmış öneriye dokunulmaz
    const sk = await db.autopilotAction.findUniqueOrThrow({ where: { id: ids.skippedWithAlts } });
    expect(sk.fingerprint).toBe("TEST-CLEAN-FP");
    expect(sk.proposal).toEqual({ pagePath: "/x" });
    const ap = await db.autopilotAction.findFirstOrThrow({ where: { runId: ids.runWithAction } });
    expect(ap.proposal).toEqual({ alternatives: [1], keep: true });
    // Dosyalar: eski silinir; yeni ve kilitli (çalışan iş) kalır
    expect((await readdir(tmp)).sort()).toEqual(["kilitli.json", "kilitli.json.lock", "yeni.json"]);
    // Geçmiş/denetim/değişiklik kayıtları korunur
    expect(await db.pageVersion.count()).toBe(versions);
    expect(await db.auditLog.count()).toBe(audits);
    expect(await db.seoChangeLog.count()).toBe(changes);
    // İdempotent: ikinci çalıştırma silinecek bir şey bulmaz
    const again = await runCleanup({ tmpDir: tmp });
    expect(again.total, JSON.stringify(again.steps)).toBe(0);
  });

  it("zamanlayıcı temizliği gece hattından sonra günde bir planlar", async () => {
    await db.jobRun.deleteMany({ where: { kind: "cleanup" } });
    // İstanbul 05:00 = 02:00 UTC
    expect(await dueJobs(new Date("2026-10-01T02:00:00Z"))).toContain("cleanup");
    await db.jobRun.create({ data: { kind: "cleanup", status: "ok", startedAt: new Date("2026-10-01T02:00:00Z"), finishedAt: new Date("2026-10-01T02:01:00Z") } });
    expect(await dueJobs(new Date("2026-10-01T10:00:00Z"))).not.toContain("cleanup");
    await db.jobRun.deleteMany({ where: { kind: "cleanup" } });
  });
});
