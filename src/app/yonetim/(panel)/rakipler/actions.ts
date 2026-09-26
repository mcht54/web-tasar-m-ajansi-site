"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { normalizeDomain, runCompetitorAnalysis } from "@/lib/competitors/analyze";

export async function addCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  let domain: string;
  try {
    domain = normalizeDomain(String(form.get("domain") ?? ""));
  } catch (e) {
    redirect(`/yonetim/rakipler?hata=${encodeURIComponent((e as Error).message)}`);
  }
  const c = await db.competitor.upsert({ where: { domain }, create: { domain, name: String(form.get("name") ?? "") || null }, update: {} });
  await audit(user.id, "competitor.add", "Competitor", c.id, { domain });
  after(() => runCompetitorAnalysis(c.id).catch(() => {}));
  redirect(`/yonetim/rakipler?id=${c.id}&basladi=1`);
}

export async function analyzeCompetitorAction(form: FormData) {
  await requireUser("seo");
  const id = String(form.get("id"));
  after(() => runCompetitorAnalysis(id).catch(() => {}));
  redirect(`/yonetim/rakipler?id=${id}&basladi=1`);
}

export async function deleteCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  await db.competitor.delete({ where: { id } });
  await audit(user.id, "competitor.delete", "Competitor", id);
  redirect("/yonetim/rakipler");
}
