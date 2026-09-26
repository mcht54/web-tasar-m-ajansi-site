"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hmac } from "@/lib/crypto";
import { verifyPassword } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const GENERIC = "Kullanıcı adı / e-posta veya şifre hatalı.";

export async function login(_prev: { error: string }, form: FormData): Promise<{ error: string }> {
  // E-posta veya kullanıcı adı ile giriş
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const ip = clientIp(await headers());
  if (!(await rateLimit(`login:${hmac(ip)}`, 10, 900))) {
    return { error: "Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin." };
  }
  const user = email.includes("@") ? await db.user.findUnique({ where: { email } }) : email ? await db.user.findUnique({ where: { username: email } }) : null;
  if (!user || !user.active) {
    await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"); // zamanlama farkını azalt
    await audit(null, "login.fail", "User", null, { email });
    return { error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Hesap çok sayıda hatalı deneme nedeniyle geçici olarak kilitlendi. Daha sonra tekrar deneyin." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null },
    });
    await audit(user.id, "login.fail", "User", user.id, { failed });
    return { error: GENERIC };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id);
  await audit(user.id, "login.ok", "User", user.id);
  const next = String(form.get("sonra") ?? "");
  redirect(next.startsWith("/yonetim") && !next.startsWith("//") ? next : "/yonetim");
}

export async function logout() {
  await destroySession();
  redirect("/yonetim/giris");
}
