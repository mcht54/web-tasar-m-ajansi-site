// Ayrı süreçte zamanlayıcı ve/veya worker. Production'da iki ayrı konteyner:
//   WORKER_ROLE=scheduler → yalnızca zamanı gelen işleri kuyruğa koyar
//   WORKER_ROLE=worker    → yalnızca kuyruğu işler
//   WORKER_ROLE=both      → ikisi (tek sunuculu kurulum; varsayılan)
// Aynı iş iki kez çalışmaz: kuyruk sahiplenmesi veritabanında atomiktir; birden çok
// worker/scheduler aynı anda çalışsa da güvenlidir.
import "dotenv/config";
import { schedulerTick, workerTick } from "../src/lib/autopilot/scheduler";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 60_000);
const ROLE = (process.env.WORKER_ROLE || "both").toLowerCase();
if (!["scheduler", "worker", "both"].includes(ROLE)) {
  console.error(`[worker] geçersiz WORKER_ROLE: ${ROLE}`);
  process.exit(2);
}
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; });

(async () => {
  console.log(`[${ROLE}] başladı (aralık ${INTERVAL / 1000} sn)`);
  while (!stopping) {
    try {
      const queued = ROLE !== "worker" ? await schedulerTick() : [];
      const ran = ROLE !== "scheduler" ? await workerTick() : [];
      if (queued.length || ran.length) console.log(`[${ROLE}] kuyruğa: ${queued.join(", ") || "—"} · işlendi: ${ran.map((r) => `${r.kind}=${r.status}`).join(", ") || "—"}`);
    } catch (e) {
      console.error(`[${ROLE}] hata:`, e instanceof Error ? e.message : e);
    }
    for (let i = 0; i < INTERVAL / 1000 && !stopping; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`[${ROLE}] durdu`);
  process.exit(0);
})();
