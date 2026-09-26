import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, PageTitle, ScoreBadge, Table, fmtDate } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";
import { PAGE_TYPE_LABELS } from "@/lib/admin/labels";
import { CATEGORY_LABELS, type Category } from "@/lib/seo/score";
import type { PageAnalysis } from "@/lib/seo/analyzer";

export const metadata = { title: "SEO Analiz" };

export default async function SeoAnalysis(props: PageProps<"/yonetim/seo-analiz">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const onlyDraft = sp.taslak === "1";
  const pages = await db.page.findMany({
    where: { seoScore: { not: null }, status: onlyDraft ? "DRAFT" : "PUBLISHED" },
    orderBy: { seoScore: "asc" },
    select: { id: true, path: true, type: true, seoScore: true, contentScore: true, analysis: true, analyzedAt: true, autoNoindex: true, robotsIndex: true },
  });
  const cats = Object.keys(CATEGORY_LABELS) as Category[];
  const avg = pages.length ? Math.round(pages.reduce((s, p) => s + (p.seoScore ?? 0), 0) / pages.length) : null;
  return (
    <>
      <PageTitle title="SEO Analiz" desc={`${pages.length} ${onlyDraft ? "taslak" : "yayındaki"} sayfa · ortalama SEO skoru ${avg ?? "—"}. En düşük skorlu sayfalar üstte.`}
        actions={<><Link href={onlyDraft ? "?" : "?taslak=1"} className="rounded-full border border-line px-4 py-2">{onlyDraft ? "Yayındakiler" : "İçerikli taslaklar"}</Link><JobButton kind="analyze" back="/yonetim/seo-analiz" /></>} />
      <Card>
        <Table head={["Sayfa", "Tür", "SEO", "İçerik", ...cats.map((c) => CATEGORY_LABELS[c]), "Hazır", "Analiz"]}>
          {pages.map((p) => {
            const a = p.analysis as unknown as PageAnalysis | null;
            return (
              <tr key={p.id}>
                <td><Link href={`/yonetim/sayfalar/${p.id}`} className="font-medium hover:underline">{p.path}</Link>{(p.autoNoindex || !p.robotsIndex) && <> <Badge tone="warn">NOINDEX</Badge></>}</td>
                <td className="text-xs">{PAGE_TYPE_LABELS[p.type]}</td>
                <td><ScoreBadge score={p.seoScore} /></td>
                <td><ScoreBadge score={p.contentScore} /></td>
                {cats.map((c) => {
                  const v = a?.seo.categories[c];
                  return <td key={c} className="tabular-nums text-xs">{v && v.max ? `${v.points}/${v.max}` : "—"}</td>;
                })}
                <td>{a ? (a.readiness.ready ? <Badge tone="ok">PASS</Badge> : <Badge tone="bad">FAIL</Badge>) : "—"}</td>
                <td className="whitespace-nowrap text-xs text-muted">{fmtDate(p.analyzedAt, true)}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
