import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { siteHost } from "@/lib/env";
import type { SiteProfile } from "@/lib/competitors/analyze";
import { Card, Notice, PageTitle, Table, fmtDate, fmtNum, inputCls } from "@/components/admin/ui";
import { addCompetitorAction, analyzeCompetitorAction, deleteCompetitorAction } from "./actions";

export const metadata = { title: "Rakip Analizi" };

const NV = <span className="text-muted">Doğrulanamadı</span>;

export default async function Competitors(props: PageProps<"/yonetim/rakipler">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const competitors = await db.competitor.findMany({ orderBy: { createdAt: "desc" }, include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const sel = competitors.find((c) => c.id === sp.id) ?? competitors[0];
  const snap = sel?.snapshots[0];
  const data = snap?.data as { theirs: SiteProfile; ours: SiteProfile | null } | undefined;
  const t = data?.theirs, o = data?.ours;
  const row = (label: string, f: (p: SiteProfile) => React.ReactNode) => (
    <tr><td className="font-medium">{label}</td><td>{o ? f(o) : NV}</td><td>{t ? f(t) : NV}</td></tr>
  );
  const n = (v: number | null) => (v == null ? NV : fmtNum(v));
  return (
    <>
      <PageTitle title="Rakip Analizi" desc="Yalnızca rakibin herkese açık verisi okunur (robots.txt, sitemap, örnek sayfalar). Trafik, keyword ve görünürlük verisi üçüncü taraf sağlayıcı olmadan bilinemez; bu alanlar tahmin edilmez." />
      {sp.basladi && <div className="mb-4"><Notice>Analiz arka planda başladı; birkaç dakika içinde bu sayfayı yenileyin.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card title="Rakip ekle">
            <form action={addCompetitorAction} className="space-y-2">
              <input name="domain" required placeholder="rakip.com" className={inputCls} />
              <input name="name" placeholder="Ad (isteğe bağlı)" className={inputCls} />
              <button className="rounded-full bg-ink px-4 py-2 text-paper">Ekle ve analiz et</button>
            </form>
          </Card>
          <Card title="Rakipler">
            <ul className="space-y-1">
              {competitors.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <Link href={`?id=${c.id}`} className={c.id === sel?.id ? "font-semibold" : "underline"}>{c.name || c.domain}</Link>
                  <span className="text-xs text-muted">{c.snapshots[0] ? fmtDate(c.snapshots[0].createdAt) : "analiz yok"}</span>
                </li>
              ))}
              {!competitors.length && <li className="text-muted">Henüz rakip eklenmedi.</li>}
            </ul>
          </Card>
        </div>
        {sel && (
          <Card title={`${siteHost().toUpperCase()} vs ${sel.domain.toUpperCase()}`} actions={
            <div className="flex gap-2">
              <form action={analyzeCompetitorAction}><input type="hidden" name="id" value={sel.id} /><button className="rounded-full border border-line px-3 py-1 text-xs">Yeniden analiz</button></form>
              <form action={deleteCompetitorAction}><input type="hidden" name="id" value={sel.id} /><button className="rounded-full border border-line px-3 py-1 text-xs text-bad">Sil</button></form>
            </div>}>
            {!snap && <p className="text-muted">Analiz henüz tamamlanmadı.</p>}
            {snap?.status === "error" && <Notice tone="bad">Analiz başarısız: {snap.error}</Notice>}
            {t && (
              <Table head={["", siteHost(), sel.domain]}>
                {row("Erişilebilir / HTTPS", (p) => (p.reachable ? (p.https ? "Evet / HTTPS" : "Evet / HTTP") : "Hayır"))}
                {row("Sitemap'teki URL (indekslenen değil)", (p) => n(p.sitemapUrls))}
                {row("Hizmet sayfaları (URL örüntüsü)", (p) => n(p.categories?.service ?? null))}
                {row("Şehir sayfaları", (p) => n(p.categories?.city ?? null))}
                {row("Kapsanan il sayısı", (p) => n(p.citiesCovered))}
                {row("Blog / rehber", (p) => n(p.categories?.blog ?? null))}
                {row("İncelenen örnek sayfa", (p) => p.sampled)}
                {row("Ortalama kelime (örnek)", (p) => n(p.avgWords))}
                {row("Ortalama iç link (örnek)", (p) => n(p.avgInternalLinks))}
                {row("Tek H1 olan sayfa", (p) => (p.pagesWithH1Pct == null ? NV : `%${p.pagesWithH1Pct}`))}
                {row("Meta description olan sayfa", (p) => (p.pagesWithMetaPct == null ? NV : `%${p.pagesWithMetaPct}`))}
                {row("Schema türleri", (p) => p.schemaTypes.join(", ") || "—")}
                {row("Title yapısı", (p) => <ul className="text-xs">{p.titlePatterns.map((x) => <li key={x}>{x}</li>)}</ul>)}
                {row("H1 örnekleri", (p) => <ul className="text-xs">{p.h1Examples.slice(0, 5).map((x, i) => <li key={i}>{x}</li>)}</ul>)}
                {row("Ana sayfa yanıt süresi", (p) => (p.homeLoadMs == null ? NV : `${p.homeLoadMs} ms`))}
                {row("Keywordler / görünürlük / trafik", () => NV)}
              </Table>
            )}
            {t?.error && <p className="mt-2 text-bad">{t.error}</p>}
            {t && <p className="mt-3 text-xs text-muted">Doğrulanamayan metrikler: {t.notVerifiable.join(", ")}. Bu veriler için Ahrefs/Semrush/DataForSEO gibi bir sağlayıcı bağlanmalıdır.</p>}
          </Card>
        )}
      </div>
    </>
  );
}
