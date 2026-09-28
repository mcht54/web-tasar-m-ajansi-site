// "Uygula" düğmesi gerçekten uygular mı? Onaylanan öneri ya sayfayı değiştirir
// (sürüm + denetim logu) ya da gerçek nedenle hata verir; "onaylandı" deyip hiçbir
// şey yapmamak (eski davranış) yasak.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { AUTOPILOT_USER, aiHooks, applyBlocker, approveAction, rollbackAction } from "@/lib/autopilot/execute";
import { applyFix } from "@/lib/ai/service";
import type { SessionUser } from "@/lib/auth/session";

let admin: SessionUser;
let runId: string;
const realHooks = { ...aiHooks };

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "apply-pipeline@example.com" }, create: { email: "apply-pipeline@example.com", name: "Uygula Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await saveSetting("autopilot", {});
  runId = (await db.autopilotRun.create({ data: { weekKey: "TEST-APPLY", trigger: "test" } })).id;
  aiHooks.available = () => false;
});

afterAll(async () => {
  Object.assign(aiHooks, realHooks);
  await db.autopilotRun.deleteMany({ where: { weekKey: "TEST-APPLY" } });
  await db.aiSuggestion.deleteMany({ where: { createdBy: "apply-pipeline" } });
});

describe("otopilot onayı (Uygula)", () => {
  it("içerik önerisinde uygulanacak metin yoksa onay hata verir, sayfa değişmez, öneri listede kalır", async () => {
    const page = await db.page.findUniqueOrThrow({ where: { path: "/google-ads-yonetimi" } });
    const a = await db.autopilotAction.create({ data: { runId, type: "CONTENT", risk: "CONTROLLED", status: "needs_approval", score: 40, title: "içerik kapsamı", reason: "367 kelime", pageId: page.id, proposal: {} } });
    expect(applyBlocker(a)).toMatch(/uygulanacak içerik yok/);
    await expect(approveAction(admin, a.id, "x")).rejects.toThrow(/uygulanacak içerik yok/);
    const after = await db.page.findUniqueOrThrow({ where: { id: page.id } });
    expect(after.body).toBe(page.body);
    expect(after.updatedAt.getTime()).toBe(page.updatedAt.getTime());
    expect((await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("needs_approval");
  });

  it("iç link önerisi onaylanınca gerçekten uygulanır: DB, sürüm ve denetim logu", async () => {
    const src = await db.page.findUniqueOrThrow({ where: { path: "/otel-web-tasarimi" } });
    const versions = await db.pageVersion.count({ where: { pageId: src.id } });
    const a = await db.autopilotAction.create({ data: { runId, type: "INTERNAL_LINK", risk: "AUTO", status: "needs_approval", score: 40, title: "otel → seo", reason: "test", pageId: src.id, proposal: { payload: { source: src.path, target: "/seo-hizmeti", anchor: "" } } } });
    const r = await approveAction(admin, a.id, "x");
    expect(r.status, r.note).toBe("applied");
    const links = (await db.page.findUniqueOrThrow({ where: { id: src.id } })).relatedLinks as { path: string }[];
    expect(links.some((l) => l.path === "/seo-hizmeti")).toBe(true);
    expect(await db.pageVersion.count({ where: { pageId: src.id } })).toBeGreaterThan(versions);
    const row = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("applied");
    expect(row.versionAfterId).toBeTruthy();
    expect(await db.auditLog.count({ where: { entityId: a.id, action: "autopilot.approve.apply" } })).toBe(1);
    await rollbackAction(AUTOPILOT_USER, a.id);
    const back = (await db.page.findUniqueOrThrow({ where: { id: src.id } })).relatedLinks as { path: string }[] | null;
    expect((back ?? []).some((l) => l.path === "/seo-hizmeti")).toBe(false);
  });

  it("teknik/lokasyon kararları 'onaylandı' diye işaretlenmez; gerçek neden döner", async () => {
    const a = await db.autopilotAction.create({ data: { runId, type: "TECH", risk: "HUMAN", status: "needs_approval", score: 20, title: "cannibal", reason: "test", proposal: {} } });
    await expect(approveAction(admin, a.id, "x")).rejects.toThrow(/otomatik uygulanmaz/);
    expect((await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("needs_approval");
  });
});

describe("AI Asistanı ÇÖZÜM ÖNER → Uygula", () => {
  it("seçilen değerler mevcutla aynıysa 'uygulandı' olmaz; hata döner ve öneri beklemede kalır", async () => {
    const page = await db.page.findUniqueOrThrow({ where: { path: "/ozel-web-yazilim" } });
    const s = await db.aiSuggestion.create({ data: { pageId: page.id, kind: "fix", provider: "kural", createdBy: "apply-pipeline", output: { kind: "fix", data: {}, current: {} } } });
    await expect(applyFix(admin, s.id, { h1: page.h1 ?? page.name })).rejects.toThrow(/Değişiklik oluşmadı/);
    expect((await db.aiSuggestion.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("PENDING");
  });
});
