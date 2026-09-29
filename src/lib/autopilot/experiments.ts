import "server-only";
// Deney motoru: her otomatik değişiklik bir deneydir. Taban = uygulama öncesi 28 gün.
// Sonuç = uygulamadan 3 gün sonrası (Search Console gecikmesi) – en çok 28 gün.
// Sonuç "gözlenen değişim"dir; nedensellik iddia edilmez.

import { db } from "../db";
import { type Metrics, addDays, lastDataDay, pageMetrics, queryMetrics } from "./metrics";

export const INTERIM_MIN_DAYS = 7; // erken gözlem
export const FINAL_DAYS = 28; // nihai değerlendirme
export const CHECKPOINTS = [7, 14, 28] as const; // ölçüm noktaları (uygulama + 3 gün gecikmeden sonra)
const LAG_DAYS = 3; // Search Console gecikmesi
const MIN_IMPRESSIONS = 100; // her iki pencerede

type Snapshot = { page: Metrics; query: Metrics };
type Checkpoint = { day: number; window: { from: string; to: string }; page: Metrics; query: Metrics; outcome: Outcome; summary: string; measuredAt: string };

/** Ölçüm planı: her noktanın ölçülebileceği en erken gün (veri gecikmesi dahil). */
export function measurementPlan(appliedAt: Date) {
  return CHECKPOINTS.map((d) => ({ day: d, measureAfter: addDays(appliedAt, LAG_DAYS + d).toISOString().slice(0, 10) }));
}

export async function baselineFor(pagePath: string, query: string | null, appliedAt: Date): Promise<Snapshot> {
  const w = { from: addDays(appliedAt, -28), to: addDays(appliedAt, -1) };
  return { page: await pageMetrics(pagePath, w), query: query ? await queryMetrics(query, w) : null };
}

export async function startExperiment(a: { actionId: string; pageId: string; pagePath: string; type: string; query: string | null; appliedAt: Date }) {
  const baseline = await baselineFor(a.pagePath, a.query, a.appliedAt);
  // Ölçüm planı tabana yazılır (sonuç alanı yalnızca gerçek ölçümle dolar)
  return db.experiment.create({ data: { ...a, baseline: { ...baseline, plan: measurementPlan(a.appliedAt) } as object, note: baseline.page ? null : "Uygulama öncesi Search Console verisi yok — sonuç ölçülemeyebilir" } });
}

export type Outcome = "positive" | "neutral" | "negative" | "insufficient";

/** Değişiklik türüne göre gözlenen değişimin yorumu. */
export function judge(type: string, base: Metrics, after: Metrics): { outcome: Outcome; summary: string } {
  if (!base || !after || base.impressions < MIN_IMPRESSIONS || after.impressions < MIN_IMPRESSIONS)
    return { outcome: "insufficient", summary: "Karşılaştırma için yeterli Search Console verisi yok" };
  const ctrRel = base.ctr && after.ctr != null ? (after.ctr - base.ctr) / base.ctr : null;
  const posDelta = base.position != null && after.position != null ? base.position - after.position : null; // + = iyileşme
  const clickRel = base.perDayClicks ? (after.perDayClicks - base.perDayClicks) / base.perDayClicks : null;
  const parts = [
    base.ctr != null && after.ctr != null ? `CTR %${(base.ctr * 100).toFixed(1)} → %${(after.ctr * 100).toFixed(1)}` : null,
    base.position != null && after.position != null ? `pozisyon ${base.position.toFixed(1)} → ${after.position.toFixed(1)}` : null,
    `günlük gösterim ${base.perDayImpr.toFixed(1)} → ${after.perDayImpr.toFixed(1)}`,
  ].filter(Boolean).join(", ");
  let outcome: Outcome = "neutral";
  if (type === "TITLE" || type === "META") {
    if (ctrRel != null && ctrRel >= 0.1) outcome = "positive";
    else if (ctrRel != null && ctrRel <= -0.1) outcome = "negative";
  } else {
    if ((posDelta != null && posDelta >= 1) || (clickRel != null && clickRel >= 0.2)) outcome = "positive";
    else if ((posDelta != null && posDelta <= -1) || (clickRel != null && clickRel <= -0.2)) outcome = "negative";
  }
  return { outcome, summary: `Gözlenen değişim: ${parts}` };
}

/** Çalışan deneyleri ölçer: 7. günden itibaren erken gözlem, 28. günde nihai sonuç. */
export async function evaluateExperiments(now = new Date()) {
  const lastDay = await lastDataDay();
  const running = await db.experiment.findMany({ where: { status: "running", appliedAt: { lte: addDays(now, -INTERIM_MIN_DAYS) } } });
  let interim = 0, final = 0;
  for (const e of running) {
    const from = addDays(e.appliedAt, 3);
    const end = addDays(e.appliedAt, FINAL_DAYS + 3);
    const to = lastDay && lastDay < end ? lastDay : end;
    if (!lastDay || to < from) continue;
    const w = { from, to };
    const after = { page: await pageMetrics(e.pagePath, w), query: e.query ? await queryMetrics(e.query, w) : null };
    const base = e.baseline as unknown as Snapshot;
    const focusBase = e.query && base.query ? base.query : base.page;
    const focusAfter = e.query && after.query ? after.query : after.page;
    const j = judge(e.type, focusBase, focusAfter);
    const isFinal = lastDay >= end;
    // 7 / 14 / 28 gün noktaları: verisi tamamlanan her nokta bir kez ölçülür ve saklanır
    const prev = (e.result as { checkpoints?: Checkpoint[] } | null)?.checkpoints ?? [];
    const checkpoints = [...prev];
    for (const d of CHECKPOINTS) {
      const cpTo = addDays(e.appliedAt, LAG_DAYS + d - 1);
      if (checkpoints.some((c) => c.day === d) || lastDay < cpTo) continue;
      const cw = { from, to: cpTo };
      const m = { page: await pageMetrics(e.pagePath, cw), query: e.query ? await queryMetrics(e.query, cw) : null };
      const cj = judge(e.type, focusBase, e.query && m.query ? m.query : m.page);
      checkpoints.push({ day: d, window: { from: from.toISOString().slice(0, 10), to: cpTo.toISOString().slice(0, 10) }, ...m, outcome: cj.outcome, summary: cj.summary, measuredAt: now.toISOString() });
    }
    await db.experiment.update({
      where: { id: e.id },
      data: {
        result: { ...after, window: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }, summary: j.summary, interim: !isFinal, checkpoints } as object,
        outcome: j.outcome,
        ...(isFinal ? { status: "evaluated", evaluatedAt: now } : {}),
      },
    });
    if (isFinal) final++;
    else interim++;
  }
  return { interim, final };
}
