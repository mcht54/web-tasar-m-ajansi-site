import "server-only";
import { db } from "../db";

/**
 * Sabit pencereli hız sınırı (DB tabanlı; birden çok süreçte de tutarlı).
 * @returns izin verildiyse true
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const row = await db.rateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  // Eski pencereleri ara sıra temizle
  if (Math.random() < 0.02) await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86400_000) } } });
  return row.count <= limit;
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
