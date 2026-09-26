import "server-only";
// Sistem sağlık kontrolü (/health). Sır veya kişisel veri döndürmez; yalnızca durum.
// Kritik: web + veritabanı (503 döndürür). Diğerleri bilgi amaçlı (ok / warn / off).

import { db } from "./db";
import { getSettingsFresh } from "./settings";
import { gscConnected } from "./gsc/sync";
import { loadAiKey } from "./ai/key";
import { HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER } from "./autopilot/daily";

export type HealthLevel = "ok" | "warn" | "fail" | "off";
export type SystemHealth = { status: "ok" | "degraded" | "fail"; time: string; checks: Record<string, { status: HealthLevel; detail: string }> };

const MIN = 60_000;

export async function systemHealth(): Promise<SystemHealth> {
  const checks: SystemHealth["checks"] = { web: { status: "ok", detail: "yanıt veriyor" } };
  let dbOk = false;
  try {
    const t = Date.now();
    await db.$queryRaw`select 1`;
    dbOk = true;
    checks.database = { status: "ok", detail: `${Date.now() - t} ms` };
  } catch {
    checks.database = { status: "fail", detail: "bağlanılamıyor" };
  }
  if (dbOk) {
    const now = Date.now();
    const beats = await db.alarmState.findMany({ where: { key: { in: [HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER] } } });
    const beat = (k: string, label: string) => {
      const b = beats.find((x) => x.key === k);
      if (!b) return { status: "fail" as const, detail: `${label} sinyali yok` };
      const age = Math.round((now - b.updatedAt.getTime()) / MIN);
      return { status: age <= 10 ? "ok" as const : age <= 60 ? "warn" as const : "fail" as const, detail: `son sinyal ${age} dk önce` };
    };
    checks.scheduler = beat(HEARTBEAT_SCHEDULER, "Zamanlayıcı");
    checks.worker = beat(HEARTBEAT_WORKER, "Worker");
    const [queued, oldest, failed, stale] = await Promise.all([
      db.jobRun.count({ where: { status: "queued" } }),
      db.jobRun.findFirst({ where: { status: "queued", OR: [{ runAfter: null }, { runAfter: { lte: new Date() } }] }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
      db.jobRun.count({ where: { status: "error", finishedAt: { gte: new Date(now - 24 * 60 * MIN) } } }),
      db.jobRun.count({ where: { status: "running", startedAt: { lt: new Date(now - 120 * MIN) } } }),
    ]);
    const wait = oldest ? Math.round((now - oldest.startedAt.getTime()) / MIN) : 0;
    checks.queue = { status: stale || wait > 60 ? "warn" : "ok", detail: `${queued} bekleyen (en eski hazır iş ${wait} dk), son 24 saatte ${failed} hatalı, ${stale} takılı` };
    const [settings, gsc, aiKey, lastDay] = await Promise.all([getSettingsFresh(), gscConnected(), loadAiKey(true), db.gscDailyTotal.findFirst({ orderBy: { date: "desc" }, select: { date: true } })]);
    checks.ai = aiKey ? { status: "ok", detail: `anahtar tanımlı (${settings.integrations.aiModel})` } : { status: "off", detail: "anahtar tanımlı değil (panelden girilebilir)" };
    checks.searchConsole = !gsc ? { status: "off", detail: "bağlı değil" } : !settings.integrations.gscProperty ? { status: "warn", detail: "bağlı, mülk seçilmedi" } : lastDay ? { status: now - lastDay.date.getTime() < 7 * 24 * 60 * MIN ? "ok" : "warn", detail: `son veri günü ${lastDay.date.toISOString().slice(0, 10)}` } : { status: "warn", detail: "bağlı, henüz veri yok" };
    checks.smtp = settings.email.smtpHost ? { status: "ok", detail: "yapılandırılmış" } : { status: "off", detail: "tanımlı değil (raporlar panelde)" };
  }
  const critical = checks.web.status === "ok" && dbOk;
  const degraded = Object.values(checks).some((c) => c.status === "fail" || c.status === "warn");
  return { status: !critical ? "fail" : degraded ? "degraded" : "ok", time: new Date().toISOString(), checks };
}
