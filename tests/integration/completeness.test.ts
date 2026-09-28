// Eksik alan taraması: yayındaki sayfalar + son 30 günün taslakları. Taslak DRAFT → DRAFT kalır;
// öneriler mevcut 48 saatlik hattan geçer. Gerçek vaka: /web-tasarim/adana/restoran (taslak,
// ~4 kelime, otomatik NOINDEX). Yazmalar TEST veritabanında.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { createPage, pageInputSchema, savePage, snapshotOf } from "@/lib/admin/pages";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import { analyzeAndStore } from "@/lib/seo/analyzer";
import { aiHooks } from "@/lib/autopilot/execute";
import { AI_REQUIRED } from "@/lib/autopilot/field-exec";
import { applyProposal } from "@/lib/proposals/lifecycle";
import { eligiblePages, findGaps, runCompletenessScan } from "@/lib/content/completeness";
import type { SessionUser } from "@/lib/auth/session";

const PATH = "/web-tasarim/adana/restoran";
const realHooks = { ...aiHooks };
let admin: SessionUser;
let pageId: string;

async function page() {
  return db.page.findUniqueOrThrow({ where: { id: pageId } });
}

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "completeness@example.com" }, create: { email: "completeness@example.com", name: "Eksik Alan Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  // Haftalık değişiklik bütçesi bu dosyadaki ardışık taramalarla dolmasın (bütçe kuralı ayrıca geçerli)
  await saveSetting("autopilot", { maxChangesPerWeek: 50 });
  await db.autopilotAction.deleteMany({ where: { source: "completeness" } });
  await db.page.deleteMany({ where: { path: PATH } });
  // Panelin "sektör + il" oluşturma yolu (createPageAction ile aynı): taslak, sürüm geçmişi "Oluşturuldu"
  const [adana, restoran, root] = await Promise.all([
    db.province.findFirstOrThrow({ where: { slug: "adana" } }),
    db.sector.findFirstOrThrow({ where: { slug: "restoran" } }),
    db.service.findUnique({ where: { slug: "web-tasarim" } }),
  ]);
  const r = await createPage(admin, { path: PATH, type: "SECTOR_LOCATION", name: "Adana Restoran Web Tasarımı", breadcrumbLabel: "Restoran", h1: "Adana Restoran Web Tasarımı", primaryKeyword: "adana restoran web tasarımı", sectorId: restoran.id, provinceId: adana.id, serviceId: root?.id ?? null, districtId: null, category: null });
  if (!r.ok) throw new Error(r.error);
  pageId = r.pageId;
  // Gerçek vakadaki gibi: çok kısa gövde → otomatik NOINDEX
  const cur = snapshotOf((await page()) as unknown as Record<string, unknown>);
  await savePage(admin, pageId, pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), body: "Adana restoran web tasarımı." }));
  await analyzeAndStore(pageId);
});

afterEach(() => {
  Object.assign(aiHooks, realHooks);
});

afterAll(async () => {
  await db.autopilotAction.deleteMany({ where: { source: { in: ["completeness", "test"] } } });
  await db.page.deleteMany({ where: { path: PATH } });
  await saveSetting("autopilot", {});
});

describe("kapsam", () => {
  it("yeni taslak taranır; seed ile gelen (sürüm geçmişi olmayan) boş taslaklar taranmaz", async () => {
    const pages = await eligiblePages();
    expect(pages.some((p) => p.path === PATH)).toBe(true);
    const seedDraft = await db.page.findFirst({ where: { status: "DRAFT", type: "DISTRICT", versions: { none: {} } } });
    expect(seedDraft).toBeTruthy();
    expect(pages.some((p) => p.id === seedDraft!.id)).toBe(false);
    const p = await page();
    expect(p.status).toBe("DRAFT");
    expect(p.autoNoindex).toBe(true); // gerçek vakadaki gibi
    const gaps = (await findGaps()).find((g) => g.pageId === pageId)!;
    expect(gaps.missing.map((m) => m.type)).toEqual(expect.arrayContaining(["META", "INTRO", "FAQ", "SECONDARY_KEYWORDS"]));
    // Şablon başlığı ana kelimeyi zaten içeriyor ve 30–60 karakter: title eksik sayılmaz
    expect(gaps.missing.some((m) => m.type === "TITLE")).toBe(false);
    expect(gaps.missing.some((m) => m.type === "NEW_PAGE")).toBe(false);
  });
});

describe("taslak güvenliği ve öneri hattı", () => {
  it("yapay zekâ yokken giriş/SSS önerisi 'Uygulanamaz — AI anahtarı gerekli'; bilgi yoksa 'Ön koşul eksik'; hiçbiri yayın durumuna dokunmaz", async () => {
    aiHooks.available = () => false;
    const before = await page();
    const s = await runCompletenessScan();
    const mine = await db.autopilotAction.findMany({ where: { source: "completeness", pageId } });
    expect(mine.length).toBeGreaterThan(0);
    const intro = mine.find((a) => a.type === "INTRO")!;
    expect(intro.status).toBe("blocked");
    expect(intro.qualityNotes).toBe(AI_REQUIRED);
    expect(intro.autoApply).toBe(false);
    expect(mine.find((a) => a.type === "SECONDARY_KEYWORDS")?.qualityNotes).toMatch(/Ön koşul eksik: Search Console/);
    expect(mine.some((a) => a.type === "NEW_PAGE")).toBe(false);
    for (const a of mine) {
      const fields = ((a.proposedChanges as { pages?: { changes: { field: string }[] }[] } | null)?.pages ?? []).flatMap((p) => p.changes.map((c) => c.field));
      for (const f of ["status", "robotsIndex", "robotsFollow", "canonical", "path"]) expect(fields).not.toContain(f);
    }
    // Hazırlık sayfaya dokunmaz
    const after = await page();
    expect(after.status).toBe("DRAFT");
    expect(after.body).toBe(before.body);
    expect(s.items.length).toBeGreaterThan(0);
  });

  it("aynı sayfa + aynı alan için en fazla bir açık öneri (tekrar tarama mükerrer üretmez)", async () => {
    aiHooks.available = () => false;
    await runCompletenessScan();
    await runCompletenessScan();
    const open = await db.autopilotAction.findMany({ where: { source: "completeness", status: { in: ["pending_approval", "blocked", "needs_approval", "preparing", "applying"] } }, select: { type: true, pageId: true, fingerprint: true } });
    const keys = open.map((a) => `${a.type}:${a.pageId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("kural tabanlı öneri (ana kelime, H1'den) uygulanır; taslak DRAFT kalır ve NOINDEX açılmaz", async () => {
    aiHooks.available = () => false;
    // Editör ana kelimeyi silmiş
    const cur = snapshotOf((await page()) as unknown as Record<string, unknown>);
    await savePage(admin, pageId, pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), primaryKeyword: null }));
    await runCompletenessScan();
    const all = await db.autopilotAction.findMany({ where: { source: "completeness", pageId }, select: { type: true, status: true, qualityNotes: true } });
    const k = await db.autopilotAction.findFirst({ where: { source: "completeness", pageId, type: "KEYWORD", status: "pending_approval" } });
    expect(k, `ana kelime önerisi hazırlanmadı: ${JSON.stringify(all)}`).toBeTruthy();
    const r = await applyProposal(k!.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status, r.note).toBe("applied");
    const after = await page();
    expect(after.primaryKeyword).toBe("adana restoran web tasarımı");
    expect(after.status).toBe("DRAFT");
    expect(after.autoNoindex).toBe(true);
  });

  it("atlanan öneri (uygulanabilir değişiklik yok) sonraki taramada yeniden üretilmez", async () => {
    aiHooks.available = () => false;
    const before = await db.autopilotAction.count({ where: { source: "completeness", pageId, status: "skipped" } });
    await runCompletenessScan();
    expect(await db.autopilotAction.count({ where: { source: "completeness", pageId, status: "skipped" } })).toBe(before);
  });

  it("öneri uygulansa bile taslak DRAFT kalır: index/canonical/robots/URL değişmez, sitemap'e girmez", async () => {
    // Editör sayfaya gerçek metin ekler (giriş yalnızca sayfadaki bilgiden yazılabilir)
    const cur = snapshotOf((await page()) as unknown as Record<string, unknown>);
    await savePage(admin, pageId, pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), body: "## Restoran siteleri\n\n" + "Adana restoran web tasarımı çalışmasında menü, rezervasyon talebi, konum ve çalışma saatleri ziyaretçinin ilk baktığı bilgilerdir. Sayfalar telefonda kolay okunacak şekilde düzenlenir ve iletişim bağlantısı her sayfada görünür. ".repeat(3) }));
    aiHooks.available = () => true;
    aiHooks.intro = async () => ({ intro: "Adana restoran web tasarımı, restoranın menüsünü, konumunu ve çalışma saatlerini ziyaretçiye telefonda kolayca ulaştıran sayfalar kurmayı amaçlar. Sayfa düzeni restoranın kendi bilgileriyle planlanır." });
    await db.autopilotAction.deleteMany({ where: { source: "completeness", pageId, type: "INTRO" } });
    await runCompletenessScan();
    const a = await db.autopilotAction.findFirstOrThrow({ where: { source: "completeness", pageId, type: "INTRO" } });
    expect(a.status, a.qualityNotes ?? "").toBe("pending_approval");
    const before = await page();
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status, r.note).toBe("applied");
    const after = await page();
    expect(after.intro).toContain("Adana restoran web tasarımı");
    expect(after.status).toBe("DRAFT");
    expect(after.robotsIndex).toBe(before.robotsIndex);
    expect(after.robotsFollow).toBe(before.robotsFollow);
    expect(after.canonical).toBe(before.canonical);
    expect(after.path).toBe(PATH);
    expect(after.body).toBe(before.body); // mevcut içerik silinmez
    const published = await db.page.findMany({ where: { status: "PUBLISHED" }, select: { path: true } });
    expect(published.some((p) => p.path === PATH)).toBe(false); // sitemap yalnızca yayındaki sayfalardan üretilir
  });

  it("yayın durumunu değiştiren öneri (NEW_PAGE dışı) elle onayla bile uygulanamaz", async () => {
    const p = await page();
    const a = await db.autopilotAction.create({ data: {
      type: "H1", risk: "AUTO", status: "pending_approval", score: 10, title: "status saldırısı", reason: "t", pageId, source: "test", riskLevel: "LOW", autoApply: false, fingerprint: `TEST:${Math.random()}`,
      proposedChanges: { pages: [{ pageId, path: PATH, changes: [{ field: "status", before: "DRAFT", after: "PUBLISHED" }] }] },
    } });
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status).toBe("failed");
    expect(r.note).toMatch(/yayın durumunu değiştiremez/);
    expect((await page()).status).toBe("DRAFT");
    expect((await page()).updatedAt.getTime()).toBe(p.updatedAt.getTime());
  });
});
