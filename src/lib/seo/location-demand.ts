import "server-only";
// Lokasyon talebi: "Hangi il/ilçeden web tasarım aranıyor?"
// Kaynak Search Console sorgularıdır (Google'ın gerçekten gösterdiği aramalar).
// Sorguda il/ilçe adı + hizmet niyeti geçiyorsa o konuma yazılır.

import { db } from "../db";
import { foldKeyword } from "../text/slug";
import { qwScore } from "./priority";

/** Web tasarım ve komşu hizmet niyetini gösteren kelime kökleri (katlanmış, ASCII). */
const INTENT = ["web", "site", "tasarim", "e ticaret", "eticaret", "seo", "yazilim", "ajans", "google ads", "reklam", "dijital", "internet sayfa", "kurumsal", "logo", "sosyal medya"];

export type LocationKey = { provinceId: number; districtId: number | null };

type Loc = { provinceId: number; districtId: number | null; name: string; folded: string; ambiguous: boolean };

export type DemandRow = {
  provinceId: number;
  districtId: number | null;
  name: string; // "Sakarya" veya "Serdivan, Sakarya"
  impressions: number;
  clicks: number;
  position: number | null;
  queries: { query: string; impressions: number; clicks: number; position: number }[];
  path: string;
  page: { id: string; status: string; seoScore: number | null; autoNoindex: boolean; robotsIndex: boolean; hasBody: boolean; contentScore?: number | null; contentUpdatedAt?: Date } | null;
  population: number | null;
  verdict: "YOK" | "TASLAK" | "NOINDEX" | "ZAYIF" | "YAYINDA";
  ctr: number | null;
  contentScore: number | null;
  lastUpdated: Date | null;
  indexStatus: string | null; // Google URL Inspection sonucu; kontrol edilmediyse null
  opportunity: number; // 0–100, OPPORTUNITY_FORMULA
};

export const OPPORTUNITY_FORMULA =
  "Fırsat skoru = hızlı kazanım skoru (gösterim, pozisyon yakınlığı, CTR açığı — yalnızca Search Console verisi) + sayfa açığı (sayfa yok/taslak +15, NOINDEX +10, zayıf +5), en çok 100.";

function hasIntent(foldedQuery: string): boolean {
  const q = ` ${foldedQuery} `;
  return INTENT.some((w) => q.includes(` ${w}`));
}

function containsName(foldedQuery: string, foldedName: string): boolean {
  // Türkçe ekleri tolere et: "sakaryada", "sakarya'da" → kelime başı eşleşmesi
  return new RegExp(`(^|\\s)${foldedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(foldedQuery);
}

/** Sorgudaki konumu bulur; belirsiz ilçe adı yalnızca il adıyla birlikte geçerse atanır. */
export function detectLocation(query: string, provinces: Loc[], districts: Loc[]): LocationKey | null {
  const q = foldKeyword(query);
  if (!hasIntent(q)) return null;
  const prov = provinces.filter((p) => containsName(q, p.folded)).sort((a, b) => b.folded.length - a.folded.length)[0];
  const dists = districts
    .filter((d) => d.folded !== "merkez" && containsName(q, d.folded))
    .filter((d) => (prov ? d.provinceId === prov.provinceId : !d.ambiguous))
    // il adıyla aynı olan ilçe adı (ör. "Kırşehir Merkez" değil ama "Artvin"?) il kabul edilir
    .filter((d) => !prov || d.folded !== prov.folded)
    .sort((a, b) => b.folded.length - a.folded.length);
  if (dists[0]) return { provinceId: dists[0].provinceId, districtId: dists[0].districtId };
  if (prov) return { provinceId: prov.provinceId, districtId: null };
  return null;
}

export async function loadLocations() {
  const [provinces, districts] = await Promise.all([
    db.province.findMany({ select: { id: true, name: true, slug: true, population: true } }),
    db.district.findMany({ select: { id: true, name: true, slug: true, provinceId: true, population: true } }),
  ]);
  const counts = new Map<string, number>();
  for (const d of districts) counts.set(foldKeyword(d.name), (counts.get(foldKeyword(d.name)) ?? 0) + 1);
  const provinceNames = new Set(provinces.map((p) => foldKeyword(p.name)));
  const pLocs: Loc[] = provinces.map((p) => ({ provinceId: p.id, districtId: null, name: p.name, folded: foldKeyword(p.name), ambiguous: false }));
  const dLocs: Loc[] = districts.map((d) => ({
    provinceId: d.provinceId, districtId: d.id, name: d.name, folded: foldKeyword(d.name),
    // Birden çok ilde olan ya da bir il adıyla aynı olan ilçe adları belirsizdir
    ambiguous: (counts.get(foldKeyword(d.name)) ?? 0) > 1 || provinceNames.has(foldKeyword(d.name)),
  }));
  return { provinces, districts, pLocs, dLocs };
}

/** Son N günün Search Console sorgularından konum bazlı talep. */
export async function locationDemand(days = 90): Promise<{ rows: DemandRow[]; hasGsc: boolean; unmatched: number }> {
  const since = new Date(Date.now() - days * 86400_000);
  const [{ provinces, districts, pLocs, dLocs }, raw, pages] = await Promise.all([
    loadLocations(),
    db.gscQueryDaily.findMany({ where: { date: { gte: since } }, select: { query: true, impressions: true, clicks: true, position: true } }),
    db.page.findMany({
      where: { type: { in: ["CITY", "DISTRICT"] } },
      select: { id: true, path: true, type: true, status: true, seoScore: true, contentScore: true, contentUpdatedAt: true, autoNoindex: true, robotsIndex: true, provinceId: true, districtId: true, body: true },
    }),
  ]);
  const indexRows = await db.gscIndexStatus.findMany({ select: { url: true, coverageState: true, verdict: true } });
  const indexByPath = new Map(indexRows.map((r) => [new URL(r.url).pathname.replace(/\/$/, "") || "/", r.coverageState ?? r.verdict]));
  const byQuery = new Map<string, { i: number; c: number; w: number }>();
  for (const r of raw) {
    const e = byQuery.get(r.query) ?? { i: 0, c: 0, w: 0 };
    e.i += r.impressions;
    e.c += r.clicks;
    e.w += r.position * r.impressions;
    byQuery.set(r.query, e);
  }
  const agg = new Map<string, DemandRow>();
  const provById = new Map(provinces.map((p) => [p.id, p]));
  const distById = new Map(districts.map((d) => [d.id, d]));
  const pageFor = (k: LocationKey) =>
    pages.find((p) => p.provinceId === k.provinceId && (k.districtId ? p.districtId === k.districtId : p.type === "CITY"));
  let unmatched = 0;
  for (const [query, e] of byQuery) {
    const loc = detectLocation(query, pLocs, dLocs);
    if (!loc) {
      if (hasIntent(foldKeyword(query))) unmatched++;
      continue;
    }
    const key = `${loc.provinceId}:${loc.districtId ?? ""}`;
    let row = agg.get(key);
    if (!row) {
      const prov = provById.get(loc.provinceId)!;
      const dist = loc.districtId ? distById.get(loc.districtId)! : null;
      const pg = pageFor(loc);
      row = {
        provinceId: loc.provinceId, districtId: loc.districtId,
        name: dist ? `${dist.name}, ${prov.name}` : prov.name,
        impressions: 0, clicks: 0, position: null, queries: [],
        path: dist ? `/web-tasarim/${prov.slug}/${dist.slug}` : `/web-tasarim/${prov.slug}`,
        page: pg ? { id: pg.id, status: pg.status, seoScore: pg.seoScore, autoNoindex: pg.autoNoindex, robotsIndex: pg.robotsIndex, hasBody: Boolean(pg.body?.trim()), contentScore: pg.contentScore, contentUpdatedAt: pg.contentUpdatedAt } : null,
        population: dist ? dist.population : prov.population,
        verdict: "YOK",
        ctr: null, contentScore: pg?.contentScore ?? null, lastUpdated: pg?.contentUpdatedAt ?? null,
        indexStatus: null, opportunity: 0,
      };
      agg.set(key, row);
    }
    row.impressions += e.i;
    row.clicks += e.c;
    row.queries.push({ query, impressions: e.i, clicks: e.c, position: e.i ? e.w / e.i : 0 });
  }
  const rows = [...agg.values()].map((r) => {
    const w = r.queries.reduce((s, q) => s + q.position * q.impressions, 0);
    r.position = r.impressions ? w / r.impressions : null;
    r.queries.sort((a, b) => b.impressions - a.impressions);
    r.verdict = verdictOf(r.page);
    r.ctr = r.impressions ? r.clicks / r.impressions : null;
    r.indexStatus = indexByPath.get(r.path) ?? null;
    const gap = { YOK: 15, TASLAK: 15, NOINDEX: 10, ZAYIF: 5, YAYINDA: 0 }[r.verdict];
    r.opportunity = Math.min(100, qwScore(r.impressions, r.position, r.ctr) + gap);
    return r;
  });
  rows.sort((a, b) => b.opportunity - a.opportunity || b.impressions - a.impressions);
  return { rows, hasGsc: raw.length > 0, unmatched };
}

export function verdictOf(page: DemandRow["page"]): DemandRow["verdict"] {
  if (!page) return "YOK";
  if (page.status !== "PUBLISHED") return "TASLAK";
  if (!page.robotsIndex || page.autoNoindex) return "NOINDEX";
  if ((page.seoScore ?? 0) < 80) return "ZAYIF";
  return "YAYINDA";
}

/** Search Console verisi yokken: resmî nüfusa göre potansiyel (arama verisi DEĞİLDİR). */
export async function populationPotential(limit = 81) {
  const [provinces, pages] = await Promise.all([
    db.province.findMany({ orderBy: { population: { sort: "desc", nulls: "last" } }, take: limit, select: { id: true, name: true, slug: true, population: true, region: true } }),
    db.page.findMany({ where: { type: "CITY" }, select: { id: true, provinceId: true, status: true, seoScore: true, autoNoindex: true, robotsIndex: true, body: true } }),
  ]);
  return provinces.map((p) => {
    const pg = pages.find((x) => x.provinceId === p.id);
    const page = pg ? { id: pg.id, status: pg.status, seoScore: pg.seoScore, autoNoindex: pg.autoNoindex, robotsIndex: pg.robotsIndex, hasBody: Boolean(pg.body?.trim()) } : null;
    return { ...p, page, verdict: verdictOf(page) };
  });
}
