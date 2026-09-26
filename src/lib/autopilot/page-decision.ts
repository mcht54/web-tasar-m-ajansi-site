import "server-only";
// SAYFA KARAR MOTORU: gerçek Search Console sorgusu var ama uygun URL yoksa ne yapılmalı?
// Kural: keyword başına sayfa AÇILMAZ. Aynı niyetteki sorgular tek kümede toplanır;
// küme mevcut güçlü bir sayfayla karşılanıyorsa karar PAGE_NOT_NEEDED'dır.
//   PAGE_NOT_NEEDED      — aynı niyeti karşılayan yayında sayfa var (sorgu oraya atanır)
//   CANNIBALIZATION      — birden çok sayfa aynı kümede gösterim bölüşüyor (insan kararı)
//   FILL_LOCATION_DRAFT  — gerçek yerel talep var, taslak lokasyon sayfası mevcut
//   NEW_PAGE             — bilgi niyetli, siteyle ilgili ve karşılanmamış küme → yeni rehber adayı
//   HUMAN_REQUIRED       — yeni hizmet/sektör taksonomisi gerekir (otomatik açılmaz)

import { db } from "../db";
import { loadSiteState, type SiteState } from "../seo/analyzer";
import { detectLocation, loadLocations } from "../seo/location-demand";
import { containsPhrase, normalizeKeyword, slugify } from "../text/slug";
import { classifyIntent } from "./intent";
import { matchTopic } from "./clusters";
import { addDays, lastDataDay } from "./metrics";
import { isSuitable, pathOfUrl, queryAggregates, type Agg } from "./agent-keywords";

export const NEW_PAGE_MIN_IMPRESSIONS = 30; // küme toplamı, 28 gün
const LOCAL_TYPES = new Set(["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"]);
// Sitenin konusuyla ilgili mi? (alakasız sorgu için sayfa açılmaz)
const RELEVANT = /(web|site|tasar|seo|e ?ticaret|eticaret|yaz[ıi]l[ıi]m|domain|alan ad|hosting|wordpress|google|arama motor|dijital|online|internet|landing|kurumsal kimlik|logo|ux|ui)/i;
const STOP = new Set(["ve", "ile", "için", "icin", "nasıl", "nasil", "nedir", "ne", "mi", "mı", "mu", "mü", "bir", "en", "de", "da", "kaç", "kac", "hangi", "neden"]);

export type PageDecisionKind = "PAGE_NOT_NEEDED" | "CANNIBALIZATION" | "FILL_LOCATION_DRAFT" | "NEW_PAGE" | "HUMAN_REQUIRED";
export const DECISION_LABELS: Record<PageDecisionKind, string> = {
  PAGE_NOT_NEEDED: "Sayfa gerekmiyor (mevcut sayfa karşılıyor)", CANNIBALIZATION: "Cannibalization — hedef sayfa kararı",
  FILL_LOCATION_DRAFT: "Taslak lokasyon sayfası doldurulabilir", NEW_PAGE: "Yeni sayfa adayı", HUMAN_REQUIRED: "İnsan kararı gerekli",
};

export type QueryGroup = { key: string; primary: string; queries: string[]; impressions: number; clicks: number; position: number | null; pages: Map<string, number>; intent: string; location: { provinceId: number; districtId: number | null } | null };
export type PageDecision = { group: QueryGroup; decision: PageDecisionKind; path: string | null; pageId: string | null; pageType: string | null; reason: string };

function tokens(q: string): Set<string> {
  return new Set(normalizeKeyword(q).replace(/-/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
}
function overlap(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / Math.max(1, Math.min(a.size, b.size));
}

/** Aynı niyetteki sorguları kümeler: konum → konu kuralı → kelime örtüşmesi (≥%60). */
export function groupQueries(items: { query: string; agg: Agg; location: QueryGroup["location"] }[]): QueryGroup[] {
  const groups: (QueryGroup & { toks: Set<string> })[] = [];
  const sorted = [...items].sort((a, b) => b.agg.impressions - a.agg.impressions);
  for (const it of sorted) {
    const topic = matchTopic(it.query);
    const intent = classifyIntent(it.query, { hasLocation: Boolean(it.location) }).primary;
    const key = it.location ? `loc:${it.location.provinceId}:${it.location.districtId ?? ""}` : topic ? topic.key : null; // topic.key zaten "topic:" önekli
    const toks = tokens(it.query);
    const g = key ? groups.find((x) => x.key === key) : groups.find((x) => x.key.startsWith("q:") && x.intent === intent && overlap(x.toks, toks) >= 0.6);
    if (g) {
      g.queries.push(it.query);
      g.position = g.position != null && it.agg.position != null ? (g.position * g.impressions + it.agg.position * it.agg.impressions) / (g.impressions + it.agg.impressions) : g.position ?? it.agg.position;
      g.impressions += it.agg.impressions;
      g.clicks += it.agg.clicks;
      for (const [p, v] of it.agg.pages) g.pages.set(p, (g.pages.get(p) ?? 0) + v);
    } else {
      groups.push({ key: key ?? `q:${slugify(it.query)}`, primary: it.query, queries: [it.query], impressions: it.agg.impressions, clicks: it.agg.clicks, position: it.agg.position, pages: new Map(it.agg.pages), intent, location: it.location, toks });
    }
  }
  return groups.map(({ toks: _t, ...g }) => g);
}

/** Tek bir küme için sayfa kararı. */
export async function decidePage(group: QueryGroup, state: SiteState): Promise<PageDecision> {
  const byPath = new Map(state.pages.map((p) => [p.path, p]));
  const published = state.pages.filter((p) => p.status === "PUBLISHED");
  const pagesWithImpr = [...group.pages].map(([u, v]) => ({ page: byPath.get(pathOfUrl(u) ?? ""), v })).filter((x) => x.page && x.page.status === "PUBLISHED");
  const base = { group, path: null as string | null, pageId: null as string | null, pageType: null as string | null };

  // 1) Yerel küme → lokasyon sayfası (varsa taslak) — genel sayfaya yazılmaz
  if (group.location) {
    const loc = state.pages.find((p) => LOCAL_TYPES.has(p.type) && p.provinceId === group.location!.provinceId && (p.districtId ?? null) === (group.location!.districtId ?? null) && p.type !== "SECTOR_LOCATION" && p.type !== "SERVICE_LOCATION");
    if (loc?.status === "PUBLISHED") return { ...base, decision: "PAGE_NOT_NEEDED", path: loc.path, pageId: loc.id, pageType: loc.type, reason: `Yayında lokasyon sayfası var: ${loc.path}; sorgular bu sayfaya atanır.` };
    if (loc) return { ...base, decision: "FILL_LOCATION_DRAFT", path: loc.path, pageId: loc.id, pageType: loc.type, reason: `Gerçek yerel talep (${group.impressions} gösterim / 28 gün) ve taslak ${loc.path} mevcut; yalnızca doğrulanmış yerel bilgiyle ve lokasyon kalite kapısından geçerse yayınlanır.` };
    return { ...base, decision: "HUMAN_REQUIRED", reason: "Konum için lokasyon sayfası kaydı yok; yeni lokasyon taksonomisi otomatik açılmaz." };
  }
  // 2) Cannibalization: aynı kümede birden çok yayındaki sayfa gösterim bölüşüyor
  const strong = pagesWithImpr.filter((x) => x.v >= Math.max(5, group.impressions * 0.2));
  if (strong.length >= 2) return { ...base, decision: "CANNIBALIZATION", path: strong[0].page!.path, pageId: strong[0].page!.id, reason: `${strong.map((x) => `${x.page!.path} (${x.v})`).join(", ")} aynı kümede gösterim bölüşüyor; tek hedef sayfa kararı gerekir.` };
  // 3) Konu kümesinin hedef sayfası yayında → sayfa gerekmez
  const topic = matchTopic(group.primary);
  const topicPage = topic?.target ? byPath.get(topic.target) : undefined;
  if (topicPage?.status === "PUBLISHED" && group.intent !== "INFORMATIONAL") return { ...base, decision: "PAGE_NOT_NEEDED", path: topicPage.path, pageId: topicPage.id, pageType: topicPage.type, reason: `Aynı niyet (${group.intent}) ${topicPage.path} tarafından karşılanıyor; ${group.queries.length} sorgu tek güçlü sayfada toplanır.` };
  // 4) Başka bir yayındaki sayfa sorguyu zaten adlandırıyor
  const named = published.find((p) => isSuitable(group.primary, p, null, false));
  if (named) return { ...base, decision: "PAGE_NOT_NEEDED", path: named.path, pageId: named.id, pageType: named.type, reason: `${named.path} bu sorguyu zaten hedefliyor (başlık/H1/anahtar kelime).` };
  // 5) Alakasız sorgu → sayfa yok
  if (!RELEVANT.test(group.primary)) return { ...base, decision: "PAGE_NOT_NEEDED", reason: "Sorgu sitenin hizmet konusuyla ilgili değil; sayfa açılmaz." };
  // 6) Bilgi niyeti → rehber yazısı adayı (taslak dahil aynı hedefte sayfa yoksa)
  if (group.intent === "INFORMATIONAL") {
    const path = `/blog/${slugify(group.primary).slice(0, 70)}`;
    const existing = byPath.get(path) ?? state.pages.find((p) => p.primaryKeyword && normalizeKeyword(p.primaryKeyword) === normalizeKeyword(group.primary));
    if (existing?.status === "PUBLISHED") return { ...base, decision: "PAGE_NOT_NEEDED", path: existing.path, pageId: existing.id, reason: `${existing.path} zaten yayında.` };
    return { ...base, decision: "NEW_PAGE", path: existing?.path ?? path, pageId: existing?.id ?? null, pageType: "BLOG_POST", reason: `Bilgi niyetli ${group.queries.length} sorgu (${group.impressions} gösterim / 28 gün) için karşılayan sayfa yok; tek rehber yazısı adayı.` };
  }
  // 7) Ticari ama konu kümesine uymuyor → yeni hizmet/sektör kararı insanın
  return { ...base, decision: "HUMAN_REQUIRED", reason: `Ticari niyetli küme (${group.primary}) mevcut hizmet/sektör sayfalarıyla eşleşmiyor; yeni hizmet sayfası otomatik açılmaz (gerçek hizmet bilgisi gerekir).` };
}

/** Uygun sayfası olmayan gerçek sorgu kümelerini bulur ve her biri için karar verir. */
export async function findPageNeeds(stateArg?: SiteState): Promise<{ hasData: boolean; decisions: PageDecision[] }> {
  const end = await lastDataDay();
  if (!end) return { hasData: false, decisions: [] };
  const state = stateArg ?? (await loadSiteState());
  const cur = await queryAggregates(addDays(end, -27), end);
  const { pLocs, dLocs } = await loadLocations();
  const byPath = new Map(state.pages.map((p) => [p.path, p]));
  const items: { query: string; agg: Agg; location: QueryGroup["location"] }[] = [];
  for (const [q, agg] of cur) {
    if (agg.impressions < 3) continue;
    const loc = detectLocation(q, pLocs, dLocs);
    const top = [...agg.pages].sort((a, b) => b[1] - a[1])[0]?.[0];
    const page = byPath.get(pathOfUrl(top) ?? "");
    // Gösterim birden çok yayındaki sayfaya bölünüyorsa uygun sayfa olsa bile cannibalization kararına gider
    const split = [...agg.pages].filter(([u, v]) => v >= Math.max(5, agg.impressions * 0.2) && byPath.get(pathOfUrl(u) ?? "")?.status === "PUBLISHED");
    if (split.length >= 2) { items.push({ query: q, agg, location: loc }); continue; }
    if (isSuitable(q, page, null, Boolean(loc))) continue; // uygun sayfa zaten gösteriliyor
    if (!loc && page && containsPhrase(`${page.h1 ?? ""} ${page.intro ?? ""} ${page.body ?? ""}`, q) && matchTopic(q)?.target === page.path) continue;
    items.push({ query: q, agg, location: loc });
  }
  const groups = groupQueries(items).filter((g) => g.impressions >= NEW_PAGE_MIN_IMPRESSIONS || g.location);
  const decisions: PageDecision[] = [];
  for (const g of groups) decisions.push(await decidePage(g, state));
  return { hasData: true, decisions };
}

/** Aynı sorgu için bekleyen/uygulanmış yeni sayfa işlemi var mı? (mükerrer sayfa önleme) */
export async function pendingNewPage(path: string): Promise<boolean> {
  const a = await db.autopilotAction.findFirst({ where: { type: "NEW_PAGE", status: { in: ["planned", "applying", "applied", "needs_approval"] }, proposal: { path: ["pagePath"], equals: path } } });
  return Boolean(a);
}
