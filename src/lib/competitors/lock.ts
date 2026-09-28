import "server-only";
// RAKİP BAŞINA TARAMA KİLİDİ (veritabanı düzeyinde, süreçten bağımsız).
//
// Kilit TEK bir koşullu UPDATE ile alınır:
//   UPDATE "Competitor" SET "crawlLockUntil" = şimdi + kira ... WHERE id = $1 AND
//     ("crawlLockUntil" IS NULL OR "crawlLockUntil" < şimdi)
// PostgreSQL aynı satırı güncellemek isteyen ikinci işlemi bekletir; birincisi commit edince
// WHERE koşulunu YENİDEN değerlendirir → kilit dolu → 0 satır. İki worker aynı anda yarışsa
// da yalnızca biri kazanır. Aynı işlem (transaction) içinde "running" tarama kaydı da
// oluşturulur: kilit sahipliği ile tarama kaydı atomiktir. Kilit alınamazsa hiçbir kayıt
// oluşmaz ve çağıran hiçbir HTTP isteği yapmaz.
// Zamanlar veritabanı saatinden (UTC) alınır: worker'lar arası saat farkı sonucu etkilemez.
// Kira süresi dolan kilit (çöken süreç) bir sonraki denemede aynı UPDATE ile devralınır.

import { randomUUID } from "node:crypto";
import { db } from "../db";

export type LockResult = { acquired: true; owner: string; snapshotId: string } | { acquired: false; reason: string };

export async function acquireCrawlLock(competitorId: string, leaseMs: number): Promise<LockResult> {
  const owner = randomUUID();
  return db.$transaction(async (tx) => {
    const n = await tx.$executeRaw`
      UPDATE "Competitor"
         SET "crawlLockUntil" = (now() AT TIME ZONE 'utc') + (${leaseMs}::int * interval '1 millisecond'),
             "crawlLockOwner" = ${owner},
             "crawlStartedAt" = (now() AT TIME ZONE 'utc'),
             "crawlRequestedAt" = NULL
       WHERE id = ${competitorId}
         AND status <> 'paused'
         AND ("crawlLockUntil" IS NULL OR "crawlLockUntil" < (now() AT TIME ZONE 'utc'))`;
    if (n !== 1) return { acquired: false as const, reason: "Bu rakip şu anda taranıyor." };
    // Kira süresi dolmuş (yarıda kalmış) önceki tarama kaydı kapatılır
    await tx.competitorSnapshot.updateMany({ where: { competitorId, status: "running" }, data: { status: "error", error: "Tarama yarıda kaldı (süreç kesildi); kilit süresi dolunca devralındı" } });
    const snap = await tx.competitorSnapshot.create({ data: { competitorId, status: "running", data: { owner } as object } });
    return { acquired: true as const, owner, snapshotId: snap.id };
  });
}

/** Kilidi yalnızca sahibi bırakır (başkasının devraldığı kilide dokunulmaz). */
export async function releaseCrawlLock(competitorId: string, owner: string): Promise<void> {
  await db.$executeRaw`UPDATE "Competitor" SET "crawlLockUntil" = NULL, "crawlLockOwner" = NULL WHERE id = ${competitorId} AND "crawlLockOwner" = ${owner}`;
}

/** Şu anda geçerli bir kilit var mı (UI durumu için)? */
export async function isCrawling(competitorId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Competitor" WHERE id = ${competitorId} AND "crawlLockUntil" > (now() AT TIME ZONE 'utc')`;
  return (rows[0]?.n ?? 0) > 0;
}

/** Kira: tarama sınırlarından türetilen üst süre (en çok 2 saat). */
export function leaseFor(s: { maxPages: number; delayMs: number; timeoutMs: number }): number {
  return Math.min(2 * 3600_000, s.maxPages * 2 * (s.delayMs + s.timeoutMs) + 5 * 60_000);
}
