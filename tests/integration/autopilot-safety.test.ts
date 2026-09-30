// OTOPİLOT GÜVENLİK DÜZELTMELERİ (2026-09-30 production olayı):
//  1) Yanlış title koruması: sayfanın gerçek konusuyla uyumsuz ifade title olamaz (motor ve yürütücü)
//  2) Kritik analiz aşaması hatası: hiçbir öneri/değişiklik yok; cycle hata olarak biter, yeniden denenmez
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { db } from "@/lib/db";
import { deleteSecret, saveSetting, setSecret } from "@/lib/settings";
import { GSC_SECRET } from "@/lib/gsc/sync";
import { titleTopicProblem } from "@/lib/autopilot/qc";
import { createProposal } from "@/lib/proposals/lifecycle";
import { runAutopilot, criticalFailure } from "@/lib/autopilot/run";
import { cycleHooks, runAutopilotCycle } from "@/lib/autopilot/cycle";
import { dueJobs } from "@/lib/autopilot/scheduler";
import { enqueueJob, processQueue } from "@/lib/jobs/runner";
import "@/lib/jobs/registry";

const runIds: string[] = [];

afterEach(() => {
  cycleHooks.defaults = undefined;
  cycleHooks.beforeStep = undefined;
});

afterAll(async () => {
  await db.autopilotAction.deleteMany({ where: { source: "safety-test" } });
  await db.autopilotRun.deleteMany({ where: { id: { in: runIds } } });
  await deleteSecret(GSC_SECRET);
  await saveSetting("integrations", {});
  await saveSetting("autopilot", {});
  await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
});

describe("1) yanlış title koruması", () => {
  const pg = (path: string, h1: string, primaryKeyword: string | null = null) => ({ path, h1, name: h1, primaryKeyword });

  it("production'da uygulanan konu dışı title'lar reddedilir", () => {
    const bad: [ReturnType<typeof pg>, string][] = [
      [pg("/restoran-web-tasarimi", "Restoran Web Tasarımı", "restoran web tasarımı"), "web sitesi fiyatları"],
      [pg("/google-ads-yonetimi", "Google Ads Yönetimi", "google ads yönetimi"), "web tasarım hizmeti"],
      [pg("/web-tasarim", "Web Tasarım", "web tasarım"), "e-ticaret sitesi yaptırma"],
      [pg("/blog/e-ticaret-sitesi-nasil-kurulur", "E-Ticaret Sitesi Nasıl Kurulur?"), "web tasarım şirketi"],
      [pg("/insaat-firmasi-web-tasarimi", "İnşaat Firması Web Tasarımı", "inşaat firması web tasarımı"), "kurumsal web sitesi firması"],
      [pg("/blog/kurumsal-web-sitesi-neden-onemlidir", "Kurumsal Web Sitesi Neden Önemlidir?"), "profesyonel web sitesi"],
      [pg("/blog/web-sitesi-yaptirirken-nelere-dikkat-edilmeli", "Web Sitesi Yaptırırken Nelere Dikkat Edilmeli?"), "kişisel web sitesi hizmeti"],
    ];
    for (const [p, phrase] of bad) expect(titleTopicProblem(p, phrase), `${p.path} ← ${phrase}`).toMatch(/Konu uyumsuz/);
  });

  it("sayfanın kendi konusundaki ifadeler engellenmez", () => {
    expect(titleTopicProblem(pg("/e-ticaret-web-tasarim", "E-Ticaret Web Tasarım", "e-ticaret web tasarım"), "e-ticaret tasarımı")).toBeNull();
    expect(titleTopicProblem(pg("/kurumsal-web-tasarim", "Kurumsal Web Tasarım", "kurumsal web tasarım"), "kurumsal web sitesi hizmeti")).toBeNull();
    expect(titleTopicProblem(pg("/web-tasarim-fiyatlari", "Web Tasarım Fiyatları", "web tasarım fiyatları"), "profesyonel web sitesi fiyatları")).toBeNull();
    expect(titleTopicProblem(pg("/restoran-web-tasarimi", "Restoran Web Tasarımı", "restoran web tasarımı"), "restoran web sitesi")).toBeNull();
    expect(titleTopicProblem(pg("/dis-klinigi-web-tasarimi", "Diş Kliniği Web Tasarımı", "diş kliniği web tasarımı"), "diş kliniği web tasarımı")).toBeNull();
  });

  it("title yürütücüsü (tüm kaynaklar) konu dışı sorguyu gerçek sayfada uygulamaz", async () => {
    const page = await db.page.findUniqueOrThrow({ where: { path: "/restoran-web-tasarimi" } });
    const r = await createProposal({ key: `TITLE:safety:${Math.random()}`, type: "TITLE", risk: "AUTO", source: "safety-test", title: "konu dışı title testi", reason: "t", score: 50, pageId: page.id, query: "web sitesi fiyatları", allowAuto: true }, { model: "x", windowHours: 48 });
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/Konu uyumsuz/);
    const after = await db.page.findUniqueOrThrow({ where: { id: page.id } });
    expect(after.seoTitle).toBe(page.seoTitle);
    expect(after.updatedAt.getTime()).toBe(page.updatedAt.getTime());
  });
});

describe("2) kritik analiz aşaması hatası", () => {
  beforeAll(async () => {
    // Search Console "bağlı" ama API hata veriyor (production'daki hatalı mülk gibi)
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await setSecret(GSC_SECRET, JSON.stringify({ type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
    await saveSetting("integrations", { gscProperty: "http://web tasarım ajansı net" });
    await saveSetting("autopilot", {}); // AUTONOMOUS + tam otomatik: yine de hiçbir şey uygulanmamalı
  });

  it("criticalFailure yalnızca kritik aşamalarda hata sayar", () => {
    const s = (n: number, status: "ok" | "error" | "skipped") => ({ n, name: `a${n}`, status, message: "m", ms: 0 });
    expect(criticalFailure([s(1, "error")])).toMatch(/a1/);
    expect(criticalFailure([s(18, "error"), s(1, "ok"), s(6, "skipped")])).toBeNull();
  });

  it("GSC senkronu hata verirse 23 aşamalı çalıştırma hiçbir öneri oluşturmaz ve hiçbir şey uygulamaz", async () => {
    const fail400 = (async () => new Response(JSON.stringify({ error: { code: 400, message: "not a valid Search Console site URL" } }), { status: 400, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    // İçerik alanları (analiz aşaması yalnızca skor günceller; contentUpdatedAt yalnızca içerik değişince değişir)
    const snap = async () => (await db.page.findMany({ select: { id: true, contentUpdatedAt: true, seoTitle: true, metaDescription: true, h1: true, body: true, primaryKeyword: true, relatedLinks: true } })).map((p) => JSON.stringify(p)).sort();
    const before = await snap();
    const r = await runAutopilot({ trigger: "test", fetchImpl: fail400, crawlFetch: null, skipStages: [6], sendEmail: false });
    runIds.push(r.id);
    expect(r.stages.find((s) => s.n === 1)?.status).toBe("error");
    expect(r.critical).toBeTruthy();
    for (const n of [13, 16]) {
      const st = r.stages.find((s) => s.n === n)!;
      expect(st.status).toBe("skipped");
      expect(st.message).toMatch(/Kritik analiz aşaması hatalı/);
    }
    expect(await db.autopilotAction.count({ where: { runId: r.id } })).toBe(0);
    expect(r.exec).toEqual({});
    expect(await snap()).toEqual(before);
  });

  it("cycle: analiz tamamlanamazsa sonraki öneri/uygulama adımları atlanır, iş hata olarak biter, yeniden denenmez; sonraki cycle planlanır", async () => {
    cycleHooks.defaults = { skipAgentRun: true, autoApplyFetch: null };
    cycleHooks.beforeStep = (name) => { if (name.startsWith("Site, Search Console")) throw new Error("test: kritik analiz hatası"); };
    await db.jobRun.deleteMany({ where: { status: { in: ["queued", "running"] } } });
    const actionsBefore = await db.autopilotAction.count();
    // Doğrudan: adımlar atlanır
    const s = await runAutopilotCycle({ skipAgentRun: true, autoApplyFetch: null });
    for (const name of ["Rakip fırsatları", "Fırsat motoru (seed + rakip + GSC)", "İçerik ve eksik alan taraması", "48 saat otomatik uygulama"]) {
      const st = s.steps.find((x) => x.name === name)!;
      expect(st.status, name).toBe("skipped");
      expect(st.message).toMatch(/Kritik analiz aşaması hatalı/);
    }
    expect(s.errors).toBeGreaterThan(0);
    expect(await db.autopilotAction.count()).toBe(actionsBefore);
    // Kuyruktan: hata olarak biter, yeniden kuyruğa girmez
    await db.jobRun.deleteMany({ where: { kind: "autopilot-cycle" } });
    await enqueueJob("autopilot-cycle", "zamanlayıcı");
    const [r] = await processQueue({ maxJobs: 1 });
    expect(r.status).toBe("error");
    expect(r.retryAt).toBeUndefined();
    expect(await db.jobRun.count({ where: { kind: "autopilot-cycle", status: "queued" } })).toBe(0);
    expect(await db.autopilotAction.count()).toBe(actionsBefore);
    // Sonraki cycle: aralık dolunca zamanlayıcı normal şekilde planlar
    const last = await db.jobRun.findFirstOrThrow({ where: { kind: "autopilot-cycle" }, orderBy: { startedAt: "desc" } });
    expect(await dueJobs(new Date(last.startedAt.getTime() + 60_000))).not.toContain("autopilot-cycle");
    expect(await dueJobs(new Date(last.startedAt.getTime() + 6 * 3600_000))).toContain("autopilot-cycle");
  });
});
