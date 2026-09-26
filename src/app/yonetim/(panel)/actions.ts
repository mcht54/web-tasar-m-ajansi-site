"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { JOB_KINDS, type JobKind, runJob } from "@/lib/jobs/runner";
import { refreshPublic } from "@/lib/admin/pages";
import { audit } from "@/lib/audit";

/** Uzun işler (tarama, GSC) yanıt döndükten sonra arka planda çalışır. */
export async function runJobAction(form: FormData) {
  const user = await requireUser("seo");
  const kind = String(form.get("kind")) as JobKind;
  const back = String(form.get("back") ?? "/yonetim");
  if (!JOB_KINDS.includes(kind)) redirect(back);
  await audit(user.id, "job.run", "Job", kind);
  after(async () => {
    const r = await runJob(kind, user.name);
    if (r.status === "ok") refreshPublic();
  });
  redirect(`${back}${back.includes("?") ? "&" : "?"}is=${kind}`);
}
