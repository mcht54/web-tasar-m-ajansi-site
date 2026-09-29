"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { JOB_KINDS, QUEUE_ONLY_KINDS, type JobKind, enqueueJob, runJob } from "@/lib/jobs/runner";
import { refreshPublic } from "@/lib/admin/pages";
import { audit } from "@/lib/audit";

/** Uzun işler (tarama, GSC) yanıt döndükten sonra arka planda çalışır. */
export async function runJobAction(form: FormData) {
  const user = await requireUser("seo");
  const kind = String(form.get("kind")) as JobKind;
  const back = String(form.get("back") ?? "/yonetim");
  if (!JOB_KINDS.includes(kind)) redirect(back);
  await audit(user.id, "job.run", "Job", kind);
  // Otopilot/cycle: web isteğinde çalışmaz, kuyruğa girer (tek kuyruk kaydı; çalışan varsa yenisi eklenmez).
  // Worker, bağımlılık ve dışlama kurallarıyla (DEPENDS_ON / EXCLUSIVE_RUNNING) sırası gelince çalıştırır.
  if (QUEUE_ONLY_KINDS.includes(kind)) {
    const q = await enqueueJob(kind, user.name);
    redirect(`${back}${back.includes("?") ? "&" : "?"}is=${kind}&kuyruk=${q.created ? "yeni" : "var"}`);
  }
  after(async () => {
    const r = await runJob(kind, user.name);
    if (r.status === "ok") refreshPublic();
  });
  redirect(`${back}${back.includes("?") ? "&" : "?"}is=${kind}`);
}
