import "server-only";
import { db } from "../db";

const DAY = 86400_000;
const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export type Totals = { clicks: number; impressions: number; ctr: number | null; position: number | null };

/** Search Console toplamları: son N gün (verinin bulunduğu son tarihten geriye) ve önceki dönem. */
export async function gscPeriod(days: number): Promise<{ current: Totals; previous: Totals; end: Date | null } | null> {
  const last = await db.gscDailyTotal.findFirst({ orderBy: { date: "desc" } });
  if (!last) return null;
  const end = last.date;
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const prevEnd = new Date(start.getTime() - DAY);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY);
  const agg = async (from: Date, to: Date): Promise<Totals> => {
    const rows = await db.gscDailyTotal.findMany({ where: { date: { gte: from, lte: to } } });
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    return {
      clicks, impressions,
      ctr: impressions ? clicks / impressions : null,
      position: impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : null,
    };
  };
  return { current: await agg(start, end), previous: await agg(prevStart, prevEnd), end };
}

export async function keywordBuckets() {
  const kws = await db.keyword.findMany({ where: { status: "ACTIVE" }, select: { currentPosition: true } });
  const b = { top3: 0, top10: 0, p11_20: 0, p21_50: 0, p50: 0, none: 0, total: kws.length };
  for (const k of kws) {
    const p = k.currentPosition;
    if (p == null) b.none++;
    else if (p <= 3) b.top3++;
    else if (p <= 10) b.top10++;
    else if (p <= 20) b.p11_20++;
    else if (p <= 50) b.p21_50++;
    else b.p50++;
  }
  return b;
}

/** Anahtar kelimelerin N gün önceki pozisyonuna göre yükselen/düşen sayısı. */
export async function keywordMovement(days: number) {
  const latest = await db.rankSnapshot.findFirst({ where: { source: "GSC" }, orderBy: { date: "desc" } });
  if (!latest) return null;
  const then = new Date(latest.date.getTime() - days * DAY);
  const [now, before] = await Promise.all([
    db.rankSnapshot.findMany({ where: { source: "GSC", date: latest.date, position: { not: null } } }),
    db.rankSnapshot.findMany({ where: { source: "GSC", date: then, position: { not: null } } }),
  ]);
  const prev = new Map(before.map((r) => [r.keywordId, r.position!]));
  let up = 0, down = 0;
  for (const r of now) {
    const p = prev.get(r.keywordId);
    if (p == null) continue;
    if (r.position! < p - 0.5) up++;
    else if (r.position! > p + 0.5) down++;
  }
  return { up, down, compared: now.filter((r) => prev.has(r.keywordId)).length };
}

export async function weeklyReport() {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const [movement, period, newIndexed, critical, openTasks, leads] = await Promise.all([
    keywordMovement(7),
    gscPeriod(7),
    db.gscIndexStatus.count({ where: { verdict: "PASS", lastCrawlTime: { gte: weekAgo } } }),
    db.seoTask.count({ where: { status: "OPEN", severity: "CRITICAL" } }),
    db.seoTask.count({ where: { status: "OPEN" } }),
    db.lead.count({ where: { createdAt: { gte: weekAgo } } }),
  ]);
  return {
    movement,
    clicksDelta: period ? period.current.clicks - period.previous.clicks : null,
    impressionsPct: period && period.previous.impressions ? ((period.current.impressions - period.previous.impressions) / period.previous.impressions) * 100 : null,
    newIndexed: (await db.gscIndexStatus.count()) ? newIndexed : null,
    critical,
    openTasks,
    leads,
  };
}

export { dayStart };
