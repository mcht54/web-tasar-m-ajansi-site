import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, Notice, PageTitle, Table, fmtNum } from "@/components/admin/ui";
import { Sparkline } from "@/components/admin/Sparkline";
import { JobButton } from "@/components/admin/JobButton";

export const metadata = { title: "Sıralama Takibi" };
const DAY = 86400_000;

export default async function RankTracking() {
  await requireUser("seo");
  const latest = await db.rankSnapshot.findFirst({ where: { source: "GSC" }, orderBy: { date: "desc" } });
  const keywords = await db.keyword.findMany({ where: { status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { phrase: "asc" }] });
  const anchor = latest?.date ?? new Date();
  const since = new Date(anchor.getTime() - 90 * DAY);
  const snaps = await db.rankSnapshot.findMany({ where: { source: "GSC", date: { gte: since } }, orderBy: { date: "asc" } });
  const byKw = new Map<string, Map<string, number | null>>();
  for (const s of snaps) {
    const m = byKw.get(s.keywordId) ?? new Map();
    m.set(s.date.toISOString().slice(0, 10), s.position);
    byKw.set(s.keywordId, m);
  }
  const dayKey = (n: number) => new Date(anchor.getTime() - n * DAY).toISOString().slice(0, 10);
  const days90 = Array.from({ length: 90 }, (_, i) => dayKey(89 - i));
  const cell = (m: Map<string, number | null> | undefined, n: number) => {
    const v = m?.get(dayKey(n));
    return v != null ? fmtNum(v, 1) : <span className="text-muted">—</span>;
  };
  return (
    <>
      <PageTitle title="Sıralama Takibi" desc={latest ? `Son veri günü: ${anchor.toISOString().slice(0, 10)}. Pozisyon = Search Console'da o gün o sorgu için gösterim ağırlıklı ortalama. “—” o gün gösterim olmadığını gösterir.` : "Henüz sıralama verisi yok."}
        actions={<><JobButton kind="gsc-sync" back="/yonetim/siralama" /><JobButton kind="rank-update" back="/yonetim/siralama" /></>} />
      {!latest && <div className="mb-4"><Notice tone="warn">Sıralama verisi Search Console bağlantısından gelir. Bağlantı kurulunca her gün otomatik güncellenir (npm run job -- daily). Canlı SERP sağlayıcısı (ör. DataForSEO) bu sürümde bağlı değildir; bağlanmadan pozisyon tahmini gösterilmez.</Notice></div>}
      <Card>
        <Table head={["Kelime", "Bugün", "Dün", "7 gün önce", "30 gün önce", "90 gün önce", "Son 90 gün"]}>
          {keywords.map((k) => {
            const m = byKw.get(k.id);
            return (
              <tr key={k.id}>
                <td><Link href={`/yonetim/siralama/${k.id}`} className="font-medium hover:underline">{k.phrase}</Link></td>
                <td className="tabular-nums font-semibold">{cell(m, 0)}</td>
                <td className="tabular-nums">{cell(m, 1)}</td>
                <td className="tabular-nums">{cell(m, 7)}</td>
                <td className="tabular-nums">{cell(m, 30)}</td>
                <td className="tabular-nums">{cell(m, 90)}</td>
                <td><Sparkline points={days90.map((d) => ({ date: d, value: m?.get(d) ?? null }))} /></td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
