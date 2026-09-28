// İçerik otopilotu: içerik önerisi 48 saatlik yaşam döngüsünden geçer. Yapay zekâ test
// kancasıyla taklit edilir (gerçek API çağrısı yok). Yazmalar TEST veritabanında.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSetting } from "@/lib/settings";
import { aiHooks } from "@/lib/autopilot/execute";
import { applyProposal, clock, createProposal, rejectProposal, runAutoApply } from "@/lib/proposals/lifecycle";
import { runContentScan } from "@/lib/content/scan";
import { districtPriorities, serviceOpportunities } from "@/lib/content/opportunities";
import { extractMarkdown } from "@/lib/text/markdown";
import { goodAiPage } from "../fixtures/ai-page";
import type { SessionUser } from "@/lib/auth/session";

const H = 3600_000;
const T0 = new Date("2026-10-05T09:00:00Z");
const PATH = "/mimarlik-web-tasarimi";
const SITE = "https://webtasarimajansi.net";
const realNow = clock.now;
const realHooks = { ...aiHooks };
let admin: SessionUser;
let original: { body: string | null; contentUpdatedAt: Date };

// Kalite kapısını geçen bölüm: sayfanın kendi konusunu açar, yeni sayı/iddia/yer adı yok
const GOOD = {
  heading: "Proje sunumunu öne çıkaran sayfa düzeni",
  markdown: "Mimarlık ofisinin sitesinde ziyaretçi önce projelere bakar. Bu nedenle proje sayfaları büyük görseller, kısa açıklamalar ve kolay gezinme ile kurgulanır. Her proje için kısa bir hikâye, kullanılan malzeme ve tasarım yaklaşımı ayrı başlıklarda anlatılabilir. Ziyaretçi bir projeden diğerine geçerken aynı düzeni görür ve aradığını hızlıca bulur. Görseller sayfayı yavaşlatmayacak biçimde hazırlanır; mobil ekranda da proje detayları okunaklı kalır. İletişim ve teklif bağlantısı her proje sayfasının sonunda yer alır, böylece ilgilenen ziyaretçi bir sonraki adımı kolayca atar.",
  rationale: "test",
};

async function page() {
  return db.page.findUniqueOrThrow({ where: { path: PATH } });
}

async function contentProposal(key = `CONTENT:test:${Math.random()}`) {
  const p = await page();
  return createProposal({ key, type: "CONTENT", risk: "CONTROLLED", category: "CONTENT", source: "test", title: "içerik testi", reason: "ince içerik", score: 40, pageId: p.id, allowAuto: true }, { model: "test-model", windowHours: 48 });
}

/** Sahte çalışan site: istenen sayfanın HTML'i gerçek veriden (başlıklar + H1) + canonical + JSON-LD + sitemap. */
function fakeSite(opts: { hideSection?: boolean; omitFromSitemap?: string } = {}): typeof fetch {
  return (async (url: string | URL) => {
    const u = new URL(String(url));
    if (u.pathname === "/sitemap.xml") return new Response(`<sitemapindex><sitemap><loc>${SITE}/sitemap-pages.xml</loc></sitemap></sitemapindex>`, { status: 200 });
    if (u.pathname === "/sitemap-pages.xml") {
      const pages = await db.page.findMany({ where: { status: "PUBLISHED" }, select: { path: true } });
      return new Response(pages.filter((p) => p.path !== opts.omitFromSitemap).map((p) => `<url><loc>${SITE}${p.path}</loc></url>`).join(""), { status: 200 });
    }
    const pg = await db.page.findUnique({ where: { path: u.pathname } });
    if (!pg || pg.status !== "PUBLISHED") return new Response("yok", { status: 404, headers: { "content-type": "text/html" } });
    const heads = extractMarkdown(pg.body).headings.map((h) => `<h2>${h.text}</h2>`).filter((h) => !(opts.hideSection && h.includes(GOOD.heading)));
    const html = `<html><head><title>${pg.seoTitle ?? pg.name}</title><link rel="canonical" href="${SITE}${pg.path}"><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><h1>${pg.h1 ?? pg.name}</h1>${heads.join("")}</body></html>`;
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

beforeAll(async () => {
  const u = await db.user.upsert({ where: { email: "content-autopilot@example.com" }, create: { email: "content-autopilot@example.com", name: "İçerik Testi", role: "ADMIN", passwordHash: "x" }, update: {} });
  admin = { id: u.id, email: u.email, name: u.name, role: "ADMIN", sessionId: "s" };
  await saveSetting("autopilot", {});
  const p = await page();
  original = { body: p.body, contentUpdatedAt: p.contentUpdatedAt };
  // Önceki çalıştırmalardan kalan test kullanıcısı kayıtları "elle düzenleme" korumasını tetiklemesin
  await db.seoChangeLog.deleteMany({ where: { userName: { in: ["İçerik Testi", "Öneri Testi"] } } });
});

const TEMP_PATHS = ["/blog/web-sitesi-bakimi-nedir", "/web-sitesi-bakim-hizmeti"];

afterEach(async () => {
  clock.now = realNow;
  Object.assign(aiHooks, realHooks);
  const p = await page();
  if (p.body !== original.body) await db.page.update({ where: { id: p.id }, data: { body: original.body } });
  // Her senaryo yalıtılmış: bekleyen öneri ve geçici sayfa sonraki senaryoya taşınmaz
  await db.autopilotAction.deleteMany({ where: { source: { in: ["test", "content", "service", "local"] } } });
  const temp = await db.page.findMany({ where: { path: { in: TEMP_PATHS } }, select: { path: true } });
  for (const t of temp) {
    // Üst sayfalara eklenen iç linkler de temizlenir
    for (const parent of await db.page.findMany({ where: { status: "PUBLISHED" }, select: { id: true, relatedLinks: true } })) {
      const rel = (parent.relatedLinks as { path: string }[] | null) ?? [];
      if (rel.some((l) => l.path === t.path)) await db.page.update({ where: { id: parent.id }, data: { relatedLinks: rel.filter((l) => l.path !== t.path) } });
    }
  }
  await db.page.deleteMany({ where: { path: { in: TEMP_PATHS } } });
  await db.service.deleteMany({ where: { slug: "web-sitesi-bakim-hizmeti" } });
});

afterAll(async () => {
  await db.autopilotAction.deleteMany({ where: { source: { in: ["test", "content", "service", "local"] } } });
  await db.page.deleteMany({ where: { path: { in: ["/blog/web-sitesi-bakimi-nedir", "/web-sitesi-bakim-hizmeti"] } } });
  await db.service.deleteMany({ where: { slug: "web-sitesi-bakim-hizmeti" } });
  await saveSetting("business", {});
  await saveSetting("autopilot", {});
});

describe("içerik önerisi → 48 saat → uygulama", () => {
  it("1: yapay zekâ anahtarı yok → öneri 'uygulanamaz', içerik uydurulmaz, sayfa değişmez", async () => {
    aiHooks.available = () => false;
    const r = await contentProposal();
    expect(r.status).toBe("blocked");
    expect(r.note).toMatch(/Yapay zekâ anahtarı yok/);
    const s = await runContentScan(["refresh"]);
    expect(Object.keys(s.created).every((k) => k === "blocked")).toBe(true);
    expect((await page()).body).toBe(original.body);
  });

  it("2: yapay zekâ üretimi başarılı → somut içerikli öneri + üretim meta verisi; sayfaya henüz yazılmaz", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => GOOD;
    const r = await contentProposal();
    expect(r.status, r.note).toBe("pending_approval");
    const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    const ch = (a.proposedChanges as { pages: { changes: { field: string; after: string }[] }[] }).pages[0].changes[0];
    expect(ch.field).toBe("body");
    expect(ch.after.startsWith(original.body!.trimEnd())).toBe(true); // mevcut içerik korunur
    expect(ch.after).toContain(`## ${GOOD.heading}`);
    const gen = (a.proposal as { generation: Record<string, string> }).generation;
    expect(gen).toMatchObject({ provider: "anthropic", model: "test-model", promptVersion: "section-v2" });
    expect(gen.intent).toBeTruthy();
    expect(gen.angle).toBeTruthy();
    expect(a.autoApply).toBe(true);
    expect(a.riskLevel).toBe("MEDIUM");
    expect((await page()).body).toBe(original.body);
  });

  it("3 + 11: onay → içerik yayına girer, HTML'de görünür; sürüm + denetim logunda proposalId/model/doğrulama", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => GOOD;
    const r = await contentProposal();
    const res = await applyProposal(r.id!, { via: "manual", user: admin, fetchImpl: fakeSite() });
    expect(res.status, res.note).toBe("applied");
    expect((await page()).body).toContain(GOOD.heading);
    const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    const crawl = (a.validation as { step: string; status: string; note: string }[]).find((s) => s.step === "crawl")!;
    expect(crawl.status).toBe("ok");
    expect(crawl.note).toMatch(/yeni bölüm görünüyor/);
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: r.id!, action: "proposal.apply" } });
    const detail = log.detail as { proposalId: string; generation: { model: string }; validation: string[]; versionAfterId: string };
    expect(detail.proposalId).toBe(r.id);
    expect(detail.generation.model).toBe("test-model");
    expect(detail.validation).toContain("crawl:ok");
    expect(detail.versionAfterId).toBeTruthy();
  });

  it("11 (olumsuz): eklenen bölüm HTML'de görünmüyorsa uygulama geri alınır", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => GOOD;
    const r = await contentProposal();
    const res = await applyProposal(r.id!, { via: "manual", user: admin, fetchImpl: fakeSite({ hideSection: true }) });
    expect(res.status).toBe("failed");
    expect(res.note).toMatch(/eklenen bölüm .* HTML'de yok/);
    expect((await page()).body).toBe(original.body);
  }, 15_000);

  it("4: ret → içerik yayınlanmaz", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => GOOD;
    const r = await contentProposal();
    await rejectProposal(admin, r.id!);
    await runAutoApply({ now: new Date(Date.now() + 72 * H), fetchImpl: null, max: 100 });
    expect((await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } })).status).toBe("rejected");
    expect((await applyProposal(r.id!, { via: "manual", user: admin, fetchImpl: null })).status).toBe("skipped");
    expect((await page()).body).toBe(original.body);
  });

  it("5 + 10: 48 saat dolunca otomatik yayın; iki eşzamanlı çalıştırma yalnızca bir kez uygular", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => GOOD;
    clock.now = () => T0;
    const r = await contentProposal();
    const versions = await db.pageVersion.count({ where: { pageId: (await page()).id } });
    const later = new Date(T0.getTime() + 48 * H + 60_000);
    const [s1, s2] = await Promise.all([runAutoApply({ now: later, fetchImpl: null }), runAutoApply({ now: later, fetchImpl: null })]);
    expect(s1.applied + s2.applied).toBe(1);
    const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    expect(a.status).toBe("applied");
    expect(a.appliedVia).toBe("auto_48h");
    expect((await page()).body!.split(GOOD.heading).length - 1).toBe(1); // bölüm bir kez eklendi
    expect(await db.pageVersion.count({ where: { pageId: a.pageId! } })).toBeLessThanOrEqual(versions + 2);
  });
});

describe("kalite kapıları", () => {
  it("6: başka sayfayı kopyalayan bölüm önerilmez", async () => {
    const other = await db.page.findUniqueOrThrow({ where: { path: "/kurumsal-web-tasarim" } });
    const copied = extractMarkdown(other.body).text.split(/\s+/).slice(0, 180).join(" ");
    aiHooks.available = () => true;
    aiHooks.section = async () => ({ heading: "Kurumsal sitelerde yaklaşım", markdown: copied, rationale: "" });
    const r = await contentProposal();
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/benzerlik|tekrar ediyor/);
    expect((await page()).body).toBe(original.body);
  });

  it("7: ince (çok kısa) bölüm önerilmez", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => ({ heading: "Kısa not", markdown: "Mimarlık siteleri projeleri öne çıkarır.", rationale: "" });
    const r = await contentProposal();
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/çok kısa/);
  });

  it("8: [DOĞRULANMALI] içeren bölüm önerilmez; yeni sayfada varsa yayın engellenir", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => ({ ...GOOD, markdown: `${GOOD.markdown} [DOĞRULANMALI: ofis adresi]` });
    const r = await contentProposal();
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/DOĞRULANMALI/);
    aiHooks.page = async () => ({ ...goodAiPage, intro: `${goodAiPage.intro} [DOĞRULANMALI: bakım süresi]` });
    const np = await createProposal({ key: `NEW_PAGE:test:${Math.random()}`, type: "NEW_PAGE", risk: "CONTROLLED", source: "test", title: "yeni sayfa", reason: "t", score: 40,
      proposal: { pagePath: "/blog/web-sitesi-bakimi-nedir", decision: "NEW_PAGE", pageType: "BLOG_POST", pageId: null, group: { primary: "web sitesi bakımı nedir", queries: ["web sitesi bakımı nedir"], impressions: 100, intent: "INFORMATIONAL", location: null } }, allowAuto: true }, { model: "test-model", windowHours: 48 });
    expect(np.status).toBe("blocked");
    expect(np.note).toMatch(/Kalite kapısı/);
    expect((await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).status).toBe("DRAFT");
  });

  it("güvensiz çıktı (HTML/script) temizlenerek saklanır ve kayda geçer", async () => {
    aiHooks.available = () => true;
    aiHooks.section = async () => ({ ...GOOD, markdown: `${GOOD.markdown} <script>alert(1)</script>` });
    const r = await contentProposal();
    expect(r.status, r.note).toBe("pending_approval");
    const a = await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } });
    expect(JSON.stringify(a.proposedChanges)).not.toMatch(/<script|alert\(1\)/);
    expect((a.proposal as { sanitized?: string[] }).sanitized).toContain("HTML etiketi");
  });

  it("9: yayın sonrası SEO doğrulaması başarısız (keyword stuffing) → otomatik geri alma", async () => {
    const p = await page();
    const kw = p.primaryKeyword ?? "mimarlık web tasarımı";
    const stuffed = `${p.body}\n\n## Ek bölüm\n\n${Array.from({ length: 30 }, () => `${kw} için ${kw}.`).join(" ")}\n`;
    const a = await db.autopilotAction.create({ data: {
      type: "CONTENT", risk: "CONTROLLED", status: "pending_approval", score: 40, title: "stuffing testi", reason: "t", pageId: p.id, source: "test", category: "CONTENT", riskLevel: "MEDIUM", autoApply: true,
      expiresAt: new Date(Date.now() + 48 * H), fingerprint: `TEST:${Math.random()}`, proposedChanges: { pages: [{ pageId: p.id, path: p.path, changes: [{ field: "body", before: p.body, after: stuffed }] }] },
    } });
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status).toBe("failed");
    expect(r.note).toMatch(/SEO doğrulama.*keyword stuffing/);
    expect((await page()).body).toBe(original.body);
    const steps = ((await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } })).validation as { step: string; status: string }[]).map((s) => `${s.step}:${s.status}`);
    expect(steps).toContain("auto_rollback:ok");
  });

  it("mevcut içeriği silen değişiklik uygulanmaz", async () => {
    const p = await page();
    const a = await db.autopilotAction.create({ data: {
      type: "CONTENT", risk: "CONTROLLED", status: "pending_approval", score: 40, title: "silme testi", reason: "t", pageId: p.id, source: "test", category: "CONTENT", riskLevel: "MEDIUM", autoApply: true,
      expiresAt: new Date(Date.now() + 48 * H), fingerprint: `TEST:${Math.random()}`, proposedChanges: { pages: [{ pageId: p.id, path: p.path, changes: [{ field: "body", before: p.body, after: "## Yeni\n\nKısa yeni metin." }] }] },
    } });
    const r = await applyProposal(a.id, { via: "manual", user: admin, fetchImpl: null });
    expect(r.status).toBe("failed");
    expect(r.note).toMatch(/mevcut içerik silinemez/);
    expect((await page()).body).toBe(original.body);
  });
});

describe("yeni sayfa: hizmet + yayın kontrolleri", () => {
  it("12: doğrulanmış hizmet sayfası → öneri → onay → yayında; canonical, JSON-LD, sitemap kontrolleri geçer", async () => {
    await saveSetting("business", { services: ["Web Sitesi Bakım Hizmeti"] });
    aiHooks.available = () => true;
    aiHooks.page = async () => ({ ...goodAiPage, seoTitle: "Web Sitesi Bakım Hizmeti | Güncelleme ve Güvenlik", h1: "Web Sitesi Bakım Hizmeti", metaDescription: "Web sitesi bakım hizmeti: güncelleme, yedekleme, güvenlik ve içerik kontrolünün düzenli yapılması. Kapsamı ve süreci sade bir dille anlattık." });
    const r = await createProposal({ key: `NEW_PAGE:service:test`, type: "NEW_PAGE", risk: "CONTROLLED", category: "SERVICE", source: "service", title: "hizmet", reason: "t", score: 50,
      proposal: { pagePath: "/web-sitesi-bakim-hizmeti", decision: "NEW_SERVICE_PAGE", pageType: "SERVICE", pageId: null, service: { name: "Web Sitesi Bakım Hizmeti" }, group: { primary: "web sitesi bakım hizmeti", queries: ["web sitesi bakım hizmeti"], impressions: 20, intent: "COMMERCIAL", location: null } }, allowAuto: true }, { model: "test-model", windowHours: 48 });
    expect(r.status, r.note).toBe("pending_approval");
    const draft = await db.page.findUniqueOrThrow({ where: { path: "/web-sitesi-bakim-hizmeti" } });
    expect(draft.type).toBe("SERVICE");
    expect(draft.status).toBe("DRAFT"); // hazırlık yayına almaz
    const res = await applyProposal(r.id!, { via: "manual", user: admin, fetchImpl: fakeSite() });
    expect(res.status, res.note).toBe("applied");
    expect((await db.page.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PUBLISHED");
    const crawl = ((await db.autopilotAction.findUniqueOrThrow({ where: { id: r.id! } })).validation as { step: string; note: string }[]).find((s) => s.step === "crawl")!;
    expect(crawl.note).toMatch(/canonical kendisi.*JSON-LD geçerli.*sitemap'te/);
  });

  it("12 (olumsuz): yeni sayfa sitemap'te yoksa yayın geri alınır (taslağa döner)", async () => {
    aiHooks.available = () => true;
    aiHooks.page = async () => goodAiPage;
    await db.page.deleteMany({ where: { path: "/blog/web-sitesi-bakimi-nedir" } });
    const r = await createProposal({ key: `NEW_PAGE:test:sitemap`, type: "NEW_PAGE", risk: "CONTROLLED", source: "test", title: "yeni sayfa", reason: "t", score: 40,
      proposal: { pagePath: "/blog/web-sitesi-bakimi-nedir", decision: "NEW_PAGE", pageType: "BLOG_POST", pageId: null, group: { primary: "web sitesi bakımı nedir", queries: ["web sitesi bakımı nedir"], impressions: 100, intent: "INFORMATIONAL", location: null } }, allowAuto: true }, { model: "test-model", windowHours: 48 });
    expect(r.status, r.note).toBe("pending_approval");
    const res = await applyProposal(r.id!, { via: "manual", user: admin, fetchImpl: fakeSite({ omitFromSitemap: "/blog/web-sitesi-bakimi-nedir" }) });
    expect(res.status).toBe("failed");
    expect(res.note).toMatch(/sitemap'te yok/);
    expect((await db.page.findUniqueOrThrow({ where: { path: "/blog/web-sitesi-bakimi-nedir" } })).status).toBe("DRAFT");
  }, 15_000);

  it("doğrulanmamış hizmet için sayfa üretilmez", async () => {
    await saveSetting("business", { services: [] });
    aiHooks.available = () => true;
    let called = false;
    aiHooks.page = async () => { called = true; return goodAiPage; };
    const r = await createProposal({ key: `NEW_PAGE:service:unverified`, type: "NEW_PAGE", risk: "CONTROLLED", category: "SERVICE", source: "service", title: "hizmet", reason: "t", score: 50,
      proposal: { pagePath: "/grafik-tasarim", decision: "NEW_SERVICE_PAGE", pageType: "SERVICE", pageId: null, service: { name: "Grafik Tasarım" }, group: { primary: "grafik tasarım", queries: ["grafik tasarım"], impressions: 20, intent: "COMMERCIAL", location: null } }, allowAuto: true }, { model: "test-model", windowHours: 48 });
    expect(r.status).toBe("blocked");
    expect(r.note).toMatch(/doğrulanmadı/);
    expect(called).toBe(false);
    expect(await db.page.findUnique({ where: { path: "/grafik-tasarim" } })).toBeNull();
  });
});

describe("hizmet kararları ve ilçe önceliği", () => {
  it("mevcut hizmetler 'kapsanıyor'; teknik SEO ayrı sayfa değil genişletme; doğrulanmamış/talepsiz hizmet önerilmez", async () => {
    await saveSetting("business", { services: [] });
    const { rows } = await serviceOpportunities();
    const by = (p: string) => rows.find((r) => r.path === p)!;
    expect(by("/seo-hizmeti").decision).toBe("COVERED");
    expect(by("/teknik-seo").decision).toBe("EXPAND_EXISTING");
    expect(by("/grafik-tasarim").decision).toBe("UNVERIFIED");
    await saveSetting("business", { services: ["Grafik Tasarım"] });
    const again = (await serviceOpportunities()).rows.find((r) => r.path === "/grafik-tasarim")!;
    expect(again.decision).toBe("NO_DEMAND_SIGNAL"); // körlemesine sayfa açılmaz
  });

  it("ilçe önceliği ölçülen kriterlerle; blokörler açık; ilçe önerisi asla otomatik uygulanmaz", async () => {
    const { rows, notes } = await districtPriorities();
    expect(rows.length).toBeGreaterThan(900);
    expect(rows[0].score).toBeGreaterThanOrEqual(rows[rows.length - 1].score);
    expect(notes.join(" ")).toMatch(/doğrulanamadı/);
    expect(rows[0].blockers.length).toBeGreaterThan(0); // test DB: işletme adı / yerel not yok
    aiHooks.available = () => true;
    const s = await runContentScan(["local"]);
    for (const it of s.items) expect(["blocked", "pending_approval", "skipped"]).toContain(it.status);
    const local = await db.autopilotAction.findMany({ where: { source: "local" } });
    for (const a of local) expect(a.autoApply).toBe(false);
    expect(await db.page.count({ where: { type: "DISTRICT", status: "PUBLISHED" } })).toBe(0);
  });
});
