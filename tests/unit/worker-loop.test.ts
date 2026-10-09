import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { loopsFor, runLoops, stopOnSignals } from "@/lib/jobs/worker-loop";

const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("koşul zamanında sağlanmadı");
    await new Promise((r) => setTimeout(r, 5));
  }
};
const quiet = { log: () => {}, error: () => {} };

describe("worker döngüleri: rol seçimi", () => {
  const ticks = { scheduler: async () => null, worker: async () => null };
  it("both iki döngü, worker/scheduler tek döngü çalıştırır; geçersiz rol reddedilir", () => {
    expect(Object.keys(loopsFor("both", ticks))).toEqual(["scheduler", "worker"]);
    expect(Object.keys(loopsFor("worker", ticks))).toEqual(["worker"]);
    expect(Object.keys(loopsFor("scheduler", ticks))).toEqual(["scheduler"]);
    expect(() => loopsFor("hepsi", ticks)).toThrow(/geçersiz WORKER_ROLE/);
  });
});

describe("worker döngüleri: bağımsızlık", () => {
  it("kuyrukta uzun süren iş varken zamanlayıcı her aralıkta çalışmaya devam eder", async () => {
    const ac = new AbortController();
    let schedulerRuns = 0;
    let finishJob!: () => void;
    const job = new Promise<void>((r) => (finishJob = r));
    const running = runLoops(
      { scheduler: async () => (schedulerRuns++, null), worker: async () => (await job, "işlendi: daily=ok") },
      { intervalMs: 5, signal: ac.signal, ...quiet },
    );
    await until(() => schedulerRuns >= 5); // iş hâlâ sürüyor
    ac.abort();
    let stopped = false;
    void running.then(() => (stopped = true));
    await new Promise((r) => setTimeout(r, 30));
    expect(stopped).toBe(false); // süren iş yarıda kesilmez
    finishJob();
    await running;
  });

  it("bir döngü sürekli hata verse de diğeri çalışır; hata döngü adıyla loglanır", async () => {
    const ac = new AbortController();
    const errors: string[] = [];
    const lines: string[] = [];
    let workerRuns = 0;
    const running = runLoops(
      {
        scheduler: async () => {
          throw new Error("veritabanı yok");
        },
        worker: async () => (++workerRuns, "işlendi: alarms=ok"),
      },
      { intervalMs: 5, signal: ac.signal, log: (l) => lines.push(l), error: (p, m) => errors.push(`${p} ${m}`) },
    );
    await until(() => workerRuns >= 3 && errors.length >= 3);
    ac.abort();
    await running;
    expect(errors[0]).toBe("[scheduler] hata: veritabanı yok");
    expect(lines[0]).toBe("[worker] işlendi: alarms=ok");
  });
});

describe("worker döngüleri: kapanış", () => {
  it("SIGTERM ve SIGINT bekleme sırasında döngüleri hemen durdurur; dinleyici kaldırılabilir", async () => {
    for (const sig of ["SIGTERM", "SIGINT"]) {
      const source = new EventEmitter();
      const ac = new AbortController();
      const remove = stopOnSignals(ac, source);
      let runs = 0;
      const running = runLoops({ scheduler: async () => (runs++, null), worker: async () => (runs++, null) }, { intervalMs: 60_000, signal: ac.signal, ...quiet });
      await until(() => runs === 2);
      const t0 = Date.now();
      source.emit(sig);
      await running;
      expect(Date.now() - t0, sig).toBeLessThan(200); // 60 sn'lik aralığı beklemez
      expect(runs).toBe(2); // durduktan sonra yeni tur yok
      remove();
      expect(source.listenerCount(sig)).toBe(0);
    }
  });

  it("gerçek süreç: veritabanına erişilemese de iki döngü çalışır, SIGTERM'de 'durdu' yazıp 0 ile çıkar", async () => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--conditions=react-server", "scripts/worker.ts"], {
      env: { ...process.env, DATABASE_URL: "postgresql://x:y@127.0.0.1:1/erisilemez_test", WORKER_ROLE: "both", WORKER_INTERVAL_MS: "200" },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
    try {
      await until(() => /\[scheduler\] hata:/.test(err) && /\[worker\] hata:/.test(err), 20_000);
      child.kill("SIGTERM");
      expect(await exited).toBe(0);
      expect(out).toContain("[both] başladı");
      expect(out).toContain("[both] durdu");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }, 30_000);
});
