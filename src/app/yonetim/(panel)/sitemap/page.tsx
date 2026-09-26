import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { isSelfCanonical, resolveRobots } from "@/lib/seo/meta";
import { SITEMAP_GROUPS, indexableEntries } from "@/lib/seo/sitemap";
import { JobButton } from "@/components/admin/JobButton";
import { Badge, Card, PageTitle, Table, fmtDate } from "@/components/admin/ui";

export const metadata = { title: "Sitemap" };

export default async function SitemapScreen() {
  await requireUser("seo");
  const settings = await getSettingsFresh();
  const base = siteUrl();
  const pages = await db.page.findMany({
    where: { OR: [{ status: "PUBLISHED" }, { body: { not: null } }] },
    orderBy: { path: "asc" },
    select: { id: true, path: true, type: true, status: true, name: true, h1: true, seoTitle: true, metaDescription: true, intro: true, canonical: true, robotsIndex: true, robotsFollow: true, autoNoindex: true, autoNoindexReason: true, contentUpdatedAt: true },
  });
  const [entries, submissions] = await Promise.all([indexableEntries(), db.indexNowSubmission.findMany({ orderBy: { createdAt: "desc" }, take: 30 })]);
  const inSitemap = new Set(entries.map((e) => e.path));
  const rows = pages.map((p) => ({ p, r: resolveRobots(p, settings.seo.allowIndexing, isSelfCanonical(p, base)) }));
  const groupOf = (t: string) => (Object.entries(SITEMAP_GROUPS).find(([, ts]) => (ts as readonly string[]).includes(t))?.[0] ?? "—");
  const included = rows.filter((x) => inSitemap.has(x.p.path));
  return (
    <>
      <PageTitle title="Sitemap" desc={`${included.length} URL sitemap'te. Taslak ve içeriksiz il/ilçe sayfaları listelenmez. NOINDEX veya başka canonical'a sahip sayfalar hiçbir zaman sitemap'e girmez.`}
        actions={<a href="/sitemap.xml" target="_blank" className="rounded-full border border-line px-4 py-2">/sitemap.xml ↗</a>} />
      <div className="mb-6 flex flex-wrap gap-2"><JobButton kind="sitemap-check" back="/yonetim/sitemap" /><JobButton kind="indexnow" back="/yonetim/sitemap" /></div>
      <div className="mb-6">
        <Card title="IndexNow gönderimleri (gerçek HTTP sonuçları)">
          <Table head={["Tarih", "Tetikleyen", "Durum", "HTTP", "URL", "Mesaj", "Sonraki deneme"]} empty="Henüz gönderim yok.">
            {submissions.map((x) => (
              <tr key={x.id}>
                <td className="whitespace-nowrap">{fmtDate(x.createdAt, true)}</td>
                <td>{x.trigger ?? "—"}</td>
                <td><Badge tone={x.status === "ok" ? "ok" : x.status === "skipped" ? "muted" : "bad"}>{{ ok: "Başarılı", failed: "Başarısız", retry: "Başarısız — tekrar denenecek", skipped: "Atlandı" }[x.status] ?? x.status}</Badge></td>
                <td>{x.httpStatus ?? "—"}</td>
                <td>{x.urls.length}</td>
                <td className="max-w-md text-xs">{x.message}</td>
                <td className="whitespace-nowrap text-xs">{x.nextRetryAt ? fmtDate(x.nextRetryAt, true) : "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <Card>
        <Table head={["URL", "Dosya", "Durum", "Neden", "lastmod"]}>
          {rows.map(({ p, r }) => (
            <tr key={p.id}>
              <td><Link href={`/yonetim/sayfalar/${p.id}`} className="hover:underline">{p.path}</Link></td>
              <td className="text-xs">sitemap-{groupOf(p.type)}.xml</td>
              <td>{inSitemap.has(p.path) ? <Badge tone="ok">Dahil</Badge> : <Badge tone="warn">Hariç</Badge>}</td>
              <td className="text-xs text-muted">{[...r.reasons, ...(r.indexable && !inSitemap.has(p.path) ? ["Doğrulanmamış içerik, yer tutucu veya yönlendirme kaynağı"] : [])].join("; ") || "—"}</td>
              <td className="text-xs">{p.contentUpdatedAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
