// İç link motoru: orphan sayfalar, az/çok link alanlar, anchor çeşitliliği ve
// "bu sayfaya şu sayfalardan link verin" önerileri.

import type { Edge } from "./graph";
import { containsPhrase } from "../text/slug";

export type LinkPage = {
  id: string;
  path: string;
  type: string;
  name: string;
  published: boolean;
  primaryKeyword: string | null;
  provinceId: number | null;
  serviceId: string | null;
  sectorId: string | null;
  text: string; // gövde düz metni
  importance: number; // 0–5: hedef kelime önceliği / sayfa türü
};

export type LinkStats = {
  path: string;
  name: string;
  type: string;
  contextIn: number;
  navIn: number;
  out: number;
  anchors: { text: string; count: number }[];
  anchorDiversity: number | null; // 0–1, farklı anchor oranı
  importance: number;
};

export type LinkSuggestion = {
  target: string;
  source: string;
  sourceName: string;
  anchor: string;
  score: number;
  reasons: string[];
};

export function linkStats(pages: LinkPage[], edges: Edge[]): LinkStats[] {
  const pub = pages.filter((p) => p.published);
  return pub.map((p) => {
    const inbound = edges.filter((e) => e.to === p.path && e.from !== p.path);
    const ctx = inbound.filter((e) => e.kind !== "nav");
    const anchorsMap = new Map<string, number>();
    for (const e of ctx) {
      const a = e.anchor.trim().toLocaleLowerCase("tr-TR");
      if (a) anchorsMap.set(a, (anchorsMap.get(a) ?? 0) + 1);
    }
    const anchors = [...anchorsMap].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count);
    const total = anchors.reduce((s, a) => s + a.count, 0);
    return {
      path: p.path,
      name: p.name,
      type: p.type,
      contextIn: new Set(ctx.map((e) => e.from)).size,
      navIn: new Set(inbound.filter((e) => e.kind === "nav").map((e) => e.from)).size,
      out: new Set(edges.filter((e) => e.from === p.path && e.kind !== "nav").map((e) => e.to)).size,
      anchors,
      anchorDiversity: total >= 3 ? anchors.length / total : null,
      importance: p.importance,
    };
  });
}

export function orphans(stats: LinkStats[]): LinkStats[] {
  return stats.filter((s) => s.type !== "HOME" && s.contextIn === 0 && s.navIn === 0);
}

export function weaklyLinked(stats: LinkStats[], min = 2): LinkStats[] {
  return stats.filter((s) => s.type !== "HOME" && s.contextIn < min && !(s.contextIn === 0 && s.navIn === 0));
}

/** Hedef sayfaya link verebilecek en uygun kaynak sayfalar. */
export function suggestLinks(target: LinkPage, pages: LinkPage[], edges: Edge[], limit = 5): LinkSuggestion[] {
  const already = new Set(edges.filter((e) => e.to === target.path && e.kind !== "nav").map((e) => e.from));
  const anchor = target.primaryKeyword?.trim() || target.name;
  const out: LinkSuggestion[] = [];
  for (const src of pages) {
    if (!src.published || src.path === target.path || already.has(src.path)) continue;
    let score = 0;
    const reasons: string[] = [];
    if (target.provinceId && src.provinceId === target.provinceId) {
      score += 3;
      reasons.push("Aynı ilin konu kümesine ait");
    }
    if (target.serviceId && src.serviceId === target.serviceId) {
      score += 2;
      reasons.push("Aynı hizmet kümesine ait");
    }
    if (target.sectorId && src.sectorId === target.sectorId) {
      score += 2;
      reasons.push("Aynı sektör kümesine ait");
    }
    if (target.primaryKeyword && containsPhrase(src.text, target.primaryKeyword)) {
      score += 4;
      reasons.push(`Metinde "${target.primaryKeyword}" geçiyor`);
    } else if (containsPhrase(src.text, target.name)) {
      score += 3;
      reasons.push(`Metinde "${target.name}" geçiyor`);
    }
    if (src.type === "BLOG_POST" && score > 0) {
      score += 1;
      reasons.push("Rehber yazısından bağlamsal link değerlidir");
    }
    if (src.type === "HOME" && target.importance >= 4) {
      score += 2;
      reasons.push("Önemli sayfa: ana sayfadan link güç aktarır");
    }
    if (score >= 3) out.push({ target: target.path, source: src.path, sourceName: src.name, anchor, score, reasons: [...reasons, "mevcut sayfadan hedefe internal link bulunmuyor"] });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── Konu kümeleri ve ilişki denetimi ───────────────────────────────────────

export type RelationKey = "service-sector" | "service-location" | "blog-service" | "blog-location" | "location-cluster";
export const RELATION_LABELS: Record<RelationKey, string> = {
  "service-sector": "Hizmet → Sektör",
  "service-location": "Hizmet → Lokasyon",
  "blog-service": "Blog → Hizmet",
  "blog-location": "Blog → Lokasyon",
  "location-cluster": "Lokasyon kümesi (il ↔ ilçe ↔ kombinasyon)",
};

export type ClusterSuggestion = { relation: RelationKey; source: string; target: string; anchor: string; reason: string };

const LOC_TYPES = new Set(["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"]);

/**
 * Yayındaki sayfalar arasında konu ilişkisi olan ama link verilmemiş çiftleri bulur.
 * İlişki yalnızca veriden çıkar: aynı hizmet/sektör/il kimliği veya metinde geçen konu.
 */
export function clusterAudit(pages: LinkPage[], edges: Edge[]) {
  const pub = pages.filter((p) => p.published);
  const linked = new Set(edges.filter((e) => e.kind !== "nav").map((e) => `${e.from}→${e.to}`));
  const counts: Record<RelationKey, { possible: number; existing: number }> = {
    "service-sector": { possible: 0, existing: 0 }, "service-location": { possible: 0, existing: 0 },
    "blog-service": { possible: 0, existing: 0 }, "blog-location": { possible: 0, existing: 0 }, "location-cluster": { possible: 0, existing: 0 },
  };
  const suggestions: ClusterSuggestion[] = [];
  const consider = (relation: RelationKey, s: LinkPage, t: LinkPage, reason: string) => {
    if (s.path === t.path) return;
    counts[relation].possible++;
    if (linked.has(`${s.path}→${t.path}`)) counts[relation].existing++;
    else suggestions.push({ relation, source: s.path, target: t.path, anchor: t.primaryKeyword?.trim() || t.name, reason });
  };
  const services = pub.filter((p) => p.type === "SERVICE");
  const sectors = pub.filter((p) => p.type === "SECTOR");
  const locations = pub.filter((p) => LOC_TYPES.has(p.type));
  const blogs = pub.filter((p) => p.type === "BLOG_POST");
  for (const s of services) {
    for (const t of sectors) if (containsPhrase(t.text, s.name) || containsPhrase(s.text, t.name.split(" ")[0]))
      consider("service-sector", s, t, `“${t.name}” sayfası “${s.name}” hizmetinden bahsediyor; aynı konu kümesine ait ve hizmet sayfasından bu sektör sayfasına internal link bulunmuyor.`);
    for (const t of locations) if (t.serviceId && t.serviceId === s.serviceId)
      consider("service-location", s, t, `Lokasyon sayfası “${s.name}” hizmetine bağlı; aynı konu kümesine ait ve hizmet sayfasından bu lokasyona internal link bulunmuyor.`);
  }
  for (const b of blogs) {
    for (const t of services) if ((t.primaryKeyword && containsPhrase(b.text, t.primaryKeyword)) || containsPhrase(b.text, t.name))
      consider("blog-service", b, t, `Yazı metninde “${t.primaryKeyword ?? t.name}” konusu geçiyor ama ilgili hizmet sayfasına internal link yok.`);
    for (const t of locations) if (t.provinceId && containsPhrase(b.text, t.name.replace(/ Web Tasarım.*$/i, "")))
      consider("blog-location", b, t, `Yazı metninde bu konumdan bahsediliyor ama lokasyon sayfasına internal link yok.`);
  }
  for (const s of locations) for (const t of locations) {
    if (s.provinceId && s.provinceId === t.provinceId && s.path !== t.path)
      consider("location-cluster", s, t, "Aynı ilin lokasyon kümesine ait ve mevcut sayfadan internal link bulunmuyor.");
  }
  return { counts, suggestions };
}

/** Çok fazla bağlamsal link alan sayfalar (ortalama + 2 standart sapma üstü). */
export function overLinked(stats: LinkStats[]): LinkStats[] {
  const xs = stats.map((s) => s.contextIn);
  if (xs.length < 3) return [];
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return stats.filter((s) => s.contextIn > mean + 2 * sd).sort((a, b) => b.contextIn - a.contextIn);
}
