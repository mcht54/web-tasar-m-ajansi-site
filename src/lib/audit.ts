import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { clientIp } from "./auth/rate-limit";

export async function audit(
  userId: string | null,
  action: string,
  entity?: string | null,
  entityId?: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  let ip: string | null = null;
  try {
    ip = clientIp(await headers());
  } catch {
    ip = null; // CLI / arka plan işi
  }
  await db.auditLog.create({
    data: { userId, action, entity: entity ?? null, entityId: entityId ?? null, detail: (detail ?? undefined) as object | undefined, ip },
  });
}
