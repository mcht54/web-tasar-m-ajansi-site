import "server-only";
// Anahtar kelime keşfi: çekirdek havuz + Search Console'da görünen gerçek sorgular.
// Keşfedilen her sorguya niyet, küme ve hedef sayfa atanır. Uydurma hacim yok.

import { db } from "../db";
import { siteUrl } from "../env";
import { getSettingsFresh } from "../settings";
import { normalizeKeyword } from "../text/slug";
import { detectLocation, loadLocations } from "../seo/location-demand";
import { classifyIntent } from "./intent";
import { ensureLocationCluster, ensureTopicClusters, matchTopic } from "./clusters";

/** Başlangıç havuzu (sabit liste değil: yalnızca ilk tohum; gerisini veri belirler). */
export const SEED_KEYWORDS = [
  "web tasarım", "web tasarımcı", "web tasarım yapan yerler", "web tasarım ajansı", "web tasarım firması", "web tasarım şirketi",
  "web sitesi", "web sitesi yaptırma", "web sitesi yapımı", "web sitesi tasarımı", "profesyonel web sitesi", "kurumsal web sitesi",
  "kurumsal web tasarım", "web tasarım hizmeti", "e-ticaret sitesi", "e-ticaret sitesi yaptırma", "e-ticaret web sitesi",
  "e-ticaret tasarımı", "online satış sitesi", "istanbul web tasarım", "ankara web tasarım", "izmir web tasarım",
  "bursa web tasarım", "antalya web tasarım", "sakarya web tasarım", "adapazarı web tasarım", "serdivan web tasarım",
];

export type DiscoveryResult = { added: { phrase: string; impressions: number; position: number | null; cluster: string | null }[]; updated: number; seeded: number };

export async function discoverKeywords(opts: { minImpressions?: number; maxNew?: number } = {}): Promise<DiscoveryResult> {
  const minImp = opts.minImpressions ?? 5;
  const [settings, topics, locs] = await Promise.all([getSettingsFresh(), ensureTopicClusters(), loadLocations()]);
  const brand = [settings.site.siteName, settings.business.name, "webtasarimajansi"].filter(Boolean);
  const pages = await db.page.findMany({ select: { id: true, path: true } });
  const pageByPath = new Map(pages.map((p) => [p.path, p.id]));
  const base = siteUrl();
  const pathOf = (url: string) => (url.startsWith(base) ? url.slice(base.length).replace(/\/$/, "") || "/" : null);

  const classify = async (phrase: string) => {
    const loc = detectLocation(phrase, locs.pLocs, locs.dLocs);
    const intent = classifyIntent(phrase, { hasLocation: Boolean(loc), brandTokens: brand });
    let clusterId: string | null = null;
    let clusterName: string | null = null;
    if (loc) {
      const name = loc.districtId ? locs.districts.find((d) => d.id === loc.districtId)!.name : locs.provinces.find((p) => p.id === loc.provinceId)!.name;
      clusterId = await ensureLocationCluster(loc.provinceId, loc.districtId, name);
      clusterName = `LOKASYON: ${name}`;
    } else {
      const t = matchTopic(phrase);
      if (t) { clusterId = topics.get(t.key) ?? null; clusterName = t.name; }
    }
    return { loc, intent, clusterId, clusterName };
  };

  // 1) Tohum
  let seeded = 0;
  for (const phrase of SEED_KEYWORDS) {
    const normalized = normalizeKeyword(phrase);
    if (await db.keyword.findUnique({ where: { normalized } })) continue;
    const c = await classify(phrase);
    const cluster = c.clusterId ? await db.keywordCluster.findUnique({ where: { id: c.clusterId }, select: { targetPageId: true } }) : null;
    await db.keyword.create({
      data: {
        phrase, normalized, source: "seed", intent: c.intent.primary, intents: c.intent.intents, clusterId: c.clusterId,
        targetPageId: cluster?.targetPageId ?? null, provinceId: c.loc?.provinceId, districtId: c.loc?.districtId, priority: 4,
      },
    });
    seeded++;
  }

  // 2) Search Console'dan keşif (son 28 gün)
  const since = new Date(Date.now() - 28 * 86400_000);
  const rows = await db.gscQueryDaily.groupBy({
    by: ["query", "page"], where: { date: { gte: since } }, _sum: { impressions: true, clicks: true },
  });
  const byQuery = new Map<string, { i: number; topPage: string; topI: number }>();
  for (const r of rows) {
    const i = r._sum.impressions ?? 0;
    const e = byQuery.get(r.query) ?? { i: 0, topPage: r.page, topI: -1 };
    e.i += i;
    if (i > e.topI) { e.topI = i; e.topPage = r.page; }
    byQuery.set(r.query, e);
  }
  const posRows = await db.gscQueryDaily.findMany({ where: { date: { gte: since } }, select: { query: true, position: true, impressions: true } });
  const posMap = new Map<string, { w: number; i: number }>();
  for (const r of posRows) {
    const e = posMap.get(r.query) ?? { w: 0, i: 0 };
    e.w += r.position * r.impressions; e.i += r.impressions;
    posMap.set(r.query, e);
  }
  const existing = new Set((await db.keyword.findMany({ select: { normalized: true } })).map((k) => k.normalized));
  const added: DiscoveryResult["added"] = [];
  const candidates = [...byQuery].filter(([q, e]) => e.i >= minImp && !existing.has(q)).sort((a, b) => b[1].i - a[1].i).slice(0, opts.maxNew ?? 300);
  for (const [q, e] of candidates) {
    const c = await classify(q);
    // Yalnızca işle ilgili sorgular: bir kümeye düşen veya marka araması
    if (!c.clusterId && c.intent.primary !== "NAVIGATIONAL") continue;
    const topPath = pathOf(e.topPage);
    const cluster = c.clusterId ? await db.keywordCluster.findUnique({ where: { id: c.clusterId }, select: { targetPageId: true } }) : null;
    const pm = posMap.get(q);
    await db.keyword.create({
      data: {
        phrase: q, normalized: q, source: "discovered", discoveredAt: new Date(), intent: c.intent.primary, intents: c.intent.intents,
        clusterId: c.clusterId, targetPageId: (topPath && pageByPath.get(topPath)) || cluster?.targetPageId || null,
        provinceId: c.loc?.provinceId, districtId: c.loc?.districtId, priority: e.i >= 100 ? 4 : 3,
        notes: `Search Console'dan otomatik keşfedildi (28 günde ${e.i} gösterim)`,
      },
    });
    added.push({ phrase: q, impressions: e.i, position: pm && pm.i ? pm.w / pm.i : null, cluster: c.clusterName });
  }

  // 3) Mevcut kelimelerde eksik küme/niyet tamamla (elle girilen niyet korunur)
  let updated = 0;
  for (const k of await db.keyword.findMany({ where: { OR: [{ clusterId: null }, { intents: { isEmpty: true } }] } })) {
    const c = await classify(k.phrase);
    await db.keyword.update({
      where: { id: k.id },
      data: { clusterId: k.clusterId ?? c.clusterId, intents: k.intents.length ? k.intents : c.intent.intents, ...(k.source !== "manual" ? { intent: c.intent.primary } : {}) },
    });
    updated++;
  }
  return { added, updated, seeded };
}
