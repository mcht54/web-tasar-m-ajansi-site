"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { normalizeKeyword } from "@/lib/text/slug";

const INTENTS = ["INFORMATIONAL", "COMMERCIAL", "TRANSACTIONAL", "NAVIGATIONAL", "LOCAL"] as const;

const kwSchema = z.object({
  phrase: z.string().trim().min(2).max(120),
  intent: z.enum(INTENTS),
  targetPageId: z.string().max(40),
  priority: z.coerce.number().int().min(1).max(5),
  targetPosition: z.union([z.literal(""), z.coerce.number().int().min(1).max(100)]),
  status: z.enum(["ACTIVE", "PAUSED"]),
  notes: z.string().max(1000),
});

async function relationsFor(targetPageId: string) {
  if (!targetPageId) return { targetPageId: null };
  const p = await db.page.findUnique({ where: { id: targetPageId }, select: { id: true, provinceId: true, districtId: true, serviceId: true, sectorId: true } });
  return p ? { targetPageId: p.id, provinceId: p.provinceId, districtId: p.districtId, serviceId: p.serviceId, sectorId: p.sectorId } : { targetPageId: null };
}

export async function saveKeywordAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id") ?? "");
  const p = kwSchema.safeParse(Object.fromEntries(form));
  if (!p.success) redirect(`/yonetim/anahtar-kelimeler?hata=${encodeURIComponent("Geçersiz değer: " + p.error.issues[0].message)}`);
  const d = p.data;
  const normalized = normalizeKeyword(d.phrase);
  const clash = await db.keyword.findUnique({ where: { normalized } });
  if (clash && clash.id !== id) redirect(`/yonetim/anahtar-kelimeler?hata=${encodeURIComponent("Bu anahtar kelime zaten var")}`);
  // Otopilot seed: işaretliyse "seed"; işaret kaldırılan seed "manual" olur; diğer kaynaklar (keşif/evren) korunur
  const prev = id ? await db.keyword.findUnique({ where: { id }, select: { source: true } }) : null;
  const source = form.get("seed") ? "seed" : prev?.source === "seed" ? "manual" : prev?.source ?? "manual";
  const data = {
    source,
    phrase: d.phrase, normalized, intent: d.intent, priority: d.priority, status: d.status, notes: d.notes || null,
    targetPosition: d.targetPosition === "" ? null : d.targetPosition, ...(await relationsFor(d.targetPageId)),
  };
  if (id) await db.keyword.update({ where: { id }, data });
  else await db.keyword.create({ data });
  await audit(user.id, id ? "keyword.update" : "keyword.create", "Keyword", id || normalized, { phrase: d.phrase });
  redirect("/yonetim/anahtar-kelimeler?kaydedildi=1");
}

/** Toplu ekleme: her satır "kelime" veya "kelime ; /hedef-url". */
export async function bulkKeywordsAction(form: FormData) {
  const user = await requireUser("seo");
  const intent = z.enum(INTENTS).catch("COMMERCIAL").parse(form.get("intent"));
  const lines = String(form.get("lines") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
  let added = 0, skipped = 0;
  for (const line of lines) {
    const [phrase, path] = line.split(";").map((s) => s.trim());
    const normalized = normalizeKeyword(phrase ?? "");
    if (normalized.length < 2 || (await db.keyword.findUnique({ where: { normalized } }))) {
      skipped++;
      continue;
    }
    const page = path ? await db.page.findUnique({ where: { path }, select: { id: true } }) : null;
    await db.keyword.create({ data: { phrase, normalized, intent, source: form.get("seed") ? "seed" : "manual", ...(await relationsFor(page?.id ?? "")) } });
    added++;
  }
  await audit(user.id, "keyword.bulk", "Keyword", null, { added, skipped });
  redirect(`/yonetim/anahtar-kelimeler?kaydedildi=1&eklenen=${added}&atlanan=${skipped}`);
}

export async function deleteKeywordAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  await db.keyword.delete({ where: { id } });
  await audit(user.id, "keyword.delete", "Keyword", id);
  redirect("/yonetim/anahtar-kelimeler");
}

export async function taskStatusAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const status = z.enum(["OPEN", "DONE", "DISMISSED"]).parse(form.get("status"));
  await db.seoTask.update({ where: { id }, data: { status, resolvedAt: status === "OPEN" ? null : new Date() } });
  await audit(user.id, "task.status", "SeoTask", id, { status });
  redirect(String(form.get("back") ?? "/yonetim/firsatlar"));
}

export async function manualRankAction(form: FormData) {
  const user = await requireUser("seo");
  const keywordId = String(form.get("keywordId"));
  const position = z.coerce.number().min(1).max(200).safeParse(form.get("position"));
  if (!position.success) redirect(`/yonetim/siralama/${keywordId}?hata=${encodeURIComponent("Pozisyon 1–200 arası olmalı")}`);
  const date = new Date(new Date().toISOString().slice(0, 10));
  await db.rankSnapshot.upsert({
    where: { keywordId_date_source: { keywordId, date, source: "MANUAL" } },
    create: { keywordId, date, source: "MANUAL", position: position.data, url: String(form.get("url") ?? "") || null },
    update: { position: position.data, url: String(form.get("url") ?? "") || null },
  });
  await audit(user.id, "rank.manual", "Keyword", keywordId, { position: position.data });
  redirect(`/yonetim/siralama/${keywordId}`);
}
