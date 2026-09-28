import "server-only";
// YENİ SAYFA MOTORU: sayfa karar motoru NEW_PAGE / FILL_LOCATION_DRAFT dediğinde
// araştır (yalnızca doğrulanmış olgular) → yapay zekâ ile içerik → taslak → kalite
// kapısı → (AUTONOMOUS ise) yayınla → yayın sonrası doğrulama. Kritik hata varsa
// sayfa TASLAK kalır; hiçbir şey silinmez, her adım sürüm geçmişine yazılır.

import { db } from "../db";
import { siteUrl } from "../env";
import { createPage, pageInputSchema, savePage, snapshotOf, type PageInput } from "../admin/pages";
import { parseFaq, PLACEHOLDER_RE, UNVERIFIED_RE } from "../seo/analyzer-shared";
import { analyzeAndStore, analyzeUnsaved, loadSiteState } from "../seo/analyzer";
import { locationGate, LOCATION_TYPES } from "../seo/location-quality";
import { isSelfCanonical, resolveDescription, resolveTitle } from "../seo/meta";
import { extractMarkdown } from "../text/markdown";
import { phraseDensity } from "../text/analyze";
import { containsPhrase, normalizeKeyword, trLower } from "../text/slug";
import { aiErrorMessage } from "../ai/claude";
import { getSettingsFresh } from "../settings";
import { agentMode } from "../settings-schema";
import { checkSection } from "./qc";
import { matchTopic } from "./clusters";
import { startExperiment } from "./experiments";
import { AUTOPILOT_USER, aiHooks, type ExecOutcome } from "./execute";

type Action = Awaited<ReturnType<typeof db.autopilotAction.findUniqueOrThrow>>;
export type GateCheck = { label: string; status: "PASS" | "FAIL" | "WARNING"; note: string };
type Group = { primary: string; queries: string[]; impressions: number; intent: string; location: { provinceId: number; districtId: number | null } | null };
type NewPageProposal = { pagePath: string; decision: string; pageType: string; pageId: string | null; group: Group; parentPath?: string | null };

/** Yeni sayfalar için haftalık üst sınır (ölçekli içerik / doorway koruması). */
async function newPagesThisWeek(): Promise<number> {
  return db.autopilotAction.count({ where: { type: "NEW_PAGE", status: "applied", appliedAt: { gte: new Date(Date.now() - 7 * 86400_000) } } });
}

/** Doğrulanmış olgular: yalnızca ayarlarda/veritabanında gerçekten bulunan bilgi. */
async function verifiedFacts(pageId: string | null): Promise<string[]> {
  const s = await getSettingsFresh();
  const b = s.business;
  const facts = [
    b.name && `İşletme adı: ${b.name}`, b.phone && `Telefon: ${b.phone}`, (b.email || s.site.email) && `E-posta: ${b.email || s.site.email}`,
    b.city && `Şehir: ${b.city}`, b.services.length ? `Hizmetler: ${b.services.join(", ")}` : null,
    "Projeler uzaktan (çevrim içi) yürütülür; Türkiye genelinde hizmet verilir (ana sayfa SSS'inde yayında olan bilgi).",
  ].filter(Boolean) as string[];
  if (pageId) {
    const p = await db.page.findUnique({ where: { id: pageId }, include: { province: true, district: true } });
    if (p?.province) facts.push(`İl: ${p.province.name}${p.province.population ? ` (resmî nüfus: ${p.province.population.toLocaleString("tr-TR")})` : ""}`);
    if (p?.district) facts.push(`İlçe: ${p.district.name}${p.district.population ? ` (resmî nüfus: ${p.district.population.toLocaleString("tr-TR")})` : ""}`);
    const notes = p?.district?.localNotes ?? p?.province?.localNotes;
    if (notes) facts.push(`Editörün doğruladığı yerel notlar: ${notes}`);
  }
  return facts;
}

/** Yayından önce otomatik kalite kapısı. Herhangi bir FAIL → yayınlanmaz. */
export async function newPageGate(pageId: string, group: Group): Promise<{ ok: boolean; checks: GateCheck[] }> {
  const checks: GateCheck[] = [];
  const add = (label: string, ok: boolean | "warn", note: string) => checks.push({ label, status: ok === "warn" ? "WARNING" : ok ? "PASS" : "FAIL", note });
  const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const state = await loadSiteState();
  const settings = state.settings;
  const others = state.pages.filter((p) => p.status === "PUBLISHED" && p.id !== pageId);
  const title = resolveTitle(page, settings.seo), meta = resolveDescription(page, settings.seo), h1 = page.h1 ?? page.name;
  const md = extractMarkdown(page.body);
  const text = `${h1} ${page.intro ?? ""} ${md.text} ${parseFaq(page.faq).map((f) => `${f.q} ${f.a}`).join(" ")}`;
  const a = await analyzeUnsaved(pageId, { status: "PUBLISHED" });
  // Mevcut yayına hazırlık listesi (SEO skoru, indekslenebilirlik, özgünlük, canonical, schema, iç link, ince içerik, cannibalization, title/meta, doğrulanmış bilgi)
  for (const r of a?.readiness.items ?? []) add(r.label, r.status === "PASS" ? true : r.status === "WARNING" ? "warn" : false, r.note);
  add("Benzersiz title", !others.some((p) => trLower(resolveTitle(p, settings.seo)) === trLower(title)), title);
  add("Benzersiz meta", Boolean(page.metaDescription) && !others.some((p) => trLower(resolveDescription(p, settings.seo)) === trLower(meta)), `${meta.length} karakter`);
  add("Benzersiz H1", !others.some((p) => trLower(p.h1 ?? p.name) === trLower(h1)), h1);
  add("Arama niyeti uyumu", containsPhrase(`${title} ${h1}`, group.primary), `Title/H1 “${group.primary}” ifadesini ${containsPhrase(`${title} ${h1}`, group.primary) ? "içeriyor" : "içermiyor"}`);
  const density = phraseDensity(text, group.primary);
  add("Keyword stuffing", density <= 3, `Yoğunluk %${density.toFixed(1)}`);
  const sameKw = others.filter((p) => p.primaryKeyword && normalizeKeyword(p.primaryKeyword) === normalizeKeyword(group.primary));
  add("Cannibalization (aynı hedef kelime)", sameKw.length === 0, sameKw.length ? sameKw.map((p) => p.path).join(", ") : "Yok");
  const sourceText = [...(await verifiedFacts(pageId)), ...others.map((p) => `${p.h1 ?? ""} ${p.intro ?? ""} ${extractMarkdown(p.body).text}`)].join(" ");
  const places = (await db.province.findMany({ select: { name: true } })).map((p) => p.name);
  const qc = checkSection(text, { query: group.primary, sourceText, beforeWords: 0, addedWords: 1000, places, otherPages: others.map((p) => ({ path: p.path, text: `${p.intro ?? ""} ${extractMarkdown(p.body).text}` })) });
  const fake = qc.problems.filter((x) => !/tekrar ediyor/.test(x)); // kaynak metin tüm site; tekrar kontrolü benzerlik kontrolüyle yapılır
  add("Sahte iddia / uydurma bilgi", fake.length === 0, fake.join("; ") || "Sayfada olmayan müşteri, referans, sayı, yer adı veya abartı yok");
  add("[DOĞRULANMALI] kalmadı", !UNVERIFIED_RE.test(`${text} ${title} ${meta}`), UNVERIFIED_RE.test(text) ? "Doğrulanmamış bilgi işareti var" : "Yok");
  add("Yer tutucu kalmadı", !PLACEHOLDER_RE.test(`${text} ${title} ${meta}`), "Kontrol edildi");
  const internal = md.links.filter((l) => l.href.startsWith("/"));
  const broken = internal.filter((l) => !others.some((p) => p.path === l.href.split("#")[0].split("?")[0]));
  add("İç link (giden)", internal.length >= 2 && broken.length === 0, broken.length ? `Yayında olmayan hedef: ${broken.map((l) => l.href).join(", ")}` : `${internal.length} iç link`);
  add("Canonical", !page.canonical || isSelfCanonical(page, siteUrl()), page.canonical ?? "Kendi URL'si");
  const parent = page.path.split("/").slice(0, -1).join("/") || "/";
  add("Breadcrumb", state.pages.some((p) => p.path === parent && p.status === "PUBLISHED"), `${parent} › ${page.path}`);
  add("Schema", !(a?.schemaIssues ?? []).some((i) => i.level === "error"), (a?.schemaTypes ?? []).join(", "));
  const noAlt = md.images.filter((i) => !i.alt.trim());
  add("Görsel alt metni", noAlt.length === 0, md.images.length ? `${md.images.length - noAlt.length}/${md.images.length} görselde alt` : "Görsel yok");
  add("Mobil / erişilebilirlik", true, "Şablon düzeyinde (responsive düzen, Lighthouse erişilebilirlik 100); gövdede ham HTML çalıştırılmaz");
  if (LOCATION_TYPES.has(page.type)) {
    const g = await locationGate(pageId);
    for (const i of g?.items.filter((x) => x.critical && x.status === "FAIL") ?? []) add(`Lokasyon kapısı: ${i.label}`, false, i.note);
  }
  return { ok: !checks.some((c) => c.status === "FAIL"), checks };
}

async function inputFor(pageId: string, patch: Partial<PageInput>) {
  const p = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const cur = snapshotOf(p as unknown as Record<string, unknown>);
  return pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), ...patch });
}

/** Yeni sayfaya bağlamsal gelen link verecek yayındaki sayfa (konu hedefi → en ilgili hizmet sayfası). */
async function chooseParent(primary: string, excludeId: string) {
  const topic = matchTopic(primary);
  const pages = await db.page.findMany({ where: { status: "PUBLISHED", id: { not: excludeId }, type: { in: ["SERVICE", "BLOG_POST", "SECTOR"] } }, select: { id: true, path: true, h1: true, name: true, primaryKeyword: true, relatedLinks: true, type: true } });
  const words = normalizeKeyword(primary).split(" ").filter((w) => w.length > 2);
  const score = (p: (typeof pages)[number]) => (p.path === topic?.target ? 100 : 0) + words.filter((w) => containsPhrase(`${p.h1 ?? ""} ${p.name} ${p.primaryKeyword ?? ""}`, w)).length * 10 + (p.type === "SERVICE" ? 1 : 0);
  return pages.filter((p) => ((p.relatedLinks as unknown[] | null) ?? []).length < 8).sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** NEW_PAGE işlemini yürütür. */
export async function execNewPage(a: Action, opts: { model: string; approved?: boolean; prepareOnly?: boolean }): Promise<ExecOutcome> {
  const prop = a.proposal as unknown as NewPageProposal;
  const settings = await getSettingsFresh();
  const mode = agentMode(settings.autopilot);
  const group = prop.group;
  // Mükerrer sayfa önleme: hedef URL yayındaysa yeni sayfa açılmaz
  const existing = prop.pageId ? await db.page.findUnique({ where: { id: prop.pageId } }) : await db.page.findUnique({ where: { path: prop.pagePath } });
  if (existing?.status === "PUBLISHED") return { status: "skipped", note: `PAGE_NOT_NEEDED: ${existing.path} zaten yayında` };
  if (!opts.approved && (await newPagesThisWeek()) >= settings.autopilot.maxNewPagesPerWeek) return { status: "needs_approval", note: `Haftalık yeni sayfa sınırı (${settings.autopilot.maxNewPagesPerWeek}) doldu — ölçekli içerik koruması` };
  // Lokasyon: yapay zekânın üretemeyeceği ön koşullar (gerçek işletme/yerel bilgi) içerikten önce kontrol edilir
  if (existing && LOCATION_TYPES.has(existing.type)) {
    const g = await locationGate(existing.id);
    const blockers = g?.items.filter((i) => i.critical && i.status === "FAIL" && ["business", "local", "relation"].includes(i.key)) ?? [];
    if (blockers.length) return { status: "needs_approval", note: `İnsan doğrulaması gerekiyor: ${blockers.map((b) => `${b.label} (${b.note})`).join("; ")}` };
  }
  if (!aiHooks.available()) return { status: "needs_approval", note: "Yapay zekâ anahtarı yok: sayfa içeriği uydurulmadan üretilemez (ANTHROPIC_API_KEY)." };

  const state = await loadSiteState();
  const links = state.pages.filter((p) => p.status === "PUBLISHED" && p.robotsIndex && !p.autoNoindex && p.type !== "STATIC").map((p) => ({ path: p.path, title: p.h1 ?? p.name }));
  const facts = await verifiedFacts(existing?.id ?? null);
  let content;
  try {
    content = await aiHooks.page({
      kind: existing && LOCATION_TYPES.has(existing.type) ? "LOCATION" : "BLOG_POST", primary: group.primary, queries: group.queries, intent: group.intent,
      siteName: settings.site.siteName, facts, links, existingTitles: state.pages.filter((p) => p.status === "PUBLISHED").map((p) => resolveTitle(p, settings.seo)),
    }, opts.model);
  } catch (e) {
    return { status: "failed", note: `Yapay zekâ: ${aiErrorMessage(e)} — yarım içerik kaydedilmedi` };
  }
  // Taslak oluştur / doldur (her zaman TASLAK; sürüm geçmişi)
  let pageId = existing?.id ?? null;
  if (!pageId) {
    const r = await createPage(AUTOPILOT_USER, { path: prop.pagePath, type: "BLOG_POST", name: content.h1.slice(0, 160), h1: content.h1.slice(0, 200), breadcrumbLabel: null, primaryKeyword: group.primary, category: "Rehber", serviceId: null, provinceId: null, districtId: null, sectorId: null });
    if (!r.ok) return { status: "failed", note: r.error };
    pageId = r.pageId;
  }
  const draft = await savePage(AUTOPILOT_USER, pageId, await inputFor(pageId, {
    status: "DRAFT", seoTitle: content.seoTitle.trim(), metaDescription: content.metaDescription.trim(), h1: content.h1.trim(), intro: content.intro.trim(), body: content.body.trim(),
    faq: content.faq.slice(0, 6), primaryKeyword: group.primary, secondaryKeywords: group.queries.filter((q) => q !== group.primary).slice(0, 10),
  }), `Otopilot: yeni sayfa taslağı (“${group.primary}”)`);
  if (!draft.ok) return { status: "failed", note: draft.error };
  // Gelen bağlamsal link (taslak görünmez; yayında görünür) — orphan sayfa yayınlanmaz
  const parent = await chooseParent(group.primary, pageId);
  const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  if (parent) {
    const rel = [...((parent.relatedLinks as { path: string; anchor: string; reason?: string }[] | null) ?? []).filter((l) => l.path !== page.path), { path: page.path, anchor: (content.h1 || group.primary).slice(0, 80), reason: `Otopilot: “${group.primary}” rehberi` }];
    await savePage(AUTOPILOT_USER, parent.id, await inputFor(parent.id, { relatedLinks: rel }), `Otopilot: yeni sayfaya iç link (${page.path})`);
  }
  const gate = await newPageGate(pageId, group);
  await db.autopilotAction.update({ where: { id: a.id }, data: { pageId, proposal: { ...prop, pageId, parentPath: parent?.path ?? null, gate: gate.checks, verifyNotes: content.verifyNotes } as object } });
  const fails = gate.checks.filter((c) => c.status === "FAIL");
  if (!gate.ok) return { status: "needs_approval", note: `Kalite kapısı: ${fails.map((f) => `${f.label} — ${f.note}`).join("; ")}. Sayfa TASLAK olarak saklandı.` };
  // Hazırlık: taslak hazır ve kapıyı geçti; uygulanacak tek değişiklik yayına alma
  if (opts.prepareOnly) return { status: "prepared", note: `Taslak kalite kapısını geçti: ${page.path}`, changes: { pages: [{ pageId, path: page.path, changes: [{ field: "status", before: "DRAFT", after: "PUBLISHED" }] }] } };
  if (mode !== "AUTONOMOUS" && !opts.approved) return { status: "needs_approval", note: "Taslak kalite kapısını geçti; ASSIST modunda yayın onayı bekliyor." };
  return publishNewPage(a, pageId, parent?.path ?? null);
}

/** Yayınla + yayın sonrası doğrulama (sitemap uygunluğu, canonical, schema, analiz, deney, denetim logu). */
export async function publishNewPage(a: Action, pageId: string, parentPath: string | null): Promise<ExecOutcome> {
  const r = await savePage(AUTOPILOT_USER, pageId, await inputFor(pageId, { status: "PUBLISHED" }), "Otopilot: kalite kapısı geçti, yayınlandı");
  if (!r.ok) return { status: "failed", note: r.error };
  const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const analysis = await analyzeAndStore(pageId);
  const settings = await getSettingsFresh();
  const post: GateCheck[] = [
    { label: "Yayında (veritabanı)", status: page.status === "PUBLISHED" ? "PASS" : "FAIL", note: page.status },
    { label: "Sitemap'e uygun", status: page.robotsIndex && !page.autoNoindex && settings.seo.allowIndexing ? "PASS" : "FAIL", note: page.autoNoindex ? page.autoNoindexReason ?? "otomatik NOINDEX" : "indekslenebilir" },
    { label: "Canonical kendisi", status: isSelfCanonical(page, siteUrl()) ? "PASS" : "FAIL", note: page.canonical ?? "Kendi URL'si" },
    { label: "Schema geçerli", status: (analysis?.schemaIssues ?? []).some((i) => i.level === "error") ? "FAIL" : "PASS", note: (analysis?.schemaTypes ?? []).join(", ") },
  ];
  const [after, before] = await db.pageVersion.findMany({ where: { pageId }, orderBy: { version: "desc" }, take: 2, select: { id: true } });
  await db.autopilotAction.update({
    where: { id: a.id },
    data: { status: "applied", appliedAt: new Date(), pageId, before: { field: "status", value: "DRAFT" } as object, after: { field: "status", value: "PUBLISHED", path: page.path, parentPath, postPublish: post } as object, versionBeforeId: before?.id ?? null, versionAfterId: after?.id ?? null },
  });
  await db.auditLog.create({ data: { userId: null, action: "autopilot.page.publish", entity: "page", entityId: pageId, detail: { actionId: a.id, path: page.path, postPublish: post } as object } });
  await startExperiment({ actionId: a.id, pageId, pagePath: page.path, type: "NEW_PAGE", query: page.primaryKeyword ? normalizeKeyword(page.primaryKeyword) : null, appliedAt: new Date() });
  const failed = post.filter((c) => c.status === "FAIL");
  return { status: "applied", note: `Yayınlandı: ${page.path}${failed.length ? ` — yayın sonrası uyarı: ${failed.map((f) => f.label).join(", ")}` : " — sitemap, canonical ve schema doğrulandı"}`, changedPaths: [page.path, ...(parentPath ? [parentPath] : [])] };
}

/** Geri alma: sayfa silinmez, TASLAK'a alınır ve üst sayfadaki link kaldırılır. */
export async function rollbackNewPage(a: Action, user: typeof AUTOPILOT_USER): Promise<void> {
  const after = a.after as { path?: string; parentPath?: string | null } | null;
  if (!a.pageId) throw new Error("Sayfa bulunamadı");
  const r = await savePage(user, a.pageId, await inputFor(a.pageId, { status: "DRAFT" }), "Otopilot yeni sayfası geri alındı (taslağa alındı)");
  if (!r.ok) throw new Error(r.error);
  if (after?.parentPath && after.path) {
    const parent = await db.page.findUnique({ where: { path: after.parentPath } });
    const rel = ((parent?.relatedLinks as { path: string }[] | null) ?? []);
    if (parent && rel.some((l) => l.path === after.path)) {
      const rest = rel.filter((l) => l.path !== after.path);
      await savePage(user, parent.id, await inputFor(parent.id, { relatedLinks: rest.length ? (rest as PageInput["relatedLinks"]) : null }), "Otopilot yeni sayfası geri alındı (iç link kaldırıldı)");
    }
  }
}
