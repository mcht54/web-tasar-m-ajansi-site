import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { normalizeKeyword } from "@/lib/text/slug";
import { type DemandRow, OPPORTUNITY_FORMULA, locationDemand } from "@/lib/seo/location-demand";
import { LOCATION_TYPES, locationGate } from "@/lib/seo/location-quality";
import { loadSiteState } from "@/lib/seo/analyzer";
import { Badge, Card, Notice, PageTitle, Stat, Table, fmtDate, fmtNum } from "@/components/admin/ui";
import { NoData } from "@/components/admin/NoData";

export const metadata = { title: "Lokasyon Talebi" };

const VERDICT: Record<DemandRow["verdict"], { label: string; tone: "bad" | "warn" | "ok" | "info" | "muted"; action: string }> = {
  YOK: { label: "Sayfa yok", tone: "bad", action: "Sayfa oluşturun, gerçek yerel bilgiyle yazın" },
  TASLAK: { label: "Taslak", tone: "bad", action: "Kalite kapısını geçirip yayınlayın" },
  NOINDEX: { label: "NOINDEX", tone: "warn", action: "İçeriği özgünleştirin/uzatın" },
  ZAYIF: { label: "Zayıf (SEO<80)", tone: "warn", action: "Analizdeki sorunları giderin" },
  YAYINDA: { label: "Yayında", tone: "ok", action: "Hızlı kazanımlara bakın, iç link verin" },
};

async function trackQueries(form: FormData) {
  "use server";
  const user = await requireUser("seo");
  const queries = form.getAll("q").map(String).slice(0, 100);
  const pageId = String(form.get("pageId") ?? "") || null;
  let added = 0;
  for (const q of queries) {
    const normalized = normalizeKeyword(q);
    if (await db.keyword.findUnique({ where: { normalized } })) continue;
    const page = pageId ? await db.page.findUnique({ where: { id: pageId }, select: { provinceId: true, districtId: true, serviceId: true } }) : null;
    await db.keyword.create({ data: { phrase: q, normalized, intent: "LOCAL", priority: 4, targetPageId: pageId, provinceId: page?.provinceId, districtId: page?.districtId, serviceId: page?.serviceId } });
    added++;
  }
  await audit(user.id, "keyword.fromDemand", "Keyword", null, { added });
  redirect(`/yonetim/lokasyon-talebi?eklendi=${added}`);
}

export default async function LocationDemandScreen(props: PageProps<"/yonetim/lokasyon-talebi">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const [demand, tracked, state] = await Promise.all([
    locationDemand(90),
    db.keyword.findMany({ select: { normalized: true } }),
    loadSiteState(),
  ]);
  const { rows, hasGsc, unmatched } = demand;
  const trackedSet = new Set(tracked.map((k) => k.normalized));
  // İçeriği olan lokasyon sayfaları ve kalite kapısı (içeriksiz taslaklar listelenmez)
  const contentPages = state.pages.filter((p) => LOCATION_TYPES.has(p.type) && (p.body?.trim() || p.status === "PUBLISHED"));
  const gates = new Map<string, Awaited<ReturnType<typeof locationGate>>>();
  for (const p of [...new Set([...contentPages.map((x) => x.id), ...rows.map((r) => r.page?.id).filter((x): x is string => Boolean(x))])])
    gates.set(p, await locationGate(p, state, demand));
  const provinces = rows.filter((r) => !r.districtId).length;
  const districts = rows.filter((r) => r.districtId).length;
  return (
    <>
      <PageTitle
        title="Lokasyon Talebi"
        desc="Hangi il ve ilçeden web tasarım aranıyor? Yalnızca Search Console'daki gerçek sorgulardan: sorgusunda il/ilçe adı ve hizmet niyeti geçen aramalar konuma göre toplanır (son 90 gün)."
      />
      {sp.eklendi && <div className="mb-4"><Notice tone="ok">{sp.eklendi} sorgu anahtar kelime takibine eklendi.</Notice></div>}
      {!hasGsc && (
        <div className="mb-4"><Notice tone="warn">
          <b>Henüz veri yok.</b> Search Console bağlı olmadığı için hangi il/ilçeden arama geldiği bilinmiyor. Nüfus veya başka bir resmî veri arama talebi yerine kullanılmaz.{" "}
          <Link href="/yonetim/ayarlar?sekme=entegrasyon" className="underline">Ayarlar &gt; SEO Entegrasyonları</Link>
        </Notice></div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Talep gelen il" value={hasGsc ? provinces : <NoData />} />
        <Stat label="Talep gelen ilçe" value={hasGsc ? districts : <NoData />} />
        <Stat label="Talep var, sayfa yok" value={hasGsc ? rows.filter((r) => r.verdict === "YOK").length : <NoData />} tone={hasGsc && rows.some((r) => r.verdict === "YOK") ? "bad" : undefined} />
        <Stat label="Talep var, taslak/NOINDEX" value={hasGsc ? rows.filter((r) => r.verdict === "TASLAK" || r.verdict === "NOINDEX").length : <NoData />} />
        <Stat label="Konumsuz hizmet sorgusu" value={hasGsc ? fmtNum(unmatched) : <NoData />} hint="İl/ilçe adı geçmeyen genel aramalar" />
      </div>

      {hasGsc && (
        <div className="mt-6">
          <Card title="Arama gelen konumlar — fırsat skoruna göre" actions={<span className="text-xs text-muted" title={OPPORTUNITY_FORMULA}>Skor nasıl hesaplanır? (üzerine gelin)</span>}>
            <p className="mb-3 text-xs text-muted">{OPPORTUNITY_FORMULA}</p>
            <Table head={["Lokasyon", "Gösterim", "Tıklama", "CTR", "Ort. poz.", "Sorgu", "Sayfa", "Durum", "Google indeks", "İçerik kalitesi", "Son güncelleme", "Kalite kapısı", "Fırsat", "Gelen sorgular"]} empty="Search Console verisinde il/ilçe adı geçen hizmet sorgusu yok.">
              {rows.map((r) => {
                const v = VERDICT[r.verdict];
                const g = r.page ? gates.get(r.page.id) : null;
                const untracked = r.queries.filter((q) => !trackedSet.has(q.query)).slice(0, 10);
                return (
                  <tr key={r.path}>
                    <td className="font-medium">{r.name}</td>
                    <td className="tabular-nums">{fmtNum(r.impressions)}</td>
                    <td className="tabular-nums">{fmtNum(r.clicks)}</td>
                    <td className="tabular-nums">{r.ctr != null ? `%${fmtNum(r.ctr * 100, 2)}` : <NoData />}</td>
                    <td className="tabular-nums">{r.position != null ? fmtNum(r.position, 1) : <NoData />}</td>
                    <td className="tabular-nums">{r.queries.length}</td>
                    <td className="text-xs">{r.page ? <Link href={`/yonetim/sayfalar/${r.page.id}`} className="underline">{r.path}</Link> : <span className="text-muted">{r.path} (yok)</span>}</td>
                    <td><Badge tone={v.tone}>{v.label}</Badge><div className="mt-1 text-xs text-muted">{v.action}</div></td>
                    <td className="text-xs">{r.indexStatus ?? <span className="text-muted">Kontrol edilmedi</span>}</td>
                    <td>{r.contentScore != null ? r.contentScore : <span className="text-xs text-muted">İçerik yok</span>}</td>
                    <td className="whitespace-nowrap text-xs">{r.lastUpdated && r.page?.hasBody ? fmtDate(r.lastUpdated) : "—"}</td>
                    <td>{g ? <Badge tone={g.ready ? "ok" : "bad"}>{g.ready ? "HAZIR" : "HAZIR DEĞİL"}</Badge> : <span className="text-xs text-muted">—</span>}</td>
                    <td className="font-semibold tabular-nums">{r.opportunity}</td>
                    <td className="max-w-sm text-xs">
                      {r.queries.slice(0, 4).map((q) => <div key={q.query}><Link href={`/yonetim/search-console/sorgu?q=${encodeURIComponent(q.query)}`} className="hover:underline">{q.query}</Link> <span className="text-muted">({q.impressions} göst., poz. {fmtNum(q.position, 1)})</span></div>)}
                      {untracked.length > 0 && (
                        <form action={trackQueries} className="mt-1">
                          {untracked.map((q) => <input key={q.query} type="hidden" name="q" value={q.query} />)}
                          <input type="hidden" name="pageId" value={r.page?.id ?? ""} />
                          <button className="underline">{untracked.length} sorguyu takibe al</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card title="İçeriği olan lokasyon sayfaları — kalite kapısı">
          <p className="mb-3 text-xs text-muted">İçeriksiz {state.pages.filter((p) => LOCATION_TYPES.has(p.type) && !p.body?.trim() && p.status !== "PUBLISHED").length} taslak il/ilçe sayfası listelenmez; toplu yayın yapılmaz.</p>
          <Table head={["Sayfa", "Durum", "Kapı", "Skor", "Başarısız kritik kontroller", "Güncelleme"]} empty="Henüz içeriği yazılmış lokasyon sayfası yok. Lokasyonlar ekranındaki brief veya AI taslağı ile başlayın.">
            {contentPages.map((p) => {
              const g = gates.get(p.id);
              return (
                <tr key={p.id}>
                  <td><Link href={`/yonetim/sayfalar/${p.id}`} className="underline">{p.path}</Link></td>
                  <td>{p.status === "PUBLISHED" ? "Yayında" : "Taslak"}</td>
                  <td>{g && <Badge tone={g.ready ? "ok" : "bad"}>{g.ready ? "YAYINA HAZIR" : "YAYINA HAZIR DEĞİL"}</Badge>}</td>
                  <td>{g?.score}</td>
                  <td className="text-xs">{g?.items.filter((i) => i.critical && i.status === "FAIL").map((i) => i.label).join(", ") || "—"}</td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(p.contentUpdatedAt)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </>
  );
}
