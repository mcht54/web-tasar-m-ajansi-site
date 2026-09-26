import "server-only";
// Gerçek Search Console metrikleri: sayfa veya sorgu için tarih penceresi.
// Kayıt yoksa null döner — 0 ile "veri yok" ayrı tutulur.

import { db } from "../db";
import { siteUrl } from "../env";

export type Window = { from: Date; to: Date };
export type Metrics = { impressions: number; clicks: number; ctr: number | null; position: number | null; days: number; perDayImpr: number; perDayClicks: number } | null;

const DAY = 86400_000;
export const days = (n: number) => n * DAY;
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function urlOf(path: string): string {
  return path === "/" ? `${siteUrl()}/` : siteUrl() + path;
}

function toMetrics(rows: { impressions: number; clicks: number; position: number }[], w: Window): Metrics {
  if (!rows.length) return null;
  const i = rows.reduce((s, r) => s + r.impressions, 0);
  const c = rows.reduce((s, r) => s + r.clicks, 0);
  const n = Math.max(1, Math.round((w.to.getTime() - w.from.getTime()) / DAY) + 1);
  return { impressions: i, clicks: c, ctr: i ? c / i : null, position: i ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / i : null, days: n, perDayImpr: i / n, perDayClicks: c / n };
}

export async function pageMetrics(path: string, w: Window): Promise<Metrics> {
  const rows = await db.gscPageDaily.findMany({ where: { page: urlOf(path), date: { gte: w.from, lte: w.to } }, select: { impressions: true, clicks: true, position: true } });
  return toMetrics(rows, w);
}

export async function queryMetrics(query: string, w: Window): Promise<Metrics> {
  const rows = await db.gscQueryDaily.findMany({ where: { query, date: { gte: w.from, lte: w.to } }, select: { impressions: true, clicks: true, position: true } });
  return toMetrics(rows, w);
}

/** Verinin son günü (Search Console 2–3 gün gecikmeli). Veri yoksa null. */
export async function lastDataDay(): Promise<Date | null> {
  const r = await db.gscDailyTotal.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  return r?.date ?? null;
}

export function pct(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}
