import "server-only";
// Hızlı kazanım motoru: Search Console'daki TÜM sorgulardan (takip edilen
// kelimelerle sınırlı değil) gerçek veriye dayalı fırsatlar. Dönem: verinin son
// gününden geriye 28 gün; karşılaştırma: önceki 28 gün. Veri yoksa boş döner —
// hiçbir değer tahmin edilmez.

import { db } from "../db";
import { expectedCtr, qwScore } from "./priority";
export { qwScore };
import { serpConflicts } from "./cannibalization";
import { detectLocation, loadLocations } from "./location-demand";

export type QwCategory = "FIRST_PAGE" | "CONTENT" | "CTR" | "DECLINE" | "RISING" | "CANNIBAL";

export const QW_LABELS: Record<QwCategory, string> = {
  FIRST_PAGE: "İlk sayfa fırsatı",
  CONTENT: "İçerik geliştirme fırsatı",
  CTR: "Title / Meta CTR fırsatı",
  DECLINE: "Performans düşüşü",
  RISING: "Yükselen sorgu",
  CANNIBAL: "Keyword cannibalization",
};

export const QW_RULES: Record<QwCategory, string> = {
  FIRST_PAGE: "Ortalama pozisyon 4–10 ve gösterim eşiğin üzerinde",
  CONTENT: "Ortalama pozisyon 8–20 ve gösterim eşiğin üzerinde",
  CTR: "Gösterim eşiğin üzerinde, pozisyon ≤ 10 ve CTR bu pozisyon için beklenenin yarısından düşük",
  DECLINE: "Tıklama önceki 28 güne göre %30'dan fazla düştü (önceki dönem en az 5 tıklama)",
  RISING: "Gösterim önceki 28 günün en az 2 katı (veya önceki dönemde hiç yoktu)",
  CANNIBAL: "Aynı sorguda en az 2 URL, her biri gösterimlerin %15'inden fazlasını alıyor",
};

export type QwItem = {
  category: QwCategory;
  query: string;
  page: string | null; // en çok gösterim alan URL
  pages: { page: string; impressions: number; share: number; position: number }[];
  impressions: number;
  clicks: number;
  ctr: number | null;
  position: number | null;
  prevImpressions: number;
  prevClicks: number;
  expectedCtr: number | null;
  location: { provinceId: number; districtId: number | null; name: string } | null;
  score: number; // 0–100, formül: QW_SCORE_FORMULA
  reason: string;
};

export const QW_SCORE_FORMULA =
  "Skor = gösterim ağırlığı (log ölçek, en çok 50) + pozisyon yakınlığı (4–10 arası en yüksek, en çok 30) + CTR açığı (beklenen ile gerçek farkı, en çok 20). Yalnızca Search Console verisinden hesaplanır.";

type Agg = { i: number; c: number; w: number; pages: Map<string, { i: number; w: number }> };

const fmt = (n: number, d = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(n);

function aggregate(rows: { query: string; page: string; impressions: number; clicks: number; position: number }[]) {
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const e = m.get(r.query) ?? { i: 0, c: 0, w: 0, pages: new Map() };
    e.i += r.impressions;
    e.c += r.clicks;
    e.w += r.position * r.impressions;
    const p = e.pages.get(r.page) ?? { i: 0, w: 0 };
    p.i += r.impressions;
    p.w += r.position * r.impressions;
    e.pages.set(r.page, p);
    m.set(r.query, e);
  }
  return m;
}

export async function periodBounds() {
  const last = await db.gscQueryDaily.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!last) return null;
  const end = last.date;
  const start = new Date(end.getTime() - 27 * 86400_000);
  const prevEnd = new Date(start.getTime() - 86400_000);
  const prevStart = new Date(prevEnd.getTime() - 27 * 86400_000);
  return { start, end, prevStart, prevEnd };
}

export async function computeQuickWins(): Promise<{ hasData: boolean; threshold: number; items: QwItem[]; period: { start: Date; end: Date } | null }> {
  const b = await periodBounds();
  if (!b) return { hasData: false, threshold: 0, items: [], period: null };
  const sel = { query: true, page: true, impressions: true, clicks: true, position: true } as const;
  const [cur, prev, locs] = await Promise.all([
    db.gscQueryDaily.findMany({ where: { date: { gte: b.start, lte: b.end } }, select: sel }),
    db.gscQueryDaily.findMany({ where: { date: { gte: b.prevStart, lte: b.prevEnd } }, select: sel }),
    loadLocations(),
  ]);
  const A = aggregate(cur);
  const P = aggregate(prev);
  // Eşik: sitenin kendi verisinde sorgu gösterimlerinin medyanı (en az 20)
  const imps = [...A.values()].map((e) => e.i).sort((x, y) => x - y);
  const median = imps.length ? imps[Math.floor((imps.length - 1) / 2)] : 0;
  const threshold = Math.max(20, median);
  const provName = new Map(locs.provinces.map((p) => [p.id, p.name]));
  const distName = new Map(locs.districts.map((d) => [d.id, d.name]));
  const items: QwItem[] = [];

  for (const [query, e] of A) {
    const pos = e.i ? e.w / e.i : null;
    const ctr = e.i ? e.c / e.i : null;
    const pv = P.get(query);
    const pages = [...e.pages]
      .map(([page, p]) => ({ page, impressions: p.i, share: e.i ? p.i / e.i : 0, position: p.i ? p.w / p.i : 0 }))
      .sort((x, y) => y.impressions - x.impressions);
    const loc = detectLocation(query, locs.pLocs, locs.dLocs);
    const base = {
      query, page: pages[0]?.page ?? null, pages, impressions: e.i, clicks: e.c, ctr, position: pos,
      prevImpressions: pv?.i ?? 0, prevClicks: pv?.c ?? 0, expectedCtr: pos != null ? expectedCtr(pos) : null,
      location: loc ? { ...loc, name: loc.districtId ? `${distName.get(loc.districtId)}, ${provName.get(loc.provinceId)}` : provName.get(loc.provinceId)! } : null,
      score: qwScore(e.i, pos, ctr),
    };
    const stat = `${fmt(e.i)} gösterim, ${fmt(e.c)} tıklama, CTR %${fmt((ctr ?? 0) * 100, 1)}, ort. poz. ${pos != null ? fmt(pos, 1) : "—"}`;
    if (pos != null && e.i >= threshold && pos >= 4 && pos <= 10)
      items.push({ ...base, category: "FIRST_PAGE", reason: `${stat}. İlk sayfanın alt sıralarında; içerik ve title iyileştirmesi en hızlı etkiyi gösterebilecek grup.` });
    if (pos != null && e.i >= threshold && pos >= 8 && pos <= 20)
      items.push({ ...base, category: "CONTENT", reason: `${stat}. Google sayfayı bu sorguyla ilişkilendiriyor ama yeterince üstte görmüyor; sorgunun niyetine yönelik bölüm eklemek gerekebilir.` });
    if (pos != null && ctr != null && e.i >= threshold && pos <= 10 && ctr < expectedCtr(pos) * 0.5)
      items.push({ ...base, category: "CTR", reason: `${stat}. Bu pozisyon için beklenen yaklaşık %${fmt(expectedCtr(pos) * 100, 1)}; sonuçtaki title/açıklama tıklamaya ikna etmiyor olabilir.` });
    if (pv && pv.c >= 5 && e.c < pv.c * 0.7)
      items.push({ ...base, category: "DECLINE", reason: `Tıklama ${fmt(pv.c)} → ${fmt(e.c)} (önceki 28 güne göre %${fmt(((pv.c - e.c) / pv.c) * 100, 0)} düşüş). Gösterim ${fmt(pv.i)} → ${fmt(e.i)}.` });
    if (e.i >= Math.max(10, threshold / 2) && (!pv || e.i >= pv.i * 2))
      items.push({ ...base, category: "RISING", reason: pv ? `Gösterim ${fmt(pv.i)} → ${fmt(e.i)} (önceki 28 güne göre ${fmt(e.i / Math.max(pv.i, 1), 1)} kat).` : `Önceki 28 günde görünmeyen yeni sorgu: ${stat}.` });
  }
  for (const c of serpConflicts(cur, threshold)) {
    const e = A.get(c.query)!;
    const pos = e.i ? e.w / e.i : null;
    const loc = detectLocation(c.query, locs.pLocs, locs.dLocs);
    items.push({
      category: "CANNIBAL", query: c.query, page: c.pages[0].page,
      pages: c.pages.map((p) => ({ page: p.page, impressions: p.impressions, share: p.share, position: p.position })),
      impressions: e.i, clicks: e.c, ctr: e.i ? e.c / e.i : null, position: pos, prevImpressions: P.get(c.query)?.i ?? 0, prevClicks: P.get(c.query)?.c ?? 0,
      expectedCtr: null,
      location: loc ? { ...loc, name: loc.districtId ? `${distName.get(loc.districtId)}, ${provName.get(loc.provinceId)}` : provName.get(loc.provinceId)! } : null,
      score: qwScore(e.i, pos, null),
      reason: `${c.pages.length} URL aynı sorguda yarışıyor: ${c.pages.map((p) => `${new URL(p.page).pathname} (%${Math.round(p.share * 100)}, poz. ${fmt(p.position, 1)})`).join("; ")}.`,
    });
  }
  items.sort((a, b) => b.score - a.score);
  return { hasData: true, threshold, items, period: { start: b.start, end: b.end } };
}
