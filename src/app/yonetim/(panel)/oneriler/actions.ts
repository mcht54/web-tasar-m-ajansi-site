"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { applyProposal, rejectProposal, rollbackProposal } from "@/lib/proposals/lifecycle";

const back = (f: FormData) => {
  const b = String(f.get("back") ?? "/yonetim/oneriler");
  return b.startsWith("/yonetim/") ? b : "/yonetim/oneriler";
};
const go = (f: FormData, key: "ok" | "hata", text: string) => {
  const b = back(f);
  redirect(`${b}${b.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(text)}`);
};

/** Şimdi uygula: aynı uygulama hattı (doğrulama → uygula → test → SEO → tarama → geri alma noktası). */
export async function applyNowAction(f: FormData) {
  const user = await requireUser("seo");
  const r = await applyProposal(String(f.get("id")), { via: "manual", user });
  // Başarı yalnızca veritabanından doğrulanmış gerçek değişiklikte
  if (!r.ok) go(f, "hata", `Uygulanmadı: ${r.note}`);
  go(f, "ok", `${r.note} — sürüm geçmişine ve denetim loguna yazıldı.`);
}

export async function rejectProposalAction(f: FormData) {
  const user = await requireUser("seo");
  try {
    await rejectProposal(user, String(f.get("id")));
  } catch (e) {
    go(f, "hata", e instanceof Error ? e.message : String(e));
  }
  go(f, "ok", "Reddedildi; bu öneri uygulanmayacak ve 30 gün yeniden önerilmeyecek.");
}

export async function rollbackProposalAction(f: FormData) {
  const user = await requireUser("seo");
  try {
    await rollbackProposal(user, String(f.get("id")));
  } catch (e) {
    go(f, "hata", `Geri alınamadı: ${e instanceof Error ? e.message : String(e)}`);
  }
  go(f, "ok", "Geri alındı; önceki içerik yeni sürüm olarak kaydedildi.");
}
