import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, Notice, PageTitle, Table, daysAgo, fmtDate, fmtNum, inputCls } from "@/components/admin/ui";
import { RankChart } from "@/components/admin/Sparkline";
import { INTENT_LABELS } from "@/lib/admin/labels";
import { manualRankAction } from "../../seo-actions";

export const metadata = { title: "Anahtar kelime" };

export default async function KeywordDetail(props: PageProps<"/yonetim/siralama/[id]">) {
  await requireUser("seo");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const k = await db.keyword.findUnique({ where: { id }, include: { targetPage: { select: { id: true, path: true } } } });
  if (!k) notFound();
  const snaps = await db.rankSnapshot.findMany({ where: { keywordId: id }, orderBy: { date: "asc" } });
  const gsc = snaps.filter((s) => s.source === "GSC");
  const pagesForQuery = await db.gscQueryDaily.groupBy({
    by: ["page"], where: { query: k.normalized, date: { gte: daysAgo(28) } },
    _sum: { impressions: true, clicks: true }, orderBy: { _sum: { impressions: "desc" } },
  });
  return (
    <>
      <PageTitle title={`“${k.phrase}”`} desc={`${INTENT_LABELS[k.intent]} · öncelik ${k.priority} · hedef ${k.targetPosition ?? "—"}`} actions={<Link href="/yonetim/siralama" className="rounded-full border border-line px-4 py-2">← Sıralama</Link>} />
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <Card title="Pozisyon değişimi (Search Console)">
        <RankChart points={gsc.map((s) => ({ date: s.date.toISOString().slice(0, 10), value: s.position }))} />
        {gsc.length > 1 && (
          <p className="mt-2 text-[13px] text-muted">
            {gsc.filter((s) => s.position != null).slice(-8).map((s) => fmtNum(s.position!, 0)).join(" → ")}
          </p>
        )}
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Bu sorgu için sıralanan sayfalar (28 gün)">
          <p className="mb-2 text-xs text-muted">Hedef URL: {k.targetPage?.path ?? "tanımsız"}. Birden fazla sayfa gösterim alıyorsa cannibalization riski vardır.</p>
          <Table head={["Sayfa", "Gösterim", "Tıklama"]} empty="Search Console verisi yok.">
            {pagesForQuery.map((r) => <tr key={r.page}><td className="text-xs">{r.page}</td><td>{fmtNum(r._sum.impressions)}</td><td>{fmtNum(r._sum.clicks)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Manuel kontrol kaydı">
          <form action={manualRankAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="keywordId" value={k.id} />
            <input name="position" type="number" min={1} max={200} required placeholder="Pozisyon" className={`${inputCls} mt-0 w-28`} />
            <input name="url" placeholder="Görünen URL" className={`${inputCls} mt-0 flex-1`} />
            <button className="rounded-full bg-ink px-4 text-paper">Kaydet</button>
          </form>
          <p className="mt-2 text-xs text-muted">Gizli pencerede, konum ayarı belirtilerek yapılan elle kontroller için. Otomatik veriden ayrı saklanır.</p>
          <Table head={["Tarih", "Kaynak", "Pozisyon", "Tıklama", "Gösterim", "URL"]}>
            {[...snaps].reverse().slice(0, 30).map((s) => (
              <tr key={s.id}><td>{fmtDate(s.date)}</td><td>{s.source === "GSC" ? "Search Console" : s.source === "MANUAL" ? "Manuel" : "SERP"}</td><td>{s.position != null ? fmtNum(s.position, 1) : "—"}</td><td>{s.clicks}</td><td>{s.impressions}</td><td className="max-w-40 truncate text-xs">{s.url ?? "—"}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
