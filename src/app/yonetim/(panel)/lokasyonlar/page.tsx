import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, PageTitle, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Lokasyonlar" };

export default async function Locations(props: PageProps<"/yonetim/lokasyonlar">) {
  await requireUser("content");
  const sp = await props.searchParams;
  const region = typeof sp.bolge === "string" ? sp.bolge : "";
  const [provinces, cityPages, districtStats] = await Promise.all([
    db.province.findMany({ where: region ? { region } : {}, orderBy: { id: "asc" }, include: { _count: { select: { districts: true } } } }),
    db.page.findMany({ where: { type: "CITY" }, select: { provinceId: true, status: true, body: true, seoScore: true, autoNoindex: true } }),
    db.page.groupBy({ by: ["provinceId", "status"], where: { type: { in: ["DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"] } }, _count: true }),
  ]);
  const regions = (await db.province.findMany({ distinct: ["region"], select: { region: true } })).map((r) => r.region).sort();
  const city = new Map(cityPages.map((c) => [c.provinceId, c]));
  const pub = new Map<number, number>();
  for (const d of districtStats) if (d.status === "PUBLISHED" && d.provinceId) pub.set(d.provinceId, (pub.get(d.provinceId) ?? 0) + d._count);
  const publishedCities = cityPages.filter((c) => c.status === "PUBLISHED").length;
  const withContent = cityPages.filter((c) => c.body?.trim()).length;
  return (
    <>
      <PageTitle title="Lokasyonlar" desc={`81 il · ${publishedCities} il sayfası yayında · ${withContent} il sayfasında içerik var. İçeriksiz sayfalar ziyaretçiye 404 döner ve sitemap'e girmez.`} />
      <Card>
        <form className="mb-4 flex gap-2">
          <select name="bolge" defaultValue={region} className={`${inputCls} mt-0 max-w-xs`}>
            <option value="">Tüm bölgeler</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button className="rounded-full bg-ink px-4 text-paper">Filtrele</button>
        </form>
        <Table head={["Plaka", "İl", "Bölge", "İlçe", "Nüfus", "İl sayfası", "Yayındaki alt sayfa"]}>
          {provinces.map((p) => {
            const c = city.get(p.id);
            return (
              <tr key={p.id}>
                <td className="tabular-nums">{String(p.id).padStart(2, "0")}</td>
                <td><Link href={`/yonetim/lokasyonlar/${p.id}`} className="font-medium hover:underline">{p.name}</Link></td>
                <td>{p.region}</td>
                <td>{p._count.districts}</td>
                <td className="tabular-nums">{p.population ? `${p.population.toLocaleString("tr-TR")} (${p.populationYear ?? "?"})` : <span className="text-muted">Doğrulanamadı</span>}</td>
                <td>{!c ? "—" : c.status === "PUBLISHED" ? <Badge tone={c.autoNoindex ? "warn" : "ok"}>{c.autoNoindex ? "Yayında · oto NOINDEX" : "Yayında"}</Badge> : c.body?.trim() ? <Badge tone="info">Taslak · içerik var</Badge> : <Badge>İçerik yok</Badge>}</td>
                <td>{pub.get(p.id) ?? 0}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
