"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { invalidateRouting } from "@/lib/routing/registry";

function cleanPath(p: string): string {
  const s = p.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const u = new URL(s.startsWith("/") ? s : `/${s}`, "http://x");
  return decodeURI(u.pathname).replace(/\/+$/, "") || "/";
}

export async function saveRedirectAction(form: FormData) {
  const user = await requireUser("seo");
  const fromPath = cleanPath(String(form.get("fromPath") ?? ""));
  const toPath = cleanPath(String(form.get("toPath") ?? ""));
  const statusCode = String(form.get("statusCode")) === "302" ? 302 : 301;
  const back = String(form.get("back") ?? "/yonetim/yonlendirmeler");
  const fail = (m: string) => redirect(`${back}${back.includes("?") ? "&" : "?"}hata=${encodeURIComponent(m)}`);
  if (/^https?:/i.test(fromPath) || fromPath === "/") fail("Kaynak site içi bir yol olmalı ve ana sayfa olamaz");
  if (fromPath === toPath) fail("Kaynak ve hedef aynı olamaz");
  if (fromPath.startsWith("/yonetim") || fromPath.startsWith("/api")) fail("Sistem yolları yönlendirilemez");
  const published = await db.page.findUnique({ where: { path: fromPath }, select: { status: true } });
  if (published?.status === "PUBLISHED") fail("Kaynak URL yayında bir sayfa; önce sayfanın URL'sini değiştirin veya arşivleyin");
  // Zincir/döngü önleme: hedef başka bir yönlendirmenin kaynağıysa nihai hedefe bağla
  let final = toPath;
  for (let i = 0; i < 5; i++) {
    const next = await db.redirect.findUnique({ where: { fromPath: final } });
    if (!next || !next.active) break;
    if (next.toPath === fromPath) fail("Bu yönlendirme döngü oluşturur");
    final = next.toPath;
  }
  await db.redirect.upsert({
    where: { fromPath },
    create: { fromPath, toPath: final, statusCode, createdBy: user.name, note: String(form.get("note") ?? "") || null },
    update: { toPath: final, statusCode, active: true },
  });
  // Bu kaynağa işaret eden eski yönlendirmeler zincir oluşturmasın
  await db.redirect.updateMany({ where: { toPath: fromPath }, data: { toPath: final } });
  await db.notFoundLog.updateMany({ where: { path: fromPath }, data: { resolved: true } });
  await audit(user.id, "redirect.save", "Redirect", fromPath, { toPath: final, statusCode });
  invalidateRouting();
  redirect(`${back.split("?")[0]}?kaydedildi=1`);
}

export async function toggleRedirectAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const op = String(form.get("op"));
  if (op === "delete") await db.redirect.delete({ where: { id } });
  else {
    const r = await db.redirect.findUniqueOrThrow({ where: { id } });
    await db.redirect.update({ where: { id }, data: { active: !r.active } });
  }
  await audit(user.id, `redirect.${op}`, "Redirect", id);
  invalidateRouting();
  redirect("/yonetim/yonlendirmeler");
}

export async function ignore404Action(form: FormData) {
  await requireUser("seo");
  await db.notFoundLog.update({ where: { path: String(form.get("path")) }, data: { resolved: true } });
  redirect("/yonetim/yonlendirmeler?sekme=404");
}
