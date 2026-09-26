import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, Notice, PageTitle, Table, fmtNum } from "@/components/admin/ui";
import { RankChart } from "@/components/admin/Sparkline";
import { normalizeKeyword } from "@/lib/text/slug";

export const metadata = { title: "Sorgu trendi" };
const PERIODS = [[7, "7 gün"], [28, "28 gün"], [90, "3 ay"], [180, "6 ay"]] as const;

export default async function QueryTrend(props: PageProps<"/yonetim/search-console/sorgu">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const q = normalizeKeyword(typeof sp.q === "string" ? sp.q : "");
  const days = Number(sp.gun) || 90;
  const last = await db.gscQueryDaily.findFirst({ where: { query: q }, orderBy: { date: "desc" }, select: { date: true } });
  const end = last?.date ?? new Date();
  const start = new Date(end.getTime() - (days - 1) * 86400_000);
  const rows = q ? await db.gscQueryDaily.findMany({ where: { query: q, date: { gte: start, lte: end } }, orderBy: { date: "asc" } }) : [];
  const byDay = new Map<string, { c: number; i: number; w: number }>();
  const byPage = new Map<string, { c: number; i: number; w: number }>();
  for (const r of rows) {
    const k = r.date.toISOString().slice(0, 10);
    for (const [m, key] of [[byDay, k], [byPage, r.page]] as const) {
      const e = m.get(key) ?? { c: 0, i: 0, w: 0 };
      e.c += r.clicks; e.i += r.impressions; e.w += r.position * r.impressions;
      m.set(key, e);
    }
  }
  // Tüm günleri doldur: kayıt olmayan gün "veri yok"tur (0 değil)
  const daysList = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 86400_000).toISOString().slice(0, 10));
  const series = (f: (e: { c: number; i: number; w: number }) => number) => daysList.map((d) => ({ date: d, value: byDay.has(d) ? f(byDay.get(d)!) : null }));
  const tot = [...byDay.values()].reduce((a, e) => ({ c: a.c + e.c, i: a.i + e.i, w: a.w + e.w }), { c: 0, i: 0, w: 0 });
  return (
    <>
      <PageTitle title={q ? `“${q}”` : "Sorgu trendi"} desc="Search Console'dan günlük saklanan veri. Kaydı olmayan günler grafikte boş bırakılır (0 değil: o gün Google bu sorguda sitenizi göstermemiş veya veri gizlilik eşiğinin altında)."
        actions={<Link href="/yonetim/search-console" className="rounded-full border border-line px-4 py-2">← Search Console</Link>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Sorgu" className="rounded-full border border-line bg-card px-4 py-2" />
        {PERIODS.map(([d, l]) => <button key={d} name="gun" value={d} className={`rounded-full px-3 py-2 text-[13px] ${d === days ? "bg-ink text-paper" : "border border-line"}`}>{l}</button>)}
      </form>
      {!rows.length ? <Notice tone="warn">Henüz veri yok{q ? " (bu sorgu için seçilen dönemde Search Console kaydı yok)" : ""}.</Notice> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 text-[13px]">
            <Card><p className="text-muted">Gösterim</p><p className="text-2xl font-semibold">{fmtNum(tot.i)}</p></Card>
            <Card><p className="text-muted">Tıklama</p><p className="text-2xl font-semibold">{fmtNum(tot.c)}</p></Card>
            <Card><p className="text-muted">CTR</p><p className="text-2xl font-semibold">%{fmtNum(tot.i ? (tot.c / tot.i) * 100 : 0, 2)}</p></Card>
            <Card><p className="text-muted">Ort. pozisyon</p><p className="text-2xl font-semibold">{fmtNum(tot.i ? tot.w / tot.i : 0, 1)}</p></Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Pozisyon trendi (düşük daha iyi)"><RankChart points={series((e) => (e.i ? e.w / e.i : 0))} height={180} /></Card>
            <Card title="Gösterim trendi"><RankChart points={series((e) => e.i)} height={180} invert={false} /></Card>
            <Card title="Tıklama trendi"><RankChart points={series((e) => e.c)} height={180} invert={false} /></Card>
            <Card title="CTR trendi (%)"><RankChart points={series((e) => (e.i ? (e.c / e.i) * 100 : 0))} height={180} invert={false} /></Card>
          </div>
          <div className="mt-6">
            <Card title="Bu sorguda görünen sayfalar">
              <Table head={["Sayfa", "Gösterim", "Tıklama", "Ort. poz."]}>
                {[...byPage].sort((a, b) => b[1].i - a[1].i).map(([p, e]) => <tr key={p}><td className="text-xs">{p}</td><td>{fmtNum(e.i)}</td><td>{fmtNum(e.c)}</td><td>{fmtNum(e.i ? e.w / e.i : 0, 1)}</td></tr>)}
              </Table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
