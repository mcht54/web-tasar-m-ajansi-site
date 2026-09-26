"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { refreshPublic } from "@/lib/admin/pages";

export async function updateServiceAction(form: FormData) {
  const user = await requireUser("seo");
  const id = String(form.get("id"));
  const data = {
    allowLocationPages: form.get("allowLocationPages") === "on",
    showInNav: form.get("showInNav") === "on",
    active: form.get("active") === "on",
    summary: String(form.get("summary") ?? "").trim().slice(0, 300) || null,
    sortOrder: Number(form.get("sortOrder")) || 0,
  };
  await db.service.update({ where: { id }, data });
  await audit(user.id, "service.update", "Service", id, data);
  refreshPublic();
  redirect("/yonetim/hizmetler?kaydedildi=1");
}

const provinceSchema = z.object({
  population: z.union([z.literal(""), z.coerce.number().int().min(0).max(30_000_000)]),
  populationYear: z.union([z.literal(""), z.coerce.number().int().min(1990).max(2100)]),
  localNotes: z.string().max(10_000),
});

export async function updateLocationAction(form: FormData) {
  const user = await requireUser("content");
  const kind = String(form.get("kind"));
  const id = Number(form.get("id"));
  const back = String(form.get("back"));
  const p = provinceSchema.safeParse({
    population: String(form.get("population") ?? ""),
    populationYear: String(form.get("populationYear") ?? ""),
    localNotes: String(form.get("localNotes") ?? ""),
  });
  if (!p.success) redirect(`${back}?hata=${encodeURIComponent("Nüfus/yıl değeri geçersiz")}`);
  const data = {
    population: p.data.population === "" ? null : p.data.population,
    populationYear: p.data.populationYear === "" ? null : p.data.populationYear,
    localNotes: p.data.localNotes.trim() || null,
  };
  if (kind === "province") {
    const sectorIds = form.getAll("sectorIds").map(String);
    await db.province.update({ where: { id }, data: { ...data, sectors: { set: sectorIds.map((s) => ({ id: s })) } } });
  } else {
    await db.district.update({ where: { id }, data });
  }
  await audit(user.id, `${kind}.update`, kind, String(id), data);
  refreshPublic();
  redirect(`${back}?kaydedildi=1`);
}
