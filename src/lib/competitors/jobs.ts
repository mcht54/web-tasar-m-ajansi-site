import "server-only";
// Rakip işleri: keşif → tarama (+fark) → fırsat taraması. Fırsatlar mevcut öneri
// yaşam döngüsüne (48 saat) girer; anahtarlar diğer motorlarla ortak olduğundan aynı URL
// için paralel öneri oluşmaz. Oluşturulan önerinin değeri sabittir: yeniden tarama mevcut
// öneriyi değiştirmez (yeni değişiklik gerekirse yeni öneri, mükerrer kuralıyla).

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { agentMode } from "../settings-schema";
import { gscConnected } from "../gsc/sync";
import { createProposal, type CreateResult } from "../proposals/lifecycle";
import { contentBudget } from "../content/strategy";
import { crawlCompetitor } from "./crawl";
import { isCrawling } from "./lock";
import { enqueueJob } from "../jobs/runner";
import { competitorFindings, FINDING_LABELS } from "./insights";
import { learningStats } from "../autopilot/learning";
import type { NetPolicy } from "./net";

/**
 * Rakip adayı keşfi. Search Console YALNIZCA sizin sitenizin sorgu/pozisyonlarını verir;
 * diğer alan adlarını döndürmez. Anahtar kelime takibi de yalnızca sizin URL'nizi tutar.
 * Aday rakip için SERP veri sağlayıcısı gerekir; bağlı değilse aday uydurulmaz.
 */
export async function competitorDiscovery() {
  const [gsc, tracked] = await Promise.all([gscConnected(), db.keyword.count({ where: { status: "ACTIVE" } })]);
  return {
    available: false,
    gsc, tracked,
    candidates: [] as { domain: string; queries: string[]; position: number; date: string }[],
    reason: "Rakip keşfi için SERP (arama sonucu) verisi bulunamadı. Search Console yalnızca sizin sitenizin sorgularını ve pozisyonlarını verir, başka alan adlarını göstermez; anahtar kelime takibi de yalnızca sizin URL'nizi tutar. Aday rakip için bir SERP veri sağlayıcısı (ör. DataForSEO, SerpApi) bağlanmalı veya rakipler elle eklenmelidir.",
  };
}

/**
 * Panelden tarama isteği: HTTP isteği / tarama YAPMAZ. Rakibi işaretler ve worker işini
 * kuyruğa ekler (aynı türden bekleyen/çalışan iş varsa yenisi eklenmez). İdempotent: art arda
 * çağrı tek tarama üretir. Tarama worker'da, rakip kilidiyle çalışır.
 */
export async function requestCompetitorCrawl(competitorId: string, by: string): Promise<{ queued: boolean; crawling: boolean }> {
  const crawling = await isCrawling(competitorId);
  await db.$executeRaw`UPDATE "Competitor" SET "crawlRequestedAt" = COALESCE("crawlRequestedAt", (now() AT TIME ZONE 'utc')) WHERE id = ${competitorId} AND status <> 'paused'`;
  await enqueueJob("competitor-crawl", by);
  return { queued: true, crawling };
}

/** Taranacak rakipler: panelden istenenler önce, sonra zamanı gelenler (haftalık); başarısız deneme 6 saat bekler. */
async function nextCompetitor(now: Date, force: boolean, tried: Set<string>) {
  const weekAgo = new Date(now.getTime() - 6.5 * 86400_000);
  const backoff = new Date(now.getTime() - 6 * 3600_000);
  return db.competitor.findFirst({
    where: {
      status: { not: "paused" }, id: { notIn: [...tried] },
      OR: [{ crawlLockUntil: null }, { crawlLockUntil: { lt: now } }],
      ...(force ? {} : { OR: [{ crawlRequestedAt: { not: null } }, { AND: [{ OR: [{ lastCrawlAt: null }, { lastCrawlAt: { lt: weekAgo } }] }, { OR: [{ crawlStartedAt: null }, { crawlStartedAt: { lt: backoff } }] }] }] }),
    },
    orderBy: [{ crawlRequestedAt: { sort: "asc", nulls: "last" } }, { lastCrawlAt: { sort: "asc", nulls: "first" } }],
  });
}

/** Yalnızca testler: kuyruk üzerinden yapılan taramanın yerel test sunucusuna ulaşması (üretimde boş). */
export const crawlHooks: { policy?: NetPolicy; baseFor?: (domain: string) => string | undefined } = {};

/** Worker: rakipleri SIRAYLA (aynı anda tek rakip) ve rakip kilidiyle tarar. */
export async function crawlDueCompetitors(opts: { policy?: NetPolicy; now?: Date; max?: number; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const out: { domain: string; ok: boolean; locked?: boolean; pages: number; changes: number; error: string | null }[] = [];
  const tried = new Set<string>();
  for (let i = 0; i < (opts.max ?? 3); i++) {
    const c = await nextCompetitor(now, Boolean(opts.force), tried);
    if (!c) break;
    tried.add(c.id);
    const r = await crawlCompetitor(c.id, { policy: opts.policy ?? crawlHooks.policy, baseOverride: crawlHooks.baseFor?.(c.domain), now });
    out.push({ domain: c.domain, ok: r.ok, locked: r.locked, pages: r.stats?.pages ?? 0, changes: r.changes.length, error: r.error });
  }
  return out;
}

export type CompetitorScan = { findings: number; actionable: number; created: Record<string, number>; items: { title: string; status: string; note: string }[]; skippedReason?: string };

/** Uygulanabilir rakip fırsatlarını öneriye çevirir (bütçe dahilinde). */
export async function runCompetitorOpportunities(opts: { now?: Date } = {}): Promise<CompetitorScan> {
  const now = opts.now ?? new Date();
  const settings = await getSettingsFresh();
  const ap = settings.autopilot;
  const mode = agentMode(ap);
  const [{ findings }, learn] = await Promise.all([competitorFindings(), learningStats()]);
  const out: CompetitorScan = { findings: findings.length, actionable: findings.filter((f) => f.actionable).length, created: {}, items: [] };
  if (mode === "OBSERVE") return { ...out, skippedReason: "OBSERVE modu: yalnızca ölçülür" };
  const since = new Date(now.getTime() - 7 * 86400_000);
  const [indexable, newPages, refreshed, small] = await Promise.all([
    db.page.count({ where: { status: "PUBLISHED", robotsIndex: true, autoNoindex: false } }),
    db.autopilotAction.count({ where: { type: "NEW_PAGE", createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
    db.autopilotAction.count({ where: { type: "CONTENT", createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
    db.autopilotAction.count({ where: { source: "competitor", type: { in: ["META", "INTERNAL_LINK"] }, createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
  ]);
  const b = contentBudget({ indexablePages: indexable, weakPages: Math.max(1, findings.filter((f) => f.proposal?.kind === "CONTENT").length), maxNewPagesPerWeek: ap.maxNewPagesPerWeek, maxChangesPerWeek: ap.maxChangesPerWeek, createdLast7: { newPages, refresh: refreshed } });
  const left = { CONTENT: b.refreshThisRun, NEW_PAGE: b.newPagesThisRun, SMALL: Math.max(0, Math.ceil(ap.maxChangesPerWeek / 3) - small) };
  const window = { model: settings.integrations.aiModel, windowHours: ap.approvalWindowHours || 48 };
  const auto = mode === "AUTONOMOUS";
  for (const f of findings) {
    const pr = f.proposal;
    if (!f.actionable || !pr) continue;
    const bucket = pr.kind === "CONTENT" ? "CONTENT" : pr.kind === "NEW_PAGE" ? "NEW_PAGE" : "SMALL";
    if (left[bucket] <= 0) continue;
    const evidence = `${f.theirs} · ${f.ours}`;
    // Öğrenme: bu değişiklik türünün geçmiş ölçülen sonuçları önceliği 0,7–1,3 kat ayarlar
    const type = pr.kind === "CONTENT" ? "CONTENT" : pr.kind === "NEW_PAGE" ? "NEW_PAGE" : pr.kind === "META" ? "META" : "INTERNAL_LINK";
    const base = f.priority === "URGENT" ? 90 : f.priority === "HIGH" ? 70 : f.priority === "MEDIUM" ? 50 : 30;
    const common = { source: "competitor", category: "COMPETITOR" as const, title: `[Rakip] ${f.title}`, reason: `${FINDING_LABELS[f.type]}: ${f.why}`, score: Math.round(base * (learn.get(type)?.multiplier ?? 1)), expectedImpact: f.action };
    const meta = { evidence, findingType: f.type, competitors: f.competitors, signals: f.signals, priority: f.priority, priorityReason: f.priorityReason, evidenceList: f.evidence, affectedUrl: pr.path };
    let r: CreateResult;
    if (pr.kind === "CONTENT") {
      r = await createProposal({ ...common, key: pr.key, type: "CONTENT", risk: "CONTROLLED", pageId: pr.pageId, proposal: { ...meta, pagePath: pr.path, competitorHeadings: pr.competitorHeadings, recommendedAction: f.action }, allowAuto: auto && ap.autoApplyControlled, noAutoReason: "Mod/ayar otomatik içerik uygulamasına izin vermiyor" }, window);
    } else if (pr.kind === "NEW_PAGE") {
      const d = pr.decision!;
      r = await createProposal({ ...common, key: pr.key, type: "NEW_PAGE", risk: "CONTROLLED", proposal: { ...meta, pagePath: d.path, decision: "NEW_SERVICE_PAGE", pageType: "SERVICE", pageId: null, service: { name: d.name, summary: d.summary || null }, group: { primary: d.primary, queries: d.queries.length ? d.queries : [d.primary], impressions: d.gscImpressions ?? 0, intent: "COMMERCIAL", location: null } }, allowAuto: auto }, window);
    } else if (pr.kind === "META") {
      r = await createProposal({ ...common, key: pr.key, type: "META", risk: "AUTO", pageId: pr.pageId, proposal: { ...meta, pagePath: pr.path }, allowAuto: auto && ap.autoApplySafe }, window);
    } else {
      r = await createProposal({ ...common, key: pr.key, type: "INTERNAL_LINK", risk: "AUTO", pageId: pr.pageId, proposal: { ...meta, pagePath: pr.path, payload: pr.payload }, allowAuto: auto && ap.autoApplySafe }, window);
    }
    if (r.duplicate) continue;
    out.created[r.status] = (out.created[r.status] ?? 0) + 1;
    out.items.push({ title: common.title, status: r.status, note: r.note });
    if (r.status === "pending_approval") left[bucket]--;
  }
  return out;
}
