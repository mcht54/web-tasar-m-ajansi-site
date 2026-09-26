"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { deleteMedia, storeUpload } from "@/lib/media/store";
import { MEDIA_TAG } from "@/lib/site/public";

export async function uploadMediaAction(form: FormData) {
  const user = await requireUser("media");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) redirect(`/yonetim/medya?hata=${encodeURIComponent("Dosya seçin")}`);
  let id: string;
  try {
    const m = await storeUpload(file, {
      seoName: String(form.get("seoName") ?? ""), alt: String(form.get("alt") ?? ""),
      title: String(form.get("title") ?? ""), caption: String(form.get("caption") ?? ""),
    });
    id = m.id;
    await audit(user.id, "media.upload", "Media", m.id, { filename: m.filename });
  } catch (e) {
    redirect(`/yonetim/medya?hata=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/yonetim/medya?id=${id}`);
}

export async function updateMediaAction(form: FormData) {
  const user = await requireUser("media");
  const id = String(form.get("id"));
  const s = (k: string) => String(form.get(k) ?? "").trim().slice(0, 300) || null;
  await db.media.update({ where: { id }, data: { alt: s("alt"), title: s("title"), caption: s("caption") } });
  await audit(user.id, "media.update", "Media", id);
  updateTag(MEDIA_TAG);
  redirect(`/yonetim/medya?id=${id}&kaydedildi=1`);
}

export async function deleteMediaAction(form: FormData) {
  const user = await requireUser("media");
  const id = String(form.get("id"));
  try {
    await deleteMedia(id);
  } catch (e) {
    redirect(`/yonetim/medya?id=${id}&hata=${encodeURIComponent((e as Error).message)}`);
  }
  await audit(user.id, "media.delete", "Media", id);
  redirect("/yonetim/medya");
}
