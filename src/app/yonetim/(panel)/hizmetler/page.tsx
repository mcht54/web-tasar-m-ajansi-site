import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Card, Notice, PageTitle, ScoreBadge, Table, inputCls } from "@/components/admin/ui";
import { updateServiceAction } from "../icerik-actions";
import { createPageAction } from "../sayfalar/actions";

export const metadata = { title: "Hizmetler" };

export default async function Services(props: PageProps<"/yonetim/hizmetler">) {
  const user = await requireUser("content");
  const sp = await props.searchParams;
  const [services, provinces] = await Promise.all([
    db.service.findMany({ orderBy: { sortOrder: "asc" }, include: { pages: { select: { id: true, path: true, type: true, status: true, seoScore: true } } } }),
    db.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const seo = can(user.role, "seo");
  return (
    <>
      <PageTitle title="Hizmetler" desc="Hizmet sayfaları ve şehir kombinasyonları. Kombinasyon sayfaları taslak olarak açılır; özgün içerik girilip hazırlık kontrolünden geçince yayınlanır." />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="space-y-4">
        {services.map((s) => {
          const main = s.pages.find((p) => p.type === "SERVICE");
          const combos = s.pages.filter((p) => p.type === "SERVICE_LOCATION");
          return (
            <Card key={s.id} title={<span>{s.name} <span className="font-normal text-muted">/{s.slug}</span></span>}
              actions={main && <Link href={`/yonetim/sayfalar/${main.id}`} className="text-xs underline">Sayfayı düzenle</Link>}>
              <div className="grid gap-6 lg:grid-cols-2">
                <form action={updateServiceAction} className="space-y-3">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="block text-[13px] font-medium">Kısa açıklama (ana sayfa kartı)
                    <input name="summary" defaultValue={s.summary ?? ""} className={inputCls} disabled={!seo} />
                  </label>
                  <div className="flex flex-wrap items-center gap-4 text-[13px]">
                    <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={s.active} disabled={!seo} /> Aktif</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="showInNav" defaultChecked={s.showInNav} disabled={!seo} /> Menüde göster</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="allowLocationPages" defaultChecked={s.allowLocationPages} disabled={!seo} /> Şehir sayfalarına izin ver</label>
                    <label className="flex items-center gap-2">Sıra <input name="sortOrder" type="number" defaultValue={s.sortOrder} className="w-16 rounded border border-line bg-paper px-2 py-1" disabled={!seo} /></label>
                  </div>
                  {seo && <button className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-semibold text-paper">Kaydet</button>}
                </form>
                <div>
                  {s.allowLocationPages && s.slug !== "web-tasarim" && (
                    <form action={createPageAction} className="mb-3 flex gap-2">
                      <input type="hidden" name="kind" value="service-location" />
                      <input type="hidden" name="serviceId" value={s.id} />
                      <input type="hidden" name="back" value="/yonetim/hizmetler" />
                      <select name="provinceId" className={`${inputCls} mt-0`} required>
                        {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button className="whitespace-nowrap rounded-full border border-line px-3 text-[13px]">+ Şehir sayfası</button>
                    </form>
                  )}
                  {s.slug === "web-tasarim" && <p className="mb-3 text-xs text-muted">İl ve ilçe sayfaları Lokasyonlar ekranından yönetilir.</p>}
                  <Table head={["Kombinasyon", "Durum", "SEO"]} empty="Kombinasyon sayfası yok.">
                    {combos.map((c) => (
                      <tr key={c.id}><td><Link href={`/yonetim/sayfalar/${c.id}`} className="hover:underline">{c.path}</Link></td><td>{c.status === "PUBLISHED" ? "Yayında" : "Taslak"}</td><td><ScoreBadge score={c.seoScore} /></td></tr>
                    ))}
                  </Table>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
