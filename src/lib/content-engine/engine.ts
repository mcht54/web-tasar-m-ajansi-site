import "server-only";
// SEO CONTENT ENGINE — harici yapay zekâ API'si veya yerel LLM KULLANMAZ.
//
// Tamamen deterministik ve veri tabanlıdır: yalnızca sitenin kendi yayındaki sayfalarındaki
// gerçek cümleleri, başlıkları, SSS'leri, hizmet/sektör kayıtlarını ve verilen sorguyu kullanır.
// Metni "yazmaz"; mevcut gerçek bilgiyi seçer, yeniden yapılandırır ve sınırlı, iddiasız kalıp
// cümlelerle bağlar. Kaynakta olmayan rakam, fiyat, müşteri, sonuç, yer adı veya üstünlük iddiası
// içeren cümleler hiç seçilmez. Yeterli gerçek kaynak yoksa üretmez: EngineNoData ("bilgi yok").
//
// Çıktılar mevcut AI kancalarıyla (execute.ts → aiHooks) aynı biçimdedir; böylece mevcut kalite
// kapıları (qc.ts, newPageGate) ve uygulama hattı (48 saat / anında / geri alma) aynen çalışır.

import { db } from "../db";
import { extractMarkdown } from "../text/markdown";
import { containsPhrase, foldKeyword, normalizeKeyword, trLower, trUpperFirst } from "../text/slug";
import { parseFaq } from "../seo/analyzer-shared";
import type { AiPage, FieldContext, PageContext, SectionContext, SnippetContext } from "../autopilot/ai";

export const ENGINE_PROVIDER = "content-engine";
export const ENGINE_VERSION = "engine-v1";

/** Yeterli gerçek kaynak bilgi yok: içerik uydurulmaz. */
export class EngineNoData extends Error {
  constructor(why: string) {
    super(`Bilgi yok: ${why} (içerik motoru yalnızca sitedeki gerçek bilgiyle üretir)`);
    this.name = "EngineNoData";
  }
}

// ─── Cümle ve bölüm çıkarımı ────────────────────────────────────────────────

// Güvenli olmayan cümle: rakam, üstünlük/güven iddiası, doğrulanmamış işaret, fiyat/süre vaadi
const UNSAFE_RE = /\d|\[DOĞRULANMALI|müşteri|referans|yorum|puan|yıldız|ödül|sertifika|garanti|en iyi|en ucuz|lider|rakipsiz|numara 1|%|₺|\btl\b|lira/iu;

const clean = (s: string) => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*_`>#]/g, "")
  .replace(/\s+/g, " ")
  .trim();

export function sentencesOf(text: string): string[] {
  return clean(text).split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])/u).map((x) => x.trim()).filter((x) => x.length >= 25 && x.length <= 260 && /[.!?]$/.test(x));
}

let placeCache: { at: number; names: string[] } | null = null;
async function placeNames(): Promise<string[]> {
  if (placeCache && Date.now() - placeCache.at < 3600_000) return placeCache.names;
  const [p, d] = await Promise.all([db.province.findMany({ select: { name: true } }), db.district.findMany({ select: { name: true } })]);
  placeCache = { at: Date.now(), names: [...new Set([...p.map((x) => x.name), ...d.map((x) => x.name)])].filter((n) => n.length >= 4) };
  return placeCache.names;
}

/** Cümle kaynak dışına taşınabilir mi (rakam/iddia/yer adı yok)? */
export function safeSentence(s: string, places: string[]): boolean {
  if (UNSAFE_RE.test(s)) return false;
  const f = ` ${foldKeyword(s)} `;
  return !places.some((p) => f.includes(` ${foldKeyword(p)} `));
}

export type Section = { heading: string; depth: number; text: string };

/** Markdown gövdeyi başlık → metin bölümlerine ayırır. */
export function sectionsOf(body: string | null | undefined): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of (body ?? "").split(/\r?\n/)) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { heading: clean(m[2]), depth: m[1].length, text: "" };
    } else if (cur) cur.text += `${line}\n`;
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

type CorpusPage = { id: string; path: string; type: string; title: string; intro: string; sections: Section[]; faq: { q: string; a: string }[]; keyword: string };

/** Yayındaki ve indekslenebilir sayfaların gerçek içeriği (motorun tek kaynağı). */
async function corpus(): Promise<CorpusPage[]> {
  const pages = await db.page.findMany({
    where: { status: "PUBLISHED", robotsIndex: true, autoNoindex: false, type: { notIn: ["STATIC", "BLOG_INDEX"] } },
    select: { id: true, path: true, type: true, h1: true, name: true, intro: true, body: true, faq: true, primaryKeyword: true },
  });
  return pages.map((p) => ({ id: p.id, path: p.path, type: p.type, title: p.h1 ?? p.name, intro: p.intro ?? "", sections: sectionsOf(p.body), faq: parseFaq(p.faq), keyword: p.primaryKeyword ?? "" }));
}

const STOP = new Set(["ve", "ile", "için", "bir", "bu", "da", "de", "mi", "mı", "ne", "nasıl", "nedir", "olan", "gibi", "daha", "en", "çok", "web"]);
export function tokens(s: string): string[] {
  return [...new Set(normalizeKeyword(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)))];
}
/** İlgililik: ifade kelimelerinin metinde (Türkçe ekler toleranslı) geçme oranı. */
function relevance(text: string, words: string[]): number {
  if (!words.length) return 0;
  const f = ` ${foldKeyword(text)} `;
  return words.filter((w) => f.includes(` ${foldKeyword(w)}`)).length / words.length;
}

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

// ─── Title + meta ────────────────────────────────────────────────────────────

export async function engineSnippets(c: SnippetContext, _model?: string): Promise<{ titles: string[]; descriptions: string[] }> {
  void _model;
  const q = trUpperFirst((c.query ?? c.h1).trim());
  const h1 = c.h1.trim();
  const titles = [
    `${q} | ${c.siteName}`,
    containsPhrase(h1, c.query ?? "") ? `${h1} | ${c.siteName}` : `${q}: ${h1}`,
    `${q} – Kapsam, Süreç ve Teklif`,
    `${q} Rehberi | ${c.siteName}`,
  ].map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t.length >= 30 && t.length <= 60);
  const places = await placeNames();
  const src = [...sentencesOf(c.intro), ...sentencesOf(c.excerpt)].filter((s) => safeSentence(s, places));
  const ranked = [...src].sort((a, b) => Number(containsPhrase(b, c.query ?? "")) - Number(containsPhrase(a, c.query ?? "")));
  const descriptions: string[] = [];
  for (const first of ranked.slice(0, 4)) {
    let d = first;
    for (const s of ranked) if (s !== first && `${d} ${s}`.length <= 160) d = `${d} ${s}`;
    if (d.length < 110) d = `${d} Ücretsiz ön analiz ve kalem kalem teklif için bize ulaşın.`;
    d = fit(d, 160);
    if (d.length >= 110 && !descriptions.includes(d)) descriptions.push(d);
  }
  return { titles: [...new Set(titles)].slice(0, 3), descriptions: descriptions.slice(0, 3) };
}

// ─── Giriş paragrafı ─────────────────────────────────────────────────────────

export async function engineIntro(c: FieldContext, _model?: string): Promise<{ intro: string }> {
  void _model;
  const places = await placeNames();
  const words = tokens(c.query ?? c.h1);
  const ss = sentencesOf(c.text).filter((s) => safeSentence(s, places) && trLower(s) !== trLower(c.h1));
  if (ss.length < 2) throw new EngineNoData("girişe kaynak olacak en az iki güvenli cümle yok");
  // Önce konuyu en iyi anlatan cümle, sonra metindeki sırasıyla devam
  const lead = [...ss].sort((a, b) => relevance(b, words) - relevance(a, words))[0];
  const rest = ss.filter((s) => s !== lead);
  let intro = lead;
  for (const s of rest) {
    const next = `${intro} ${s}`;
    if (next.split(/\s+/).length > 70) break;
    intro = next;
  }
  if (intro.split(/\s+/).length < 20) throw new EngineNoData("giriş için yeterli uzunlukta gerçek metin yok");
  return { intro };
}

// ─── SSS ─────────────────────────────────────────────────────────────────────

/** Başlıktan soru: soru kalıbındaysa aynen; değilse iddiasız kalıp. */
export function questionOf(heading: string): string {
  const h = heading.replace(/[:.]$/, "").trim();
  if (/\?$/.test(h)) return h;
  if (/\b(nedir|nasıl|neden|nelerdir|hangi|ne zaman|kimler)\b/i.test(h)) return `${h}?`;
  return `${trUpperFirst(h)} konusunda neler bilinmeli?`;
}

export async function engineFaq(c: FieldContext, _model?: string): Promise<{ faq: { q: string; a: string }[] }> {
  void _model;
  const places = await placeNames();
  const page = await db.page.findFirst({ where: { path: c.path }, select: { body: true } });
  const existing = new Set(c.existingFaq.map((q) => trLower(q)));
  const out: { q: string; a: string }[] = [];
  for (const s of sectionsOf(page?.body)) {
    const q = questionOf(s.heading);
    if (existing.has(trLower(q)) || !safeSentence(q, places)) continue;
    const ans = sentencesOf(s.text).filter((x) => safeSentence(x, places)).slice(0, 2).join(" ");
    if (ans.split(/\s+/).length < 12) continue;
    out.push({ q, a: ans });
    if (out.length === 4) break;
  }
  if (out.length < 2) throw new EngineNoData("sayfada SSS'ye dönüştürülebilecek en az iki başlıklı bölüm yok");
  return { faq: out };
}

// ─── Eksik bölüm (içerik güçlendirme) ───────────────────────────────────────

const HUB_HEADINGS = ["Bu konuyu tamamlayan sayfalar", "Birlikte değerlendirilen konular", "İlgili hizmetler ve rehberler", "Karar vermeden önce bakılacak sayfalar"];

/**
 * Sayfaya, sitedeki ilgili sayfaların GERÇEK giriş cümlelerinden kurulan ve onlara bağlanan bir
 * bölüm ekler (iç link merkezi). Sayfanın kendi metnini tekrar etmez; kaynakta olmayan olgu eklemez.
 */
export async function engineSection(c: SectionContext, _model?: string): Promise<{ heading: string; markdown: string; rationale: string }> {
  void _model;
  const places = await placeNames();
  const all = await corpus();
  const self = all.find((p) => p.path === c.path);
  const bodyWords = (c.body || "").split(/\s+/).filter(Boolean).length;
  const budget = Math.floor(bodyWords * 0.35); // uygulama hattı %40 büyümeye izin verir; pay bırakılır
  if (budget < 60) throw new EngineNoData("sayfa, güvenli büyüme sınırı içinde yeni bölüm eklenemeyecek kadar kısa");
  const linked = new Set(extractMarkdown(c.body).links.map((l) => l.href.split("#")[0]));
  const allowed = new Set((c.links ?? []).map((l) => l.path));
  const words = tokens(`${c.query ?? ""} ${c.h1}`);
  const cands = all
    .filter((p) => p.path !== c.path && !linked.has(p.path) && (allowed.size === 0 || allowed.has(p.path)))
    .map((p) => ({ p, score: relevance(`${p.title} ${p.keyword} ${p.intro}`, words) + (p.type === self?.type ? 0 : 0.1) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.path.localeCompare(b.p.path));
  const items: string[] = [];
  let used = 0;
  for (const { p } of cands) {
    const s = sentencesOf(p.intro || p.sections[0]?.text || "").filter((x) => safeSentence(x, places))[0];
    if (!s) continue;
    if (!safeSentence(p.title, places)) continue;
    const item = `### ${p.title}\n\n${s} [${p.title} sayfasında](${p.path}) ayrıntılarını bulabilirsiniz.`;
    const w = item.split(/\s+/).length;
    if (used + w > budget) break;
    items.push(item);
    used += w;
    if (items.length === 3) break;
  }
  if (items.length < 2 || used < 60) throw new EngineNoData("bu sayfayla ilişkili, bağlanabilecek en az iki gerçek sayfa yok");
  const avoid = new Set([...(c.headings ?? []), ...(c.avoidHeadings ?? [])].map((h) => trLower(h)));
  const heading = HUB_HEADINGS.filter((h) => !avoid.has(trLower(h)))[0] ?? pick(HUB_HEADINGS, c.path);
  return { heading, markdown: items.join("\n\n"), rationale: `İçerik motoru (${ENGINE_VERSION}): ${items.length} ilgili sayfanın gerçek giriş cümlesi + iç link` };
}

// ─── Yeni sayfa / rehber ─────────────────────────────────────────────────────

/**
 * Yeni sayfa/rehber: sitedeki ilgili bölümlerin gerçek cümleleri konu etrafında yeniden
 * yapılandırılır; her bölüm kaynak sayfasına bağlanır. Yerel (konumlu) sayfa, editörün
 * doğruladığı yerel bilgi olmadan üretilmez.
 */
export async function enginePage(c: PageContext, _model?: string): Promise<AiPage> {
  void _model;
  if (c.kind === "LOCATION") throw new EngineNoData("konumlu sayfa için doğrulanmış yerel bilgi (editör notu) gerekir; şablon metin üretilmez");
  const places = await placeNames();
  const all = await corpus();
  const words = tokens(`${c.primary} ${c.queries.join(" ")}`);
  if (!words.length) throw new EngineNoData("sorgu anlamlı kelime içermiyor");
  // Konuyla ilgili gerçek bölümler (başlık + metin), sayfa başına en çok 2
  const blocks: { page: CorpusPage; s: Section; score: number }[] = [];
  for (const p of all) {
    const scored = p.sections.map((s) => ({ page: p, s, score: relevance(`${s.heading} ${s.text}`, words) + 0.5 * relevance(p.title, words) }))
      .filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 2);
    blocks.push(...scored);
  }
  blocks.sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));
  const avoid = new Set((c.avoidHeadings ?? []).map((h) => trLower(h)));
  const body: string[] = [];
  const usedPages = new Set<string>();
  const usedHeadings = new Set<string>();
  let total = 0;
  for (const b of blocks) {
    const ss = sentencesOf(b.s.text).filter((x) => safeSentence(x, places)).slice(0, 4);
    if (ss.length < 2) continue;
    const heading = trUpperFirst(b.s.heading);
    if (!safeSentence(heading, places)) continue; // başlıkta da rakam/iddia/yer adı taşınmaz
    if (usedHeadings.has(trLower(heading)) || avoid.has(trLower(heading))) continue;
    usedHeadings.add(trLower(heading));
    usedPages.add(b.page.path);
    const para = `${ss.join(" ")} Bu konunun devamı [${b.page.title}](${b.page.path}) sayfasında.`;
    body.push(`## ${heading}\n\n${para}`);
    total += para.split(/\s+/).length;
    if (total >= 700 || body.length >= 7) break;
  }
  if (body.length < 3 || usedPages.size < 2) throw new EngineNoData(`“${c.primary}” konusunda sitede yeniden yapılandırılabilecek yeterli gerçek içerik yok (en az 2 sayfadan 3 bölüm gerekir)`);
  const h1 = trUpperFirst(c.primary) + (c.kind === "BLOG_POST" && /\b(nedir|nasıl|neden|hangi|mi|mı|mu|mü)\b/i.test(c.primary) && !/\?$/.test(c.primary) ? "?" : "");
  const intro = `Bu ${c.kind === "BLOG_POST" ? "rehber" : "sayfa"}, ${trLower(c.primary)} konusunu sitemizdeki ilgili hizmet ve rehber sayfalarındaki bilgilerle bir araya getirir. Her bölümde konunun bir boyutunu ele alıyor ve ayrıntısı için ilgili sayfaya bağlantı veriyoruz.`;
  body.push(`## Sonraki adım\n\nİhtiyacınızı ve varsa mevcut sitenizi konuşmak için [teklif formunu](/teklif-al) kullanabilirsiniz; kapsamı birlikte netleştiririz.`);
  // SSS: ilgili sayfalardaki gerçek SSS'ler (yanıtlarında rakam/iddia olmayanlar)
  const faq = all.filter((p) => usedPages.has(p.path)).flatMap((p) => p.faq)
    .filter((f) => relevance(`${f.q} ${f.a}`, words) > 0 && safeSentence(f.a, places) && safeSentence(f.q, places)).slice(0, 3);
  const titleBase = `${h1} | ${c.siteName}`;
  const seoTitle = titleBase.length <= 60 ? titleBase : fit(h1, 60);
  const metaSrc = sentencesOf(body[0].replace(/^##.*\n/, "")).filter((x) => safeSentence(x, places));
  let meta = `${h1.replace(/\?$/, "")}: ${metaSrc[0] ?? intro}`;
  meta = fit(meta.length < 110 ? `${meta} İlgili hizmet ve rehber sayfalarımızla birlikte inceleyin.` : meta, 160);
  return { seoTitle, metaDescription: meta, h1, intro, body: body.join("\n\n"), faq, verifyNotes: [] };
}

/** Motorun kancaları (aiHooks ile aynı biçim). */
export const engineHooks = { snippets: engineSnippets, section: engineSection, page: enginePage, intro: engineIntro, faq: engineFaq, available: () => true };
