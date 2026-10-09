// Ayrı süreçte zamanlayıcı ve/veya worker. Production'da tek konteyner (WORKER_ROLE=both):
//   WORKER_ROLE=scheduler → yalnızca zamanı gelen işleri kuyruğa koyar
//   WORKER_ROLE=worker    → yalnızca kuyruğu işler
//   WORKER_ROLE=both      → ikisi (varsayılan)
// "both" modunda zamanlayıcı ve kuyruk iki bağımsız döngüdür: kuyrukta saatlerce süren bir iş
// varken de zamanlayıcı her aralıkta çalışır (alarm, 48 saatlik onay, kalp atışı gecikmez).
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

async function loop(name: string, tick: () => Promise<string | null>) {
  while (!stopping) {
    try {
      const line = await tick();
      if (line) console.log(`[${name}] ${line}`);
    } catch (e) {
      console.error(`[${name}] hata:`, e instanceof Error ? e.message : e);
    }
    for (let i = 0; i < INTERVAL / 1000 && !stopping; i++) await new Promise((r) => setTimeout(r, 1000));
  }
}

const scheduler = async () => {
  const queued = await schedulerTick();
  return queued.length ? `kuyruğa: ${queued.join(", ")}` : null;
};
const worker = async () => {
  const ran = await workerTick();
  return ran.length ? `işlendi: ${ran.map((r) => `${r.kind}=${r.status}`).join(", ")}` : null;
};

(async () => {
  console.log(`[${ROLE}] başladı (aralık ${INTERVAL / 1000} sn)`);
  await Promise.all([
    ROLE !== "worker" ? loop("scheduler", scheduler) : null,
    ROLE !== "scheduler" ? loop("worker", worker) : null,
  ]);
  console.log(`[${ROLE}] durdu`);
  process.exit(0);
})();
