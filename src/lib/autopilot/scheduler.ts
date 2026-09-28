import "server-only";
// ZAMANLAYICI + WORKER. Zamanlayıcı yalnızca "zamanı gelen" işleri kuyruğa koyar;
// worker kuyruğu sırayla işler (lib/jobs/runner.ts: atomik sahiplenme, yeniden
// deneme, çöken iş kurtarma). Uygulama sürecinde (instrumentation → /api/internal/tick)
// veya ayrı süreçte (npm run worker) çalışır; ikisi birlikte çalışsa da iş iki kez yapılmaz.
//
// Gece hattı (Türkiye saati): 02:00 veri (GSC + tarama + analiz + sitemap + IndexNow)
// → ajan döngüsü (veri hattı bittikten sonra) → günlük rapor e-postası (varsayılan 09:00).
// Haftalık rapor seçilen gün/saatte; kritik alarmlar saatte bir.

import { db } from "../db";
import { enqueueJob, processQueue, type JobKind, type QueueResult } from "../jobs/runner";
import { getSettingsFresh } from "../settings";
import { HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER, istanbulMidnight } from "./daily";

const HOUR = 3600_000;
export const NIGHTLY_HOUR = 2;

export function istanbul(d: Date) {
  const t = new Date(d.getTime() + 3 * HOUR);
  return { day: t.getUTCDay(), hour: t.getUTCHours() };
}

/** Zamanı gelmiş işlerin listesi (yan etkisiz; test edilebilir). Sıra = kuyruk sırası. */
export async function dueJobs(now = new Date()): Promise<JobKind[]> {
  const { email } = await getSettingsFresh();
  const tr = istanbul(now);
  const today = istanbulMidnight(now);
  const due: JobKind[] = [];
  const pending = new Set((await db.jobRun.findMany({ where: { status: { in: ["queued", "running"] } }, select: { kind: true } })).map((j) => j.kind));
  const lastOf = (kind: string) => db.jobRun.findFirst({ where: { kind, status: { not: "queued" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  const add = (k: JobKind) => { if (!pending.has(k)) due.push(k); };

  if (tr.hour >= NIGHTLY_HOUR) {
    // Veri hattı: son 20 saatte çalışmadıysa (harici cron ile çakışmaz)
    const daily = await lastOf("daily");
    if (!daily || now.getTime() - daily.startedAt.getTime() > 20 * HOUR) add("daily");
    // Otonom ajan: günde bir zamanlanmış çalıştırma
    const ran = await db.autopilotRun.findFirst({ where: { trigger: "schedule", startedAt: { gte: today } } });
    if (!ran) add("autopilot");
  }
  // Günlük rapor e-postası: bugün gönderilmediyse
  if (email.dailyReport && tr.hour >= email.dailyHour) {
    const sent = await db.emailLog.findFirst({ where: { kind: "daily", createdAt: { gte: today } } });
    if (!sent) add("daily-email");
  }
  // Haftalık rapor: seçilen gün ve saatten sonra, bu hafta gönderilmediyse
  if (email.enabled && tr.day === email.day && tr.hour >= email.hour) {
    const sent = await db.emailLog.findFirst({ where: { kind: "weekly", createdAt: { gte: new Date(now.getTime() - 6 * 24 * HOUR) } } });
    if (!sent) add("weekly-email");
  }
  // İçerik otopilotu (gece hattından sonra): yenileme günde bir, hizmet ve ilçe haftada bir.
  // Üretim miktarı ayrıca veriye dayalı haftalık bütçeyle sınırlıdır (content/strategy.ts).
  if (tr.hour >= NIGHTLY_HOUR + 1) {
    const every = async (kind: JobKind, hours: number) => {
      const last = await lastOf(kind);
      if (!last || now.getTime() - last.startedAt.getTime() > hours * HOUR) add(kind);
    };
    await every("content-opportunity-scan", 20);
    await every("service-page-opportunity", 6.5 * 24);
    await every("local-seo-opportunity", 6.5 * 24);
    // Rakip: tarama işi günde bir kontrol eder (her rakip haftada bir taranır); fırsat
    // taraması tarama sonrasında kuyruğa girer, ayrıca haftalık yedek çalışma
    if ((await db.competitor.count({ where: { status: { not: "paused" } } })) > 0) {
      await every("competitor-crawl", 20);
      await every("competitor-opportunity-scan", 6.5 * 24);
    }
    await every("competitor-discovery", 6.5 * 24);
  }
  // 48 saatlik onay: süresi dolan öneriler 15 dakikada bir kontrol edilir (panel kapalı olsa da)
  const autoApply = await lastOf("auto-apply-proposals");
  if (!autoApply || now.getTime() - autoApply.startedAt.getTime() >= 15 * 60_000 - 30_000) add("auto-apply-proposals");
  // Kritik alarmlar: saatte bir
  const alarms = await lastOf("alarms");
  if (!alarms || now.getTime() - alarms.startedAt.getTime() >= HOUR - 60_000) add("alarms");
  return due;
}

async function beat(key: string, detail: string) {
  await db.alarmState.upsert({ where: { key }, create: { key, active: false, detail }, update: { detail, active: false } });
}

/** Zamanlayıcı: zamanı gelen işleri kuyruğa koyar. */
export async function schedulerTick(now = new Date()): Promise<JobKind[]> {
  const due = await dueJobs(now);
  for (const kind of due) await enqueueJob(kind, "zamanlayıcı");
  await beat(HEARTBEAT_SCHEDULER, due.length ? `Kuyruğa eklendi: ${due.join(", ")}` : "Zamanı gelen iş yok");
  return due;
}

/** Worker: kuyruğu işler ve sinyal bırakır. */
export async function workerTick(opts: { budgetMs?: number } = {}): Promise<QueueResult[]> {
  await beat(HEARTBEAT_WORKER, "Kuyruk işleniyor");
  const done = await processQueue({ budgetMs: opts.budgetMs });
  await beat(HEARTBEAT_WORKER, done.length ? `İşlendi: ${done.map((d) => `${d.kind}=${d.status}`).join(", ")}` : "Kuyruk boş");
  return done;
}
