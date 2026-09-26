import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import { Card, PageTitle, SeverityBadge, fmtDate } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";
import { LEVEL_LABEL, type Level } from "@/lib/seo/priority";
import { taskStatusAction } from "../seo-actions";
import { FixButton } from "@/components/admin/FixButton";

export const metadata = { title: "SEO Fırsatları" };

export default async function Opportunities(props: PageProps<"/yonetim/firsatlar">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const status = (typeof sp.durum === "string" ? sp.durum : "OPEN") as "OPEN" | "DONE" | "DISMISSED";
  const sev = typeof sp.onem === "string" ? sp.onem : "";
  const where: Prisma.SeoTaskWhereInput = { status, ...(sev ? { severity: sev as "CRITICAL" } : {}) };
  const [tasks, counts] = await Promise.all([
    db.seoTask.findMany({ where, orderBy: [{ priority: "desc" }, { lastSeenAt: "desc" }], take: 300, include: { keyword: { select: { phrase: true } }, page: { select: { id: true } } } }),
    db.seoTask.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const back = `/yonetim/firsatlar?durum=${status}${sev ? `&onem=${sev}` : ""}`;
  const tab = (s: string, l: string) => (
    <Link href={`?durum=${s}`} className={`rounded-full px-3 py-1.5 ${status === s ? "bg-ink text-paper" : "border border-line"}`}>{l} ({count(s)})</Link>
  );
  return (
    <>
      <PageTitle title="SEO Fırsatları" desc="Her gün analiz, tarama, iç link, cannibalization ve Search Console verisinden üretilir. Sorun ortadan kalkınca görev otomatik kapanır." actions={<JobButton kind="opportunities" back="/yonetim/firsatlar" />} />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {tab("OPEN", "Açık")}{tab("DONE", "Tamamlanan")}{tab("DISMISSED", "Yok sayılan")}
        <span className="mx-2 text-line">|</span>
        {["", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
          <Link key={s} href={`?durum=${status}${s ? `&onem=${s}` : ""}`} className={`rounded-full px-3 py-1.5 ${sev === s ? "bg-accent text-accent-ink" : "border border-line"}`}>{s ? { CRITICAL: "Kritik", HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" }[s] : "Tüm önem"}</Link>
        ))}
      </div>
      <div className="space-y-3">
        {typeof sp.hata === "string" && <Card><p className="text-bad">{sp.hata}</p></Card>}
      {tasks.length === 0 && <Card><p className="text-muted">Bu filtrede görev yok.</p></Card>}
        {tasks.map((t) => (
          <Card key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge s={t.severity} />
                  <h2 className="font-semibold"><Link href={`/yonetim/firsatlar/${t.id}`} className="hover:underline">{t.title}</Link></h2>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[110px_1fr]">
                  <dt className="text-muted">Sebep</dt><dd className="whitespace-pre-line">{t.reason}</dd>
                  <dt className="text-muted">Önerilen çözüm</dt><dd className="whitespace-pre-line">{t.solution}</dd>
                  {t.url && <><dt className="text-muted">İlgili URL</dt><dd>{t.page ? <Link href={`/yonetim/sayfalar/${t.page.id}`} className="underline">{t.url}</Link> : t.url}</dd></>}
                  {t.keyword && <><dt className="text-muted">İlgili keyword</dt><dd>{t.keyword.phrase}</dd></>}
                </dl>
              </div>
              <div className="w-44 shrink-0 text-[13px]">
                <p>Etki: <b>{LEVEL_LABEL[t.impact as Level]}</b></p>
                <p>Zorluk: <b>{LEVEL_LABEL[t.difficulty as Level]}</b></p>
                <p>Öncelik: <b>{t.priority}</b></p>
                <p className="mt-1 text-xs text-muted">İlk: {fmtDate(t.firstSeenAt)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href={`/yonetim/firsatlar/${t.id}`} className="rounded-full border border-line px-3 py-1 text-xs">DETAY</Link>
                  {t.pageId && <FixButton small pageId={t.pageId} query={(t.data as { query?: string } | null)?.query ?? null} category={t.code} back={back} />}
                  {t.status !== "DONE" && <form action={taskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="DONE" /><input type="hidden" name="back" value={back} /><button className="rounded-full bg-ink px-3 py-1 text-xs text-paper">Tamamlandı</button></form>}
                  {t.status === "OPEN" && <form action={taskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="DISMISSED" /><input type="hidden" name="back" value={back} /><button className="rounded-full border border-line px-3 py-1 text-xs">Yok say</button></form>}
                  {t.status !== "OPEN" && <form action={taskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="OPEN" /><input type="hidden" name="back" value={back} /><button className="rounded-full border border-line px-3 py-1 text-xs">Yeniden aç</button></form>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
