"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { refreshPublic } from "@/lib/admin/pages";
import { getSettingsFresh } from "@/lib/settings";
import { approveAction, rejectAction } from "@/lib/autopilot/execute";
import { rollbackProposal } from "@/lib/proposals/lifecycle";

const back = (tab: string, q: string) => `/yonetim/autopilot?sekme=${tab}&${q}`;
const msg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

export async function approveAutopilotAction(f: FormData) {
  const user = await requireUser("seo");
  const id = String(f.get("id"));
  const tab = String(f.get("tab") ?? "hafta");
  let r: Awaited<ReturnType<typeof approveAction>>;
  try {
    r = await approveAction(user, id, (await getSettingsFresh()).integrations.aiModel);
  } catch (e) {
    redirect(back(tab, `hata=${msg(e)}`));
  }
  // Başarı bildirimi yalnızca sayfa gerçekten değiştiyse; aksi hâlde gerçek neden hata olarak
  if (r.status !== "applied") redirect(back(tab, `hata=${encodeURIComponent(`Uygulanmadı: ${r.note}`)}`));
  refreshPublic(r.changedPaths ?? []);
  redirect(back(tab, `ok=${encodeURIComponent(`Uygulandı: ${r.note} (sürüm geçmişine yazıldı).`)}`));
}

export async function rejectAutopilotAction(f: FormData) {
  const user = await requireUser("seo");
  const tab = String(f.get("tab") ?? "hafta");
  try {
    await rejectAction(user, String(f.get("id")));
  } catch (e) {
    redirect(back(tab, `hata=${msg(e)}`));
  }
  redirect(back(tab, `ok=${encodeURIComponent("Reddedildi.")}`));
}

export async function rollbackAutopilotAction(f: FormData) {
  const user = await requireUser("seo");
  const tab = String(f.get("tab") ?? "hafta");
  try {
    await rollbackProposal(user, String(f.get("id")));
    refreshPublic();
  } catch (e) {
    redirect(back(tab, `hata=${msg(e)}`));
  }
  redirect(back(tab, `ok=${encodeURIComponent("Geri alındı (yeni sürüm olarak kaydedildi).")}`));
}
