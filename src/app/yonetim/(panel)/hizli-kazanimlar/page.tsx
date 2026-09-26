import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { siteUrl } from "@/lib/env";
import { type QwCategory, QW_LABELS, QW_RULES, QW_SCORE_FORMULA, computeQuickWins } from "@/lib/seo/quick-wins";
import { Card, Notice, PageTitle, Table, fmtDate, fmtNum } from "@/components/admin/ui";
import { FixButton } from "@/components/admin/FixButton";

export const metadata = { title: "Hızlı Kazanımlar" };
const CATS = Object.keys(QW_LABELS) as QwCategory[];

export default async function QuickWins(props: PageProps<"/yonetim/hizli-kazanimlar">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const cat = (CATS.includes(sp.tur as QwCategory) ? sp.tur : "FIRST_PAGE") as QwCategory;
  const [qw, pages] = await Promise.all([computeQuickWins(), db.page.findMany({ select: { id: true, path: true } })]);
  const base = siteUrl();
  const pageId = (url: string | null) => {
    if (!url) return null;
    const path = url.startsWith(base) ? url.slice(base.length).replace(/\/$/, "") || "/" : new URL(url).pathname.replace(/\/$/, "") || "/";
    return pages.find((p) => p.path === path)?.id ?? null;
  };
  const list = qw.items.filter((i) => i.category === cat);
  return (
    <>
      <PageTitle title="Hızlı Kazanımlar" desc="Search Console'daki tüm sorgulardan (takip edilen kelimelerle sınırlı değil). Dönem: verinin son gününden geriye 28 gün, karşılaştırma: önceki 28 gün. Sıralama garantisi değil, gerçek veriye dayalı önceliklendirmedir." />
      {!qw.hasData && <Notice tone="warn"><b>Henüz veri yok.</b> Search Console bağlanıp senkronize edilince fırsatlar burada görünür. Tahmin gösterilmez.</Notice>}
      {qw.hasData && (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
            {CATS.map((c) => (
              <Link key={c} href={`?tur=${c}`} className={`rounded-full px-3 py-1.5 ${c === cat ? "bg-ink text-paper" : "border border-line"}`}>{QW_LABELS[c]} ({qw.items.filter((i) => i.category === c).length})</Link>
            ))}
          </div>
          <Card title={QW_LABELS[cat]}>
            <p className="mb-1 text-xs text-muted">Kural: {QW_RULES[cat]}. “Yüksek gösterim” eşiği bu sitenin verisinden: {qw.threshold} gösterim / 28 gün (sorgu gösterimlerinin medyanı, en az 20). Dönem: {fmtDate(qw.period!.start)} – {fmtDate(qw.period!.end)}.</p>
            <p className="mb-3 text-xs text-muted">{QW_SCORE_FORMULA}</p>
            <Table head={["Sorgu", "Lokasyon", "Sayfa", "Gösterim", "Tıklama", "CTR", "Ort. poz.", "Önceki 28 gün", "Skor", "Neden", ""]} empty="Bu kategoride fırsat yok.">
              {list.map((i) => (
                <tr key={`${i.category}:${i.query}`}>
                  <td className="font-medium"><Link href={`/yonetim/search-console/sorgu?q=${encodeURIComponent(i.query)}`} className="hover:underline">{i.query}</Link></td>
                  <td className="text-xs">{i.location?.name ?? "—"}</td>
                  <td className="max-w-40 truncate text-xs">{i.page ? new URL(i.page).pathname : "—"}</td>
                  <td className="tabular-nums">{fmtNum(i.impressions)}</td>
                  <td className="tabular-nums">{fmtNum(i.clicks)}</td>
                  <td className="tabular-nums">{i.ctr != null ? `%${fmtNum(i.ctr * 100, 2)}` : "—"}</td>
                  <td className="tabular-nums">{i.position != null ? fmtNum(i.position, 1) : "—"}</td>
                  <td className="text-xs tabular-nums">{i.prevImpressions || i.prevClicks ? `${fmtNum(i.prevImpressions)} göst. / ${fmtNum(i.prevClicks)} tık` : "kayıt yok"}</td>
                  <td className="font-semibold tabular-nums">{i.score}</td>
                  <td className="max-w-sm text-xs">{i.reason}</td>
                  <td><FixButton small pageId={pageId(i.page)} query={i.query} category={i.category} back={`/yonetim/hizli-kazanimlar?tur=${cat}`} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
