import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { competitorFindings, FINDING_LABELS, PRIORITY_LABELS, QUALITY_LABELS, UNKNOWN_METRICS, categoryCounts, type Finding } from "@/lib/competitors/insights";
import { CATEGORY_LABELS, type Category } from "@/lib/competitors/classify";
import { SERVICE_CATALOG } from "@/lib/content/catalog";
import type { CrawlStats } from "@/lib/competitors/crawl";
import { Badge, Card, Notice, PageTitle, Stat, Table, fmtDate, fmtNum } from "@/components/admin/ui";
import { analyzeCompetitorAction, deleteCompetitorAction, toggleCompetitorAction } from "../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { isCrawling } from "@/lib/competitors/lock";

export const metadata = { title: "Rakip ayrıntısı" };

const TABS = [["teknik", "Teknik SEO"], ["icerik", "İçerik"], ["hizmetler", "Hizmetler"], ["lokasyonlar", "Lokasyonlar"], ["kelimeler", "Anahtar Kelimeler"], ["linkler", "İç Linkler"], ["degisiklik", "Değişiklik Geçmişi"], ["firsatlar", "Fırsatlar"]] as const;
const CHANGE_LABELS: Record<string, string> = { NEW_PAGE: "Yeni sayfa", REMOVED_PAGE: "Kaldırılan sayfa", URL_CHANGE: "URL değişikliği (çıkarım)", TITLE: "Title değişti", H1: "H1 değişti", LENGTH: "İçerik uzunluğu değişti", SCHEMA: "Yeni schema", NEW_SERVICE: "Yeni hizmet konusu", NEW_LOCATION: "Yeni lokasyon sayfası" };
const PRIO_TONE = { URGENT: "bad", HIGH: "warn", MEDIUM: "info", LOW: "muted" } as const;
const pct = (n: number, d: number) => (d ? `%${Math.round((n / d) * 100)}` : "—");

function FindingCard({ f }: { f: Finding }) {
  const s = f.signals;
  return (
    <article className="rounded-2xl border border-line p-4" data-finding={f.type} data-actionable={f.actionable ? "1" : "0"}>
      <div className="flex flex-wrap items-center gap-2"><Badge tone={PRIO_TONE[f.priority]}>{PRIORITY_LABELS[f.priority]}</Badge><Badge>{FINDING_LABELS[f.type]}</Badge><b>{f.title}</b></div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[140px_1fr]">
        <dt className="text-muted">Rakipte var</dt><dd>{f.theirs}</dd>
        <dt className="text-muted">Bizde</dt><dd>{f.ours}</dd>
        <dt className="text-muted">Neden önemli</dt><dd>{f.why}</dd>
        <dt className="text-muted">Kanıt</dt><dd><ul className="space-y-0.5">{f.evidence.map((e, i) => <li key={i}>{e.text} <span className="text-xs text-muted">[{QUALITY_LABELS[e.quality]}]</span></li>)}</ul></dd>
        <dt className="text-muted">Önerilen işlem</dt><dd>{f.actionable ? f.action : <span className="text-warn">Uygulanmaz — {f.blockedReason}</span>}</dd>
        <dt className="text-muted">Risk</dt><dd>{s.implementationRisk === "HIGH" ? "Yüksek (otomatik uygulanmaz)" : s.implementationRisk === "MEDIUM" ? "Orta" : "Düşük"}{f.actionable ? " · öneri olarak 48 saat onay penceresine girer" : ""}</dd>
        <dt className="text-muted">Sinyaller</dt>
        <dd className="text-xs">Search Console talebi: {s.gscDemand == null ? "bağlı değil" : fmtNum(s.gscDemand)} · takip edilen kelime: {s.keywordDemand} · niyet: {s.commercialIntent} · mevcut sayfa: {s.existingPageFit ?? "yok"} · hizmet doğrulaması: {s.serviceVerification == null ? "—" : s.serviceVerification ? "var" : "yok"} · cannibalization: {s.cannibalizationRisk ?? "risk görülmedi"}{s.contentGap ? ` · içerik: ${s.contentGap}` : ""}{s.technicalGap ? ` · teknik: ${s.technicalGap}` : ""}</dd>
        <dt className="text-muted">Öncelik gerekçesi</dt><dd className="text-xs">{f.priorityReason}</dd>
      </dl>
    </article>
  );
}

export default async function CompetitorDetail(props: PageProps<"/yonetim/rakipler/[id]">) {
  await requireUser("seo");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const c = await db.competitor.findUnique({ where: { id }, include: { snapshots: { where: { status: { not: "running" } }, orderBy: { createdAt: "desc" }, take: 5 } } });
  const crawling = await isCrawling(id);
  if (!c) notFound();
  const tab = TABS.find(([k]) => k === sp.sekme)?.[0] ?? "firsatlar";
  const [pages, changes, { findings, hasGsc }, proposals, ourPages] = await Promise.all([
    db.competitorPage.findMany({ where: { competitorId: id }, orderBy: [{ category: "asc" }, { path: "asc" }] }),
    db.competitorChange.findMany({ where: { competitorId: id }, orderBy: { createdAt: "desc" }, take: 200 }),
    competitorFindings({ competitorId: id }),
    db.autopilotAction.findMany({ where: { source: "competitor", proposal: { path: ["competitors"], array_contains: [c.domain] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.page.findMany({ where: { status: "PUBLISHED" }, select: { path: true, type: true, metaDescription: true, h1: true } }),
  ]);
  const live = pages.filter((p) => p.status === 200 && !p.removedAt && !p.duplicateOf);
  const redirects = pages.filter((p) => p.status >= 300 && p.status < 400);
  const duplicates = pages.filter((p) => p.duplicateOf);
  const s = c.snapshots[0]?.data as CrawlStats | undefined;
  return (
    <>
      <PageTitle title={c.name || c.domain} desc={<>{c.domain} · son tarama {c.lastCrawlAt ? fmtDate(c.lastCrawlAt, true) : "henüz yok"}{c.lastStatus ? ` · HTTP ${c.lastStatus}` : ""}</>}
        actions={<div className="flex flex-wrap gap-2">
          <form action={analyzeCompetitorAction}><input type="hidden" name="id" value={c.id} /><SubmitButton pending="Tarama kuyruğa alınıyor…" className="rounded-full bg-ink px-4 py-2 text-paper">Şimdi tara</SubmitButton></form>
          <form action={toggleCompetitorAction}><input type="hidden" name="id" value={c.id} /><button className="rounded-full border border-line px-4 py-2">{c.status === "paused" ? "Etkinleştir" : "Duraklat"}</button></form>
          <form action={deleteCompetitorAction}><input type="hidden" name="id" value={c.id} /><button className="rounded-full border border-line px-4 py-2 text-bad">Sil</button></form>
          <Link href="/yonetim/rakipler" className="rounded-full border border-line px-4 py-2">← Rakipler</Link>
        </div>} />
      {crawling ? <div className="mb-4" data-crawl-state="running"><Notice tone="warn">Bu rakip şu anda taranıyor.</Notice></div>
        : c.crawlRequestedAt ? <div className="mb-4" data-crawl-state="queued"><Notice>Tarama kuyruğa alındı. Worker robots.txt&apos;ye uyarak, istekler arasında bekleyerek tarar; birkaç dakika sonra yenileyin.</Notice></div>
        : sp.kuyruk ? <div className="mb-4"><Notice tone="ok">Tarama kuyruğa alındı.</Notice></div> : null}
      {c.lastError && <div className="mb-4"><Notice tone="bad">{c.lastError}</Notice></div>}
      {!hasGsc && <div className="mb-4"><Notice tone="warn">Search Console bağlı değil: talep bazlı karşılaştırma sınırlı; talep sinyali 0 değil “bilinmiyor” sayılır.</Notice></div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Keşfedilen sayfa" value={s ? fmtNum(s.pages) : "—"} hint={s ? `indekslenebilir: ${live.filter((p) => !/noindex/i.test(p.robotsMeta ?? "")).length}` : undefined} />
        <Stat label="Hizmet konusu" value={s?.services.length ?? "—"} />
        <Stat label="Lokasyon sayfası" value={s?.locations.length ?? "—"} />
        <Stat label="Fırsat (uygulanabilir)" value={`${findings.length} (${findings.filter((f) => f.actionable).length})`} />
        <Stat label="Veri kalitesi" value={s ? (s.errors ? "Kısmi" : "Tam") : "—"} hint={s ? `${s.fetched} indirildi · ${s.cacheHits + s.notModified} önbellekten · ${s.errors} hata${s.truncated ? ` · ${s.truncated} boyut sınırında kesildi` : ""}` : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {TABS.map(([k, l]) => <Link key={k} href={`?sekme=${k}`} className={`rounded-full px-3 py-1.5 ${tab === k ? "bg-ink text-paper" : "border border-line"}`}>{l}</Link>)}
      </div>

      {tab === "firsatlar" && (
        <div className="space-y-4">
          <Card title="Bizde ne eksik? (fırsatlar)">
            <div className="space-y-3">{findings.length ? findings.map((f) => <FindingCard key={f.key} f={f} />) : <p className="text-muted">Bulgu yok{live.length ? "" : " — önce tarama gerekli"}.</p>}</div>
          </Card>
          <Card title="Bu rakipten gelen öneriler (48 saat)">
            <Table head={["Öneri", "Durum", "Oluşturma"]} empty="Henüz öneri yok.">
              {proposals.map((a) => <tr key={a.id}><td><Link href={`/yonetim/oneriler/${a.id}`} className="underline">{a.title}</Link></td><td className="text-xs">{a.status}</td><td className="text-xs">{fmtDate(a.createdAt, true)}</td></tr>)}
            </Table>
          </Card>
        </div>
      )}

      {tab === "teknik" && (
        <Card title="Teknik SEO karşılaştırması (gözlenen sayfalar)">
          <Table head={["Sinyal", c.domain, "Bizim site (yayında)"]}>
            <tr><td>HTTPS</td><td>{s ? (s.https ? "Evet" : "Hayır") : "—"}</td><td>Evet</td></tr>
            <tr><td>robots.txt / sitemap</td><td>{s ? `${s.robotsFound ? "var" : "yok"} / ${s.sitemapFound ? `var (${s.sitemapUrls})` : "yok"}` : "—"}</td><td>var / var</td></tr>
            <tr><td>Meta description olan sayfa</td><td>{pct(live.filter((p) => p.metaDescription).length, live.length)}</td><td>{pct(ourPages.filter((p) => p.metaDescription).length, ourPages.length)} (elle yazılmış)</td></tr>
            <tr><td>Tek H1 olan sayfa</td><td>{pct(live.filter((p) => p.h1.length === 1).length, live.length)}</td><td>%100 (şablon)</td></tr>
            <tr><td>Canonical tanımlı sayfa</td><td>{pct(live.filter((p) => p.canonical).length, live.length)}</td><td>%100 (şablon)</td></tr>
            <tr><td>noindex sayfa</td><td>{live.filter((p) => /noindex/i.test(p.robotsMeta ?? "")).length}</td><td>—</td></tr>
            <tr><td>ALT metni eksik görsel</td><td>{fmtNum(live.reduce((n, p) => n + p.imagesNoAlt, 0))} / {fmtNum(live.reduce((n, p) => n + p.images, 0))}</td><td>SEO Sağlığı ekranında</td></tr>
            <tr><td>Tekrarlanan title</td><td>{live.length - new Set(live.map((p) => p.title)).size}</td><td>—</td></tr>
            <tr><td>İnce içerik (&lt;250 kelime)</td><td>{live.filter((p) => p.wordCount < 250).length}</td><td>İçerik Planı</td></tr>
            <tr><td>Schema türleri</td><td className="text-xs">{s?.schemaTypes.join(", ") || "—"}</td><td className="text-xs">Organization, WebSite, BreadcrumbList, Service, FAQPage (koşullu), LocalBusiness (işletme bilgisi tamsa)</td></tr>
            <tr><td>HTTP yönlendirmesi (kaynak adres; sayfa sayılmaz)</td><td>{redirects.length}{s?.redirectsExternal ? ` (dış siteye ${s.redirectsExternal})` : ""}</td><td>—</td></tr>
            <tr><td>Aynı içerik (kopya; sayfa sayılmaz)</td><td>{duplicates.length}</td><td>—</td></tr>
            <tr><td>Hata / robots ile atlanan</td><td>{s ? `${s.errors} / ${s.blockedByRobots}` : "—"}</td><td>—</td></tr>
          </Table>
          <p className="mt-3 text-xs text-muted">Bilinmeyen (tahmin edilmez): {UNKNOWN_METRICS.join(", ")}.</p>
        </Card>
      )}

      {tab === "icerik" && (
        <Card title="İçerik kapsamı (sayfa türleri — çıkarım)">
          <div className="mb-4 flex flex-wrap gap-2">{categoryCounts(live).map((x) => <Badge key={x.key}>{x.label}: {x.n}</Badge>)}</div>
          <Table head={["Sayfa", "Tür", "H1", "H2", "Kelime", "Schema"]} empty="Tarama yok.">
            {live.slice(0, 200).map((p) => <tr key={p.id}><td className="max-w-xs truncate text-xs">{p.path}</td><td className="text-xs">{CATEGORY_LABELS[(p.category ?? "other") as Category]}</td><td className="max-w-xs truncate text-xs">{p.h1[0] ?? "—"}</td><td className="tabular-nums">{p.h2.length}</td><td className="tabular-nums">{p.wordCount}</td><td className="text-xs">{p.schemaTypes.join(", ")}</td></tr>)}
          </Table>
        </Card>
      )}

      {tab === "hizmetler" && (
        <Card title="Hizmet konuları: rakip vs bizim site">
          <Table head={["Hizmet", "Rakipte (sayfa)", "Bizde", ""]}>
            {SERVICE_CATALOG.map((d) => {
              const theirs = live.filter((p) => p.topics.includes(d.path) && p.category !== "home");
              const ours = ourPages.find((p) => p.path === d.path);
              return <tr key={d.path} data-service-row={d.path}><td>{d.name}</td><td>{theirs.length ? <span title={theirs.map((p) => p.path).join("\n")}>{theirs.length} ({theirs[0].path})</span> : "—"}</td><td>{ours ? <Link href={ours.path} className="underline">{ours.path}</Link> : d.overlaps ? `${d.overlaps} kapsamında` : "yok"}</td><td className="text-xs text-muted">çıkarım</td></tr>;
            })}
          </Table>
        </Card>
      )}

      {tab === "lokasyonlar" && (
        <Card title="Rakibin lokasyon sayfaları (yalnızca bilgi)">
          <p className="mb-3 text-xs text-muted">Rakipte olması, bizde otomatik sayfa üretme nedeni değildir (doorway koruması). İlçe sayfaları İçerik Planı&apos;ndaki öncelik ve yayın kapısıyla, insan onayıyla yayınlanır.</p>
          <Table head={["Sayfa", "Title"]} empty="Lokasyon sayfası keşfedilmedi.">
            {live.filter((p) => p.category === "location").map((p) => <tr key={p.id}><td className="text-xs">{p.path}</td><td className="text-xs">{p.title}</td></tr>)}
          </Table>
        </Card>
      )}

      {tab === "kelimeler" && (
        <Card title="Anahtar kelimeler">
          <Notice tone="warn">Rakibin sıralandığı anahtar kelimeler doğrulanamaz: bu veri Search Console&apos;da yoktur (yalnızca sizin sorgularınız) ve SERP sağlayıcısı bağlı değildir. Aşağıdaki konu listesi yalnızca rakip sayfalarının title/H1 yapısından çıkarılmıştır — sıralama anlamına gelmez.</Notice>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">{[...new Set(live.flatMap((p) => p.topics))].map((t) => <li key={t}><Badge>{SERVICE_CATALOG.find((d) => d.path === t)?.name ?? t}</Badge></li>)}</ul>
        </Card>
      )}

      {tab === "linkler" && (
        <Card title="İç link yaklaşımı (gözlenen)">
          <Table head={["Sayfa türü", "Sayfa", "Ortanca site içi link", "Derinlik (ortanca)"]}>
            {categoryCounts(live).map((x) => {
              const ps = live.filter((p) => (p.category ?? "other") === x.key);
              const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
              return <tr key={x.key}><td>{x.label}</td><td className="tabular-nums">{x.n}</td><td className="tabular-nums">{med(ps.map((p) => p.internalLinks))}</td><td className="tabular-nums">{med(ps.map((p) => p.depth))}</td></tr>;
            })}
          </Table>
        </Card>
      )}

      {tab === "degisiklik" && (
        <Card title="Değişiklik geçmişi (iki tarama arası, gözlenen)">
          {c.snapshots.length > 0 && <p className="mb-3 text-xs text-muted">Taramalar: {c.snapshots.map((x) => `${fmtDate(x.createdAt, true)} (${x.status})`).join(" · ")}</p>}
          <Table head={["Zaman", "Değişiklik", "Sayfa", "Önce", "Sonra"]} empty="Henüz değişiklik yok (ilk tarama temel kayıttır).">
            {changes.map((x) => <tr key={x.id} data-change={x.kind}><td className="text-xs">{fmtDate(x.createdAt, true)}</td><td className="text-xs">{CHANGE_LABELS[x.kind] ?? x.kind}</td><td className="text-xs">{x.url}</td><td className="max-w-xs truncate text-xs">{x.before ?? "—"}</td><td className="max-w-xs truncate text-xs">{x.after ?? "—"}</td></tr>)}
          </Table>
        </Card>
      )}
    </>
  );
}
