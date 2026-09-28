import "server-only";
// UYGULA: güvenli işlemler kalite kapısından geçerse sayfaya yazılır.
// Her değişiklik savePage üzerinden sürüm geçmişine girer, alan logu tutulur,
// deney kaydı açılır ve tek tıkla (alan bazında) geri alınabilir.

import { loadAiKey } from "../ai/key";
import { db } from "../db";
import type { SessionUser } from "../auth/session";
import { FIELD_LABELS, diffFields, pageInputSchema, savePage, snapshotOf, type PageInput } from "../admin/pages";
import { parseFaq } from "../seo/analyzer-shared";
import { loadSiteState } from "../seo/analyzer";
import { resolveDescription, resolveTitle } from "../seo/meta";
import { extractMarkdown } from "../text/markdown";
import { wordCount } from "../text/analyze";
import { containsPhrase, trLower, trUpperFirst } from "../text/slug";
import { claudeAvailable, aiErrorMessage } from "../ai/claude";
import { getSettingsFresh } from "../settings";
import { aiPage, aiSection, aiSnippets } from "./ai";
import { execNewPage, newPageGate, publishNewPage, rollbackNewPage } from "./new-page";
import { checkAnchor, checkDescription, checkSection, checkTitle } from "./qc";
import { startExperiment } from "./experiments";
import { addDays, pageMetrics } from "./metrics";

export const AUTOPILOT_USER: SessionUser = { id: "autopilot", email: "", name: "SEO Otopilot", role: "ADMIN", sessionId: "" };

type RelatedLink = { path: string; anchor: string; reason?: string };
type Action = Awaited<ReturnType<typeof db.autopilotAction.findUniqueOrThrow>>;
type Proposal = { pagePath?: string | null; payload?: Record<string, unknown>; section?: { heading: string; markdown: string }; alternatives?: unknown };

export type FieldChange = { field: keyof PageInput; before: unknown; after: unknown };
export type PageChangeSet = { pageId: string; path: string; changes: FieldChange[] };
export type ProposedChanges = { pages: PageChangeSet[] };

export type ExecOutcome = {
  status: "applied" | "skipped" | "failed" | "needs_approval" | "prepared";
  note: string;
  changedPaths?: string[];
  changes?: ProposedChanges; // prepared: uygulanacak somut değişiklik
  noAuto?: string; // prepared ama otomatik uygulanmamalı (ör. elle düzenlenmiş alan)
};

/** Hazırlık modu: kalite kapısı çalışır, sayfaya yazılmaz; değişiklik listesi döner. */
type PrepAction = Action & { prepareOnly?: boolean };

/** AI çağrısı test ve geliştirme ortamında taklit edilebilir. */
export const aiHooks = { snippets: aiSnippets, section: aiSection, page: aiPage, available: claudeAvailable };

async function pageInput(pageId: string) {
  const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const cur = snapshotOf(page as unknown as Record<string, unknown>);
  return { page, cur, input: (patch: Partial<PageInput>) => pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), ...patch }) };
}

/** Elle düzenlenen alanın üzerine otomatik yazılmaz (insan onayı hariç). */
export const MANUAL_EDIT_GUARD_DAYS = 30;

async function manualEditBlock(pageId: string, field: keyof PageInput): Promise<string | null> {
  if (field === "relatedLinks") return null; // yalnızca otopilotun yönettiği alan
  const label = FIELD_LABELS[field] ?? field;
  const human = await db.seoChangeLog.findFirst({
    where: { pageId, field: label, userId: { not: null }, NOT: { userName: AUTOPILOT_USER.name }, createdAt: { gte: new Date(Date.now() - MANUAL_EDIT_GUARD_DAYS * 86400_000) } },
    orderBy: { createdAt: "desc" },
  });
  return human ? `“${label}” alanı ${human.createdAt.toLocaleDateString("tr-TR")} tarihinde ${human.userName ?? "bir editör"} tarafından elle düzenlenmiş; son ${MANUAL_EDIT_GUARD_DAYS} gün içinde otomatik değişiklik yapılmaz. Öneri onay bekliyor.` : null;
}

async function commit(a: PrepAction, pageId: string, field: keyof PageInput, value: unknown, note: string, opts: { approved?: boolean } = {}): Promise<ExecOutcome> {
  if (a.prepareOnly) {
    const { page, cur } = await pageInput(pageId);
    if (!diffFields({ [field]: cur[field] ?? null }, { [field]: value ?? null }).length) return { status: "skipped", note: "Değişiklik oluşmadı (değer zaten aynı)" };
    const block = opts.approved ? null : await manualEditBlock(pageId, field);
    return { status: "prepared", note, changes: { pages: [{ pageId, path: page.path, changes: [{ field, before: cur[field] ?? null, after: value ?? null }] }] }, ...(block ? { noAuto: block } : {}) };
  }
  if (!opts.approved) {
    const block = await manualEditBlock(pageId, field);
    if (block) {
      await db.autopilotAction.update({ where: { id: a.id }, data: { proposal: { ...(a.proposal as object), pending: { field, value } } as object } });
      return { status: "needs_approval", note: block };
    }
  }
  const { page, cur, input } = await pageInput(pageId);
  const r = await savePage(AUTOPILOT_USER, pageId, input({ [field]: value } as Partial<PageInput>), `Otopilot: ${note}`);
  if (!r.ok) return { status: "failed", note: r.error };
  if (!r.changed.length) return { status: "skipped", note: "Değişiklik oluşmadı (değer zaten aynı)" };
  const [after, before] = await db.pageVersion.findMany({ where: { pageId }, orderBy: { version: "desc" }, take: 2, select: { id: true } });
  const appliedAt = new Date();
  await db.autopilotAction.update({
    where: { id: a.id },
    data: { status: "applied", appliedAt, before: { field, value: cur[field] ?? null } as object, after: { field, value: value ?? null } as object, versionBeforeId: before?.id ?? null, versionAfterId: after?.id ?? null },
  });
  await db.auditLog.create({ data: { userId: null, action: "autopilot.apply", entity: "page", entityId: pageId, detail: { actionId: a.id, type: a.type, field, path: page.path } } });
  return { status: "applied", note, changedPaths: [page.path] };
}

/** İl adları: kaynak metinde geçmeyen yer adı eklenemez (şehir spamı / doğrulanmamış yerel bilgi). */
async function placeNames(): Promise<string[]> {
  return (await db.province.findMany({ select: { name: true } })).map((p) => p.name);
}

/** Karşılaştırma için diğer yayındaki sayfaların metni. */
async function otherPageTexts(pageId: string) {
  const rows = await db.page.findMany({ where: { status: "PUBLISHED", id: { not: pageId }, body: { not: null } }, select: { path: true, intro: true, body: true } });
  return rows.map((r) => ({ path: r.path, text: `${r.intro ?? ""} ${extractMarkdown(r.body).text}` }));
}

async function otherTitles(pageId: string) {
  const st = await loadSiteState();
  return new Set(st.pages.filter((p) => p.id !== pageId && p.status === "PUBLISHED").map((p) => trLower(resolveTitle(p, st.settings.seo))));
}

function sentencesWith(text: string, query: string | null): string[] {
  const s = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 20 && !/[#[\]|*]/.test(x));
  return query ? [...s.filter((x) => containsPhrase(x, query)), ...s.filter((x) => !containsPhrase(x, query))] : s;
}

/** Sayfanın kendi cümlelerinden 110–160 karakterlik açıklama (yeni bilgi eklenmez). */
export function ruleDescription(text: string, query: string | null): string | null {
  const ss = sentencesWith(text, query);
  for (let i = 0; i < ss.length; i++) {
    let d = ss[i];
    if (d.length >= 110 && d.length <= 160) return d;
    for (let j = 0; j < ss.length && d.length < 110; j++) {
      if (j === i) continue;
      const next = `${d} ${ss[j]}`;
      if (next.length <= 160) d = next;
    }
    if (d.length >= 110 && d.length <= 160) return d;
  }
  return null;
}

export function ruleTitles(query: string, pageName: string, h1: string, siteName: string): string[] {
  const q = trUpperFirst(query.trim());
  const out = [`${q} | ${siteName}`, `${q} – ${pageName}`, `${q}: ${h1}`, `${h1} | ${siteName}`];
  return [...new Set(out.map((t) => t.replace(/\s+/g, " ").trim()))];
}

async function execTitle(a: Action, model: string, approved = false): Promise<ExecOutcome> {
  if (!a.pageId || !a.query) return { status: "skipped", note: "Odak sorgu yok" };
  const { page } = await pageInput(a.pageId);
  const st = await getSettingsFresh();
  const current = resolveTitle(page, st.seo);
  const others = await otherTitles(page.id);
  const md = extractMarkdown(page.body);
  const alts: { text: string; source: string }[] = [];
  let aiNote = "";
  if (aiHooks.available()) {
    try {
      const m = await pageMetrics(page.path, { from: addDays(new Date(), -31), to: addDays(new Date(), -3) });
      const r = await aiHooks.snippets({ path: page.path, siteName: st.site.siteName, query: a.query, currentTitle: current, currentDescription: page.metaDescription ?? "", h1: page.h1 ?? page.name, intro: page.intro ?? "", excerpt: md.text.slice(0, 3000), ctr: m?.ctr ?? null, position: m?.position ?? null }, model);
      alts.push(...r.titles.map((t) => ({ text: t.trim(), source: "yapay zekâ" })));
    } catch (e) {
      aiNote = ` Yapay zekâ kullanılamadı: ${aiErrorMessage(e)}.`;
    }
  }
  alts.push(...ruleTitles(a.query, page.name, page.h1 ?? page.name, st.site.siteName).map((t) => ({ text: t, source: "kural" })));
  const places = await placeNames();
  const titleSource = `${page.name} ${page.h1 ?? ""} ${page.intro ?? ""} ${md.text}`;
  const checked = alts.map((x) => ({ ...x, qc: checkTitle(x.text, { query: a.query, current, otherTitles: others, sourceText: titleSource, places }) }));
  await db.autopilotAction.update({ where: { id: a.id }, data: { proposal: { ...(a.proposal as object), alternatives: checked } as object } });
  const best = checked.find((x) => x.qc.ok);
  if (!best) return { status: "skipped", note: `Kalite kapısını geçen title alternatifi yok: ${checked.map((c) => `“${c.text}” (${c.qc.problems.join(", ")})`).slice(0, 3).join("; ")}.${aiNote}` };
  return commit(a, page.id, "seoTitle", best.text, `Title (${best.source}) “${a.query}” için CTR optimizasyonu`, { approved });
}

async function execMeta(a: Action, model: string, approved = false): Promise<ExecOutcome> {
  if (!a.pageId) return { status: "skipped", note: "Sayfa yok" };
  const { page } = await pageInput(a.pageId);
  const st = await getSettingsFresh();
  const current = page.metaDescription ?? "";
  const md = extractMarkdown(page.body);
  const source = `${page.h1 ?? ""} ${page.intro ?? ""} ${md.text}`;
  const alts: { text: string; source: string }[] = [];
  let aiNote = "";
  if (aiHooks.available()) {
    try {
      const r = await aiHooks.snippets({ path: page.path, siteName: st.site.siteName, query: a.query, currentTitle: resolveTitle(page, st.seo), currentDescription: resolveDescription(page, st.seo), h1: page.h1 ?? page.name, intro: page.intro ?? "", excerpt: md.text.slice(0, 3000), ctr: null, position: null }, model);
      alts.push(...r.descriptions.map((t) => ({ text: t.trim(), source: "yapay zekâ" })));
    } catch (e) {
      aiNote = ` Yapay zekâ kullanılamadı: ${aiErrorMessage(e)}.`;
    }
  }
  const rule = ruleDescription(`${page.intro ?? ""} ${md.text}`, a.query);
  if (rule) alts.push({ text: rule, source: "sayfanın kendi cümleleri" });
  const places = await placeNames();
  const checked = alts.map((x) => ({ ...x, qc: checkDescription(x.text, { query: a.query, current, sourceText: source, places }) }));
  await db.autopilotAction.update({ where: { id: a.id }, data: { proposal: { ...(a.proposal as object), alternatives: checked } as object } });
  const best = checked.find((x) => x.qc.ok);
  if (!best) return { status: "skipped", note: `Kalite kapısını geçen açıklama yok.${checked.length ? ` ${checked.map((c) => c.qc.problems.join(", ")).slice(0, 2).join("; ")}.` : " Sayfa metninden uygun cümle çıkarılamadı."}${aiNote}` };
  return commit(a, page.id, "metaDescription", best.text, `Meta description (${best.source})`, { approved });
}

async function execLink(a: Action): Promise<ExecOutcome> {
  const p = (a.proposal as Proposal).payload ?? {};
  const source = String(p.source ?? ""), target = String(p.target ?? "");
  const src = await db.page.findUnique({ where: { path: source } });
  const tgt = await db.page.findUnique({ where: { path: target } });
  if (!src || !tgt) return { status: "skipped", note: "Kaynak veya hedef sayfa bulunamadı" };
  if (tgt.status !== "PUBLISHED" || !tgt.robotsIndex || tgt.autoNoindex) return { status: "skipped", note: "Hedef sayfa yayında/indekslenebilir değil" };
  const links = ((src.relatedLinks as RelatedLink[] | null) ?? []).slice();
  if (links.some((l) => l.path === target)) return { status: "skipped", note: "Bağlantı zaten var" };
  if (links.length >= 8) return { status: "skipped", note: "Kaynak sayfada otomatik bağlantı sınırı (8) dolu" };
  // Doğal anchor çeşitliliği: aynı hedefe verilen mevcut anchor'lara bakılır
  const st = await loadSiteState();
  const existing = st.edges.filter((e) => e.to === target && e.kind !== "nav").map((e) => e.anchor);
  // Seçenekler yalnızca hedef sayfanın kendi konusunu adlandıranlar: öneri anchor'ı, hedef
  // kelime, H1 ve ad (ikincil kelimeler konu dışı olabilir, kullanılmaz). Biçim kontrolünden
  // geçenler arasında bu hedefe en az kullanılmış olan seçilir (anchor çeşitliliği).
  const options = [...new Set([String(p.anchor ?? ""), tgt.primaryKeyword ?? "", tgt.h1 ?? "", tgt.name].map((x) => x.trim()).filter((x) => x && x.length <= 60))];
  const used = (o: string) => existing.filter((x) => trLower(x.trim()) === trLower(o)).length;
  const anchor = options.filter((o) => checkAnchor(o, []).ok).map((o, i) => ({ o, i, n: used(o) })).sort((a, b) => a.n - b.n || a.i - b.i)[0]?.o;
  if (!anchor) return { status: "skipped", note: "Doğal bir anchor metni bulunamadı" };
  links.push({ path: target, anchor, reason: a.reason.slice(0, 300) });
  const r = await commit(a, src.id, "relatedLinks", links, `İç link → ${target} (“${anchor}”)`);
  return r.status === "applied" ? { ...r, changedPaths: [source] } : r;
}

async function execBroken(a: Action, approved = false): Promise<ExecOutcome> {
  const p = (a.proposal as Proposal).payload ?? {};
  const from = String(p.from ?? ""), to = p.to ? String(p.to) : null;
  if (!a.pageId || !to) return { status: "needs_approval", note: "Doğru hedef bilinmiyor; insan kararı gerekir" };
  const { page } = await pageInput(a.pageId);
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\]\\(${esc}(?=[)#?\\s])`, "g");
  const body = page.body ?? "";
  if (re.test(body)) return commit(a, page.id, "body", body.replace(re, `](${to}`), `Kırık link ${from} → ${to}`, { approved });
  const links = (page.relatedLinks as RelatedLink[] | null) ?? [];
  if (links.some((l) => l.path === from)) return commit(a, page.id, "relatedLinks", links.map((l) => (l.path === from ? { ...l, path: to } : l)), `Kırık link ${from} → ${to}`, { approved });
  return { status: "skipped", note: "Kırık link sayfa gövdesinde bulunamadı (şablon linki olabilir)" };
}

async function execContent(a: Action, model: string, allowControlled: boolean): Promise<ExecOutcome> {
  if (!a.pageId) return { status: "skipped", note: "Sayfa yok" };
  if (!aiHooks.available()) return { status: "needs_approval", note: "Yapay zekâ anahtarı yok: içerik genişletme kural tabanlı yapılmaz (uydurma riski). Editörün gerçek bilgiyle genişletmesi gerekir." };
  const { page } = await pageInput(a.pageId);
  const md = extractMarkdown(page.body);
  const sourceText = `${page.h1 ?? ""} ${page.intro ?? ""} ${md.text}`;
  let section: { heading: string; markdown: string };
  try {
    section = await aiHooks.section({ path: page.path, query: a.query, h1: page.h1 ?? page.name, headings: md.headings.map((h) => h.text), body: page.body ?? "", gaps: [a.reason] }, model);
  } catch (e) {
    return { status: "failed", note: `Yapay zekâ: ${aiErrorMessage(e)}` };
  }
  const before = wordCount(sourceText);
  const added = wordCount(section.markdown);
  const qc = checkSection(`${section.heading}\n${section.markdown}`, { query: a.query, sourceText, beforeWords: before, addedWords: added, places: await placeNames(), otherPages: await otherPageTexts(page.id) });
  await db.autopilotAction.update({ where: { id: a.id }, data: { proposal: { ...(a.proposal as object), section, qc } as object, qualityNotes: qc.problems.join("; ") || null } });
  if (md.headings.some((h) => trLower(h.text) === trLower(section.heading))) return { status: "skipped", note: "Önerilen başlık sayfada zaten var" };
  const body = `${(page.body ?? "").trimEnd()}\n\n## ${section.heading.replace(/^#+\s*/, "")}\n\n${section.markdown.trim()}\n`;
  const note = `İçerik bölümü eklendi: “${section.heading}”`;
  if (!qc.ok) {
    const onlySize = qc.problems.every((p) => p.includes("%40"));
    // Büyük değişiklik: öneri hazırlanır ama yalnızca insan onayıyla uygulanır
    if (onlySize && (a as PrepAction).prepareOnly) return { ...(await commit(a, page.id, "body", body, note)), noAuto: qc.problems.join("; ") };
    return onlySize ? { status: "needs_approval", note: qc.problems.join("; ") } : { status: "skipped", note: `Kalite kapısı: ${qc.problems.join("; ")}` };
  }
  if (!allowControlled) return { status: "needs_approval", note: "Kontrollü otomatik uygulama kapalı; öneri onay bekliyor" };
  return commit(a, page.id, "body", body, note);
}

/** Tek işlemi çalıştırır ve sonucu işleme yazar. */
export async function executeAction(actionId: string, opts: { allowControlled: boolean; model: string; approvedBy?: string }): Promise<ExecOutcome> {
  const found = await db.autopilotAction.findUniqueOrThrow({ where: { id: actionId } });
  await loadAiKey();
  const approved = Boolean(opts.approvedBy);
  if (!["TITLE", "META", "INTERNAL_LINK", "BROKEN_LINK", "CONTENT", "NEW_PAGE"].includes(found.type)) return { status: "needs_approval", note: "Yüksek riskli işlem: insan onayı gerekir" };
  // Sahiplenme (idempotency): yalnızca "planned" (veya onaylanmış "needs_approval") işlem
  // tek bir kez "applying" durumuna alınır; yeniden deneme / eşzamanlı çalışma aynı
  // değişikliği ikinci kez yapamaz.
  const claimed = await db.autopilotAction.updateMany({ where: { id: actionId, status: { in: approved ? ["planned", "needs_approval"] : ["planned"] } }, data: { status: "applying" } });
  if (claimed.count !== 1) return { status: "skipped", note: `İşlem zaten işlenmiş (durum: ${found.status})` };
  const a = { ...found, status: "applying" };
  let r: ExecOutcome;
  try {
    switch (a.type) {
      case "TITLE": r = await execTitle(a, opts.model, approved); break;
      case "META": r = await execMeta(a, opts.model, approved); break;
      case "INTERNAL_LINK": r = await execLink(a); break;
      case "BROKEN_LINK": r = await execBroken(a, approved); break;
      case "CONTENT": r = await execContent(a, opts.model, opts.allowControlled); break;
      case "NEW_PAGE": r = await execNewPage(a, { model: opts.model, approved }); break;
      default: r = { status: "needs_approval", note: "Yüksek riskli işlem: insan onayı gerekir" };
    }
  } catch (e) {
    r = { status: "failed", note: e instanceof Error ? e.message : String(e) };
  }
  if (r.status !== "applied") {
    await db.autopilotAction.update({ where: { id: a.id }, data: { status: r.status, qualityNotes: r.note, ...(r.status === "failed" ? { error: r.note } : {}) } });
    return r;
  }
  await db.autopilotAction.update({ where: { id: a.id }, data: { qualityNotes: r.note } });
  // Deney: iç linkte etkisi ölçülen sayfa hedef sayfadır
  const fresh = await db.autopilotAction.findUniqueOrThrow({ where: { id: a.id } });
  const payload = (a.proposal as Proposal).payload ?? {};
  const measured = a.type === "INTERNAL_LINK" ? await db.page.findUnique({ where: { path: String(payload.target ?? "") } }) : a.pageId ? await db.page.findUnique({ where: { id: a.pageId } }) : null;
  if (measured && a.type !== "BROKEN_LINK" && a.type !== "NEW_PAGE") {
    await startExperiment({ actionId: a.id, pageId: measured.id, pagePath: measured.path, type: a.type, query: a.query, appliedAt: fresh.appliedAt ?? new Date() });
  }
  return r;
}

/**
 * Öneriyi HAZIRLAR: uygulama anında yapılacak tüm hesap (alternatif üretimi, kalite kapısı,
 * yapay zekâ bölümü, yeni sayfa taslağı + kapı) şimdi yapılır; sonuç somut değişiklik
 * listesidir. Yayındaki sayfaya dokunulmaz (yeni sayfa taslağı görünmez kalır). Böylece
 * kullanıcı onay penceresinde tam olarak neyin uygulanacağını görür.
 */
export async function prepareAction(actionId: string, opts: { model: string }): Promise<ExecOutcome> {
  const found = await db.autopilotAction.findUniqueOrThrow({ where: { id: actionId } });
  await loadAiKey();
  const a: PrepAction = { ...found, prepareOnly: true };
  try {
    switch (a.type) {
      case "TITLE": return await execTitle(a, opts.model);
      case "META": return await execMeta(a, opts.model);
      case "INTERNAL_LINK": return await execLink(a);
      case "BROKEN_LINK": return await execBroken(a);
      case "CONTENT": return await execContent(a, opts.model, true);
      case "NEW_PAGE": return await execNewPage(a, { model: opts.model, prepareOnly: true });
      default: return { status: "needs_approval", note: "Bu tür (teknik/lokasyon/cannibalization kararı) otomatik uygulanmaz; ilgili ekrandan elle yapılır." };
    }
  } catch (e) {
    return { status: "failed", note: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Onaylanan öneride sayfaya yazılabilecek somut bir değişiklik var mı? Yoksa gerçek neden
 * döner (düğme gösterilmez; "onaylandı" deyip hiçbir şey yapmamak yasak).
 */
export function applyBlocker(a: Pick<Action, "type" | "pageId" | "proposal">): string | null {
  const prop = (a.proposal ?? {}) as Proposal & { pageId?: string | null; group?: unknown };
  switch (a.type) {
    case "TITLE": case "META": return a.pageId ? null : "Öneriye bağlı sayfa yok";
    case "INTERNAL_LINK": return prop.payload?.source && prop.payload?.target ? null : "Kaynak/hedef sayfa bilgisi yok";
    case "BROKEN_LINK": return a.pageId && prop.payload?.to ? null : "Kırık linkin doğru hedefi bilinmiyor; sayfa editöründen düzeltin";
    case "CONTENT":
      if (prop.section && a.pageId) return null;
      return aiHooks.available() ? null : "Bu öneride uygulanacak içerik yok: yapay zekâ anahtarı bağlı değil ve içerik kural tabanlı üretilmez (uydurma riski). Ayarlar → Entegrasyonlar'dan anahtar ekleyin veya sayfayı editörden genişletin.";
    case "NEW_PAGE": return prop.group ? null : "Yeni sayfa önerisinde sorgu kümesi yok";
    default: return "Bu tür (teknik/lokasyon/cannibalization kararı) otomatik uygulanmaz; ilgili ekrandan elle yapılır.";
  }
}

/**
 * İnsan onayı: öneriyi uygular. Uygulanamıyorsa hata fırlatır (sessiz başarı yok);
 * uygulama denenip olmadıysa işlem onay listesinde kalır ve gerçek neden yazılır.
 */
export async function approveAction(user: SessionUser, id: string, model: string): Promise<ExecOutcome> {
  const a = await db.autopilotAction.findUniqueOrThrow({ where: { id } });
  if (a.status !== "needs_approval") throw new Error("Bu işlem onay beklemiyor");
  const blocker = applyBlocker(a);
  if (blocker) throw new Error(blocker);
  const prop = a.proposal as Proposal;
  if (a.type === "CONTENT" && prop.section && a.pageId) {
    const { page } = await pageInput(a.pageId);
    const body = `${(page.body ?? "").trimEnd()}\n\n## ${prop.section.heading}\n\n${prop.section.markdown.trim()}\n`;
    const r = await commit(a, page.id, "body", body, `İçerik bölümü (onaylayan: ${user.name})`, { approved: true });
    if (r.status === "applied") await startExperiment({ actionId: a.id, pageId: page.id, pagePath: page.path, type: a.type, query: a.query, appliedAt: new Date() });
    else await db.autopilotAction.update({ where: { id }, data: { status: "needs_approval", qualityNotes: r.note } });
    return r;
  }
  if (a.type === "NEW_PAGE") {
    // Onay: taslak kalite kapısını geçtiyse yayınla; yoksa (yeniden) üret ve kapıdan geçir
    const p = a.proposal as { pageId?: string | null; parentPath?: string | null; group?: Parameters<typeof newPageGate>[1] };
    if (p.pageId && p.group) {
      const gate = await newPageGate(p.pageId, p.group);
      if (!gate.ok) throw new Error(`Kalite kapısı geçmedi: ${gate.checks.filter((c) => c.status === "FAIL").map((c) => `${c.label} — ${c.note}`).join("; ")}`);
      const claimed = await db.autopilotAction.updateMany({ where: { id, status: "needs_approval" }, data: { status: "applying" } });
      if (claimed.count !== 1) throw new Error("İşlem zaten işlendi");
      return publishNewPage(a, p.pageId, p.parentPath ?? null);
    }
    return executeAction(id, { allowControlled: true, model, approvedBy: user.name });
  }
  const r = await executeAction(id, { allowControlled: true, model, approvedBy: user.name });
  await db.auditLog.create({ data: { userId: user.id, action: r.status === "applied" ? "autopilot.approve.apply" : "autopilot.approve.fail", entity: "autopilotAction", entityId: id, detail: { status: r.status, note: r.note } } });
  // Uygulanamadıysa öneri kaybolmaz: onay listesinde gerçek nedenle kalır
  if (r.status !== "applied") await db.autopilotAction.update({ where: { id }, data: { status: "needs_approval", qualityNotes: r.note } });
  return r;
}

export async function rejectAction(user: SessionUser, id: string) {
  const a = await db.autopilotAction.findUniqueOrThrow({ where: { id } });
  if (a.status !== "needs_approval" && a.status !== "planned") throw new Error("Bu işlem reddedilemez");
  await db.autopilotAction.update({ where: { id }, data: { status: "rejected", qualityNotes: `Reddedildi (${user.name})` } });
  await db.auditLog.create({ data: { userId: user.id, action: "autopilot.reject", entity: "autopilotAction", entityId: id } });
}

/**
 * Geri al: yalnızca değiştirilen alan eski değerine döner (sonraki başka
 * düzenlemeler korunur). Alan sonradan elle değiştiyse geri alma reddedilir.
 */
export async function rollbackAction(user: SessionUser, id: string): Promise<void> {
  const a = await db.autopilotAction.findUniqueOrThrow({ where: { id } });
  if (a.status !== "applied") throw new Error("Yalnızca uygulanmış işlem geri alınabilir");
  if (a.type === "NEW_PAGE") {
    await rollbackNewPage(a, user);
    return finishRollback(user, id);
  }
  const before = a.before as { field: keyof PageInput; value: unknown } | null;
  const after = a.after as { field: keyof PageInput; value: unknown } | null;
  if (!before || !after) throw new Error("Geri alma verisi yok");
  const pageId = a.type === "INTERNAL_LINK" ? (await db.page.findUnique({ where: { path: String(((a.proposal as Proposal).payload ?? {}).source ?? "") } }))?.id : a.pageId;
  if (!pageId) throw new Error("Sayfa bulunamadı");
  const { cur, input } = await pageInput(pageId);
  if (a.type === "INTERNAL_LINK") {
    // Bağlantı bazında geri alma: yalnızca bu işlemin eklediği link çıkarılır,
    // aynı sayfaya sonradan eklenen diğer linkler korunur.
    const target = String(((a.proposal as Proposal).payload ?? {}).target ?? "");
    const links = (cur.relatedLinks as RelatedLink[] | null) ?? [];
    if (!links.some((l) => l.path === target)) throw new Error("Bu iç link sayfada artık yok; sürüm geçmişinden kontrol edin");
    const rest = links.filter((l) => l.path !== target);
    const r = await savePage(user, pageId, input({ relatedLinks: rest.length ? rest : null }), `Otopilot işlemi geri alındı (${a.title})`);
    if (!r.ok) throw new Error(r.error);
    return finishRollback(user, a.id);
  }
  if (diffFields({ [after.field]: cur[after.field] ?? null }, { [after.field]: after.value }).length) throw new Error("Alan otomatik değişiklikten sonra elle değiştirilmiş; sürüm geçmişinden kontrol edin");
  const r = await savePage(user, pageId, input({ [before.field]: before.value } as Partial<PageInput>), `Otopilot işlemi geri alındı (${a.title})`);
  if (!r.ok) throw new Error(r.error);
  return finishRollback(user, id);
}

async function finishRollback(user: SessionUser, id: string) {
  await db.autopilotAction.update({ where: { id }, data: { status: "rolled_back" } });
  await db.experiment.updateMany({ where: { actionId: id }, data: { status: "rolled_back" } });
  await db.auditLog.create({ data: { userId: user.id === AUTOPILOT_USER.id ? null : user.id, action: "autopilot.rollback", entity: "autopilotAction", entityId: id } });
}
