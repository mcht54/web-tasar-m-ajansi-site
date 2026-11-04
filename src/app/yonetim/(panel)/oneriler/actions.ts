"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { applyProposal, applyProposalsBulk, rejectProposal, reopenProposal, rollbackProposal } from "@/lib/proposals/lifecycle";

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

/**
 * Onayla ve uygula / tekrar yayına al: "İnsan kararı", "Uygulanamaz" ve geçmişteki (reddedilen, geri alınan,
 * başarısız, atlanan) öneriyi yeniden açar ve aynı uygulama hattından hemen uygular.
 */
export async function reopenAndApplyAction(f: FormData) {
  const user = await requireUser("seo");
  const id = String(f.get("id"));
  try {
    await reopenProposal(user, id);
  } catch (e) {
    go(f, "hata", e instanceof Error ? e.message : String(e));
  }
  const r = await applyProposal(id, { via: "manual", user });
  if (!r.ok) go(f, "hata", `Uygulanmadı: ${r.note}`);
  go(f, "ok", `${r.note} — sürüm geçmişine ve denetim loguna yazıldı.`);
}

/** Toplu uygula: seçilenler ya da (kategori süzgecine göre) tüm düşük/orta riskli bekleyen öneriler. */
export async function bulkApplyAction(f: FormData) {
  const user = await requireUser("seo");
  const ids = f.getAll("ids").map(String);
  const all = f.get("kapsam") === "tumu";
  if (!all && !ids.length) go(f, "hata", "Önce uygulanacak önerileri işaretleyin.");
  const r = await applyProposalsBulk(user, all ? { category: String(f.get("kategori") ?? "") } : { ids });
  const parts = [`${r.applied} öneri uygulandı`];
  if (r.failed.length) parts.push(`${r.failed.length} başarısız (${r.failed.slice(0, 3).map((x) => `${x.title}: ${x.note}`).join("; ")})`);
  if (r.held) parts.push(`${r.held} öneri aynı sayfa alanını değiştirdiği için bekletildi`);
  if (r.excluded) parts.push(`${r.excluded} yüksek riskli öneri dışarıda kaldı; kendi kartından onaylanır`);
  if (r.remaining) parts.push(`${r.remaining} öneri sırada; devam etmek için tekrar basın`);
  go(f, r.failed.length ? "hata" : "ok", `${parts.join(" · ")}.`);
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
