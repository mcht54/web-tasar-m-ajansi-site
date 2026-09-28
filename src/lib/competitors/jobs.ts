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
import { competitorFindings, FINDING_LABELS } from "./insights";
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

/** Tarama zamanı gelen rakipler sırayla (aynı anda tek rakip) taranır. */
export async function crawlDueCompetitors(opts: { policy?: NetPolicy; now?: Date; max?: number; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const due = await db.competitor.findMany({
    where: { status: { not: "paused" }, ...(opts.force ? {} : { OR: [{ lastCrawlAt: null }, { lastCrawlAt: { lt: new Date(now.getTime() - 6.5 * 86400_000) } }] }) },
    orderBy: [{ lastCrawlAt: { sort: "asc", nulls: "first" } }], take: opts.max ?? 3,
  });
  const out: { domain: string; ok: boolean; pages: number; changes: number; error: string | null }[] = [];
  for (const c of due) {
    try {
      const r = await crawlCompetitor(c.id, { policy: opts.policy, now });
      out.push({ domain: c.domain, ok: r.ok, pages: r.stats?.pages ?? 0, changes: r.changes.length, error: r.error });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.competitor.update({ where: { id: c.id }, data: { lastCrawlAt: now, lastError: msg, status: "error" } });
      out.push({ domain: c.domain, ok: false, pages: 0, changes: 0, error: msg });
    }
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
  const { findings } = await competitorFindings();
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
    const common = { source: "competitor", category: "COMPETITOR" as const, title: `[Rakip] ${f.title}`, reason: `${FINDING_LABELS[f.type]}: ${f.why}`, score: f.priority === "URGENT" ? 90 : f.priority === "HIGH" ? 70 : f.priority === "MEDIUM" ? 50 : 30, expectedImpact: f.action };
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
