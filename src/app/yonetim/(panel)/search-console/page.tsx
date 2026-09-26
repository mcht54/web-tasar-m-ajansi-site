import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { gscConnected } from "@/lib/gsc/sync";
import { gscPeriod, type Totals } from "@/lib/admin/dashboard";
import { Badge, Card, Notice, PageTitle, Table, fmtDate, fmtNum } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";

export const metadata = { title: "Search Console" };
const DAY = 86400_000;

function Row({ label, p }: { label: string; p: { current: Totals; previous: Totals } | null }) {
  if (!p) return <tr><td>{label}</td><td colSpan={4} className="text-muted">Henüz veri yok</td></tr>;
  const d = (a: number | null, b: number | null, f: (n: number) => string, inv = false) => {
    if (a == null || b == null) return "";
    const x = a - b;
    if (Math.abs(x) < 1e-9) return "";
    return <span className={`ml-1 text-xs ${(inv ? x < 0 : x > 0) ? "text-ok" : "text-bad"}`}>({x > 0 ? "+" : "−"}{f(Math.abs(x))})</span>;
  };
  const c = p.current, v = p.previous;
  return (
    <tr>
      <td className="font-medium">{label}</td>
      <td>{fmtNum(c.clicks)}{d(c.clicks, v.clicks, (n) => fmtNum(n))}</td>
      <td>{fmtNum(c.impressions)}{d(c.impressions, v.impressions, (n) => fmtNum(n))}</td>
      <td>{c.ctr != null ? `%${fmtNum(c.ctr * 100, 1)}` : "—"}{d(c.ctr, v.ctr, (n) => `${fmtNum(n * 100, 1)} puan`)}</td>
      <td>{c.position != null ? fmtNum(c.position, 1) : "—"}{d(c.position, v.position, (n) => fmtNum(n, 1), true)}</td>
    </tr>
  );
}

export default async function SearchConsole() {
  await requireUser("seo");
  const [settings, connected] = await Promise.all([getSettingsFresh(), gscConnected()]);
  const [p7, p28, p90, last] = await Promise.all([gscPeriod(7), gscPeriod(28), gscPeriod(90), db.gscDailyTotal.findFirst({ orderBy: { date: "desc" } })]);
  const end = last?.date ?? new Date();
  const since = new Date(end.getTime() - 27 * DAY);
  const prevSince = new Date(since.getTime() - 28 * DAY);
  const [topPages, topQueries, cur, prev, index] = await Promise.all([
    db.gscPageDaily.groupBy({ by: ["page"], where: { date: { gte: since } }, _sum: { clicks: true, impressions: true }, orderBy: { _sum: { clicks: "desc" } }, take: 15 }),
    db.gscQueryDaily.groupBy({ by: ["query"], where: { date: { gte: since } }, _sum: { clicks: true, impressions: true }, orderBy: { _sum: { clicks: "desc" } }, take: 15 }),
    db.gscQueryDaily.findMany({ where: { date: { gte: since } }, select: { query: true, position: true, impressions: true } }),
    db.gscQueryDaily.findMany({ where: { date: { gte: prevSince, lt: since } }, select: { query: true, position: true, impressions: true } }),
    db.gscIndexStatus.findMany({ orderBy: { checkedAt: "desc" } }),
  ]);
  const avgPos = (rows: typeof cur) => {
    const m = new Map<string, { w: number; i: number }>();
    for (const r of rows) {
      const e = m.get(r.query) ?? { w: 0, i: 0 };
      e.w += r.position * r.impressions;
      e.i += r.impressions;
      m.set(r.query, e);
    }
    return m;
  };
  const a = avgPos(cur), b = avgPos(prev);
  const falling = [...a]
    .filter(([q, e]) => e.i >= 20 && (b.get(q)?.i ?? 0) >= 20)
    .map(([q, e]) => ({ q, now: e.w / e.i, before: b.get(q)!.w / b.get(q)!.i, imp: e.i }))
    .filter((x) => x.now - x.before >= 2)
    .sort((x, y) => y.now - y.before - (x.now - x.before))
    .slice(0, 15);
  const [devices, countries] = await Promise.all([
    db.gscDimDaily.groupBy({ by: ["value"], where: { dimension: "device", date: { gte: since } }, _sum: { clicks: true, impressions: true }, orderBy: { _sum: { impressions: "desc" } } }),
    db.gscDimDaily.groupBy({ by: ["value"], where: { dimension: "country", date: { gte: since } }, _sum: { clicks: true, impressions: true }, orderBy: { _sum: { impressions: "desc" } }, take: 10 }),
  ]);
  const rising = [...a]
    .filter(([q, e]) => e.i >= 10 && (!b.get(q) || e.i >= (b.get(q)!.i) * 2))
    .map(([q, e]) => ({ q, now: e.i, before: b.get(q)?.i ?? 0 }))
    .sort((x, y) => y.now - x.now)
    .slice(0, 15);
  const coverage = new Map<string, number>();
  for (const s of index) coverage.set(s.coverageState ?? s.verdict ?? "Bilinmiyor", (coverage.get(s.coverageState ?? s.verdict ?? "Bilinmiyor") ?? 0) + 1);
  const ok = connected && settings.integrations.gscProperty;
  return (
    <>
      <PageTitle title="Google Search Console" desc={ok ? `Mülk: ${settings.integrations.gscProperty}${last ? ` · son veri günü ${fmtDate(last.date)}` : ""}` : "Bağlantı kurulmadı."}
        actions={ok ? <><JobButton kind="gsc-sync" back="/yonetim/search-console" /><JobButton kind="index-inspect" back="/yonetim/search-console" /></> : undefined} />
      {!ok && (
        <div className="mb-4"><Notice tone="warn">
          Bağlanmak için: (1) Google Cloud&apos;da bir servis hesabı oluşturup Search Console API&apos;yi etkinleştirin, (2) JSON anahtarını indirin, (3) servis hesabının e-postasını Search Console&apos;da mülke &quot;Kullanıcı&quot; olarak ekleyin, (4) <Link href="/yonetim/ayarlar?sekme=entegrasyon" className="underline">Ayarlar &gt; SEO Entegrasyonları</Link>&apos;na JSON&apos;u ve mülk adresini girin.
        </Notice></div>
      )}
      <Card title="Toplamlar (verinin son gününden geriye; parantez: önceki eşit döneme göre)">
        <Table head={["Dönem", "Tıklama", "Gösterim", "CTR", "Ort. pozisyon"]}>
          <Row label="Son 7 gün" p={p7} />
          <Row label="Son 28 gün" p={p28} />
          <Row label="Son 3 ay" p={p90} />
        </Table>
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="En çok trafik getiren sayfalar (28 gün)">
          <Table head={["Sayfa", "Tıklama", "Gösterim"]} empty="Veri yok.">
            {topPages.map((r) => <tr key={r.page}><td className="max-w-md truncate text-xs">{r.page}</td><td>{fmtNum(r._sum.clicks)}</td><td>{fmtNum(r._sum.impressions)}</td></tr>)}
          </Table>
        </Card>
        <Card title="En çok trafik getiren sorgular (28 gün)">
          <Table head={["Sorgu", "Tıklama", "Gösterim"]} empty="Veri yok.">
            {topQueries.map((r) => <tr key={r.query}><td><Link href={`/yonetim/search-console/sorgu?q=${encodeURIComponent(r.query)}`} className="hover:underline">{r.query}</Link></td><td>{fmtNum(r._sum.clicks)}</td><td>{fmtNum(r._sum.impressions)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Düşen sorgular (son 28 gün vs önceki 28 gün)">
          <Table head={["Sorgu", "Önce", "Şimdi", "Gösterim"]} empty="Belirgin düşüş yok veya veri yetersiz.">
            {falling.map((f) => <tr key={f.q}><td><Link href={`/yonetim/search-console/sorgu?q=${encodeURIComponent(f.q)}`} className="hover:underline">{f.q}</Link></td><td>{fmtNum(f.before, 1)}</td><td className="text-bad">{fmtNum(f.now, 1)}</td><td>{fmtNum(f.imp)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Yükselen sorgular (gösterim önceki 28 günün en az 2 katı)">
          <Table head={["Sorgu", "Önce", "Şimdi"]} empty="Henüz veri yok veya yükselen sorgu yok.">
            {rising.map((r) => <tr key={r.q}><td><Link href={`/yonetim/search-console/sorgu?q=${encodeURIComponent(r.q)}`} className="hover:underline">{r.q}</Link></td><td>{r.before ? fmtNum(r.before) : "kayıt yok"}</td><td className="text-ok">{fmtNum(r.now)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Cihaz ve ülke (28 gün)">
          <Table head={["Cihaz", "Tıklama", "Gösterim"]} empty="Henüz veri yok.">
            {devices.map((d) => <tr key={d.value}><td>{({ MOBILE: "Mobil", DESKTOP: "Masaüstü", TABLET: "Tablet" } as Record<string, string>)[d.value] ?? d.value}</td><td>{fmtNum(d._sum.clicks)}</td><td>{fmtNum(d._sum.impressions)}</td></tr>)}
          </Table>
          <div className="mt-4" />
          <Table head={["Ülke (ISO)", "Tıklama", "Gösterim"]} empty="Henüz veri yok.">
            {countries.map((d) => <tr key={d.value}><td className="uppercase">{d.value}</td><td>{fmtNum(d._sum.clicks)}</td><td>{fmtNum(d._sum.impressions)}</td></tr>)}
          </Table>
        </Card>
        <Card title="İndeks durumu (URL Inspection)">
          {index.length ? (
            <>
              <ul className="mb-3 flex flex-wrap gap-2">{[...coverage].map(([k, v]) => <li key={k}><Badge tone={/indexed$/i.test(k) && !/not/i.test(k) ? "ok" : "warn"}>{k}: {v}</Badge></li>)}</ul>
              <Table head={["URL", "Durum", "Son tarama", "Kontrol"]}>
                {index.slice(0, 50).map((s) => <tr key={s.url}><td className="max-w-xs truncate text-xs">{s.url}</td><td>{s.coverageState ?? s.verdict}</td><td>{fmtDate(s.lastCrawlTime)}</td><td>{fmtDate(s.checkedAt)}</td></tr>)}
              </Table>
            </>
          ) : <p className="text-muted">Henüz kontrol yapılmadı. Durumlar Google&apos;ın döndürdüğü şekliyle (Indexed, Crawled - currently not indexed, Discovered - currently not indexed…) listelenir.</p>}
        </Card>
      </div>
    </>
  );
}
