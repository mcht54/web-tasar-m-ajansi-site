"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { refreshPublic } from "@/lib/admin/pages";
import { getSettingsFresh } from "@/lib/settings";
import { approveAction, rejectAction, rollbackAction } from "@/lib/autopilot/execute";

const back = (tab: string, q: string) => `/yonetim/autopilot?sekme=${tab}&${q}`;
const msg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

export async function approveAutopilotAction(f: FormData) {
  const user = await requireUser("seo");
  const id = String(f.get("id"));
  const tab = String(f.get("tab") ?? "hafta");
  let text: string;
  try {
    const r = await approveAction(user, id, (await getSettingsFresh()).integrations.aiModel);
    if (r.status === "applied") refreshPublic(r.changedPaths ?? []);
    text = r.status === "applied" ? "Uygulandı (sürüm geçmişine yazıldı)." : r.note;
  } catch (e) {
    redirect(back(tab, `hata=${msg(e)}`));
  }
  redirect(back(tab, `ok=${encodeURIComponent(text)}`));
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
    await rollbackAction(user, String(f.get("id")));
    refreshPublic();
  } catch (e) {
    redirect(back(tab, `hata=${msg(e)}`));
  }
  redirect(back(tab, `ok=${encodeURIComponent("Geri alındı (yeni sürüm olarak kaydedildi).")}`));
}
