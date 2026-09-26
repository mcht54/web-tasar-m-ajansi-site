import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createPage, pageInputSchema, restoreVersion, savePage, snapshotOf, validatePath } from "@/lib/admin/pages";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import type { SessionUser } from "@/lib/auth/session";
import { analyzeAndStore, runFullAnalysis } from "@/lib/seo/analyzer";

let admin: SessionUser;
let editor: SessionUser;
const P = "/test-entegrasyon";

async function inputOf(id: string, patch: Record<string, unknown> = {}) {
  const p = await db.page.findUniqueOrThrow({ where: { id } });
  const snap = snapshotOf(p as unknown as Record<string, unknown>);
  return pageInputSchema.parse({ ...snap, faq: parseFaq(snap.faq), ...patch });
}

beforeAll(async () => {
  await db.page.deleteMany({ where: { path: { startsWith: P } } });
  await db.redirect.deleteMany({ where: { fromPath: { startsWith: P } } });
  const mk = async (email: string, role: "ADMIN" | "EDITOR") =>
    db.user.upsert({ where: { email }, create: { email, name: role, role, passwordHash: "x" }, update: {} });
  const a = await mk("it-admin@example.com", "ADMIN");
  const e = await mk("it-editor@example.com", "EDITOR");
  admin = { id: a.id, email: a.email, name: "Test Yönetici", role: "ADMIN", sessionId: "s" };
  editor = { id: e.id, email: e.email, name: "Test Editör", role: "EDITOR", sessionId: "s" };
});

afterAll(async () => {
  await db.page.deleteMany({ where: { path: { startsWith: P } } });
  await db.redirect.deleteMany({ where: { OR: [{ fromPath: { startsWith: P } }, { toPath: { startsWith: P } }] } });
});

describe("URL doğrulama", () => {
  it("Türkçe karakter, büyük harf ve sistem yollarını reddeder", () => {
    expect(validatePath("/web-tasarım")).toBeTruthy();
    expect(validatePath("/Web-Tasarim")).toBeTruthy();
    expect(validatePath("/yonetim/x")).toBeTruthy();
    expect(validatePath("/sitemap-x")).toBeTruthy();
    expect(validatePath("/web-tasarim/sakarya")).toBeNull();
  });
});

describe("sayfa kaydetme", () => {
  it("alan logu ve sürüm oluşturur", async () => {
    const r = await createPage(admin, { path: `${P}-a`, type: "STATIC", name: "Test A", h1: "Test A" });
    expect(r.ok).toBe(true);
    const id = (r as { pageId: string }).pageId;
    const s = await savePage(admin, id, await inputOf(id, { metaDescription: "Yeni açıklama", status: "PUBLISHED" }), "not");
    expect(s.ok && s.changed).toEqual(expect.arrayContaining(["metaDescription", "status"]));
    const logs = await db.seoChangeLog.findMany({ where: { pageId: id, field: "Meta description" } });
    expect(logs[0].after).toBe("Yeni açıklama");
    expect(logs[0].userName).toBe("Test Yönetici");
    expect(await db.pageVersion.count({ where: { pageId: id } })).toBe(2);
    const p = await db.page.findUniqueOrThrow({ where: { id } });
    expect(p.publishedAt).not.toBeNull();
  });

  it("içerik değişmediyse (CRLF / JSON anahtar sırası farkı) hayalet değişiklik kaydedilmez", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: `${P}-a` } });
    await db.page.update({ where: { id: p.id }, data: { body: "## A\n\nMetin", faq: [{ q: "Soru?", a: "Yanıt." }] } });
    const { formToInput } = await import("@/lib/admin/page-form");
    const fd = new FormData();
    const cur = await inputOf(p.id);
    for (const [k, v] of Object.entries(cur)) {
      if (k === "faq" || k === "secondaryKeywords" || k === "schemaDisabled") continue;
      if (typeof v === "boolean") { if (v) fd.set(k, "on"); continue; }
      fd.set(k, (v as string | null) ?? "");
    }
    fd.set("body", "## A\r\n\r\nMetin");
    fd.append("faq_q", "Soru?");
    fd.append("faq_a", "Yanıt.");
    const { input } = formToInput(fd);
    const r = await savePage(admin, p.id, input!);
    expect(r.ok && r.changed).toEqual([]);
  });

  it("yayındaki sayfanın URL'si değişince 301 oluşturur ve zinciri kısaltır", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: `${P}-a` } });
    await db.redirect.create({ data: { fromPath: `${P}-cok-eski`, toPath: `${P}-a` } });
    const r = await savePage(admin, p.id, await inputOf(p.id, { path: `${P}-b` }));
    expect(r.ok).toBe(true);
    const red = await db.redirect.findUniqueOrThrow({ where: { fromPath: `${P}-a` } });
    expect(red.toPath).toBe(`${P}-b`);
    expect(red.statusCode).toBe(301);
    // eski yönlendirme artık doğrudan yeni adrese gider (zincir yok)
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: `${P}-cok-eski` } })).toPath).toBe(`${P}-b`);
  });

  it("editör teknik alanları (robots, URL) değiştiremez ama içeriği değiştirebilir", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: `${P}-b` } });
    const bad = await savePage(editor, p.id, await inputOf(p.id, { robotsIndex: false }));
    expect(bad.ok).toBe(false);
    const ok = await savePage(editor, p.id, await inputOf(p.id, { intro: "Editör girişi" }));
    expect(ok.ok).toBe(true);
  });

  it("sürüme geri döner ve bunu yeni sürüm olarak kaydeder", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: `${P}-b` } });
    const v2 = await db.pageVersion.findFirstOrThrow({ where: { pageId: p.id, version: 2 } });
    const r = await restoreVersion(admin, p.id, v2.id);
    expect(r.ok).toBe(true);
    const after = await db.page.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.intro).toBeNull(); // v2'de giriş yoktu
    const last = await db.pageVersion.findFirstOrThrow({ where: { pageId: p.id }, orderBy: { version: "desc" } });
    expect(last.note).toContain("geri yüklendi");
    // v2'de URL -a idi: geri dönüş URL'yi de geri alır ve yayındaki sayfa için -b → -a 301'i oluşur
    expect(after.path).toBe(`${P}-a`);
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: `${P}-b` } })).toPath).toBe(`${P}-a`);
    // döngü olmamalı: -a artık yönlendirme kaynağı değil
    expect(await db.redirect.findUnique({ where: { fromPath: `${P}-a` } })).toBeNull();
  });

  it("aynı URL'ye ikinci sayfa oluşturulamaz", async () => {
    const r = await createPage(admin, { path: `${P}-a`, type: "STATIC", name: "Kopya" });
    expect(r.ok).toBe(false);
  });
});

describe("programatik SEO koruması", () => {
  const cityText = (city: string) =>
    Array.from({ length: 12 }, (_, i) =>
      `${city} bölgesindeki işletmeler için web tasarım sürecimiz ${i + 1}. adımda ihtiyaç analizi, içerik planı ve hız hedefleriyle ilerler. ${city} firmalarının müşterileri telefonla arama yapar, bu yüzden mobil deneyim önceliklidir.`,
    ).join("\n\n");

  it("yalnızca şehir adı değişmiş il sayfası otomatik NOINDEX olur", async () => {
    const [bolu, duzce] = await Promise.all([
      db.page.findUniqueOrThrow({ where: { path: "/web-tasarim/bolu" } }),
      db.page.findUniqueOrThrow({ where: { path: "/web-tasarim/duzce" } }),
    ]);
    await db.page.update({ where: { id: bolu.id }, data: { status: "PUBLISHED", body: `## Bolu\n\n${cityText("Bolu")}`, intro: "Bolu web tasarım." } });
    await db.page.update({ where: { id: duzce.id }, data: { status: "PUBLISHED", body: `## Düzce\n\n${cityText("Düzce")}`, intro: "Düzce web tasarım." } });
    await runFullAnalysis();
    const a = await analyzeAndStore(duzce.id);
    expect(a!.similar.score).toBeGreaterThan(0.9);
    expect(a!.autoNoindex.noindex).toBe(true);
    expect((await db.page.findUniqueOrThrow({ where: { id: duzce.id } })).autoNoindex).toBe(true);
    // geri al
    await db.page.updateMany({ where: { id: { in: [bolu.id, duzce.id] } }, data: { status: "DRAFT", body: null, intro: null, autoNoindex: false, autoNoindexReason: null } });
  });

  it("içeriksiz ilçe sayfası yayında olsa bile thin content nedeniyle NOINDEX olur", async () => {
    const p = await db.page.findUniqueOrThrow({ where: { path: "/web-tasarim/sakarya/serdivan" } });
    await db.page.update({ where: { id: p.id }, data: { status: "PUBLISHED", intro: "Serdivan için kısa bir giriş.", body: "## Kısa\n\nÇok kısa bir metin." } });
    const a = await analyzeAndStore(p.id);
    expect(a!.autoNoindex.noindex).toBe(true);
    expect(a!.autoNoindex.reason).toContain("İçerik yetersiz");
    await db.page.update({ where: { id: p.id }, data: { status: "DRAFT", intro: null, body: null, autoNoindex: false, autoNoindexReason: null } });
  });
});
