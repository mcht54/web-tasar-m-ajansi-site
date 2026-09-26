import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, Notice, PageTitle, ScoreBadge, Table, inputCls } from "@/components/admin/ui";
import { updateLocationAction } from "../../icerik-actions";
import { createPageAction } from "../../sayfalar/actions";

export const metadata = { title: "İl" };

function brief(p: { name: string; region: string; districts: { name: string }[] }, neighbours: string[]) {
  // Yazara yol gösteren içerik brief'i — yalnızca sistemdeki olgusal veriden üretilir.
  return [
    `Sayfa: ${p.name} Web Tasarım · Ana kelime önerisi: “web tasarım ${p.name.toLocaleLowerCase("tr-TR")}”`,
    `Bölge: ${p.region} · ${p.districts.length} ilçe: ${p.districts.map((d) => d.name).join(", ")}`,
    `Yakın iller: ${neighbours.join(", ")}`,
    "Yazmadan önce toplanması gereken GERÇEK bilgiler (tahmin etmeyin):",
    "• İldeki öne çıkan sektörler ve işletme profili (sanayi, turizm, tarım, hizmet…)",
    "• Bu ilden gelen müşterilerinizin tipik ihtiyaçları ve sık sorduğu sorular",
    "• Bu ilde yaptığınız gerçek, izinli çalışmalar (varsa)",
    "• Yüz yüze görüşme / uzaktan çalışma bilgisi — gerçekte nasılsa",
    "Önerilen bölümler: il işletmeleri için yaklaşım · il için dikkat edilecekler · hizmetler · ilçeler · sektörler · SSS",
    "Kaçının: diğer illerin metnini şehir adı değiştirerek kullanmak (sistem %55+ benzerliği otomatik NOINDEX yapar).",
  ].join("\n");
}

export default async function ProvinceDetail(props: PageProps<"/yonetim/lokasyonlar/[id]">) {
  await requireUser("content");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const province = await db.province.findUnique({
    where: { id: Number(id) },
    include: { districts: { orderBy: { name: "asc" } }, sectors: true },
  });
  if (!province) notFound();
  const [pages, sectors, services, all] = await Promise.all([
    db.page.findMany({ where: { provinceId: province.id }, orderBy: { path: "asc" }, select: { id: true, path: true, type: true, status: true, seoScore: true, districtId: true, body: true, autoNoindex: true } }),
    db.sector.findMany({ orderBy: { sortOrder: "asc" } }),
    db.service.findMany({ where: { allowLocationPages: true, slug: { not: "web-tasarim" } }, orderBy: { sortOrder: "asc" } }),
    db.province.findMany({ select: { name: true, lat: true, lng: true } }),
  ]);
  const neighbours = all
    .filter((p) => p.name !== province.name && p.lat != null && province.lat != null)
    .sort((a, b) => (a.lat! - province.lat!) ** 2 + (a.lng! - province.lng!) ** 2 - ((b.lat! - province.lat!) ** 2 + (b.lng! - province.lng!) ** 2))
    .slice(0, 5)
    .map((p) => p.name);
  const city = pages.find((p) => p.type === "CITY");
  const districtPage = new Map(pages.filter((p) => p.type === "DISTRICT").map((p) => [p.districtId, p]));
  const status = (p?: { status: string; body: string | null; autoNoindex: boolean }) =>
    !p ? "—" : p.status === "PUBLISHED" ? <Badge tone={p.autoNoindex ? "warn" : "ok"}>{p.autoNoindex ? "Oto NOINDEX" : "Yayında"}</Badge> : p.body?.trim() ? <Badge tone="info">Taslak</Badge> : <Badge>İçerik yok</Badge>;
  const back = `/yonetim/lokasyonlar/${province.id}`;
  return (
    <>
      <PageTitle title={`${String(province.id).padStart(2, "0")} · ${province.name}`} desc={`${province.region} Bölgesi · ${province.districts.length} ilçe · Koordinat: ${province.lat?.toFixed(3)}, ${province.lng?.toFixed(3)} · Yüzölçümü: ${province.areaKm2?.toLocaleString("tr-TR") ?? "?"} km²`}
        actions={city && <Link href={`/yonetim/sayfalar/${city.id}`} className="rounded-full bg-ink px-4 py-2 text-paper">İl sayfasını düzenle</Link>} />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Yerel bilgiler (gerçek veri)">
          <form action={updateLocationAction} className="space-y-3">
            <input type="hidden" name="kind" value="province" /><input type="hidden" name="id" value={province.id} /><input type="hidden" name="back" value={back} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[13px] font-medium">Nüfus<input name="population" defaultValue={province.population ?? ""} className={inputCls} placeholder="Doğrulanamadı" /></label>
              <label className="text-[13px] font-medium">Nüfus yılı (kaynak: TÜİK ADNKS)<input name="populationYear" defaultValue={province.populationYear ?? ""} className={inputCls} /></label>
            </div>
            <label className="block text-[13px] font-medium">İşletme profili ve yerel notlar
              <textarea name="localNotes" defaultValue={province.localNotes ?? ""} rows={6} className={inputCls} placeholder="Yalnızca doğrulanmış bilgi: öne çıkan sektörler, OSB'ler, müşteri profiliniz…" />
            </label>
            <fieldset>
              <legend className="text-[13px] font-medium">İlgili sektörler</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {sectors.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="sectorIds" value={s.id} defaultChecked={province.sectors.some((x) => x.id === s.id)} /> {s.name}</label>
                ))}
              </div>
            </fieldset>
            <button className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-semibold text-paper">Kaydet</button>
          </form>
        </Card>
        <Card title="İçerik brief'i (yazar için)">
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-soft">{brief(province, neighbours)}</pre>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Kombinasyon sayfaları">
          <div className="mb-3 flex flex-wrap gap-2">
            <form action={createPageAction} className="flex gap-2">
              <input type="hidden" name="kind" value="service-location" /><input type="hidden" name="provinceId" value={province.id} /><input type="hidden" name="back" value={back} />
              <select name="serviceId" className={`${inputCls} mt-0`}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <button className="whitespace-nowrap rounded-full border border-line px-3 text-[13px]">+ Hizmet</button>
            </form>
            <form action={createPageAction} className="flex gap-2">
              <input type="hidden" name="kind" value="sector-location" /><input type="hidden" name="provinceId" value={province.id} /><input type="hidden" name="back" value={back} />
              <select name="sectorId" className={`${inputCls} mt-0`}>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <button className="whitespace-nowrap rounded-full border border-line px-3 text-[13px]">+ Sektör</button>
            </form>
          </div>
          <Table head={["Sayfa", "Durum", "SEO"]} empty="Kombinasyon sayfası yok.">
            {pages.filter((p) => p.type === "CITY" || p.type === "SERVICE_LOCATION" || p.type === "SECTOR_LOCATION").map((p) => (
              <tr key={p.id}><td><Link href={`/yonetim/sayfalar/${p.id}`} className="hover:underline">{p.path}</Link></td><td>{status(p)}</td><td><ScoreBadge score={p.seoScore} /></td></tr>
            ))}
          </Table>
        </Card>
        <Card title={`İlçeler (${province.districts.length})`}>
          <Table head={["İlçe", "Sayfa", "SEO", ""]}>
            {province.districts.map((d) => {
              const p = districtPage.get(d.id);
              return (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{status(p)}</td>
                  <td><ScoreBadge score={p?.seoScore} /></td>
                  <td>{p && <Link href={`/yonetim/sayfalar/${p.id}`} className="text-xs underline">Düzenle</Link>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </>
  );
}
