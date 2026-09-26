import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { loadSiteState, analyzePage } from "@/lib/seo/analyzer";
import { buildBreadcrumbs } from "@/lib/seo/breadcrumbs";
import { pageJsonLd } from "@/lib/site/seo-render";
import { parseFaq } from "@/lib/seo/analyzer-shared";
import { Badge, Card, PageTitle, Table, inputCls } from "@/components/admin/ui";
import type { PublicPage } from "@/lib/site/public";

export const metadata = { title: "Schema" };

export default async function SchemaScreen(props: PageProps<"/yonetim/schema">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const state = await loadSiteState();
  const published = state.pages.filter((p) => p.status === "PUBLISHED");
  const selected = state.pages.find((p) => p.path === (typeof sp.yol === "string" ? sp.yol : "/")) ?? published[0];
  const rows = published.map((p) => ({ p, a: analyzePage(p, state) }));
  let json = "";
  if (selected) {
    const full = await db.page.findUniqueOrThrow({
      where: { id: selected.id },
      include: { service: true, province: { include: { _count: { select: { districts: true } } } }, district: true, sector: true, ogImage: true },
    });
    const page = { ...JSON.parse(JSON.stringify(full)), faqItems: parseFaq(full.faq) } as PublicPage & { faqItems: { q: string; a: string }[] };
    json = JSON.stringify(JSON.parse(pageJsonLd(page, state.settings, buildBreadcrumbs(full.path, full.breadcrumbLabel || full.name, state.graph), null)), null, 2);
  }
  const selA = rows.find((r) => r.p.id === selected?.id)?.a;
  return (
    <>
      <PageTitle title="Schema (JSON-LD)" desc="Yapılandırılmış veri sayfa verisinden otomatik üretilir. LocalBusiness yalnızca işletme bilgisi tamsa ve yalnızca ana sayfa/iletişimde; FAQPage en az 2 görünür soru varsa; sahte puan/yorum hiçbir zaman üretilmez." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card title="Sayfalar">
          <Table head={["Sayfa", "Türler", "Durum"]}>
            {rows.map(({ p, a }) => {
              const err = a.schemaIssues.filter((i) => i.level === "error").length;
              const warn = a.schemaIssues.filter((i) => i.level === "warning").length;
              return (
                <tr key={p.id}>
                  <td><Link href={`?yol=${encodeURIComponent(p.path)}`} className={p.id === selected?.id ? "font-semibold" : "hover:underline"}>{p.path}</Link></td>
                  <td className="text-xs">{a.schemaTypes.join(", ")}</td>
                  <td>{err ? <Badge tone="bad">{err} hata</Badge> : warn ? <Badge tone="warn">{warn} uyarı</Badge> : <Badge tone="ok">PASS</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title={selected ? `${selected.path} — üretilen JSON-LD` : "Sayfa seçin"} actions={selected && <Link href={`/yonetim/sayfalar/${selected.id}`} className="text-xs underline">Schema türlerini düzenle</Link>}>
          {selA && selA.schemaIssues.length > 0 && (
            <ul className="mb-3 list-disc pl-5 text-[13px]">{selA.schemaIssues.map((i, k) => <li key={k} className={i.level === "error" ? "text-bad" : "text-warn"}>{i.type}: {i.message}</li>)}</ul>
          )}
          <textarea readOnly value={json} rows={32} className={`${inputCls} font-mono text-xs`} />
          <p className="mt-2 text-xs text-muted">Google&apos;ın Zengin Sonuç Testi ile doğrulamak için sayfa URL&apos;sini search.google.com/test/rich-results adresine girin.</p>
        </Card>
      </div>
    </>
  );
}
