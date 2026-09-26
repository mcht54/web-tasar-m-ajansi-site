import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { Badge, Card, PageTitle, Stat, Table } from "@/components/admin/ui";
import { PAGE_TYPE_LABELS } from "@/lib/admin/labels";

export const metadata = { title: "Web Sitesi" };

export default async function Website() {
  await requireUser();
  const [settings, groups, noindex] = await Promise.all([
    getSettingsFresh(),
    db.page.groupBy({ by: ["type", "status"], _count: true }),
    db.page.count({ where: { status: "PUBLISHED", OR: [{ robotsIndex: false }, { autoNoindex: true }] } }),
  ]);
  const types = Object.keys(PAGE_TYPE_LABELS);
  const count = (t: string, s: string) => groups.find((g) => g.type === t && g.status === s)?._count ?? 0;
  const published = groups.filter((g) => g.status === "PUBLISHED").reduce((s, g) => s + g._count, 0);
  const b = settings.business;
  return (
    <>
      <PageTitle title="Web Sitesi" desc={<>Kanonik adres: <a href={siteUrl()} target="_blank" className="underline">{siteUrl()}</a> (SITE_URL ortam değişkeni)</>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Yayındaki sayfa" value={published} />
        <Stat label="Yayında ama NOINDEX" value={noindex} tone={noindex ? "warn" : undefined} />
        <Stat label="Site indeksleme" value={settings.seo.allowIndexing ? "Açık" : "KAPALI"} tone={settings.seo.allowIndexing ? "ok" : "bad"} />
        <Stat label="İşletme bilgisi (schema)" value={b.name && b.phone && b.street && b.city ? "Tam" : "Eksik"} tone={b.name && b.phone && b.street && b.city ? "ok" : "warn"} hint="Eksikse LocalBusiness üretilmez" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Sayfa türleri">
          <Table head={["Tür", "Yayında", "Taslak", "Arşiv"]}>
            {types.map((t) => (
              <tr key={t}><td><Link href={`/yonetim/sayfalar?tur=${t}`} className="hover:underline">{PAGE_TYPE_LABELS[t]}</Link></td><td>{count(t, "PUBLISHED")}</td><td>{count(t, "DRAFT")}</td><td>{count(t, "ARCHIVED")}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Teknik dosyalar">
          <ul className="space-y-2">
            {["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-services.xml", "/sitemap-locations.xml", "/sitemap-blog.xml", "/robots.txt"].map((f) => (
              <li key={f} className="flex items-center justify-between"><a href={f} target="_blank" className="underline">{f}</a><Badge tone="ok">otomatik</Badge></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Sitemap yalnızca yayında, INDEX ve kendi canonical&apos;ına sahip sayfaları içerir. Ayrıntı: <Link href="/yonetim/sitemap" className="underline">Sitemap ekranı</Link>.</p>
        </Card>
      </div>
    </>
  );
}
