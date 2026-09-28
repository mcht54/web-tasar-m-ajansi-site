import "server-only";
// EKSİK ALAN HAZIRLAYICILARI (eksik alan taraması için). Mevcut kalıbı izler: değer yalnızca
// sayfanın kendi verisinden (H1, ad, giriş, kayıtlı Medya alt metni, Search Console sorguları)
// veya yapay zekâdan (giriş, SSS) gelir; tümü commit → hazırlık modu → 48 saatlik öneri →
// uygulama hattından geçer. Gerçek bilgi yoksa "Ön koşul eksik"; yapay zekâ yoksa
// "Uygulanamaz — AI anahtarı gerekli". Hiçbiri durum/URL/canonical/index alanına dokunmaz.

import { db } from "../db";
import { siteUrl } from "../env";
import { parseFaq } from "../seo/analyzer-shared";
import { extractMarkdown } from "../text/markdown";
import { normalizeKeyword, trLower } from "../text/slug";
import { aiErrorMessage } from "../ai/claude";
import { sanitizeAiText } from "../content/sanitize";
import { LOCATION_TYPES } from "../seo/location-quality";
import { checkSection } from "./qc";
import { classifyIntent } from "./intent";
import { aiHooks, commitField, type ExecOutcome } from "./execute";

type Action = Awaited<ReturnType<typeof db.autopilotAction.findUniqueOrThrow>>;
export const AI_REQUIRED = "Uygulanamaz — AI anahtarı gerekli: bu alan yapay zekâ olmadan uydurulmadan üretilemez.";
const prereq = (why: string): ExecOutcome => ({ status: "needs_approval", note: `Ön koşul eksik: ${why}` });

async function load(a: Action) {
  if (!a.pageId) throw new Error("Öneriye bağlı sayfa yok");
  return db.page.findUniqueOrThrow({ where: { id: a.pageId } });
}
const places = async () => (await db.province.findMany({ select: { name: true } })).map((p) => p.name);
const sentences = (t: string) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 15);

async function execH1(a: Action): Promise<ExecOutcome> {
  const p = await load(a);
  if (p.h1?.trim()) return { status: "skipped", note: "H1 zaten var" };
  if (p.name.trim().length < 10) return prereq("sayfa adı H1 için çok kısa; editörden yazılmalı");
  return commitField(a, p.id, "h1", p.name.trim(), "H1 (sayfa adından)");
}

async function execKeyword(a: Action): Promise<ExecOutcome> {
  const p = await load(a);
  if (p.primaryKeyword?.trim()) return { status: "skipped", note: "Ana anahtar kelime zaten var" };
  const src = (p.h1 ?? p.name).replace(/[?!:|].*$/, "").trim();
  if (src.split(/\s+/).length < 2 || src.length > 80) return prereq("H1/ad ana anahtar kelimeye uygun değil");
  return commitField(a, p.id, "primaryKeyword", normalizeKeyword(src), "Ana anahtar kelime (H1'den)");
}

async function execSecondary(a: Action): Promise<ExecOutcome> {
  const p = await load(a);
  if (p.secondaryKeywords.length) return { status: "skipped", note: "İkincil kelimeler zaten var" };
  const url = p.path === "/" ? `${siteUrl()}/` : siteUrl() + p.path;
  const rows = await db.gscQueryDaily.groupBy({ by: ["query"], where: { page: url, date: { gte: new Date(Date.now() - 90 * 86400_000) } }, _sum: { impressions: true }, orderBy: { _sum: { impressions: "desc" } }, take: 10 });
  const primary = p.primaryKeyword ? normalizeKeyword(p.primaryKeyword) : null;
  const qs = rows.map((r) => normalizeKeyword(r.query)).filter((q) => q !== primary).slice(0, 5);
  if (!qs.length) return prereq("Search Console'da bu sayfa için sorgu verisi yok (ikincil kelime tahmin edilmez)");
  return commitField(a, p.id, "secondaryKeywords", qs, "İkincil kelimeler (Search Console sorgularından)");
}

async function execExcerpt(a: Action): Promise<ExecOutcome> {
  const p = await load(a);
  if (p.excerpt?.trim()) return { status: "skipped", note: "Özet zaten var" };
  const ss = sentences(p.intro ?? "");
  if (!ss.length) return prereq("giriş paragrafı yok (özet sayfanın kendi girişinden türetilir)");
  let out = ss[0];
  for (const s of ss.slice(1)) if (`${out} ${s}`.length <= 300) out = `${out} ${s}`;
  if (out.length > 400) return prereq("girişten 400 karakteri aşmayan özet çıkarılamadı");
  return commitField(a, p.id, "excerpt", out, "Özet (girişten)");
}

/** Gövdedeki kayıtlı Medya görselleri (dosya adıyla). */
async function bodyMedia(body: string | null) {
  const imgs = extractMarkdown(body).images;
  const files = imgs.map((i) => /\/medya\/([^)?#\s]+)/.exec(i.src)?.[1]).filter(Boolean) as string[];
  const media = files.length ? await db.media.findMany({ where: { OR: files.map((f) => ({ filename: f.replace(/-\d+\.(webp|avif|jpe?g|png)$/, ".$1") })).concat(files.map((f) => ({ filename: f }))) } }) : [];
  return { imgs, media };
}

async function execOgImage(a: Action): Promise<ExecOutcome> {
  const p = await load(a);
  if (p.ogImageId) return { status: "skipped", note: "OG görseli zaten var" };
  const { media } = await bodyMedia(p.body);
  const m = media.find((x) => x.alt?.trim() && x.width >= 600);
  if (!m) return prereq("sayfada alt metni olan ve en az 600 px genişlikte kayıtlı görsel yok (varsayılan OG görseli kullanılıyor)");
  return commitField(a, p.id, "ogImageId", m.id, `OG görseli (${m.filename})`);
}

async function execAltText(a: Action): Promise<ExecOutcome> {
  const p = await load(a);
  const body = p.body ?? "";
  const { media } = await bodyMedia(body);
  let changed = 0;
  const next = body.replace(/!\[\s*\]\(([^)]+)\)/g, (all, src: string) => {
    const file = /\/medya\/([^)?#\s]+)/.exec(src)?.[1];
    const m = file ? media.find((x) => file === x.filename || file.startsWith(x.filename.replace(/\.[a-z]+$/, ""))) : undefined;
    if (!m?.alt?.trim()) return all;
    changed++;
    return `![${m.alt.trim().replace(/[[\]]/g, "")}](${src})`;
  });
  if (!changed) return prereq("alt metni boş görseller için Medya kaydında alt metin yok (alt metin uydurulmaz)");
  return commitField(a, p.id, "body", next, `${changed} görsele alt metin (Medya kaydından)`);
}

function context(p: Awaited<ReturnType<typeof load>>) {
  const md = extractMarkdown(p.body);
  const text = `${p.h1 ?? p.name}\n${p.intro ?? ""}\n${md.text}`.trim();
  const intent = classifyIntent(p.primaryKeyword ?? p.name, { hasLocation: LOCATION_TYPES.has(p.type) }).primary;
  return { text, intent };
}

async function execIntro(a: Action, model: string): Promise<ExecOutcome> {
  const p = await load(a);
  if (p.intro?.trim()) return { status: "skipped", note: "Giriş paragrafı zaten var" };
  if (!aiHooks.available()) return { status: "needs_approval", note: AI_REQUIRED };
  const { text, intent } = context(p);
  if (text.split(/\s+/).length < 40) return prereq("sayfada girişe kaynak olacak yeterli metin yok (yalnızca sayfadaki bilgi kullanılır)");
  let intro: string;
  try {
    intro = sanitizeAiText((await aiHooks.intro({ path: p.path, h1: p.h1 ?? p.name, query: p.primaryKeyword, intent, existingFaq: [], text }, model)).intro);
  } catch (e) {
    return { status: "failed", note: `Yapay zekâ üretimi başarısız: ${aiErrorMessage(e)}` };
  }
  const words = intro.split(/\s+/).length;
  // Yoğunluk kısa metinde yanıltıcıdır (4 kelimelik ifade 30 kelimede tek geçişte %13); giriş için
  // "ana ifade en çok 2 kez" kuralı uygulanır, sayfa düzeyi stuffing uygulama hattında ölçülür
  const qc = checkSection(intro, { query: null, sourceText: text, beforeWords: 0, addedWords: Math.max(words, 60), places: await places() });
  const problems = qc.problems.filter((x) => !/tekrar ediyor/.test(x)); // giriş, sayfanın kendi bilgisini özetler
  if (p.primaryKeyword && trLower(intro).split(trLower(p.primaryKeyword)).length - 1 > 2) problems.push("Ana anahtar kelime girişte 2'den fazla geçiyor");
  if (words < 20 || words > 120) problems.push(`Giriş uzunluğu ${words} kelime (20–120 olmalı)`);
  if (problems.length) return { status: "skipped", note: `Kalite kapısı: ${problems.join("; ")}` };
  return commitField(a, p.id, "intro", intro, "Giriş paragrafı (yapay zekâ, sayfanın kendi bilgisiyle)");
}

async function execFaq(a: Action, model: string): Promise<ExecOutcome> {
  const p = await load(a);
  const existing = parseFaq(p.faq);
  if (existing.length >= 2) return { status: "skipped", note: "SSS zaten var" };
  if (!aiHooks.available()) return { status: "needs_approval", note: AI_REQUIRED };
  const { text, intent } = context(p);
  if (text.split(/\s+/).length < 80) return prereq("sayfada SSS yanıtlarına kaynak olacak yeterli metin yok");
  let items: { q: string; a: string }[];
  try {
    items = (await aiHooks.faq({ path: p.path, h1: p.h1 ?? p.name, query: p.primaryKeyword, intent, existingFaq: existing.map((f) => f.q), text }, model)).faq
      .map((f) => ({ q: sanitizeAiText(f.q), a: sanitizeAiText(f.a) })).filter((f) => f.q && f.a).slice(0, 4);
  } catch (e) {
    return { status: "failed", note: `Yapay zekâ üretimi başarısız: ${aiErrorMessage(e)}` };
  }
  const pl = await places();
  const problems: string[] = [];
  for (const f of items) {
    const qc = checkSection(`${f.q}\n${f.a}`, { query: null, sourceText: text, beforeWords: 0, addedWords: 60, places: pl });
    for (const x of qc.problems.filter((y) => !/tekrar ediyor|çok kısa/.test(y))) problems.push(`“${f.q}”: ${x}`);
    if (existing.some((e) => trLower(e.q) === trLower(f.q))) problems.push(`“${f.q}” zaten var`);
  }
  if (items.length < 2) problems.push("En az 2 soru gerekir");
  if (problems.length) return { status: "skipped", note: `Kalite kapısı: ${problems.slice(0, 4).join("; ")}` };
  return commitField(a, p.id, "faq", [...existing, ...items], `${items.length} SSS (yapay zekâ, sayfanın kendi bilgisiyle)`);
}

/** Eylem türü → hazırlayıcı (prepareAction bu tabloyu kullanır). */
export const FIELD_EXECUTORS: Record<string, (a: Action, model: string) => Promise<ExecOutcome>> = {
  H1: execH1, KEYWORD: execKeyword, SECONDARY_KEYWORDS: execSecondary, EXCERPT: execExcerpt,
  OG_IMAGE: execOgImage, ALT_TEXT: execAltText, INTRO: execIntro, FAQ: execFaq,
};
