import "server-only";
// ÇÖZÜM ÖNER: bir fırsat için sayfanın gerçek verisinden düzeltme önerisi.
// Kaynaklar: sayfanın mevcut alanları, analiz sonuçları, Search Console sorguları
// (varsa), iç link motoru ve schema doğrulaması. Bilinmeyen içerik uydurulmaz;
// yazılması gereken her şey [DOĞRULANMALI] olarak işaretlenir.

import { z } from "zod";
import { db } from "../db";
import { siteUrl } from "../env";
import { analyzePage, loadSiteState } from "../seo/analyzer";
import { parseFaq } from "../seo/analyzer-shared";
import { suggestLinks } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { resolveDescription, resolveTitle, truncate } from "../seo/meta";
import { extractMarkdown } from "../text/markdown";
import { containsPhrase, trUpperFirst } from "../text/slug";

export const fixSchema = z.object({
  seoTitle: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  contentGaps: z.array(z.string()),
  headings: z.array(z.string()).describe("Önerilen H2/H3 başlıkları"),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  internalLinks: z.array(z.object({ source: z.string(), anchor: z.string(), reason: z.string() })),
  schema: z.array(z.string()),
  rationale: z.string(),
});
export type FixProposal = z.infer<typeof fixSchema>;

export type FixContext = {
  pageId: string;
  path: string;
  type: string;
  focusQuery: string | null;
  category: string | null;
  current: { seoTitle: string; metaDescription: string; h1: string; intro: string; headings: string[]; faq: { q: string; a: string }[]; wordCount: number };
  queries: { query: string; impressions: number; clicks: number; ctr: number; position: number; inContent: boolean }[] | null; // null = veri yok
  failingChecks: string[];
  linkCandidates: { source: string; anchor: string; reason: string }[];
  schema: { types: string[]; issues: string[] };
  siteName: string;
};

const QUESTION_RE = /\b(nasıl|nedir|ne kadar|kaç|neden|hangi|fiyat|ücret|mi|mı|mu|mü)\b/i;

export async function buildFixContext(pageId: string, focusQuery: string | null, category: string | null): Promise<FixContext> {
  const state = await loadSiteState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("Sayfa bulunamadı");
  const a = analyzePage(page, state);
  const md = extractMarkdown(page.body);
  const text = `${page.h1 ?? ""} ${page.intro ?? ""} ${md.text}`;
  const url = page.path === "/" ? `${siteUrl()}/` : siteUrl() + page.path;
  const hasGsc = (await db.gscQueryDaily.count()) > 0;
  let queries: FixContext["queries"] = null;
  if (hasGsc) {
    const since = new Date(Date.now() - 28 * 86400_000);
    const rows = await db.gscQueryDaily.findMany({ where: { page: url, date: { gte: since } }, select: { query: true, impressions: true, clicks: true, position: true } });
    const m = new Map<string, { i: number; c: number; w: number }>();
    for (const r of rows) {
      const e = m.get(r.query) ?? { i: 0, c: 0, w: 0 };
      e.i += r.impressions; e.c += r.clicks; e.w += r.position * r.impressions;
      m.set(r.query, e);
    }
    queries = [...m].map(([query, e]) => ({ query, impressions: e.i, clicks: e.c, ctr: e.i ? e.c / e.i : 0, position: e.i ? e.w / e.i : 0, inContent: containsPhrase(text, query) }))
      .sort((x, y) => y.impressions - x.impressions).slice(0, 20);
  }
  const lp = toLinkPages(state);
  const target = lp.find((p) => p.id === pageId)!;
  return {
    pageId, path: page.path, type: page.type, focusQuery, category,
    current: {
      seoTitle: resolveTitle(page, state.settings.seo), metaDescription: page.metaDescription ?? "", h1: page.h1 ?? page.name, intro: page.intro ?? "",
      headings: md.headings.map((h) => `${"#".repeat(h.depth)} ${h.text}`), faq: parseFaq(page.faq), wordCount: a.seo.wordCount,
    },
    queries,
    failingChecks: a.seo.checks.filter((c) => c.status === "FAIL" || c.status === "WARN").map((c) => `${c.label}: ${c.message}`),
    linkCandidates: suggestLinks(target, lp, state.edges, 6).map((s) => ({ source: s.source, anchor: s.anchor, reason: s.reasons.join("; ") })),
    schema: { types: a.schemaTypes, issues: a.schemaIssues.map((i) => `${i.type}: ${i.message}`) },
    siteName: state.settings.site.siteName,
  };
}

/** Kural tabanlı öneri (API anahtarı gerekmez). */
export function ruleFix(c: FixContext): FixProposal {
  const focus = c.focusQuery ?? c.queries?.[0]?.query ?? null;
  const focusCap = focus ? trUpperFirst(focus) : null;
  const titleHas = focus ? containsPhrase(c.current.seoTitle, focus) : true;
  const h1Has = focus ? containsPhrase(c.current.h1, focus) : true;
  const seoTitle = !titleHas && focusCap ? truncate(`${focusCap} | ${c.siteName}`, 60) : c.current.seoTitle;
  const metaBase = c.current.metaDescription || c.current.intro;
  const metaDescription = focus && !containsPhrase(metaBase, focus)
    ? `[DOĞRULANMALI: “${focus}” aramasını yapan kişiye sayfanın ne sunduğunu 110–160 karakterde anlatan açıklama]`
    : truncate(metaBase, 158);
  const uncovered = (c.queries ?? []).filter((q) => !q.inContent && q.impressions > 0).slice(0, 5);
  const questions = (c.queries ?? []).filter((q) => QUESTION_RE.test(q.query)).slice(0, 4);
  return {
    seoTitle,
    metaDescription,
    h1: !h1Has && focusCap ? focusCap : c.current.h1,
    contentGaps: [
      ...uncovered.map((q) => `“${q.query}” sorgusu ${q.impressions} gösterim almış ama sayfa metninde bu ifadeye doğrudan yanıt yok.`),
      ...c.failingChecks.slice(0, 6),
      ...(c.queries === null ? ["Search Console verisi yok: sorgu bazlı içerik eksikleri hesaplanamadı."] : []),
    ],
    headings: uncovered.map((q) => `## ${trUpperFirst(q.query)} [DOĞRULANMALI: bu başlığın altına gerçek bilgi yazın]`),
    faq: questions.map((q) => ({ q: trUpperFirst(q.query) + (q.query.trim().endsWith("?") ? "" : "?"), a: "[DOĞRULANMALI: işletmenizin gerçek yanıtı]" })),
    internalLinks: c.linkCandidates,
    schema: [
      ...c.schema.issues,
      ...(c.current.faq.length < 2 ? ["Sayfada en az 2 gerçek SSS olursa FAQPage yapılandırılmış verisi otomatik üretilir."] : []),
      ...(c.schema.issues.length === 0 ? [`Mevcut schema geçerli: ${c.schema.types.join(", ")}`] : []),
    ],
    rationale: focus
      ? `Kural tabanlı öneri: odak sorgu “${focus}”. Title/H1 bu ifadeyi ${titleHas && h1Has ? "zaten içeriyor" : "içermiyordu"}; metni kendi cümlelerinizle iyileştirin.`
      : "Kural tabanlı öneri: Search Console sorgusu olmadığı için analizdeki başarısız kontrollere göre hazırlandı.",
  };
}

export function contextForAi(c: FixContext): string {
  return [
    `URL: ${c.path} (tür ${c.type})`,
    c.focusQuery && `Odak sorgu: ${c.focusQuery} (fırsat türü: ${c.category ?? "-"})`,
    `Mevcut title: ${c.current.seoTitle}`,
    `Mevcut meta: ${c.current.metaDescription || "(yok)"}`,
    `Mevcut H1: ${c.current.h1}`,
    `Mevcut giriş: ${c.current.intro}`,
    `Mevcut başlıklar:\n${c.current.headings.join("\n") || "(yok)"}`,
    `Mevcut SSS: ${c.current.faq.map((f) => f.q).join(" | ") || "(yok)"}`,
    `Kelime sayısı: ${c.current.wordCount}`,
    c.queries ? `Search Console (28 gün) bu sayfaya gelen sorgular:\n${c.queries.map((q) => `- ${q.query}: ${q.impressions} gösterim, ${q.clicks} tık, poz. ${q.position.toFixed(1)}, metinde ${q.inContent ? "var" : "yok"}`).join("\n")}` : "Search Console verisi YOK — sorgu uydurma.",
    `Başarısız SEO kontrolleri:\n${c.failingChecks.join("\n") || "(yok)"}`,
    `İç link adayları (yalnızca bunları öner):\n${c.linkCandidates.map((l) => `- ${l.source} → “${l.anchor}” (${l.reason})`).join("\n") || "(yok)"}`,
    `Schema: ${c.schema.types.join(", ")}; sorunlar: ${c.schema.issues.join("; ") || "yok"}`,
  ].filter(Boolean).join("\n");
}

export async function currentFields(pageId: string) {
  const p = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const state = await loadSiteState();
  return { seoTitle: p.seoTitle ?? "", metaDescription: p.metaDescription ?? "", h1: p.h1 ?? "", resolvedTitle: resolveTitle(p, state.settings.seo), resolvedDescription: resolveDescription(p, state.settings.seo) };
}
