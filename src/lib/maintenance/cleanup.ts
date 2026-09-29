import "server-only";
// MERKEZİ TEMİZLİK: 5 günden eski ve artık referans edilmeyen GEÇİCİ veriyi siler.
//
// Silinenler (yalnızca aşağıdaki koşulların hepsi sağlanınca):
//   • CrawlRun (+ CrawlPage/CrawlIssue): bitmiş, 5 günden eski; en son başarılı ve en son tarama korunur
//   • JobRun: bitmiş (ok/skipped/error), 5 günden eski; her iş türünün son kaydı korunur (zamanlayıcı onu okur)
//   • AutopilotRun: bitmiş, 5 günden eski, HİÇ öneri kaydı yok; her haftanın son çalıştırması korunur (rapor)
//   • CompetitorSnapshot: 5 günden eski; rakibin son snapshot'ı, değişiklik kaydının işaret ettiği snapshot
//     ve şu an taranan rakibin snapshot'ları korunur
//   • RateLimit pencereleri ve süresi 5 günden fazla önce dolmuş oturumlar
//   • IndexNowSubmission: 5 günden eski, yeniden deneme planı olmayan; en son kayıt korunur
//   • İçerik motoru / kalite kapısı ara çıktıları: sonuçlanmış (uygulanmamış) önerilerdeki alternatif
//     listesi ve kapı ayrıntısı (öneri kaydı, durumu, gerekçesi ve parmak izi KALIR — mükerrer önleme)
//   • Disk: storage/tmp altındaki 5 günden eski geçici dosyalar
//
// ASLA silinmez: sayfalar ve içerik, PageVersion, SeoChangeLog, AuditLog, deneyler ve ölçümler,
// Search Console verisi, aktif/uygulanmış öneriler ve geri alma verileri (before/after/snapshot),
// kullanıcı verisi (lead, medya, referans, anahtar kelime, rakip), e-posta geçmişi.
// Her adım bağımsızdır: biri hata verse diğerleri çalışır; tekrar çalıştırmak güvenlidir (idempotent).

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";

export const RETENTION_DAYS = 5;
export const TMP_DIR = process.env.APP_TMP_DIR || path.join(process.cwd(), "storage", "tmp");

export type CleanupStep = { name: string; deleted: number; error?: string };
export type CleanupSummary = { cutoff: string; steps: CleanupStep[]; total: number; errors: number };

async function crawlRuns(cutoff: Date): Promise<number> {
  const [lastOk, last] = await Promise.all([
    db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" }, select: { id: true } }),
    db.crawlRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } }),
  ]);
  const keep = [lastOk?.id, last?.id].filter(Boolean) as string[];
  const r = await db.crawlRun.deleteMany({ where: { status: { not: "running" }, startedAt: { lt: cutoff }, id: { notIn: keep } } });
  return r.count;
}

async function jobRuns(cutoff: Date): Promise<number> {
  // Her türün son (bitmiş) kaydı: zamanlayıcı "son ne zaman çalıştı" bilgisini buradan okur
  const latest = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (kind) id FROM "JobRun" WHERE status NOT IN ('queued','running') ORDER BY kind, "startedAt" DESC`;
  const r = await db.jobRun.deleteMany({ where: { status: { in: ["ok", "skipped", "error"] }, startedAt: { lt: cutoff }, OR: [{ finishedAt: null }, { finishedAt: { lt: cutoff } }], id: { notIn: latest.map((x) => x.id) } } });
  return r.count;
}

async function autopilotRuns(cutoff: Date): Promise<number> {
  const perWeek = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON ("weekKey") id FROM "AutopilotRun" ORDER BY "weekKey", "startedAt" DESC`;
  // Öneri kaydı olan çalıştırma silinmez (silme öneri kayıtlarını da silerdi)
  const r = await db.autopilotRun.deleteMany({ where: { status: { not: "running" }, startedAt: { lt: cutoff }, actions: { none: {} }, id: { notIn: perWeek.map((x) => x.id) } } });
  return r.count;
}

async function competitorSnapshots(cutoff: Date, now: Date): Promise<number> {
  const latest = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON ("competitorId") id FROM "CompetitorSnapshot" ORDER BY "competitorId", "createdAt" DESC`;
  const referenced = (await db.competitorChange.findMany({ where: { snapshotId: { not: null } }, select: { snapshotId: true }, distinct: ["snapshotId"] })).map((c) => c.snapshotId!) ;
  const crawling = (await db.competitor.findMany({ where: { crawlLockUntil: { gt: now } }, select: { id: true } })).map((c) => c.id);
  const r = await db.competitorSnapshot.deleteMany({ where: { createdAt: { lt: cutoff }, id: { notIn: [...latest.map((x) => x.id), ...referenced] }, competitorId: { notIn: crawling } } });
  return r.count;
}

async function sessionsAndLimits(cutoff: Date): Promise<number> {
  const [a, b] = await Promise.all([
    db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
  ]);
  return a.count + b.count;
}

async function indexNow(cutoff: Date): Promise<number> {
  const last = await db.indexNowSubmission.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const r = await db.indexNowSubmission.deleteMany({ where: { createdAt: { lt: cutoff }, nextRetryAt: null, status: { not: "retry" }, id: { not: last?.id ?? "" } } });
  return r.count;
}

/** Sonuçlanmış (uygulanmamış) önerilerde içerik motoru/kalite kapısı ara çıktılarını temizler. */
async function engineIntermediates(cutoff: Date): Promise<number> {
  const rows = await db.autopilotAction.findMany({
    where: { status: { in: ["skipped", "failed", "rejected", "blocked"] }, createdAt: { lt: cutoff } },
    select: { id: true, proposal: true },
  });
  let n = 0;
  for (const r of rows) {
    const p = (r.proposal ?? null) as Record<string, unknown> | null;
    if (!p || !("alternatives" in p || "gate" in p)) continue;
    const rest = { ...p };
    delete rest.alternatives;
    delete rest.gate;
    await db.autopilotAction.updateMany({ where: { id: r.id, status: { in: ["skipped", "failed", "rejected", "blocked"] } }, data: { proposal: rest as object } });
    n++;
  }
  return n;
}

/** storage/tmp altındaki 5 günden eski geçici dosyalar (klasör yoksa sessizce 0). */
async function tmpFiles(cutoff: Date, dir = TMP_DIR): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of entries) {
    if (name.endsWith(".lock")) continue; // çalışan işin kilidi
    const f = path.join(dir, name);
    try {
      const st = await stat(f);
      if (!st.isFile() || st.mtime >= cutoff) continue;
      if (entries.includes(`${name}.lock`)) continue;
      await unlink(f);
      n++;
    } catch {
      // eşzamanlı silinmiş/erişilemeyen dosya: atla
    }
  }
  return n;
}

export async function runCleanup(opts: { now?: Date; tmpDir?: string } = {}): Promise<CleanupSummary> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400_000);
  const steps: CleanupStep[] = [];
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      steps.push({ name, deleted: await fn() });
    } catch (e) {
      steps.push({ name, deleted: 0, error: e instanceof Error ? e.message : String(e) });
    }
  };
  await step("Tarama çıktıları (CrawlRun)", () => crawlRuns(cutoff));
  await step("İş kayıtları (JobRun)", () => jobRuns(cutoff));
  await step("Boş otopilot çalıştırmaları", () => autopilotRuns(cutoff));
  await step("Rakip snapshot'ları", () => competitorSnapshots(cutoff, now));
  await step("Oturum/hız sınırı kayıtları", () => sessionsAndLimits(cutoff));
  await step("IndexNow gönderim kayıtları", () => indexNow(cutoff));
  await step("İçerik motoru ara çıktıları", () => engineIntermediates(cutoff));
  await step("Geçici dosyalar (storage/tmp)", () => tmpFiles(cutoff, opts.tmpDir));
  return { cutoff: cutoff.toISOString(), steps, total: steps.reduce((s, x) => s + x.deleted, 0), errors: steps.filter((s) => s.error).length };
}
