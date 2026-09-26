"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { applyFix, generateFix, rollbackFix } from "@/lib/ai/service";

/** ÇÖZÜM ÖNER düğmesi: fırsat bağlamıyla öneri üretir ve inceleme ekranına götürür. */
export async function generateFixAction(form: FormData) {
  const user = await requireUser("seo");
  const pageId = String(form.get("pageId") ?? "");
  const back = String(form.get("back") ?? "/yonetim/firsatlar");
  if (!pageId) redirect(`${back}${back.includes("?") ? "&" : "?"}hata=${encodeURIComponent("Bu fırsat için önce ilgili sayfa oluşturulmalı")}`);
  let id: string;
  try {
    const s = await generateFix(user, pageId, String(form.get("query") ?? "") || null, String(form.get("category") ?? "") || null);
    id = s.id;
    await audit(user.id, "ai.fix.generate", "AiSuggestion", s.id, { pageId, provider: s.provider });
  } catch (e) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}hata=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/yonetim/ai-asistan/${id}`);
}

export type FixApplyState = { ok: boolean; message: string };

export async function applyFixAction(_prev: FixApplyState, form: FormData): Promise<FixApplyState> {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const pick = (k: string) => (form.get(`use_${k}`) === "on" ? String(form.get(k) ?? "").replace(/\r\n?/g, "\n") : undefined);
  const faq = form.getAll("faq_use").map(Number).map((i) => ({ q: String(form.get(`faq_q_${i}`) ?? ""), a: String(form.get(`faq_a_${i}`) ?? "").replace(/\r\n?/g, "\n") }))
    .filter((f) => f.q.trim() && f.a.trim());
  try {
    await applyFix(user, id, { seoTitle: pick("seoTitle"), metaDescription: pick("metaDescription"), h1: pick("h1"), faq });
    await audit(user.id, "ai.fix.apply", "AiSuggestion", id);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  redirect(`/yonetim/ai-asistan/${id}?uygulandi=1`);
}

export async function rejectFixAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  await db.aiSuggestion.update({ where: { id }, data: { status: "REJECTED", reviewedBy: user.name, reviewedAt: new Date() } });
  await audit(user.id, "ai.fix.reject", "AiSuggestion", id);
  redirect(`/yonetim/ai-asistan/${id}`);
}

export async function rollbackFixAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  try {
    await rollbackFix(user, id);
    await audit(user.id, "ai.fix.rollback", "AiSuggestion", id);
  } catch (e) {
    redirect(`/yonetim/ai-asistan/${id}?hata=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/yonetim/ai-asistan/${id}?geri=1`);
}
