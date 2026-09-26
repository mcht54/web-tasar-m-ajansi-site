import "server-only";
// ANAHTAR KELİME AJANI: her takip edilen kelime için Search Console'dan ölçer
// (son 28 gün vs önceki 28 gün), karar verir ve karar otomatik işleme dönüşür.
//   Pozisyon 1–3   → KORU (izle)
//   Pozisyon 4–10  → SAYFAYI OPTİMİZE ET (title / meta / içerik / iç link / schema)
//   Pozisyon 11–30 → İÇERİĞİ GENİŞLET (sorguları grupla, niyet uyumunu kontrol et)
//   Uygun URL yok  → SAYFA KARARI (mevcut sayfa / gerek yok / yeni sayfa adayı)
// Veri yoksa karar "VERİ YOK"tur; tahmin yapılmaz.

import { db } from "../db";
import { siteUrl } from "../env";
import { analyzePage, loadSiteState, type SiteState } from "../seo/analyzer";
import { suggestLinks } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { resolveTitle } from "../seo/meta";
import { extractMarkdown } from "../text/markdown";
import { containsPhrase } from "../text/slug";
import { learningStats } from "./learning";
import { addDays, lastDataDay } from "./metrics";
import { matchTopic } from "./clusters";
import { classifyIntent } from "./intent";
import { RECOMMENDED_ACTION, scoreCandidate, type Candidate } from "./decide";

export const OPTIMIZE_MIN_IMPRESSIONS = 20; // 28 günde: 4–10 bandında işlem için
export const EXPAND_MIN_IMPRESSIONS = 40; // 28 günde: 11–30 bandında içerik genişletme için

export type KeywordBucket = "NO_DATA" | "INSUFFICIENT_DATA" | "HOLD" | "OPTIMIZE_PAGE" | "EXPAND_CONTENT" | "MONITOR" | "NEEDS_PAGE";
export const BUCKET_LABELS: Record<KeywordBucket, string> = {
  NO_DATA: "Veri yok", INSUFFICIENT_DATA: "Yetersiz veri (izleniyor)", HOLD: "İlk 3 — koru", OPTIMIZE_PAGE: "4–10 — sayfa optimize",
  EXPAND_CONTENT: "11–30 — içerik genişlet", MONITOR: "30+ — izle", NEEDS_PAGE: "Uygun sayfa yok — sayfa kararı",
};

export type Agg = { impressions: number; clicks: number; ctr: number | null; position: number | null; pages: Map<string, number> };
export type KeywordDecision = {
  measuredAt: string;
  window: { current: string; previous: string } | null;
  current: { impressions: number; clicks: number; ctr: number | null; position: number | null } | null;
  previous: { impressions: number; clicks: number; ctr: number | null; position: number | null } | null;
  trend: "rising" | "falling" | "stable" | null;
  targetPath: string | null;
  bucket: KeywordBucket;
  reason: string;
  actions: string[];
};

/** Sorgu → metrik (penceredeki tüm günler; pozisyon gösterim ağırlıklı). */
export async function queryAggregates(from: Date, to: Date): Promise<Map<string, Agg>> {
  const rows = await db.gscQueryDaily.findMany({ where: { date: { gte: from, lte: to } }, select: { query: true, page: true, impressions: true, clicks: true, position: true } });
  const m = new Map<string, { i: number; c: number; w: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const e = m.get(r.query) ?? { i: 0, c: 0, w: 0, pages: new Map() };
    e.i += r.impressions; e.c += r.clicks; e.w += r.position * r.impressions;
    e.pages.set(r.page, (e.pages.get(r.page) ?? 0) + r.impressions);
    m.set(r.query, e);
  }
  return new Map([...m].map(([q, e]) => [q, { impressions: e.i, clicks: e.c, ctr: e.i ? e.c / e.i : null, position: e.i ? e.w / e.i : null, pages: e.pages }]));
}

export function pathOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = siteUrl();
  if (url.startsWith(base)) return url.slice(base.length).replace(/\/$/, "") || "/";
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}

export function bucketFor(a: Agg | null, suitable: boolean): KeywordBucket {
  if (!a || a.impressions === 0) return "NO_DATA";
  if (!suitable) return a.impressions >= OPTIMIZE_MIN_IMPRESSIONS ? "NEEDS_PAGE" : "INSUFFICIENT_DATA";
  const p = a.position ?? 999;
  if (p <= 3) return "HOLD";
  if (p <= 10) return a.impressions >= OPTIMIZE_MIN_IMPRESSIONS ? "OPTIMIZE_PAGE" : "INSUFFICIENT_DATA";
  if (p <= 30) return a.impressions >= EXPAND_MIN_IMPRESSIONS ? "EXPAND_CONTENT" : "INSUFFICIENT_DATA";
  return "MONITOR";
}

type PageLike = SiteState["pages"][number];

/** Sorgu için sayfa uygun mu: hedef sayfa, konu kümesi hedefi veya sayfa metni sorguyu adlandırıyor. */
export function isSuitable(query: string, page: PageLike | undefined, targetPageId: string | null, localQuery: boolean): boolean {
  if (!page || page.status !== "PUBLISHED") return false;
  if (localQuery && !["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"].includes(page.type)) return false;
  if (page.id === targetPageId) return true;
  // Konu kümesi hedefi ticari/işlem niyetini karşılar; bilgi sorusu (nedir/nasıl) ayrı bir yanıt ister
  if (matchTopic(query)?.target === page.path && classifyIntent(query, { hasLocation: localQuery }).primary !== "INFORMATIONAL") return true;
  const text = [page.seoTitle, page.h1, page.name, page.primaryKeyword, ...page.secondaryKeywords].filter(Boolean).join(" ");
  return containsPhrase(text, query);
}

/**
 * Tüm aktif anahtar kelimeleri ölçer, kararı Keyword.decision'a yazar ve
 * karardan otomatik işlem adaylarını üretir.
 */
export async function runKeywordAgent(stateArg?: SiteState): Promise<{ measured: number; decisions: Record<string, number>; candidates: Candidate[]; hasData: boolean }> {
  const state = stateArg ?? (await loadSiteState());
  const end = await lastDataDay();
  const keywords = await db.keyword.findMany({ where: { status: "ACTIVE" }, include: { targetPage: { select: { id: true, path: true } }, province: { select: { name: true } }, district: { select: { name: true } } } });
  const now = new Date();
  const counts: Record<string, number> = {};
  const candidates: Candidate[] = [];
  if (!end) {
    for (const k of keywords) {
      const d: KeywordDecision = { measuredAt: now.toISOString(), window: null, current: null, previous: null, trend: null, targetPath: k.targetPage?.path ?? null, bucket: "NO_DATA", reason: "Search Console verisi yok — gerçek Google verisi alınamadı; karar verilmedi.", actions: [] };
      await db.keyword.update({ where: { id: k.id }, data: { decision: d as object } });
    }
    return { measured: keywords.length, decisions: { NO_DATA: keywords.length }, candidates, hasData: false };
  }
  const cur = await queryAggregates(addDays(end, -27), end);
  const prev = await queryAggregates(addDays(end, -55), addDays(end, -28));
  const byPath = new Map(state.pages.map((p) => [p.path, p]));
  const learn = await learningStats();
  const lp = toLinkPages(state);
  const seen = new Set<string>();
  const window = { current: `${addDays(end, -27).toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`, previous: `${addDays(end, -55).toISOString().slice(0, 10)} – ${addDays(end, -28).toISOString().slice(0, 10)}` };

  for (const k of keywords) {
    const a = cur.get(k.normalized) ?? null;
    const b = prev.get(k.normalized) ?? null;
    const topUrl = a ? [...a.pages].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null : null;
    const local = Boolean(k.provinceId);
    const targetPath = k.targetPage?.path ?? pathOfUrl(topUrl);
    const topPage = byPath.get(pathOfUrl(topUrl) ?? "") ?? (k.targetPage ? byPath.get(k.targetPage.path) : undefined);
    const suitable = isSuitable(k.normalized, topPage, k.targetPageId, local);
    const bucket = bucketFor(a, suitable);
    const trend = a?.position != null && b?.position != null ? (b.position - a.position >= 1 ? "rising" : a.position - b.position >= 1 ? "falling" : "stable") : null;
    const actions: string[] = [];
    let reason = BUCKET_LABELS[bucket];
    const m = { impressions: a?.impressions ?? null, position: a?.position ?? null, ctr: a?.ctr ?? null, trend: trend === "rising" ? "rising" as const : trend === "falling" ? "declining" as const : null, relevance: 8, intent: k.intent, techIssue: false };
    const push = (c: Omit<Candidate, "score" | "parts">, risk: Candidate["risk"], seoScore: number | null) => {
      if (seen.has(c.key)) return;
      seen.add(c.key);
      const s = scoreCandidate({ ...m, seoScore, risk, learning: learn.get(c.type)?.multiplier ?? 1 });
      candidates.push({ ...c, score: s.score, parts: s.parts, evidence: c.reason, recommendedAction: RECOMMENDED_ACTION[c.type], expectedIntent: k.intent });
      actions.push(c.type);
    };
    if ((bucket === "OPTIMIZE_PAGE" || bucket === "EXPAND_CONTENT") && topPage) {
      const an = analyzePage(topPage, state);
      const md = extractMarkdown(topPage.body);
      const title = resolveTitle(topPage, state.settings.seo);
      const ev = `“${k.phrase}”: son 28 gün ${a!.impressions} gösterim, ${a!.clicks} tık, ort. pozisyon ${a!.position!.toFixed(1)}${b?.position != null ? ` (önceki ${b.position.toFixed(1)})` : ""}.`;
      if (bucket === "OPTIMIZE_PAGE") {
        if (!containsPhrase(title, k.normalized)) push({ key: `TITLE:${topPage.id}`, type: "TITLE", risk: "AUTO", title: `${topPage.path} title optimizasyonu (“${k.phrase}”)`, reason: `${ev} Title sorguyu içermiyor.`, pageId: topPage.id, pagePath: topPage.path, query: k.normalized, clusterId: k.clusterId, payload: { source: "keyword-agent" } }, "AUTO", topPage.seoScore);
        if (!topPage.metaDescription || !containsPhrase(topPage.metaDescription, k.normalized)) push({ key: `META:${topPage.id}`, type: "META", risk: "AUTO", title: `${topPage.path} meta description (“${k.phrase}”)`, reason: `${ev} Meta açıklama ${topPage.metaDescription ? "sorguyu içermiyor" : "yok"}.`, pageId: topPage.id, pagePath: topPage.path, query: k.normalized, clusterId: k.clusterId, payload: { source: "keyword-agent" } }, "AUTO", topPage.seoScore);
        if (an.inlinks < 3) {
          const target = lp.find((p) => p.path === topPage.path);
          if (target) for (const s of suggestLinks(target, lp, state.edges, 2)) push({ key: `INTERNAL_LINK:${s.source}->${s.target}`, type: "INTERNAL_LINK", risk: "AUTO", title: `${s.source} → ${s.target} iç link`, reason: `${ev} Hedef sayfa yalnızca ${an.inlinks} bağlamsal link alıyor. ${s.reasons.join("; ")}.`, pageId: byPath.get(s.source)?.id ?? null, pagePath: s.source, query: k.normalized, clusterId: k.clusterId, payload: { source: s.source, target: s.target, anchor: s.anchor } }, "AUTO", topPage.seoScore);
        }
        if (an.schemaIssues.some((i) => i.level === "error")) push({ key: `TECH:schema:${topPage.path}`, type: "TECH", risk: "HUMAN", title: `${topPage.path} schema hatası`, reason: `${ev} ${an.schemaIssues.filter((i) => i.level === "error").map((i) => `${i.type}: ${i.message}`).join("; ")}`, pageId: topPage.id, pagePath: topPage.path, query: k.normalized, clusterId: k.clusterId, payload: {} }, "HUMAN", topPage.seoScore);
      }
      if (!containsPhrase(`${topPage.h1 ?? ""} ${topPage.intro ?? ""} ${md.text}`, k.normalized) || bucket === "EXPAND_CONTENT") {
        const queries = [...cur].filter(([, v]) => v.pages.has(topUrl ?? "")).sort((x, y) => y[1].impressions - x[1].impressions).slice(0, 8).map(([q, v]) => `${q} (${v.impressions})`);
        push({ key: `CONTENT:${topPage.id}`, type: "CONTENT", risk: "CONTROLLED", title: `${topPage.path} içerik geliştirme (“${k.phrase}”)`, reason: `${ev} Bu sayfaya gelen sorgular: ${queries.join(", ")}. Rakip verisi doğrulanamadı (kullanılmadı).`, pageId: topPage.id, pagePath: topPage.path, query: k.normalized, clusterId: k.clusterId, payload: { queries } }, "CONTROLLED", topPage.seoScore);
      }
      reason = `${BUCKET_LABELS[bucket]}: ${actions.length ? `${actions.join(", ")} önerildi` : "sayfa zaten sorguyu karşılıyor; değişiklik gerekmedi"}`;
    } else if (bucket === "NEEDS_PAGE") {
      reason = `Uygun sayfa yok${topPage ? ` (Google şu an ${topPage.path} gösteriyor; niyet/konu uyumsuz)` : ""} — sayfa karar motoruna gönderildi`;
    } else if (bucket === "INSUFFICIENT_DATA") {
      reason = `Yetersiz veri: ${a?.impressions ?? 0} gösterim (eşik ${a?.position != null && a.position > 10 ? EXPAND_MIN_IMPRESSIONS : OPTIMIZE_MIN_IMPRESSIONS}) — izleniyor`;
    }
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    const d: KeywordDecision = {
      measuredAt: now.toISOString(), window,
      current: a ? { impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, position: a.position } : null,
      previous: b ? { impressions: b.impressions, clicks: b.clicks, ctr: b.ctr, position: b.position } : null,
      trend, targetPath, bucket, reason, actions,
    };
    await db.keyword.update({
      where: { id: k.id },
      data: { decision: d as object, ...(a?.position != null ? { previousPosition: k.currentPosition, currentPosition: a.position, lastCheckedAt: now, serpUrl: topUrl } : {}) },
    });
  }
  return { measured: keywords.length, decisions: counts, candidates, hasData: true };
}
