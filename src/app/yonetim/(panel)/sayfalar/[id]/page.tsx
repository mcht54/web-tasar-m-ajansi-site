import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettingsFresh } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { autoSchemaTypes } from "@/lib/seo/schema";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import type { PageAnalysis } from "@/lib/seo/analyzer";
import { PageEditor } from "@/components/admin/PageEditor";
import { Badge, Card, Notice, PageTitle, Table, daysAgo, fmtDate, fmtNum } from "@/components/admin/ui";
import { PAGE_TYPE_LABELS, STATUS_LABELS } from "@/lib/admin/labels";
import { restoreVersionAction } from "../actions";
import { LOCATION_TYPES, locationGate } from "@/lib/seo/location-quality";

export const metadata = { title: "Sayfa düzenle" };

export default async function EditPage(props: PageProps<"/yonetim/sayfalar/[id]">) {
  const user = await requireUser("content");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const page = await db.page.findUnique({ where: { id } });
  if (!page) notFound();
  const [settings, versions, changes, media, keywords, gsc] = await Promise.all([
    getSettingsFresh(),
    db.pageVersion.findMany({ where: { pageId: id }, orderBy: { version: "desc" }, take: 30 }),
    db.seoChangeLog.findMany({ where: { pageId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.media.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, filename: true }, take: 200 }),
    db.keyword.findMany({ where: { targetPageId: id }, orderBy: { priority: "desc" } }),
    db.gscPageDaily.aggregate({
      where: { page: siteUrl() + (page.path === "/" ? "/" : page.path), date: { gte: daysAgo(28) } },
      _sum: { clicks: true, impressions: true },
    }),
  ]);
  const faq = parseFaq(page.faq);
  const gate = LOCATION_TYPES.has(page.type) ? await locationGate(page.id) : null;
  const allSchema = [...new Set([...autoSchemaTypes(page.type, page.path, Math.max(faq.length, 2), settings.business), ...page.schemaDisabled])];
  const s = (v: string | null) => v ?? "";
  return (
    <>
      <PageTitle
        title={page.name}
        desc={<span className="flex flex-wrap items-center gap-2">{PAGE_TYPE_LABELS[page.type]} · <Badge tone={page.status === "PUBLISHED" ? "ok" : "muted"}>{STATUS_LABELS[page.status]}</Badge> {page.status === "PUBLISHED" && <a href={page.path} target="_blank" className="underline">Sayfayı aç ↗</a>}</span>}
        actions={<Link href="/yonetim/sayfalar" className="rounded-full border border-line px-4 py-2">← Sayfalar</Link>}
      />
      {sp["geri-yuklendi"] && <div className="mb-4"><Notice tone="ok">Sürüm geri yüklendi (yeni sürüm olarak kaydedildi).</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <PageEditor
        page={{
          id: page.id, path: page.path, type: page.type, status: page.status, name: page.name, breadcrumbLabel: s(page.breadcrumbLabel),
          seoTitle: s(page.seoTitle), metaDescription: s(page.metaDescription), h1: s(page.h1), intro: s(page.intro), body: s(page.body),
          faq, canonical: s(page.canonical), robotsIndex: page.robotsIndex, robotsFollow: page.robotsFollow, ogTitle: s(page.ogTitle),
          ogDescription: s(page.ogDescription), ogImageId: s(page.ogImageId), schemaDisabled: page.schemaDisabled,
          primaryKeyword: s(page.primaryKeyword), secondaryKeywords: page.secondaryKeywords, excerpt: s(page.excerpt),
          category: s(page.category), authorName: s(page.authorName),
        }}
        canSeo={can(user.role, "seo")}
        siteUrl={siteUrl()}
        titleTemplate={settings.seo.titleTemplate}
        defaultTitle={settings.seo.defaultTitle}
        media={media}
        schemaTypes={allSchema}
        analysis={(page.analysis as unknown as PageAnalysis) ?? null}
        gate={gate}
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Hedef anahtar kelimeler ve trafik (son 28 gün)">
          <p className="mb-3 text-muted">Tıklama: {fmtNum(gsc._sum.clicks)} · Gösterim: {fmtNum(gsc._sum.impressions)} {gsc._sum.impressions == null && "(Search Console verisi yok)"}</p>
          <Table head={["Kelime", "Öncelik", "Pozisyon", "Hedef"]} empty="Bu sayfayı hedefleyen kelime yok.">
            {keywords.map((k) => (
              <tr key={k.id}><td>{k.phrase}</td><td>{k.priority}</td><td>{k.currentPosition ? fmtNum(k.currentPosition, 1) : "—"}</td><td>{k.targetPosition ?? "—"}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Sürüm geçmişi">
          <Table head={["Sürüm", "Tarih", "Kim", "Not", ""]}>
            {versions.map((v, i) => (
              <tr key={v.id}>
                <td>v{v.version}</td>
                <td className="whitespace-nowrap">{fmtDate(v.createdAt, true)}</td>
                <td>{v.userName ?? "—"}</td>
                <td className="text-muted">{v.note ?? ""}</td>
                <td>{i > 0 && !(v.snapshot as Record<string, unknown>).seed && (
                  <form action={restoreVersionAction}>
                    <input type="hidden" name="pageId" value={page.id} /><input type="hidden" name="versionId" value={v.id} />
                    <button className="text-xs underline">Bu sürüme dön</button>
                  </form>
                )}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <div className="mt-6">
        <Card title="SEO değişiklik logu">
          <Table head={["Tarih", "Alan", "Önce", "Sonra", "Kim"]} empty="Henüz değişiklik yok.">
            {changes.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{fmtDate(c.createdAt, true)}</td>
                <td className="font-medium">{c.field}</td>
                <td className="max-w-xs break-words text-muted">{trim(c.before)}</td>
                <td className="max-w-xs break-words">{trim(c.after)}</td>
                <td>{c.userName ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

function trim(s: string | null) {
  if (!s) return "—";
  return s.length > 180 ? `${s.slice(0, 180)}…` : s;
}
