import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { siteUrl } from "@/lib/env";
import { Card, Notice, PageTitle, SeverityBadge, Table, daysAgo, fmtDate, fmtNum } from "@/components/admin/ui";
import { FixButton } from "@/components/admin/FixButton";
import { RankChart } from "@/components/admin/Sparkline";
import { LEVEL_LABEL, type Level } from "@/lib/seo/priority";
import { taskStatusAction } from "../../seo-actions";

export const metadata = { title: "Fırsat detayı" };

export default async function TaskDetail(props: PageProps<"/yonetim/firsatlar/[id]">) {
  await requireUser("seo");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = await db.seoTask.findUnique({ where: { id }, include: { page: { select: { id: true, path: true, seoScore: true, contentScore: true, status: true } }, keyword: true } });
  if (!t) notFound();
  const data = (t.data ?? {}) as { query?: string; category?: string; pages?: { page: string; impressions: number; share: number; position: number }[] };
  const query = data.query ?? t.keyword?.normalized ?? null;
  const [history, pageQueries] = await Promise.all([
    query ? db.gscQueryDaily.groupBy({ by: ["date"], where: { query }, _sum: { impressions: true, clicks: true }, orderBy: { date: "asc" } }) : [],
    t.page ? db.gscQueryDaily.groupBy({
      by: ["query"], where: { page: t.page.path === "/" ? `${siteUrl()}/` : siteUrl() + t.page.path, date: { gte: daysAgo(28) } },
      _sum: { impressions: true, clicks: true }, orderBy: { _sum: { impressions: "desc" } }, take: 10,
    }) : [],
  ]);
  const posHistory = query ? await db.gscQueryDaily.findMany({ where: { query }, select: { date: true, position: true, impressions: true }, orderBy: { date: "asc" } }) : [];
  const byDay = new Map<string, { w: number; i: number }>();
  for (const r of posHistory) {
    const k = r.date.toISOString().slice(0, 10);
    const e = byDay.get(k) ?? { w: 0, i: 0 };
    e.w += r.position * r.impressions; e.i += r.impressions;
    byDay.set(k, e);
  }
  const back = `/yonetim/firsatlar/${t.id}`;
  return (
    <>
      <PageTitle title={t.title} desc={<span className="flex flex-wrap items-center gap-2"><SeverityBadge s={t.severity} /> Etki {LEVEL_LABEL[t.impact as Level]} · Zorluk {LEVEL_LABEL[t.difficulty as Level]} · Öncelik {t.priority} · ilk görülme {fmtDate(t.firstSeenAt)}</span>}
        actions={<div className="flex gap-2"><FixButton pageId={t.pageId} query={query} category={data.category ?? t.code} back={back} /><Link href="/yonetim/firsatlar" className="rounded-full border border-line px-4 py-2">← Fırsatlar</Link></div>} />
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Neden?">
          <p className="whitespace-pre-line text-[13px]">{t.reason}</p>
          <p className="mt-4 font-semibold">Önerilen çözüm</p>
          <p className="whitespace-pre-line text-[13px]">{t.solution}</p>
          {t.page && <p className="mt-4 text-[13px]">İlgili sayfa: <Link href={`/yonetim/sayfalar/${t.page.id}`} className="underline">{t.page.path}</Link> · SEO {t.page.seoScore ?? "—"} · içerik {t.page.contentScore ?? "—"}</p>}
          <div className="mt-4 flex gap-2">
            {(["DONE", "DISMISSED"] as const).map((st) => (
              <form key={st} action={taskStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={st} /><input type="hidden" name="back" value="/yonetim/firsatlar" />
                <button className="rounded-full border border-line px-3 py-1 text-xs">{st === "DONE" ? "Tamamlandı" : "Yok say"}</button></form>
            ))}
          </div>
        </Card>
        <Card title={query ? `“${query}” — Search Console geçmişi` : "Search Console geçmişi"}>
          {query && history.length ? (
            <>
              <RankChart points={[...byDay].map(([date, e]) => ({ date, value: e.i ? e.w / e.i : null }))} height={180} />
              <p className="mt-2 text-xs text-muted">Pozisyon (düşük daha iyi). Toplam: {fmtNum(history.reduce((s, h) => s + (h._sum.impressions ?? 0), 0))} gösterim, {fmtNum(history.reduce((s, h) => s + (h._sum.clicks ?? 0), 0))} tıklama.</p>
            </>
          ) : <p className="text-muted">{query ? "Henüz veri yok." : "Bu fırsat bir sorguya bağlı değil."}</p>}
          {data.pages && data.pages.length > 1 && (
            <Table head={["Sıralanan URL", "Gösterim", "Pay", "Poz."]}>
              {data.pages.map((p) => <tr key={p.page}><td className="text-xs">{p.page}</td><td>{fmtNum(p.impressions)}</td><td>%{Math.round(p.share * 100)}</td><td>{fmtNum(p.position, 1)}</td></tr>)}
            </Table>
          )}
        </Card>
        {t.page && (
          <Card title="Bu sayfaya gelen sorgular (28 gün)">
            <Table head={["Sorgu", "Gösterim", "Tıklama"]} empty="Henüz veri yok.">
              {pageQueries.map((q) => <tr key={q.query}><td><Link href={`/yonetim/search-console/sorgu?q=${encodeURIComponent(q.query)}`} className="hover:underline">{q.query}</Link></td><td>{fmtNum(q._sum.impressions)}</td><td>{fmtNum(q._sum.clicks)}</td></tr>)}
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
