"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { validateDomain } from "@/lib/competitors/net";
import { requestCompetitorCrawl } from "@/lib/competitors/jobs";

// Sunucu eylemleri TARAMA YAPMAZ: yalnızca isteği kaydeder ve worker işini kuyruğa ekler.
// Tarama worker'da, rakip başına atomik kilitle çalışır (lib/competitors/lock.ts). Eylemler
// idempotenttir: art arda gönderim tek rakip kaydı ve tek tarama üretir.

const back = (q: string) => `/yonetim/rakipler?${q}`;

export async function addCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  let domain: string;
  try {
    domain = validateDomain(String(form.get("domain") ?? ""));
  } catch (e) {
    redirect(back(`hata=${encodeURIComponent((e as Error).message)}`));
  }
  const own = (process.env.SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[:/].*$/, "");
  if (domain === own) redirect(back(`hata=${encodeURIComponent("Kendi sitenizi rakip olarak ekleyemezsiniz")}`));
  const existing = await db.competitor.findUnique({ where: { domain } });
  const c = existing ?? (await db.competitor.upsert({ where: { domain }, create: { domain, name: String(form.get("name") ?? "").trim() || null, source: "manual" }, update: {} }));
  // Denetim kaydı yalnızca rakip gerçekten ilk kez eklendiğinde (tekrar gönderim ≠ yeni ekleme)
  if (!existing) await audit(user.id, "competitor.add", "Competitor", c.id, { domain });
  const r = await requestCompetitorCrawl(c.id, user.name);
  redirect(`/yonetim/rakipler/${c.id}?${r.crawling ? "taraniyor=1" : "kuyruk=1"}`);
}

export async function analyzeCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const r = await requestCompetitorCrawl(id, user.name);
  await audit(user.id, "competitor.crawl_request", "Competitor", id, { alreadyCrawling: r.crawling });
  redirect(`/yonetim/rakipler/${id}?${r.crawling ? "taraniyor=1" : "kuyruk=1"}`);
}

export async function toggleCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const c = await db.competitor.findUniqueOrThrow({ where: { id } });
  const status = c.status === "paused" ? "active" : "paused";
  await db.competitor.update({ where: { id }, data: { status } });
  await audit(user.id, `competitor.${status}`, "Competitor", id);
  redirect(`/yonetim/rakipler/${id}`);
}

export async function deleteCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  await db.competitor.delete({ where: { id } });
  await audit(user.id, "competitor.delete", "Competitor", id);
  redirect("/yonetim/rakipler");
}
