import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { loadSiteState } from "@/lib/seo/analyzer";
import { RELATION_LABELS, type RelationKey, clusterAudit, linkStats, orphans, overLinked, suggestLinks, weaklyLinked } from "@/lib/seo/links";
import { db } from "@/lib/db";
import { toLinkPages } from "@/lib/seo/opportunities";
import { Badge, Card, PageTitle, Stat, Table, fmtNum } from "@/components/admin/ui";
import { PAGE_TYPE_LABELS } from "@/lib/admin/labels";

export const metadata = { title: "Internal Linkler" };

export default async function InternalLinks(props: PageProps<"/yonetim/ic-linkler">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const state = await loadSiteState();
  const lp = toLinkPages(state);
  const stats = linkStats(lp, state.edges).sort((a, b) => a.contextIn - b.contextIn);
  const orph = orphans(stats);
  const weak = weaklyLinked(stats).filter((s) => !["STATIC", "BLOG_INDEX"].includes(s.type));
  const most = [...stats].sort((a, b) => b.contextIn - a.contextIn).slice(0, 8);
  const important = stats.filter((s) => s.type === "SERVICE" || s.importance >= 4);
  const target = typeof sp.hedef === "string" ? lp.find((p) => p.path === sp.hedef) : undefined;
  const cluster = clusterAudit(lp, state.edges);
  const over = overLinked(stats);
  // Gerçeklik kontrolü: crawler'ın gerçek HTML'den saydığı gelen linkler
  const lastCrawl = await db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" } });
  const crawled = lastCrawl ? await db.crawlPage.findMany({ where: { runId: lastCrawl.id, indexable: true }, select: { url: true, inlinks: true } }) : [];
  const crawlOrphans = crawled.filter((c) => c.inlinks === 0 && new URL(c.url).pathname !== "/").map((c) => new URL(c.url).pathname);
  const modelOrphans = new Set(orph.map((o) => o.path));
  const mismatch = crawlOrphans.filter((p) => !modelOrphans.has(p));
  const suggestions = target ? suggestLinks(target, lp, state.edges, 10) : [];
  return (
    <>
      <PageTitle title="Internal Linkler" desc="Link grafiği, yayındaki sayfaların şablon linkleri (ilçeler, ilgili hizmetler…) ve içerikteki linklerden hesaplanır. Menü/footer linkleri ayrıca sayılır." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Yayındaki sayfa" value={stats.length} />
        <Stat label="Orphan sayfa" value={orph.length} tone={orph.length ? "bad" : "ok"} />
        <Stat label="Az link alan (<2)" value={weak.length} tone={weak.length ? "warn" : "ok"} />
        <Stat label="Toplam bağlamsal link" value={fmtNum(state.edges.filter((e) => e.kind !== "nav").length)} />
      </div>
      {target && (
        <div className="mt-6">
          <Card title={`Bu sayfaya şu sayfalardan link verilmesi öneriliyor: ${target.path}`}>
            <Table head={["Kaynak sayfa", "Önerilen anchor", "Neden", "Puan"]} empty="Uygun kaynak bulunamadı (aynı şehir/hizmet/sektörde veya metninde bu konudan bahseden yayında sayfa yok).">
              {suggestions.map((s) => <tr key={s.source}><td>{s.source}</td><td>“{s.anchor}”</td><td className="text-xs">{s.reasons.join(" · ")}</td><td>{s.score}</td></tr>)}
            </Table>
            <p className="mt-2 text-xs text-muted">Anchor metnini cümle içinde doğal kullanın; aynı anchor&apos;u her yerde tekrarlamak yerine çeşitlendirin.</p>
          </Card>
        </div>
      )}
      <div className="mt-6">
        <Card title="Konu kümeleri — ilişki matrisi">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {(Object.keys(RELATION_LABELS) as RelationKey[]).map((k) => (
              <div key={k} className="rounded-xl border border-line p-3">
                <p className="text-xs text-muted">{RELATION_LABELS[k]}</p>
                <p className="text-lg font-semibold">{cluster.counts[k].possible ? `${cluster.counts[k].existing} / ${cluster.counts[k].possible}` : "ilişki yok"}</p>
                <p className="text-xs text-muted">mevcut / olası bağlantı</p>
              </div>
            ))}
          </div>
          <Table head={["İlişki", "Kaynak", "Hedef", "Önerilen anchor", "Neden"]} empty="Eksik küme bağlantısı yok.">
            {cluster.suggestions.slice(0, 60).map((c, i) => (
              <tr key={i}><td className="text-xs">{RELATION_LABELS[c.relation]}</td><td>{c.source}</td><td>{c.target}</td><td>“{c.anchor}”</td><td className="text-xs">{c.reason}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
      <div className="mt-6">
        <Card title="Gerçeklik kontrolü: model vs crawler">
          {lastCrawl ? (
            <p className="text-[13px]">
              Son tarama ({crawled.length} indekslenebilir sayfa): crawler&apos;a göre gelen linki olmayan {crawlOrphans.length} sayfa; link modeline göre {orph.length} orphan.
              {mismatch.length ? <span className="text-bad"> Uyuşmayan: {mismatch.join(", ")}</span> : <span className="text-ok"> Model ile gerçek HTML uyumlu.</span>}
            </p>
          ) : <p className="text-muted">Henüz tarama yok — SEO Sağlığı ekranından çalıştırın.</p>}
          {over.length > 0 && <p className="mt-2 text-[13px]">Çok fazla bağlamsal link alan (ortalama+2σ üstü): {over.map((o) => `${o.path} (${o.contextIn})`).join(", ")}</p>}
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Orphan ve az link alan sayfalar">
          <Table head={["Sayfa", "Bağlamsal", "Menü", ""]} empty="Sorunlu sayfa yok.">
            {[...orph, ...weak].map((s) => (
              <tr key={s.path}><td>{s.path}{s.contextIn + s.navIn === 0 && <> <Badge tone="bad">orphan</Badge></>}</td><td>{s.contextIn}</td><td>{s.navIn}</td><td><Link href={`?hedef=${encodeURIComponent(s.path)}`} className="text-xs underline">Öneri al</Link></td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Önemli sayfalara verilen linkler">
          <Table head={["Sayfa", "Bağlamsal", "Menü", "Anchor çeşitliliği", ""]}>
            {important.map((s) => (
              <tr key={s.path}>
                <td>{s.path}</td><td>{s.contextIn}</td><td>{s.navIn}</td>
                <td>{s.anchorDiversity == null ? "—" : <span className={s.anchorDiversity < 0.3 ? "text-warn" : ""}>%{Math.round(s.anchorDiversity * 100)} <span className="text-xs text-muted">({s.anchors.slice(0, 2).map((a) => a.text).join(", ")})</span></span>}</td>
                <td><Link href={`?hedef=${encodeURIComponent(s.path)}`} className="text-xs underline">Öneri al</Link></td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="En çok link alan sayfalar">
          <Table head={["Sayfa", "Tür", "Bağlamsal", "Giden"]}>
            {most.map((s) => <tr key={s.path}><td>{s.path}</td><td className="text-xs">{PAGE_TYPE_LABELS[s.type]}</td><td>{s.contextIn}</td><td>{s.out}</td></tr>)}
          </Table>
        </Card>
        <Card title="Tüm sayfalar">
          <Table head={["Sayfa", "Gelen", "Menü", "Giden", ""]}>
            {stats.map((s) => <tr key={s.path}><td>{s.path}</td><td>{s.contextIn}</td><td>{s.navIn}</td><td>{s.out}</td><td><Link href={`?hedef=${encodeURIComponent(s.path)}`} className="text-xs underline">Öneri</Link></td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
