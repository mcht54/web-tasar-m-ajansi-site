import "server-only";
// ANAHTAR KELİME EVRENİ + BİRLEŞİK FIRSAT MOTORU (deterministik; yapay zekâ kullanmaz).
//
//   seed (panel) ─┐
//   rakip başlık/H1 ─┼─→ evren (Keyword) ─→ her ifade için: site kapsamı, rakip kapsamı,
//   GSC sorguları ─┤                         GSC talebi/pozisyon, niyet, seed ilişkisi,
//   kalıp varyasyon ┘                         cannibalization / doorway / kopya riski
//                                         ─→ skor (+ öğrenme çarpanı) ─→ karar ─→ öneri (48 saat)
//
// Rakipte görülmek TEK BAŞINA sayfa açma nedeni değildir: yeni sayfa için ya ölçülen GSC talebi
// ya da (en az 2 rakip + kullanıcı seed'iyle ilişki) birlikte gerekir. Hacim/trafik uydurulmaz:
// GSC yoksa talep "bilinmiyor" kalır ve skora katkı vermez.

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { agentMode } from "../settings-schema";
import { loadSiteState } from "../seo/analyzer";
import { linkStats } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { resolveTitle } from "../seo/meta";
import { detectLocation, loadLocations } from "../seo/location-demand";
import { extractMarkdown } from "../text/markdown";
import { containsPhrase, foldKeyword, normalizeKeyword, slugify } from "../text/slug";
import { createProposal, duplicateReason, type CreateResult } from "../proposals/lifecycle";
import { classifyIntent } from "./intent";
import { matchTopic } from "./clusters";
import { learningStats } from "./learning";
import { activeSeeds } from "./discovery";
import { pendingNewPage } from "./page-decision";

// ─── 1) Evren genişletme ─────────────────────────────────────────────────────

/** Deterministik varyasyon kalıpları (niyet çeşitliliği). Hacim atanmaz; kanıt gelirse fırsata dönüşür. */
export const VARIATIONS: { suffix: string; kind: "commercial" | "transactional" | "informational" | "question" }[] = [
  { suffix: "fiyatları", kind: "transactional" },
  { suffix: "firması", kind: "commercial" },
  { suffix: "ajansı", kind: "commercial" },
  { suffix: "hizmeti", kind: "commercial" },
  { suffix: "nedir", kind: "informational" },
  { suffix: "nasıl yapılır", kind: "question" },
];

const UNIVERSE_SOURCES = ["universe", "competitor"];
const MAX_NEW_PER_RUN = 40;
const MAX_UNIVERSE = 500;

/** Seed ifadesinin konum dışı çekirdeği ("web tasarım sakarya" → "web tasarım"). */
export function seedCore(phrase: string, placeNames: string[]): string {
  const places = new Set(placeNames.map(foldKeyword));
  const words = normalizeKeyword(phrase).split(" ").filter((w) => !places.has(foldKeyword(w)) && !places.has(foldKeyword(w.replace(/(da|de|ta|te|daki|deki)$/, ""))));
  return words.join(" ");
}

/** Seed'den türeyen varyasyonlar (yalnızca konum içermeyen çekirdek için). */
export function expandSeed(core: string): string[] {
  if (!core || core.split(" ").length > 4) return [];
  return VARIATIONS.map((v) => normalizeKeyword(`${core} ${v.suffix}`)).filter((p) => !p.endsWith(`${core.split(" ").pop()} ${core.split(" ").pop()}`));
}

/** Rakip başlık/H1 metninden ifade adayı: marka/yıl/sayı ayıklanır, 2–7 kelime. */
export function competitorPhrase(text: string, brandTokens: string[]): string | null {
  const brand = new Set(brandTokens.map(foldKeyword).filter(Boolean));
  const seg = text.split(/\s[|–—-]\s|[|:]/).map((s) => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const s of seg) {
    const words = normalizeKeyword(s).split(" ").filter((w) => w && !/^\d+$/.test(w) && !brand.has(foldKeyword(w)));
    if (words.length >= 2 && words.length <= 7) return words.join(" ");
  }
  return null;
}

type UniverseResult = { seeds: number; added: { phrase: string; source: string }[]; total: number };

/** Seed + rakip sinyalleri → Keyword evreni (source "universe" | "competitor"). İdempotent. */
export async function expandUniverse(): Promise<UniverseResult> {
  const [seeds, locs, settings, competitors] = await Promise.all([activeSeeds(), loadLocations(), getSettingsFresh(), db.competitor.findMany({ where: { status: { not: "paused" } }, select: { id: true, domain: true } })]);
  const places = [...locs.provinces.map((p) => p.name), ...locs.districts.map((d) => d.name)];
  const cores = [...new Set(seeds.map((s) => seedCore(s.phrase, places)).filter((c) => c.split(" ").length >= 1 && c.length > 2))];
  const seedTopics = new Set(seeds.map((s) => matchTopic(s.phrase)?.key).filter(Boolean));
  const existing = new Set((await db.keyword.findMany({ select: { normalized: true } })).map((k) => k.normalized));
  let universeCount = await db.keyword.count({ where: { source: { in: UNIVERSE_SOURCES } } });
  const added: UniverseResult["added"] = [];
  const brandTokens = [settings.site.siteName, settings.business.name, "webtasarimajansi"].filter(Boolean);
  const add = async (phrase: string, source: "universe" | "competitor", note: string) => {
    const normalized = normalizeKeyword(phrase);
    if (normalized.length < 3 || existing.has(normalized) || added.length >= MAX_NEW_PER_RUN || universeCount >= MAX_UNIVERSE) return;
    const loc = detectLocation(normalized, locs.pLocs, locs.dLocs);
    const intent = classifyIntent(normalized, { hasLocation: Boolean(loc), brandTokens });
    await db.keyword.create({ data: { phrase: normalized, normalized, source, intent: intent.primary, intents: intent.intents, provinceId: loc?.provinceId, districtId: loc?.districtId, priority: 2, discoveredAt: new Date(), notes: note } });
    existing.add(normalized);
    universeCount++;
    added.push({ phrase: normalized, source });
  };
  // Rakip ifadeleri: seed çekirdeğini içeren veya seed ile aynı konudaki başlık/H1
  if (competitors.length && cores.length) {
    const pages = await db.competitorPage.findMany({ where: { competitorId: { in: competitors.map((c) => c.id) }, status: 200, removedAt: null, duplicateOf: null }, select: { competitorId: true, title: true, h1: true, category: true } });
    const byPhrase = new Map<string, Set<string>>();
    for (const p of pages) {
      if (p.category === "home" || p.category === "contact" || p.category === "about") continue;
      const domain = competitors.find((c) => c.id === p.competitorId)!.domain;
      const domainTokens = domain.replace(/^www\./, "").split(/[.-]/);
      for (const text of [p.h1[0], p.title].filter(Boolean) as string[]) {
        const phrase = competitorPhrase(text, [...brandTokens, ...domainTokens]);
        if (!phrase) continue;
        const related = cores.some((c) => containsPhrase(phrase, c)) || seedTopics.has(matchTopic(phrase)?.key);
        if (!related) continue;
        byPhrase.set(phrase, (byPhrase.get(phrase) ?? new Set()).add(domain));
        break;
      }
    }
    for (const [phrase, doms] of [...byPhrase].sort((a, b) => b[1].size - a[1].size)) await add(phrase, "competitor", `Rakip başlık/H1 sinyali: ${[...doms].join(", ")}`);
  }
  for (const core of cores) for (const v of expandSeed(core)) await add(v, "universe", `Seed varyasyonu: “${core}”`);
  return { seeds: seeds.length, added, total: await db.keyword.count({ where: { status: "ACTIVE" } }) };
}

// ─── 2) Fırsat: kapsam + skor + karar ───────────────────────────────────────

export type Coverage = "strong" | "weak" | "none";
export type GapType = "A_COMPETITOR_ONLY" | "B_COMPETITOR_STRONGER" | "C_VISIBLE_NOT_OPTIMIZED" | "D_QUERY_NO_LANDING" | "E_CANNIBALIZATION" | "F_SUPPORTING_TOPIC";
export const GAP_LABELS: Record<GapType, string> = {
  A_COMPETITOR_ONLY: "Rakipte var, sitede yok", B_COMPETITOR_STRONGER: "Rakip güçlü, site zayıf", C_VISIBLE_NOT_OPTIMIZED: "Görünür ama optimize değil",
  D_QUERY_NO_LANDING: "Sorgu var, uygun sayfa yok", E_CANNIBALIZATION: "Aynı kelimede birden fazla sayfa", F_SUPPORTING_TOPIC: "Destekleyici içerik eksik",
};
export type Decision = "NEW_LANDING" | "NEW_BLOG" | "OPTIMIZE_TITLE" | "OPTIMIZE_CONTENT" | "INTERNAL_LINK" | "CANNIBALIZATION" | "LOCATION_HUMAN" | "NONE";

export type OppInput = {
  phrase: string;
  intent: string; // SearchIntent
  hasLocation: boolean;
  coverage: Coverage;
  cannibalPaths: string[];
  duplicateOf: string | null; // benzer başlıklı mevcut sayfa (yeni sayfa yerine onu güçlendir)
  competitorDomains: number;
  seedRel: number; // 1 = seed'in kendisi/çekirdeğini içerir · 0,5 = seed ile aynı konu · 0 = ilişkisiz
  gsc: { impressions: number; clicks: number; position: number | null } | null; // null = veri yok (bilinmiyor)
  titleHasPhrase: boolean; // hedef sayfanın title/H1'i ifadeyi içeriyor mu
  targetContextIn: number | null; // hedef sayfaya gelen bağlamsal link sayısı
  learning?: number; // öğrenme çarpanı (0,7–1,3)
};

const INTENT_VALUE: Record<string, number> = { TRANSACTIONAL: 15, COMMERCIAL: 12, LOCAL: 12, INFORMATIONAL: 6, NAVIGATIONAL: 0 };
const QUESTION_RE = /\b(nedir|nasıl|neden|nelerdir|ne kadar|hangi|mi|mı|mu|mü|vs|karşılaştırma|farkı)\b/;

/** Deterministik fırsat skoru (0–100). Bilinmeyen talep 0 katkı verir (tahmin yok). */
export function scoreOpportunity(o: OppInput) {
  const imp = o.gsc?.impressions ?? 0;
  const demand = imp > 0 ? Math.min(25, Math.round(6 * Math.log10(1 + imp) * 2)) : 0;
  const commercialIntent = INTENT_VALUE[o.intent] ?? 6;
  const competitorGap = o.coverage === "strong" ? 0 : Math.min(20, 8 * o.competitorDomains);
  const pos = o.gsc?.position ?? null;
  const ctr = o.gsc && o.gsc.impressions ? o.gsc.clicks / o.gsc.impressions : null;
  const currentPotential = (pos != null && pos >= 4 && pos <= 10 ? 15 : pos != null && pos > 10 && pos <= 20 ? 10 : 0) + (imp >= 100 && ctr != null && ctr < 0.02 ? 5 : 0) + (o.coverage === "weak" ? 6 : 0);
  const conversionValue = ["TRANSACTIONAL", "COMMERCIAL", "LOCAL"].includes(o.intent) && o.seedRel > 0 ? 8 : 3;
  const topicalValue = Math.round(10 * o.seedRel);
  const cannibalizationRisk = o.cannibalPaths.length >= 2 ? 20 : 0;
  const doorwayRisk = o.hasLocation && o.coverage === "none" ? 25 : 0;
  const duplicationRisk = o.duplicateOf && o.coverage === "none" ? 15 : 0;
  const raw = demand + commercialIntent + competitorGap + currentPotential + conversionValue + topicalValue - cannibalizationRisk - doorwayRisk - duplicationRisk;
  const learning = o.learning ?? 1;
  const score = Math.max(0, Math.min(100, Math.round(raw * learning)));
  return { score, parts: { demand, commercialIntent, competitorGap, currentPotential, conversionValue, topicalValue, cannibalizationRisk, doorwayRisk, duplicationRisk, learning: Number(learning.toFixed(2)) }, demandKnown: o.gsc != null };
}

/** Karar: yeni landing mi, blog mu, mevcut sayfa mı, iç link mi, insan kararı mı? */
export function decideOpportunity(o: OppInput): { decision: Decision; gap: GapType | null; reason: string } {
  const imp = o.gsc?.impressions ?? 0;
  if (o.cannibalPaths.length >= 2) return { decision: "CANNIBALIZATION", gap: "E_CANNIBALIZATION", reason: `“${o.phrase}” için ${o.cannibalPaths.length} sayfa yarışıyor: ${o.cannibalPaths.join(", ")}. Hedef farklılaştırma/birleştirme insan kararıdır.` };
  if (o.coverage === "none") {
    const evidence = imp >= 20 || (o.competitorDomains >= 2 && o.seedRel >= 0.5);
    if (!evidence) return { decision: "NONE", gap: null, reason: o.competitorDomains ? "Rakip sinyali tek başına yetmez: ölçülen talep veya seed ilişkisiyle en az 2 rakip gerekir" : "Kanıt yok (talep ve rakip sinyali yok)" };
    if (o.duplicateOf) return { decision: "OPTIMIZE_CONTENT", gap: o.competitorDomains ? "B_COMPETITOR_STRONGER" : "D_QUERY_NO_LANDING", reason: `Yeni sayfa açılmaz: ${o.duplicateOf} aynı konuyu işliyor (kopya/cannibalization riski); mevcut sayfa güçlendirilir` };
    if (o.hasLocation) return { decision: "LOCATION_HUMAN", gap: imp ? "D_QUERY_NO_LANDING" : "A_COMPETITOR_ONLY", reason: "Konumlu sayfa şablonla açılmaz (doorway riski): gerçek yerel bilgi ve işletme doğrulaması gerekir" };
    const info = o.intent === "INFORMATIONAL" || QUESTION_RE.test(foldKeyword(o.phrase));
    const gap: GapType = imp >= 20 ? "D_QUERY_NO_LANDING" : o.seedRel >= 1 || !info ? "A_COMPETITOR_ONLY" : "F_SUPPORTING_TOPIC";
    return info
      ? { decision: "NEW_BLOG", gap, reason: "Bilgi/soru niyeti: ticari sayfaları destekleyen rehber yazısı" }
      : { decision: "NEW_LANDING", gap, reason: "Ticari niyet ve sitede karşılayan sayfa yok: yeni hizmet sayfası (hizmetin verildiği doğrulanmalı)" };
  }
  if (o.coverage === "weak") {
    if (!o.titleHasPhrase) return { decision: "OPTIMIZE_TITLE", gap: o.competitorDomains ? "B_COMPETITOR_STRONGER" : "C_VISIBLE_NOT_OPTIMIZED", reason: "Sayfa konuyu işliyor ama title/H1 ifadeyi hedeflemiyor" };
    return { decision: "OPTIMIZE_CONTENT", gap: o.competitorDomains ? "B_COMPETITOR_STRONGER" : "C_VISIBLE_NOT_OPTIMIZED", reason: "Sayfa hedefliyor ama içerik kapsamı zayıf" };
  }
  const pos = o.gsc?.position ?? null;
  if (pos != null && pos >= 4 && pos <= 20 && imp >= 20 && !o.titleHasPhrase) return { decision: "OPTIMIZE_TITLE", gap: "C_VISIBLE_NOT_OPTIMIZED", reason: `Pozisyon ${pos.toFixed(1)}: title sorguyu tam hedeflemiyor` };
  if (o.targetContextIn != null && o.targetContextIn < 2 && (o.seedRel > 0 || imp > 0)) return { decision: "INTERNAL_LINK", gap: "F_SUPPORTING_TOPIC", reason: `Hedef sayfaya yalnızca ${o.targetContextIn} bağlamsal iç link var` };
  return { decision: "NONE", gap: null, reason: "Sayfa güçlü ve iyi bağlanmış" };
}

const DECISION_TYPE: Record<Decision, string> = { NEW_LANDING: "NEW_PAGE", NEW_BLOG: "NEW_PAGE", OPTIMIZE_TITLE: "TITLE", OPTIMIZE_CONTENT: "CONTENT", INTERNAL_LINK: "INTERNAL_LINK", CANNIBALIZATION: "TECH", LOCATION_HUMAN: "LOCATION", NONE: "" };
export const MIN_SCORE = 30;

export type Opportunity = OppInput & ReturnType<typeof scoreOpportunity> & ReturnType<typeof decideOpportunity> & {
  type: string; targetPath: string | null; targetPageId: string | null; newPath: string | null; linkSource: string | null; competitors: string[]; competitorHeadings: string[]; source: string;
};

/** Tüm evreni değerlendirir (yan etkisiz): skor sırasıyla fırsatlar. */
export async function findOpportunities(opts: { now?: Date } = {}): Promise<{ opportunities: Opportunity[]; evaluated: number; hasGsc: boolean }> {
  const now = opts.now ?? new Date();
  const [st, seeds, locs, learn, competitors] = await Promise.all([loadSiteState(), activeSeeds(), loadLocations(), learningStats(), db.competitor.findMany({ where: { status: { not: "paused" } }, select: { id: true, domain: true } })]);
  const places = [...locs.provinces.map((p) => p.name), ...locs.districts.map((d) => d.name)];
  const cores = [...new Set(seeds.map((s) => seedCore(s.phrase, places)).filter(Boolean))];
  const seedSet = new Set(seeds.map((s) => s.normalized));
  const seedTopics = new Set(seeds.map((s) => matchTopic(s.phrase)?.key).filter(Boolean));
  const brandTokens = [st.settings.site.siteName, st.settings.business.name, "webtasarimajansi"].filter(Boolean);
  const pub = st.pages.filter((p) => p.status === "PUBLISHED" && p.robotsIndex && !p.autoNoindex && !["STATIC", "BLOG_INDEX", "HOME"].includes(p.type));
  const ours = pub.map((p) => {
    const md = extractMarkdown(p.body);
    return { p, head: `${resolveTitle(p, st.settings.seo)} ${p.h1 ?? p.name}`, primary: p.primaryKeyword ?? "", secondary: (p.secondaryKeywords ?? []).join(" "), text: `${p.intro ?? ""} ${md.text}` };
  });
  const stats = new Map(linkStats(toLinkPages(st), st.edges).map((s) => [s.path, s]));
  const cPages = competitors.length ? (await db.competitorPage.findMany({ where: { competitorId: { in: competitors.map((c) => c.id) }, status: 200, removedAt: null, duplicateOf: null }, select: { competitorId: true, title: true, h1: true, h2: true, category: true } }))
    .filter((p) => !["home", "contact", "about"].includes(p.category ?? "")).map((p) => ({ ...p, domain: competitors.find((c) => c.id === p.competitorId)!.domain, head: `${p.title ?? ""} ${p.h1.join(" ")}` })) : [];
  // GSC: son 28 gün (senkron tabloları; burada API çağrısı yok)
  const since = new Date(now.getTime() - 28 * 86400_000);
  const gscRows = await db.gscQueryDaily.groupBy({ by: ["query", "page"], where: { date: { gte: since } }, _sum: { impressions: true, clicks: true } });
  const posRows = await db.gscQueryDaily.findMany({ where: { date: { gte: since } }, select: { query: true, page: true, position: true, impressions: true } });
  const hasGsc = gscRows.length > 0;
  const gsc = new Map<string, { impressions: number; clicks: number; w: number; pages: Map<string, number> }>();
  for (const r of gscRows) {
    const e = gsc.get(r.query) ?? { impressions: 0, clicks: 0, w: 0, pages: new Map() };
    e.impressions += r._sum.impressions ?? 0; e.clicks += r._sum.clicks ?? 0;
    e.pages.set(r.page, (e.pages.get(r.page) ?? 0) + (r._sum.impressions ?? 0));
    gsc.set(r.query, e);
  }
  for (const r of posRows) { const e = gsc.get(r.query); if (e) e.w += r.position * r.impressions; }

  const kws = await db.keyword.findMany({ where: { status: "ACTIVE", source: { in: ["seed", "universe", "competitor", "discovered"] } }, select: { normalized: true, source: true } });
  const out: Opportunity[] = [];
  for (const k of kws) {
    const phrase = k.normalized;
    const loc = detectLocation(phrase, locs.pLocs, locs.dLocs);
    const intent = classifyIntent(phrase, { hasLocation: Boolean(loc), brandTokens }).primary;
    if (intent === "NAVIGATIONAL") continue;
    const strong = ours.filter((o) => (o.primary && normalizeKeyword(o.primary) === phrase) || containsPhrase(o.head, phrase));
    const weak = ours.filter((o) => !strong.includes(o) && (containsPhrase(o.secondary, phrase) || containsPhrase(o.text, phrase)));
    const primaryClash = ours.filter((o) => o.primary && normalizeKeyword(o.primary) === phrase);
    const g = gsc.get(phrase) ?? null;
    const gscPages = g ? [...g.pages].filter(([, i]) => i >= Math.max(10, g.impressions * 0.2)).map(([u]) => u.replace(/^https?:\/\/[^/]+/, "") || "/") : [];
    const cannibalPaths = primaryClash.length >= 2 ? primaryClash.map((o) => o.p.path) : gscPages.length >= 2 ? gscPages : [];
    const coverage: Coverage = strong.length ? "strong" : weak.length ? "weak" : "none";
    const target = strong[0] ?? weak.sort((a, b) => Number(containsPhrase(b.text.slice(0, 600), phrase)) - Number(containsPhrase(a.text.slice(0, 600), phrase)))[0] ?? null;
    const words = phrase.split(" ");
    const dup = coverage === "none" ? ours.find((o) => { const h = new Set(normalizeKeyword(o.head).split(" ")); return words.filter((w) => h.has(w)).length / words.length >= 0.75 && words.length >= 3; }) : null;
    const theirs = cPages.filter((c) => containsPhrase(c.head, phrase));
    const doms = [...new Set(theirs.map((c) => c.domain))];
    const seedRel = seedSet.has(phrase) || cores.some((c) => containsPhrase(phrase, c)) ? 1 : seedTopics.has(matchTopic(phrase)?.key) ? 0.5 : 0;
    const input: OppInput = {
      phrase, intent, hasLocation: Boolean(loc), coverage, cannibalPaths, duplicateOf: dup?.p.path ?? null, competitorDomains: doms.length, seedRel,
      gsc: g ? { impressions: g.impressions, clicks: g.clicks, position: g.impressions ? g.w / g.impressions : null } : null,
      titleHasPhrase: target ? containsPhrase(target.head, phrase) : false,
      targetContextIn: target ? stats.get(target.p.path)?.contextIn ?? null : null,
    };
    const d = decideOpportunity(input);
    if (d.decision === "NONE") continue;
    const type = DECISION_TYPE[d.decision];
    input.learning = learn.get(type)?.multiplier ?? 1;
    const sc = scoreOpportunity(input);
    // Mevcut sayfa hedefi: benzer sayfa (kopya riski) veya kapsayan sayfa
    const tgt = d.decision === "OPTIMIZE_CONTENT" && dup ? dup : target;
    // İç link kaynağı: ifadeyi metninde geçiren, hedefe henüz bağlamsal link vermeyen yayındaki sayfa
    const linkSource = d.decision === "INTERNAL_LINK" && tgt
      ? ours.find((o) => o.p.id !== tgt.p.id && containsPhrase(o.text, phrase) && !st.edges.some((e) => e.from === o.p.path && e.to === tgt.p.path && e.kind !== "nav") && (((o.p.relatedLinks as unknown[] | null) ?? []).length < 8))?.p.path ?? null
      : null;
    if (d.decision === "INTERNAL_LINK" && !linkSource) continue;
    const newPath = d.decision === "NEW_BLOG" ? `/blog/${slugify(phrase)}` : d.decision === "NEW_LANDING" ? `/${slugify(phrase)}` : null;
    out.push({
      ...input, ...sc, ...d, type, source: k.source, targetPath: tgt?.p.path ?? null, targetPageId: tgt?.p.id ?? null, newPath, linkSource, competitors: doms,
      competitorHeadings: [...new Set(theirs.flatMap((c) => c.h2))].slice(0, 30),
    });
  }
  out.sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase, "tr"));
  return { opportunities: out, evaluated: kws.length, hasGsc };
}

// ─── 3) Fırsat → öneri (mevcut 48 saatlik yaşam döngüsü) ─────────────────────

export type UniverseScan = { evaluated: number; opportunities: number; selected: { phrase: string; decision: Decision; gap: GapType | null; score: number; status: string; note: string }[]; created: Record<string, number>; skippedReason?: string };

function keyFor(o: Opportunity): string {
  switch (o.decision) {
    case "NEW_LANDING": case "NEW_BLOG": return `NEW_PAGE:universe:${o.newPath}`;
    case "OPTIMIZE_TITLE": return `TITLE:${o.targetPageId}`;
    case "OPTIMIZE_CONTENT": return `CONTENT:${o.targetPageId}`;
    case "INTERNAL_LINK": return `INTERNAL_LINK:${o.linkSource}->${o.targetPath}`;
    case "CANNIBALIZATION": return `TECH:cannibal:${o.phrase}`;
    default: return `LOCATION:universe:${o.phrase}`;
  }
}

/** En değerli fırsatları (cycle bütçesi dahilinde) öneriye çevirir. Mükerrer önleme lifecycle'ın. */
export async function runUniverseOpportunities(opts: { now?: Date; runId?: string | null } = {}): Promise<UniverseScan> {
  const now = opts.now ?? new Date();
  const settings = await getSettingsFresh();
  const ap = settings.autopilot;
  const mode = agentMode(ap);
  const { opportunities, evaluated } = await findOpportunities({ now });
  const out: UniverseScan = { evaluated, opportunities: opportunities.length, selected: [], created: {} };
  if (mode === "OBSERVE") return { ...out, skippedReason: "OBSERVE modu: fırsatlar yalnızca ölçüldü" };
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const usedThisWeek = await db.autopilotAction.count({ where: { source: "universe", createdAt: { gte: weekAgo }, status: { in: ["pending_approval", "applying", "applied"] } } });
  let left = Math.min(ap.maxActionsPerCycle, Math.max(0, ap.maxChangesPerWeek - usedThisWeek));
  let humanLeft = 2;
  const window = { model: settings.integrations.aiModel, windowHours: ap.approvalWindowHours || 48 };
  const auto = mode === "AUTONOMOUS";
  for (const o of opportunities) {
    if (o.score < MIN_SCORE) break;
    const human = o.decision === "CANNIBALIZATION" || o.decision === "LOCATION_HUMAN";
    if (human ? humanLeft <= 0 : left <= 0) continue;
    const key = keyFor(o);
    const evidence = [
      o.gsc ? `GSC 28 gün: ${o.gsc.impressions} gösterim, ${o.gsc.clicks} tık${o.gsc.position != null ? `, ort. pozisyon ${o.gsc.position.toFixed(1)}` : ""}` : "GSC talebi: bilinmiyor (veri yok)",
      o.competitors.length ? `Rakipte: ${o.competitors.join(", ")}` : "Rakip sinyali yok",
      `Seed ilişkisi: ${o.seedRel === 1 ? "doğrudan" : o.seedRel ? "aynı konu" : "yok"}`, `Site kapsamı: ${o.coverage}${o.targetPath ? ` (${o.targetPath})` : ""}`,
    ].join(" · ");
    const meta = { phrase: o.phrase, gapType: o.gap, gapLabel: o.gap ? GAP_LABELS[o.gap] : null, decision: o.decision, parts: o.parts, evidence, competitors: o.competitors, keywordSource: o.source };
    const title = `[Fırsat] ${o.phrase} — ${o.decision === "NEW_BLOG" ? "yeni rehber" : o.decision === "NEW_LANDING" ? "yeni hizmet sayfası" : o.decision === "OPTIMIZE_TITLE" ? "title optimizasyonu" : o.decision === "OPTIMIZE_CONTENT" ? "içerik güçlendirme" : o.decision === "INTERNAL_LINK" ? "iç link" : o.decision === "CANNIBALIZATION" ? "cannibalization kararı" : "lokasyon kararı"}`;
    const reason = `${o.gap ? GAP_LABELS[o.gap] : ""}: ${o.reason}`;
    const common = { key, source: "universe", category: o.competitors.length ? ("COMPETITOR" as const) : undefined, title, reason, score: o.score, runId: opts.runId ?? null, query: o.phrase, expectedImpact: o.reason };
    let r: CreateResult;
    if (human) {
      const dup = await duplicateReason(key, now);
      if (dup) continue;
      const row = await db.autopilotAction.create({ data: { runId: opts.runId ?? null, type: o.type, risk: "HUMAN", status: "needs_approval", score: o.score, title, reason, pageId: o.targetPageId, query: o.phrase, proposal: { ...meta, pagePath: o.targetPath, paths: o.cannibalPaths } as object, qualityNotes: "Yüksek riskli işlem: insan kararı gerekir (otomatik uygulanmaz)", riskLevel: "HIGH", category: o.type === "LOCATION" ? "LOCAL" : "TECH", source: "universe", fingerprint: key, createdAt: now } });
      r = { id: row.id, status: "needs_approval", note: "İnsan kararı gerekir" };
      humanLeft--;
    } else if (o.decision === "NEW_BLOG" || o.decision === "NEW_LANDING") {
      const path = o.newPath!;
      if (await db.page.findUnique({ where: { path }, select: { id: true } })) continue; // mevcut taslak/sayfa ezilmez
      if (await pendingNewPage(path)) continue;
      const blog = o.decision === "NEW_BLOG";
      const name = o.phrase.replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("tr"));
      r = await createProposal({ ...common, type: "NEW_PAGE", risk: "CONTROLLED", proposal: { ...meta, pagePath: path, decision: "NEW_PAGE", pageType: blog ? "BLOG_POST" : "SERVICE", pageId: null, ...(blog ? {} : { service: { name, summary: null } }), group: { primary: o.phrase, queries: [o.phrase], impressions: o.gsc?.impressions ?? 0, intent: o.intent, location: null } }, allowAuto: auto && ap.autoApplyControlled, noAutoReason: "Mod/ayar otomatik yeni sayfaya izin vermiyor" }, window);
    } else if (o.decision === "OPTIMIZE_TITLE") {
      r = await createProposal({ ...common, type: "TITLE", risk: "AUTO", pageId: o.targetPageId, proposal: { ...meta, pagePath: o.targetPath }, allowAuto: auto && ap.autoApplySafe }, window);
    } else if (o.decision === "OPTIMIZE_CONTENT") {
      r = await createProposal({ ...common, type: "CONTENT", risk: "CONTROLLED", pageId: o.targetPageId, proposal: { ...meta, pagePath: o.targetPath, competitorHeadings: o.competitorHeadings, recommendedAction: o.reason }, allowAuto: auto && ap.autoApplyControlled, noAutoReason: "Mod/ayar otomatik içerik uygulamasına izin vermiyor" }, window);
    } else {
      const src = await db.page.findUnique({ where: { path: o.linkSource! }, select: { id: true } });
      r = await createProposal({ ...common, type: "INTERNAL_LINK", risk: "AUTO", pageId: src?.id ?? null, proposal: { ...meta, pagePath: o.linkSource, payload: { source: o.linkSource, target: o.targetPath, anchor: o.phrase } }, allowAuto: auto && ap.autoApplySafe }, window);
    }
    if (r.duplicate) continue;
    out.created[r.status] = (out.created[r.status] ?? 0) + 1;
    out.selected.push({ phrase: o.phrase, decision: o.decision, gap: o.gap, score: o.score, status: r.status, note: r.note });
    if (!human && ["pending_approval", "applied", "needs_approval"].includes(r.status)) left--;
  }
  return out;
}
