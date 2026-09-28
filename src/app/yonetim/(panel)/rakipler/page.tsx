import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { competitorDiscovery } from "@/lib/competitors/jobs";
import { competitorFindings, FINDING_LABELS, PRIORITY_LABELS, UNKNOWN_METRICS } from "@/lib/competitors/insights";
import type { CrawlStats } from "@/lib/competitors/crawl";
import { Badge, Card, Notice, PageTitle, fmtDate, fmtNum, inputCls } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";
import { addCompetitorAction } from "./actions";

export const metadata = { title: "Rakip Analizi" };

const PRIO_TONE = { URGENT: "bad", HIGH: "warn", MEDIUM: "info", LOW: "muted" } as const;

export default async function Competitors(props: PageProps<"/yonetim/rakipler">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const [competitors, discovery, { findings, hasGsc }, proposals] = await Promise.all([
    db.competitor.findMany({ orderBy: { createdAt: "desc" }, include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { changes: true } } } }),
    competitorDiscovery(),
    competitorFindings(),
    db.autopilotAction.groupBy({ by: ["status"], where: { source: "competitor" }, _count: true }),
  ]);
  const byComp = (domain: string) => findings.filter((f) => f.competitors.includes(domain));
  const pending = proposals.find((p) => p.status === "pending_approval")?._count ?? 0;
  return (
    <>
      <PageTitle
        title="Rakip Analizi"
        desc="Rakip verisi → fark → fırsat → öneri (48 saat) → onay veya otomatik uygulama → gerçek site doğrulaması → geri alma. Rakip metni kopyalanmaz; yalnızca yapı, konu kapsamı ve teknik sinyaller kullanılır."
        actions={<div className="flex flex-wrap gap-2"><JobButton kind="competitor-crawl" back="/yonetim/rakipler" /><JobButton kind="competitor-opportunity-scan" back="/yonetim/rakipler" /></div>}
      />
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      {typeof sp.is === "string" && <div className="mb-4"><Notice>İş arka planda başlatıldı; birkaç dakika sonra sayfayı yenileyin.</Notice></div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-card p-4" data-gsc={hasGsc ? "on" : "off"}>
          <p className="text-xs text-muted">Search Console</p>
          <p className={`mt-1 font-semibold ${hasGsc ? "text-ok" : "text-warn"}`}>{hasGsc ? "Bağlı" : "Bağlı değil"}</p>
          <p className="mt-1 text-xs text-muted">{hasGsc ? "Talep sinyali fırsat puanına katılır." : "Rakip aday keşfi ve talep bazlı karşılaştırma sınırlı."}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">Rakip</p><p className="mt-1 text-2xl font-semibold">{competitors.length}</p></div>
        <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">Bulgu (uygulanabilir)</p><p className="mt-1 text-2xl font-semibold">{findings.length} <span className="text-base text-muted">({findings.filter((f) => f.actionable).length})</span></p></div>
        <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">Onay bekleyen rakip önerisi</p><p className="mt-1 text-2xl font-semibold"><Link href="/yonetim/oneriler?kategori=COMPETITOR" className="underline">{pending}</Link></p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card title="Rakip ekle">
            <form action={addCompetitorAction} className="space-y-2">
              <input name="domain" required placeholder="rakip.com" className={inputCls} />
              <input name="name" placeholder="Görünen ad (isteğe bağlı)" className={inputCls} />
              <button className="rounded-full bg-ink px-4 py-2 text-paper">Ekle ve tara</button>
              <p className="text-xs text-muted">Yalnızca herkese açık alan adı; IP adresi, yerel/iç ağ adresleri reddedilir. Tarama robots.txt&apos;ye uyar, istekler arasında bekler.</p>
            </form>
          </Card>
          <Card title="Aday rakip keşfi">
            {discovery.available ? null : <p className="text-[13px] text-muted" data-discovery>{discovery.reason}</p>}
          </Card>
          <Card title="Bilinmeyen (tahmin edilmez)">
            <p className="text-xs text-muted">{UNKNOWN_METRICS.join(" · ")} — bu veriler için güvenilir kaynak bağlı değil; sistem bunları asla tahmin edip gerçek veri gibi göstermez.</p>
          </Card>
        </div>
        <div className="space-y-4">
          {!competitors.length && <Card><p className="text-muted">Henüz rakip eklenmedi.</p></Card>}
          {competitors.map((c) => {
            const s = c.snapshots[0]?.data as CrawlStats | undefined;
            const f = byComp(c.domain);
            return (
              <Card key={c.id}>
                <article data-competitor={c.domain}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold"><Link href={`/yonetim/rakipler/${c.id}`} className="hover:underline">{c.name || c.domain}</Link></h2>
                      <p className="text-xs text-muted">{c.domain} · {c.source === "manual" ? "elle eklendi" : c.source} · {c.status === "paused" ? "duraklatıldı" : c.status === "error" ? "hata" : "aktif"}</p>
                    </div>
                    <div className="text-right text-xs text-muted">Son tarama: {c.lastCrawlAt ? fmtDate(c.lastCrawlAt, true) : "henüz yok"}{c.lastStatus ? ` · HTTP ${c.lastStatus}` : ""}</div>
                  </div>
                  {c.lastError && <p className="mt-2 text-xs text-bad">{c.lastError}</p>}
                  {s ? (
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4 lg:grid-cols-7">
                      <div><dt className="text-xs text-muted">Sayfa</dt><dd className="font-semibold">{fmtNum(s.pages)}</dd></div>
                      <div><dt className="text-xs text-muted">Hizmet konusu</dt><dd className="font-semibold">{s.services.length}</dd></div>
                      <div><dt className="text-xs text-muted">Lokasyon sayfası</dt><dd className="font-semibold">{s.locations.length}</dd></div>
                      <div><dt className="text-xs text-muted">Teknik bulgu</dt><dd className="font-semibold">{f.filter((x) => x.type === "TECHNICAL_GAP").length}</dd></div>
                      <div><dt className="text-xs text-muted">İçerik gap</dt><dd className="font-semibold">{f.filter((x) => ["CONTENT_GAP", "CONTENT_EXPANSION", "SERVICE_GAP"].includes(x.type)).length}</dd></div>
                      <div><dt className="text-xs text-muted">Fırsat</dt><dd className="font-semibold">{f.filter((x) => x.actionable).length}</dd></div>
                      <div><dt className="text-xs text-muted">Değişiklik</dt><dd className="font-semibold">{c._count.changes}</dd></div>
                    </dl>
                  ) : <p className="mt-3 text-sm text-muted">Tarama sonucu yok.</p>}
                  {s && <p className="mt-2 text-xs text-muted">robots.txt {s.robotsFound ? "var" : "yok"} · sitemap {s.sitemapFound ? `var (${s.sitemapUrls} URL)` : "yok"} · {s.https ? "HTTPS" : "HTTP"} · önbellekten {s.cacheHits + s.notModified}, indirilen {s.fetched}{s.blockedByRobots ? ` · robots ile atlanan ${s.blockedByRobots}` : ""}</p>}
                </article>
              </Card>
            );
          })}
          {findings.length > 0 && (
            <Card title="Öne çıkan fırsatlar">
              <ul className="space-y-3 text-[13px]">
                {findings.slice(0, 6).map((f) => (
                  <li key={f.key} className="rounded-xl border border-line p-3" data-finding={f.type}>
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={PRIO_TONE[f.priority]}>{PRIORITY_LABELS[f.priority]}</Badge><Badge>{FINDING_LABELS[f.type]}</Badge><b>{f.title}</b></div>
                    <p className="mt-1"><span className="text-muted">Rakipte var:</span> {f.theirs} · <span className="text-muted">Bizde:</span> {f.ours}</p>
                    <p className="text-xs text-muted">{f.actionable ? `Önerilen işlem: ${f.action}` : `Uygulanmaz: ${f.blockedReason}`}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
