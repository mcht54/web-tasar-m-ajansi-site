// Worker sürecinin döngüleri (scripts/worker.ts). Ayrı modül: test edilebilsin.
// Her döngü kendi aralığıyla bağımsız çalışır; birinin hatası veya uzun süren işi diğerini
// durdurmaz. Durdurma sinyalinde yeni tur başlamaz, süren tur bitince döngü kapanır.

export type LoopTick = () => Promise<string | null>;
export type WorkerRole = "scheduler" | "worker" | "both";

export const WORKER_ROLES: readonly WorkerRole[] = ["scheduler", "worker", "both"];

/** Role göre çalışacak döngüler (sıra: zamanlayıcı, kuyruk). */
export function loopsFor(role: string, ticks: { scheduler: LoopTick; worker: LoopTick }): Record<string, LoopTick> {
  if (!WORKER_ROLES.includes(role as WorkerRole)) throw new Error(`geçersiz WORKER_ROLE: ${role}`);
  return {
    ...(role !== "worker" ? { scheduler: ticks.scheduler } : {}),
    ...(role !== "scheduler" ? { worker: ticks.worker } : {}),
  };
}

/** Aralık kadar bekler; durdurma sinyali gelirse hemen döner. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/** Döngüleri birlikte çalıştırır; hepsi durunca döner. */
export async function runLoops(
  loops: Record<string, LoopTick>,
  opts: { intervalMs: number; signal: AbortSignal; log?: (line: string) => void; error?: (prefix: string, message: unknown) => void },
): Promise<void> {
  const log = opts.log ?? ((line) => console.log(line));
  const error = opts.error ?? ((prefix, message) => console.error(prefix, message));
  await Promise.all(
    Object.entries(loops).map(async ([name, tick]) => {
      while (!opts.signal.aborted) {
        try {
          const line = await tick();
          if (line) log(`[${name}] ${line}`);
        } catch (e) {
          error(`[${name}] hata:`, e instanceof Error ? e.message : e);
        }
        await pause(opts.intervalMs, opts.signal);
      }
    }),
  );
}

type SignalSource = { on(event: string, fn: () => void): unknown; off(event: string, fn: () => void): unknown };

/** SIGINT/SIGTERM gelince döngüleri durdurur. Dinleyiciyi kaldıran fonksiyonu döndürür. */
export function stopOnSignals(controller: AbortController, source: SignalSource = process): () => void {
  const stop = () => controller.abort();
  for (const sig of ["SIGINT", "SIGTERM"]) source.on(sig, stop);
  return () => {
    for (const sig of ["SIGINT", "SIGTERM"]) source.off(sig, stop);
  };
}
