// Ayrı süreçte zamanlayıcı ve/veya worker. Production'da tek konteyner (WORKER_ROLE=both):
//   WORKER_ROLE=scheduler → yalnızca zamanı gelen işleri kuyruğa koyar
//   WORKER_ROLE=worker    → yalnızca kuyruğu işler
//   WORKER_ROLE=both      → ikisi (varsayılan)
// "both" modunda zamanlayıcı ve kuyruk iki bağımsız döngüdür (src/lib/jobs/worker-loop.ts): kuyrukta
// saatlerce süren bir iş varken de zamanlayıcı her aralıkta çalışır (alarm, 48 saatlik onay, kalp atışı gecikmez).
// Aynı iş iki kez çalışmaz: kuyruk sahiplenmesi veritabanında atomiktir; birden çok
// worker/scheduler aynı anda çalışsa da güvenlidir.
import "dotenv/config";
import { schedulerTick, workerTick } from "../src/lib/autopilot/scheduler";
import { loopsFor, runLoops, stopOnSignals } from "../src/lib/jobs/worker-loop";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 60_000);
const ROLE = (process.env.WORKER_ROLE || "both").toLowerCase();

let loops;
try {
  loops = loopsFor(ROLE, {
    scheduler: async () => {
      const queued = await schedulerTick();
      return queued.length ? `kuyruğa: ${queued.join(", ")}` : null;
    },
    worker: async () => {
      const ran = await workerTick();
      return ran.length ? `işlendi: ${ran.map((r) => `${r.kind}=${r.status}`).join(", ")}` : null;
    },
  });
} catch (e) {
  console.error(`[worker] ${e instanceof Error ? e.message : e}`);
  process.exit(2);
}

const controller = new AbortController();
stopOnSignals(controller);

(async () => {
  console.log(`[${ROLE}] başladı (aralık ${INTERVAL / 1000} sn)`);
  await runLoops(loops, { intervalMs: INTERVAL, signal: controller.signal });
  console.log(`[${ROLE}] durdu`);
  process.exit(0);
})();
