// 48 saatlik onay yaşam döngüsü: öneri → onay/ret → süre dolumu → zamanlayıcı → worker →
// otomatik uygulama → sürüm + denetim logu → geri alma. 48 saat beklenmez: test saati
// (`clock.now`) ileri alınır. Tüm yazmalar TEST veritabanında.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { applyProposal, clock, createProposal, duplicateReason, rejectProposal, rollbackProposal, runAutoApply } from "@/lib/proposals/lifecycle";
import { autoApplyBlocker, riskLevelFor } from "@/lib/proposals/policy";
import { aiHooks } from "@/lib/autopilot/execute";
import { dueJobs } from "@/lib/autopilot/scheduler";
import { enqueueJob, processQueue } from "@/lib/jobs/runner";
import type { SessionUser } from "@/lib/auth/session";

const H = 3600_000;
const T0 = new Date("2026-10-01T09:00:00Z");
const PATH = "/restoran-web-tasarimi";
const realNow = clock.now;
const realHooks = { ...aiHooks };
let admin: SessionUser;
let original: string | null;
const NEW_META = "Restoranlar için menü, rezervasyon ve konum bilgisini hızlıca bulunur kılan web tasarımı; mobilde okunaklı sayfalar ve teklif formu.";

async function page() {
  return db.page.findUniqueOrThrow({ where: { path: PATH } });
}

/** Hazırlanmış (somut değişiklikli) bekleyen öneri. */
async function pending(o: { risk?: string; riskLevel?: string; autoApply?: boolean; createdAt?: Date; after?: string; title?: string } = {}) {
  const p = await page();
  const createdAt = o.createdAt ?? T0;
  return db.autopilotAction.create({
    data: {
      type: "META", risk: o.risk ?? "AUTO", status: "pending_approval", score: 40, title: o.title ?? `meta testi ${Math.random().toString(36).slice(2, 7)}`, reason: "test",
      pageId: p.id, category: "SEO", source: "test", riskLevel: o.riskLevel ?? "LOW", autoApply: o.autoApply ?? true, createdAt,
      expiresAt: new Date(createdAt.getTime() + 48 * H), fingerprint: `TEST:${Math.random()}`,
      proposedChanges: { pages: [{ pageId: p.id, path: p.path, changes: [{ field: "metaDescription", before: p.metaDescription, after: o.after ?? NEW_META }] }] },
    },
  });
}

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "proposals@example.com" }, create: { email: "proposals@example.com", name: "Öneri Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await saveSetting("autopilot", { instantApply: false });
  original = (await page()).metaDescription;
  aiHooks.available = () => false;
});

afterEach(async () => {
  clock.now = realNow;
  // Her senaryodan sonra sayfa orijinal hâline döner (sonraki senaryonun "before"u doğru olsun)
  const p = await page();
  if (p.metaDescription !== original) await db.page.update({ where: { id: p.id }, data: { metaDescription: original } });
  await db.autopilotAction.deleteMany({ where: { source: "test" } });
});

afterAll(async () => {
  Object.assign(aiHooks, realHooks);
  await db.autopilotAction.deleteMany({ where: { OR: [{ source: "test" }, { fingerprint: { startsWith: "INTERNAL_LINK:test" } }] } });
  await db.jobRun.deleteMany({ where: { kind: "auto-apply-proposals" } });
});

describe("politika", () => {
  it("URL/canonical/index değişikliği kritik risktir ve asla otomatik uygulanmaz", () => {
    const ch = (field: string) => ({ pages: [{ pageId: "x", path: "/x", changes: [{ field, before: "a", after: "b" }] }] });
    expect(riskLevelFor("AUTO", ch("canonical"))).toBe("CRITICAL");
    expect(riskLevelFor("AUTO", ch("robotsIndex"))).toBe("CRITICAL");
    expect(riskLevelFor("AUTO", ch("path"))).toBe("CRITICAL");
    expect(riskLevelFor("AUTO", ch("status"), "META")).toBe("HIGH");
    expect(riskLevelFor("AUTO", ch("seoTitle"))).toBe("LOW");
    expect(autoApplyBlocker({ type: "META", riskLevel: "HIGH", proposedChanges: ch("metaDescription") })).toMatch(/insan onayı/);
    expect(autoApplyBlocker({ type: "META", riskLevel: "LOW", proposedChanges: ch("canonical") })).toMatch(/otomatik değiştirilemez/);
    expect(autoApplyBlocker({ type: "TECH", riskLevel: "LOW", proposedChanges: ch("metaDescription") })).toMatch(/otomatik uygulanmaz/);
    expect(autoApplyBlocker({ type: "META", riskLevel: "LOW", proposedChanges: { pages: [] } })).toMatch(/somut değişiklik yok/);
  });
});

describe("48 saatlik yaşam döngüsü", () => {
  it("A: onay bekleyen öneri kullanıcı onaylayınca hemen uygulanır", async () => {
    const a = await pending();
    clock.now = () => new Date(T0.getTime() + 1 * H); // süre dolmadan
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status, r.note).toBe("applied");
    expect((await page()).metaDescription).toBe(NEW_META);
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.appliedVia).toBe("manual");
    expect(row.decidedBy).toBe(admin.name);
  });

  it("B: reddedilen öneri uygulanmaz, sonradan uygulanamaz", async () => {
    const a = await pending();
    await rejectProposal(admin, a.id);
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("rejected");
    expect(row.rejectedAt).toBeTruthy();
    clock.now = () => new Date(T0.getTime() + 49 * H);
    expect((await runAutoApply({ fetchImpl: null })).applied).toBe(0);
    expect((await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null })).status).toBe("skipped");
    expect((await page()).metaDescription).toBe(original);
  });

  it("C + G: süresi dolan düşük riskli öneri zamanlayıcı → kuyruk → worker ile otomatik uygulanır; sürüm, denetim logu, appliedAt", async () => {
    const a = await pending();
    const versions = await db.pageVersion.count({ where: { pageId: a.pageId! } });
    // 47 saat: henüz süre dolmadı
    clock.now = () => new Date(T0.getTime() + 47 * H);
    expect((await runAutoApply({ fetchImpl: null })).applied).toBe(0);
    expect((await page()).metaDescription).toBe(original);
    // 48 saat + 1 dk: zamanlayıcı işi kuyruğa koyar, worker çalıştırır
    const later = new Date(T0.getTime() + 48 * H + 60_000);
    clock.now = () => later;
    await db.jobRun.deleteMany({ where: { kind: "auto-apply-proposals" } });
    expect(await dueJobs(later)).toContain("auto-apply-proposals");
    await enqueueJob("auto-apply-proposals", "zamanlayıcı");
    const done = await processQueue({ now: () => later });
    const job = done.find((d) => d.kind === "auto-apply-proposals");
    expect(job?.status, job?.message).toBe("ok");
    expect(job?.message).toMatch(/uygulanan 1/);
    // G: gerçek değişiklik + kayıtlar
    expect((await page()).metaDescription).toBe(NEW_META);
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("applied");
    expect(row.appliedVia).toBe("auto_48h");
    expect(row.appliedAt?.getTime()).toBe(later.getTime());
    expect(row.rollbackAvailable).toBe(true);
    expect(row.versionAfterId).toBeTruthy();
    expect(await db.pageVersion.count({ where: { pageId: a.pageId! } })).toBeGreaterThan(versions);
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "proposal.auto_apply" } })).toBe(1);
    const steps = (row.validation as { step: string; status: string }[]).map((s) => `${s.step}:${s.status}`);
    expect(steps).toEqual(["validation:ok", "snapshot:ok", "apply:ok", "test:ok", "seo:ok", "crawl:not_verifiable", "rollback_point:ok"]);
    expect(await db.seoChangeLog.count({ where: { pageId: a.pageId!, field: "Meta description", after: NEW_META } })).toBeGreaterThan(0);
  });

  it("D: süresi dolmuş yüksek riskli öneri otomatik uygulanmaz (autoApply işareti bozulmuş olsa bile)", async () => {
    const human = await pending({ risk: "HUMAN", riskLevel: "HIGH", autoApply: false });
    const tampered = await pending({ risk: "HUMAN", riskLevel: "HIGH", autoApply: true });
    clock.now = () => new Date(T0.getTime() + 72 * H);
    const s = await runAutoApply({ fetchImpl: null });
    expect(s.applied).toBe(0);
    expect(s.expiredManual).toBeGreaterThanOrEqual(1);
    for (const id of [human.id, tampered.id]) expect((await db.autopilotAction.findUniqueOrThrow({ where: { id } })).status).toBe("pending_approval");
    expect((await applyProposal(tampered.id, { via: "auto_48h", fetchImpl: null })).status).toBe("skipped");
    expect((await page()).metaDescription).toBe(original);
  });

  it("E: aynı öneriyi iki süreç aynı anda görse de yalnızca bir kez uygulanır", async () => {
    const a = await pending();
    const versions = await db.pageVersion.count({ where: { pageId: a.pageId! } });
    clock.now = () => new Date(T0.getTime() + 49 * H);
    const [s1, s2] = await Promise.all([runAutoApply({ fetchImpl: null }), runAutoApply({ fetchImpl: null })]);
    expect(s1.applied + s2.applied).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "proposal.auto_apply" } })).toBe(1);
    // savePage: en çok bir temel sürüm + bir yeni sürüm
    expect(await db.pageVersion.count({ where: { pageId: a.pageId! } })).toBeLessThanOrEqual(versions + 2);
    expect((await applyProposal(a.id, { via: "auto_48h", fetchImpl: null })).status).toBe("skipped");
  });

  it("F: otomatik uygulamada hata → geri alınır, yeniden denenir; 3. denemede FAILED; içerik bozulmaz", async () => {
    const a = await pending();
    const broken = (async () => new Response("Sunucu hatası", { status: 500, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    let t = T0.getTime() + 49 * H;
    for (let attempt = 1; attempt <= 3; attempt++) {
      clock.now = () => new Date(t);
      const s = await runAutoApply({ fetchImpl: broken });
      expect(s.due, `deneme ${attempt}`).toBe(1);
      expect((await page()).metaDescription, `deneme ${attempt}: içerik geri alınmalı`).toBe(original);
      const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.attempts).toBe(attempt);
      if (attempt < 3) {
        expect(row.status).toBe("pending_approval");
        expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(t);
        // Yeniden deneme zamanı gelmeden tekrar denenmez
        expect((await runAutoApply({ fetchImpl: broken, now: new Date(t + 60_000) })).due).toBe(0);
        t = row.nextAttemptAt!.getTime() + 1000;
      } else {
        expect(row.status).toBe("failed");
        expect(row.error).toMatch(/Tarama kontrolü.*HTTP 500/);
        expect(row.rollbackAvailable).toBe(false);
        const steps = (row.validation as { step: string; status: string }[]).map((s) => `${s.step}:${s.status}`);
        expect(steps).toContain("auto_rollback:ok");
      }
    }
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "proposal.apply.retry" } })).toBe(2);
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "proposal.apply.fail" } })).toBe(1);
  });

  it("H: geri alma önceki içeriği getirir; elle değiştirilmiş alanın üzerine yazmaz", async () => {
    const a = await pending();
    expect((await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null })).status).toBe("applied");
    expect((await page()).metaDescription).toBe(NEW_META);
    await rollbackProposal(admin, a.id);
    expect((await page()).metaDescription).toBe(original);
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("rolled_back");
    expect(row.rollbackAvailable).toBe(false);
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "proposal.rollback" } })).toBe(1);
    await expect(rollbackProposal(admin, a.id)).rejects.toThrow();
    // Elle değişiklik sonrası geri alma reddedilir
    const b = await pending();
    await applyProposal(b.id, { via: "manual", user: admin, fetchImpl: null });
    await db.page.update({ where: { id: b.pageId! }, data: { metaDescription: "Editörün sonradan elle yazdığı açıklama." } });
    await expect(rollbackProposal(admin, b.id)).rejects.toThrow(/elle değiştirilmiş/);
  });

  it("öneri hazırlandıktan sonra sayfa değiştiyse uygulanmaz (eskimiş öneri)", async () => {
    const a = await pending();
    await db.page.update({ where: { id: a.pageId! }, data: { metaDescription: "Arada elle değiştirildi." } });
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status).toBe("failed");
    expect(r.note).toMatch(/hazırlandıktan sonra değişti/);
    expect((await page()).metaDescription).toBe("Arada elle değiştirildi.");
  });

  it("[DOĞRULANMALI] içeren öneri uygulanmaz", async () => {
    const a = await pending({ after: "[DOĞRULANMALI: gerçek açıklama] restoran sitesi" });
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status).toBe("failed");
    expect((await page()).metaDescription).toBe(original);
  });
});

describe("oluşturma: hazırlık + mükerrer koruma", () => {
  it("iç link önerisi somut değişiklikle hazırlanır, 48 saat penceresi alır; aynı öneri ikinci kez üretilmez", async () => {
    clock.now = () => T0;
    const src = await db.page.findUniqueOrThrow({ where: { path: "/hukuk-burosu-web-tasarimi" } });
    const key = `INTERNAL_LINK:test:${src.path}->/seo-hizmeti`;
    const input = { key, type: "INTERNAL_LINK", risk: "AUTO" as const, title: "hukuk → seo", reason: "test", score: 30, pageId: src.id, proposal: { payload: { source: src.path, target: "/seo-hizmeti", anchor: "" } }, allowAuto: true };
    const r = await createProposal(input, { model: "x", windowHours: 48 });
    expect(r.status, r.note).toBe("pending_approval");
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.expiresAt!.getTime() - row.createdAt.getTime()).toBe(48 * H);
    expect(row.autoApply).toBe(true);
    expect(row.riskLevel).toBe("LOW");
    const ch = (row.proposedChanges as { pages: { changes: { field: string; after: { path: string }[] }[] }[] }).pages[0].changes[0];
    expect(ch.field).toBe("relatedLinks");
    expect(ch.after.some((l) => l.path === "/seo-hizmeti")).toBe(true);
    // Hazırlık sayfaya dokunmaz
    expect((await db.page.findUniqueOrThrow({ where: { id: src.id } })).relatedLinks).toEqual(src.relatedLinks);
    const again = await createProposal(input, { model: "x", windowHours: 48 });
    expect(again.duplicate).toBe(true);
    expect(await duplicateReason(key, T0)).toBeTruthy();
    await db.autopilotAction.deleteMany({ where: { id: r.id! } });
  });

  it("yapay zekâ yokken içerik önerisi 'blocked' olur: düğme/geri sayım yok, sayfa değişmez", async () => {
    clock.now = () => T0;
    const p = await db.page.findUniqueOrThrow({ where: { path: "/google-ads-yonetimi" } });
    const r = await createProposal({ key: `CONTENT:test:${p.id}`, type: "CONTENT", risk: "CONTROLLED", source: "test", title: "içerik", reason: "ince içerik", score: 30, pageId: p.id, allowAuto: true }, { model: "x", windowHours: 48 });
    expect(r.status).toBe("blocked");
    expect(r.note).toMatch(/Yapay zekâ anahtarı yok/);
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.expiresAt).toBeNull();
    expect(row.autoApply).toBe(false);
    await db.autopilotAction.update({ where: { id: r.id! }, data: { source: "test" } });
  });
});
