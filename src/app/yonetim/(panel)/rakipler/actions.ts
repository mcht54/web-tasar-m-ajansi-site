"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { validateDomain } from "@/lib/competitors/net";
import { crawlCompetitor } from "@/lib/competitors/crawl";
import { enqueueJob } from "@/lib/jobs/runner";

const back = (q: string) => `/yonetim/rakipler?${q}`;

/** Arka planda tek rakip taraması (SSRF korumalı); bitince fırsat taraması kuyruğa girer. */
function crawlLater(id: string) {
  after(async () => {
    try {
      const r = await crawlCompetitor(id);
      if (r.ok) await enqueueJob("competitor-opportunity-scan", "rakip taraması");
    } catch (e) {
      await db.competitor.update({ where: { id }, data: { lastError: e instanceof Error ? e.message : String(e), status: "error", lastCrawlAt: new Date() } }).catch(() => undefined);
    }
  });
}

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
  const c = await db.competitor.upsert({ where: { domain }, create: { domain, name: String(form.get("name") ?? "").trim() || null, source: "manual" }, update: { status: "active" } });
  await audit(user.id, "competitor.add", "Competitor", c.id, { domain });
  crawlLater(c.id);
  redirect(`/yonetim/rakipler/${c.id}?basladi=1`);
}

export async function analyzeCompetitorAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  await audit(user.id, "competitor.crawl", "Competitor", id);
  crawlLater(id);
  redirect(`/yonetim/rakipler/${id}?basladi=1`);
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
