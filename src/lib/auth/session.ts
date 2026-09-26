import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { isProduction } from "../env";
import { type Permission, type Role, can } from "./permissions";
import { clientIp } from "./rate-limit";

export const SESSION_COOKIE = "wta_session";
const IDLE_MS = 12 * 60 * 60 * 1000; // 12 saat hareketsizlik
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // en fazla 7 gün

export type SessionUser = { id: string; email: string; name: string; role: Role; sessionId: string };

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const h = await headers();
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + IDLE_MS),
      ip: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 300),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  const now = Date.now();
  if (!s || s.expiresAt.getTime() < now || now - s.createdAt.getTime() > ABSOLUTE_MS || !s.user.active) return null;
  // Kayan süre: saatte bir uzat (her istekte yazma yapmamak için)
  if (now - s.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(now + IDLE_MS) } });
  }
  return { id: s.user.id, email: s.user.email, name: s.user.name, role: s.user.role, sessionId: s.id };
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Sayfa ve server action'larda kullanılır: oturum yoksa girişe, izin yoksa hata. */
export async function requireUser(perm?: Permission): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/yonetim/giris");
  if (perm && !can(u.role, perm)) redirect(`/yonetim?yetkisiz=${perm}`);
  return u;
}
