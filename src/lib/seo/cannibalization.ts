// Keyword cannibalization tespiti — iki kaynaktan:
//  1) Niyet: birden çok sayfanın ana anahtar kelimesi aynı (içerik tarafı).
//  2) Gerçek: Search Console'da aynı sorgu için birden çok URL anlamlı gösterim
//     alıyor (Google'ın kararsız kaldığının kanıtı).

import { foldKeyword } from "../text/slug";

export type IntentConflict = { keyword: string; paths: string[] };

export function intentConflicts(pages: { path: string; primaryKeyword: string | null }[]): IntentConflict[] {
  const map = new Map<string, { keyword: string; paths: string[] }>();
  for (const p of pages) {
    if (!p.primaryKeyword?.trim()) continue;
    const k = foldKeyword(p.primaryKeyword);
    const e = map.get(k) ?? { keyword: p.primaryKeyword.trim(), paths: [] };
    e.paths.push(p.path);
    map.set(k, e);
  }
  return [...map.values()].filter((e) => e.paths.length > 1);
}

export type GscRow = { query: string; page: string; impressions: number; clicks: number; position: number };

export type SerpConflict = {
  query: string;
  totalImpressions: number;
  pages: { page: string; impressions: number; clicks: number; share: number; position: number }[];
};

/**
 * Bir sorgu için en az iki URL toplam gösterimin %15'inden fazlasını alıyorsa
 * risk vardır. Çok az gösterimli sorgular gürültüdür, atlanır.
 */
export function serpConflicts(rows: GscRow[], minImpressions = 30, minShare = 0.15): SerpConflict[] {
  const byQuery = new Map<string, Map<string, { impressions: number; clicks: number; posSum: number }>>();
  for (const r of rows) {
    const q = byQuery.get(r.query) ?? new Map();
    const e = q.get(r.page) ?? { impressions: 0, clicks: 0, posSum: 0 };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.posSum += r.position * r.impressions;
    q.set(r.page, e);
    byQuery.set(r.query, q);
  }
  const out: SerpConflict[] = [];
  for (const [query, pages] of byQuery) {
    const total = [...pages.values()].reduce((s, p) => s + p.impressions, 0);
    if (total < minImpressions) continue;
    const list = [...pages]
      .map(([page, p]) => ({
        page,
        impressions: p.impressions,
        clicks: p.clicks,
        share: p.impressions / total,
        position: p.impressions ? p.posSum / p.impressions : 0,
      }))
      .filter((p) => p.share >= minShare)
      .sort((a, b) => b.impressions - a.impressions);
    if (list.length >= 2) out.push({ query, totalImpressions: total, pages: list });
  }
  return out.sort((a, b) => b.totalImpressions - a.totalImpressions);
}
