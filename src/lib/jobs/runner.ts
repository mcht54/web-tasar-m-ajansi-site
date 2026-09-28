import "server-only";
import { db } from "../db";
import { runFullAnalysis } from "../seo/analyzer";

export const JOB_KINDS = ["analyze", "opportunities", "crawl", "gsc-sync", "rank-update", "index-inspect", "indexnow", "sitemap-check", "daily", "autopilot", "alarms", "weekly-email", "daily-email", "auto-apply-proposals", "content-opportunity-scan", "service-page-opportunity", "local-seo-opportunity", "competitor-discovery", "competitor-crawl", "competitor-opportunity-scan", "page-completeness-scan"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobResult = { id: string; kind: JobKind; status: "ok" | "error" | "skipped"; message: string; stats?: unknown };

type Handler = (triggeredBy: string) => Promise<{ status?: "ok" | "skipped"; message: string; stats?: unknown }>;

const handlers: Partial<Record<JobKind, Handler>> = {
  analyze: async () => {
    const r = await runFullAnalysis();
    return { message: `${r.analyzed} sayfa analiz edildi, ${r.autoNoindexChanged} otomatik NOINDEX değişikliği`, stats: { analyzed: r.analyzed, autoNoindexChanged: r.autoNoindexChanged } };
  },
};

export function registerJob(kind: JobKind, h: Handler) {
  handlers[kind] = h;
}

/** Her iş JobRun tablosuna kaydedilir; aynı türde çalışan iş varsa yenisi atlanır. */
export async function runJob(kind: JobKind, triggeredBy: string): Promise<JobResult> {
  await import("./registry");
  const handler = handlers[kind];
  if (!handler) throw new Error(`Tanımsız iş: ${kind}`);
  // Kontrol + kayıt atomik: işlem düzeyinde Postgres advisory kilidi, iki süreç
  // (ör. iki sunucu örneği veya cron + panel) aynı işi aynı anda başlatamaz.
  const claim = await db.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(hashtext(${`job:${kind}`})) as locked`;
    if (!locked) return { skipped: true as const, id: "" };
    const running = await tx.jobRun.findFirst({
      where: { kind, status: "running", startedAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (running) return { skipped: true as const, id: running.id };
    return { skipped: false as const, id: (await tx.jobRun.create({ data: { kind, triggeredBy } })).id };
  });
  if (claim.skipped) return { id: claim.id, kind, status: "skipped", message: "Bu iş zaten çalışıyor" };
  const run = { id: claim.id };
  try {
    const r = await handler(triggeredBy);
    const status = r.status ?? "ok";
    await db.jobRun.update({
      where: { id: run.id },
      data: { status, message: r.message, stats: (r.stats ?? undefined) as object | undefined, finishedAt: new Date() },
    });
    return { id: run.id, kind, status, message: r.message, stats: r.stats };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.jobRun.update({ where: { id: run.id }, data: { status: "error", message, finishedAt: new Date() } });
    return { id: run.id, kind, status: "error", message };
  }
}

// ─── Kuyruk + worker ─────────────────────────────────────────────────────────
// Zamanlayıcı işleri kuyruğa koyar (status "queued"); worker sırayla, atomik olarak
// sahiplenip çalıştırır. Hata → üstel geri çekilmeyle yeniden deneme (en çok 3 deneme).
// Yarıda kalan (çökmüş) iş zaman aşımıyla hataya çekilir ve yeniden denenir.

export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 5 * 60_000; // 5 dk, 10 dk, 20 dk
export const STALE_MS = 2 * 3600_000;

/** Aynı türde bekleyen veya çalışan iş varsa yenisini eklemez (mükerrer iş yok). */
export async function enqueueJob(kind: JobKind, triggeredBy: string, opts: { runAfter?: Date; attempts?: number } = {}): Promise<{ id: string; created: boolean }> {
  return db.$transaction(async (tx) => {
    // pg_advisory_xact_lock void döndürür; Prisma void sütunu okuyamaz → metne çevir
    await tx.$queryRaw`select pg_advisory_xact_lock(hashtext(${`enqueue:${kind}`}))::text as locked`;
    const existing = await tx.jobRun.findFirst({ where: { kind, status: { in: ["queued", "running"] } } });
    if (existing) return { id: existing.id, created: false };
    const r = await tx.jobRun.create({ data: { kind, triggeredBy, status: "queued", attempts: opts.attempts ?? 1, runAfter: opts.runAfter ?? null } });
    return { id: r.id, created: true };
  });
}

/** Çökmüş/yarıda kalmış işleri hataya çeker ve (hakkı varsa) yeniden kuyruğa koyar. */
export async function recoverStaleJobs(now = new Date()): Promise<number> {
  const stale = await db.jobRun.findMany({ where: { status: "running", startedAt: { lt: new Date(now.getTime() - STALE_MS) } } });
  for (const j of stale) {
    const done = await db.jobRun.updateMany({ where: { id: j.id, status: "running" }, data: { status: "error", message: `${j.message ?? ""} Zaman aşımı: iş ${STALE_MS / 3600_000} saatte bitmedi (süreç kesilmiş olabilir)`.trim(), finishedAt: now } });
    if (done.count && j.attempts < MAX_ATTEMPTS) await enqueueJob(j.kind as JobKind, j.triggeredBy ?? "yeniden deneme", { attempts: j.attempts + 1, runAfter: new Date(now.getTime() + RETRY_BASE_MS) });
  }
  return stale.length;
}

/** Sıradaki uygun işi atomik olarak sahiplenir (iki worker aynı işi alamaz). */
/** Sıra bağımlılıkları: ajan veri hattı bitmeden, raporlar ajan bitmeden başlamaz. */
export const DEPENDS_ON: Partial<Record<JobKind, JobKind[]>> = {
  autopilot: ["daily", "gsc-sync", "crawl"], "daily-email": ["daily", "autopilot"], "weekly-email": ["daily", "autopilot"],
  // İçerik işleri güncel analizden sonra ve otopilotla aynı anda çalışmaz (aynı sayfaya iki öneri üretilmesin)
  "content-opportunity-scan": ["daily", "autopilot"], "service-page-opportunity": ["daily", "autopilot", "content-opportunity-scan"], "local-seo-opportunity": ["daily", "autopilot", "content-opportunity-scan", "service-page-opportunity"],
  // Rakip taraması kendi site işlerini engellemez: gece hattı/otopilot bitmeden başlamaz
  "competitor-crawl": ["daily", "autopilot"],
  "page-completeness-scan": ["daily", "autopilot", "content-opportunity-scan", "service-page-opportunity", "local-seo-opportunity", "competitor-opportunity-scan"],
  "competitor-opportunity-scan": ["competitor-crawl", "daily", "autopilot", "content-opportunity-scan", "service-page-opportunity"],
};

async function claimNext(now: Date) {
  const queued = await db.jobRun.findMany({ where: { status: "queued", OR: [{ runAfter: null }, { runAfter: { lte: now } }] }, orderBy: { startedAt: "asc" }, take: 20 });
  const active = new Set((await db.jobRun.findMany({ where: { status: { in: ["queued", "running"] } }, select: { kind: true, id: true, status: true } })).map((j) => `${j.status}:${j.kind}`));
  const next = queued.find((j) => !active.has(`running:${j.kind}`) && !(DEPENDS_ON[j.kind as JobKind] ?? []).some((d) => active.has(`running:${d}`) || active.has(`queued:${d}`)));
  if (!next) return null;
  const claimed = await db.jobRun.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", startedAt: now } });
  return claimed.count === 1 ? next : null;
}

export type QueueResult = { id: string; kind: string; status: string; message: string; retryAt?: string };

/** Worker: kuyruktaki işleri sırayla çalıştırır (süre bütçesi içinde). */
export async function processQueue(opts: { maxJobs?: number; budgetMs?: number; now?: () => Date } = {}): Promise<QueueResult[]> {
  await import("./registry");
  const clock = opts.now ?? (() => new Date());
  const started = Date.now();
  const out: QueueResult[] = [];
  await recoverStaleJobs(clock());
  while (out.length < (opts.maxJobs ?? 10) && Date.now() - started < (opts.budgetMs ?? 45 * 60_000)) {
    const job = await claimNext(clock());
    if (!job) break;
    const handler = handlers[job.kind as JobKind];
    try {
      if (!handler) throw new Error(`Tanımsız iş: ${job.kind}`);
      const r = await handler(job.triggeredBy ?? "worker");
      await db.jobRun.update({ where: { id: job.id }, data: { status: r.status ?? "ok", message: r.message, stats: (r.stats ?? undefined) as object | undefined, finishedAt: new Date() } });
      out.push({ id: job.id, kind: job.kind, status: r.status ?? "ok", message: r.message });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retry = job.attempts < MAX_ATTEMPTS;
      const retryAt = new Date(clock().getTime() + RETRY_BASE_MS * 2 ** (job.attempts - 1));
      await db.jobRun.update({ where: { id: job.id }, data: { status: "error", message: `${message}${retry ? ` · yeniden denenecek (deneme ${job.attempts + 1}/${MAX_ATTEMPTS})` : ` · ${MAX_ATTEMPTS} deneme tükendi`}`, finishedAt: new Date() } });
      if (retry) await enqueueJob(job.kind as JobKind, job.triggeredBy ?? "yeniden deneme", { attempts: job.attempts + 1, runAfter: retryAt });
      out.push({ id: job.id, kind: job.kind, status: "error", message, ...(retry ? { retryAt: retryAt.toISOString() } : {}) });
    }
  }
  return out;
}
