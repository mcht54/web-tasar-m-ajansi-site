import "server-only";
// Haftalık raporu (son otopilot çalıştırmasının planıyla) yeniden üretip gönderir.

import { db } from "../db";
import { siteUrl } from "../env";
import { getSettingsFresh } from "../settings";
import { sendMail } from "../email/send";
import { buildWeeklyReport, renderReportHtml, renderReportText, weeklySubject, type WeeklyReport } from "./report";

export async function latestReport(): Promise<WeeklyReport> {
  const last = await db.autopilotRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } });
  const prev = last?.summary as WeeklyReport | null;
  return buildWeeklyReport({ runId: last?.id ?? null, plan: prev?.plan ?? [], health: prev?.health ?? null });
}

export async function sendWeeklyEmail(kind: "weekly" | "test" = "weekly") {
  const { email } = await getSettingsFresh();
  const r = await latestReport();
  const o = { notifyRising: email.notifyRising, notifyFalling: email.notifyFalling };
  const subject = (kind === "test" ? "[TEST] " : "") + (await weeklySubject(r));
  return sendMail(kind, subject, renderReportHtml(r, o, `${siteUrl()}/yonetim/autopilot`), renderReportText(r, o));
}
