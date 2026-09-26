import "server-only";
// Anahtar kelime kümeleri: aynı kullanıcı amacına sahip sorgular aynı konu/sayfa
// altında yönetilir. Kurallar açıklanabilir; her kümenin hedef sayfası vardır.

import { db } from "../db";
import { foldKeyword } from "../text/slug";

export type TopicRule = { key: string; name: string; intent: string; weight: number; target: string | null; patterns: string[] };

// Sıra önemlidir: ilk eşleşen kural kazanır (daha özel kurallar önce).
export const TOPIC_RULES: TopicRule[] = [
  { key: "topic:fiyat", name: "WEB TASARIM FİYATLARI", intent: "COMMERCIAL", weight: 9, target: "/web-tasarim-fiyatlari", patterns: ["fiyat", "ucret", "kac para", "maliyet", "ne kadar"] },
  { key: "topic:e-ticaret", name: "E-TİCARET", intent: "COMMERCIAL", weight: 10, target: "/e-ticaret-web-tasarim", patterns: ["e ticaret", "eticaret", "online satis", "internet magaza", "sanal magaza", "e magaza"] },
  { key: "topic:kurumsal", name: "KURUMSAL WEB", intent: "COMMERCIAL", weight: 10, target: "/kurumsal-web-tasarim", patterns: ["kurumsal", "firma web sitesi", "sirket web sitesi", "firma sitesi", "sirket sitesi"] },
  { key: "topic:site-yaptirma", name: "WEB SİTESİ YAPTIRMA", intent: "TRANSACTIONAL", weight: 10, target: "/web-sitesi-yaptirma", patterns: ["web sitesi yaptir", "site yaptir", "web sitesi yapimi", "site yapimi", "web sitesi kur", "web sitesi yapmak"] },
  { key: "topic:ajans", name: "WEB TASARIM AJANSI / FİRMASI", intent: "COMMERCIAL", weight: 10, target: "/web-tasarim-ajansi", patterns: ["ajans", "firma", "firmasi", "sirket", "sirketi", "yapan yerler", "yapan firmalar"] },
  { key: "topic:seo", name: "SEO", intent: "COMMERCIAL", weight: 8, target: "/seo-hizmeti", patterns: ["seo"] },
  { key: "topic:ads", name: "GOOGLE ADS", intent: "COMMERCIAL", weight: 7, target: "/google-ads-yonetimi", patterns: ["google ads", "adwords", "google reklam"] },
  { key: "topic:yazilim", name: "WEB YAZILIM", intent: "COMMERCIAL", weight: 7, target: "/ozel-web-yazilim", patterns: ["yazilim", "web uygulama"] },
  { key: "topic:web-tasarim", name: "WEB TASARIM", intent: "COMMERCIAL", weight: 10, target: "/web-tasarim", patterns: ["web tasarim", "web tasarimci", "website tasarim", "web sitesi tasarim", "web sitesi", "profesyonel web", "web tasarim hizmeti"] },
];

export function matchTopic(query: string): TopicRule | null {
  // "e-ticaret" ↔ "e ticaret": tire boşluk sayılır
  const q = ` ${foldKeyword(query).replace(/-/g, " ")} `;
  return TOPIC_RULES.find((r) => r.patterns.some((p) => q.includes(` ${p}`))) ?? null;
}

/** Kümeleri veritabanında garanti eder (idempotent) ve anahtar → id eşlemesi döner. */
export async function ensureTopicClusters(): Promise<Map<string, string>> {
  const pages = new Map((await db.page.findMany({ select: { id: true, path: true } })).map((p) => [p.path, p.id]));
  const out = new Map<string, string>();
  for (const r of TOPIC_RULES) {
    const c = await db.keywordCluster.upsert({
      where: { key: r.key },
      create: { key: r.key, name: r.name, kind: "TOPIC", intent: r.intent, weight: r.weight, targetPageId: r.target ? pages.get(r.target) ?? null : null },
      update: { name: r.name, weight: r.weight, targetPageId: r.target ? pages.get(r.target) ?? null : null },
    });
    out.set(r.key, c.id);
  }
  return out;
}

/** Lokasyon kümesi: il veya ilçe (hedef = il/ilçe sayfası, taslak olabilir). */
export async function ensureLocationCluster(provinceId: number, districtId: number | null, name: string): Promise<string> {
  const key = districtId ? `loc:${provinceId}:${districtId}` : `loc:${provinceId}`;
  const page = await db.page.findFirst({ where: districtId ? { type: "DISTRICT", districtId } : { type: "CITY", provinceId }, select: { id: true } });
  const c = await db.keywordCluster.upsert({
    where: { key },
    create: { key, name: `LOKASYON: ${name.toLocaleUpperCase("tr-TR")}`, kind: "LOCATION", intent: "COMMERCIAL", weight: 9, provinceId, districtId, targetPageId: page?.id ?? null },
    update: { targetPageId: page?.id ?? null },
  });
  return c.id;
}
