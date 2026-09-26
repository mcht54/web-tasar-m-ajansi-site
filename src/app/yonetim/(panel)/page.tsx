import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { gscPeriod, keywordBuckets, weeklyReport } from "@/lib/admin/dashboard";
import { computeQuickWins } from "@/lib/seo/quick-wins";
import { locationDemand } from "@/lib/seo/location-demand";
import { AI_ENGINES, buildRobotsTxt, robotsAllows } from "@/lib/seo/robots";
import { indexableEntries } from "@/lib/seo/sitemap";
import { Card, Notice, PageTitle, SeverityBadge, Stat, Table, fmtDate, fmtNum } from "@/components/admin/ui";
import { NoData } from "@/components/admin/NoData";
import { JobButton } from "@/components/admin/JobButton";
import { FixButton } from "@/components/admin/FixButton";

export const metadata = { title: "SEO Kontrol Merkezi" };

function delta(cur: number | null, prev: number | null, fmt: (n: number) => string, invert = false) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return <span className="text-muted">önceki döneme göre değişim yok</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={good ? "text-ok" : "text-bad"}>{d > 0 ? "+" : "−"}{fmt(Math.abs(d))} önceki 28 güne göre</span>;
}

function Section({ title, children, href, link }: { title: string; children: React.ReactNode; href?: string; link?: string }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>{href && <Link href={href} className="text-xs underline">{link}</Link>}</div>
      {children}
    </section>
  );
}

export default async function Dashboard(props: PageProps<"/yonetim">) {
  await requireUser();
  const sp = await props.searchParams;
  const [p28, buckets, report, qw, demand, settings, entries, crawl, lastSitemapCheck, lastIndexNow, taskCounts, tasks, newLeads, locPages] = await Promise.all([
    gscPeriod(28), keywordBuckets(), weeklyReport(), computeQuickWins(), locationDemand(90), getSettingsFresh(), indexableEntries(),
    db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" } }),
    db.jobRun.findFirst({ where: { kind: { in: ["sitemap-check", "daily"] } }, orderBy: { startedAt: "desc" } }),
    db.indexNowSubmission.findFirst({ orderBy: { createdAt: "desc" } }),
    db.seoTask.groupBy({ by: ["code"], where: { status: "OPEN" }, _count: true }),
    db.seoTask.findMany({ where: { status: "OPEN" }, orderBy: [{ priority: "desc" }, { lastSeenAt: "desc" }], take: 10 }),
    db.lead.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.page.groupBy({ by: ["status"], where: { type: { in: ["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"] }, OR: [{ status: "PUBLISHED" }, { body: { not: null } }] }, _count: true }),
  ]);
  const t = p28?.current;
  const count = (...codes: string[]) => taskCounts.filter((c) => codes.some((x) => c.code === x || (x.endsWith("*") && c.code.startsWith(x.slice(0, -1))))).reduce((s, c) => s + c._count, 0);
  const qwCount = (c: string) => qw.items.filter((i) => i.category === c).length;
  const robots = buildRobotsTxt(siteUrl(), settings.robots.extraRules, { search: settings.seo.aiSearchBots, training: settings.seo.aiTrainingBots });
  const aiAllowed = AI_ENGINES.filter((e) => robotsAllows(robots, e.bot, "/").allowed).length;
  const [topPages, topQueries] = p28 ? await Promise.all([
    db.gscPageDaily.groupBy({ by: ["page"], where: { date: { gte: new Date(p28.end!.getTime() - 27 * 86400_000) } }, _sum: { clicks: true, impressions: true }, orderBy: { _sum: { clicks: "desc" } }, take: 5 }),
    db.gscQueryDaily.groupBy({ by: ["query"], where: { date: { gte: new Date(p28.end!.getTime() - 27 * 86400_000) } }, _sum: { clicks: true, impressions: true }, orderBy: { _sum: { clicks: "desc" } }, take: 5 }),
  ]) : [[], []];
  const https = siteUrl().startsWith("https://");
  const locPublished = locPages.find((l) => l.status === "PUBLISHED")?._count ?? 0;
  const locDraft = locPages.filter((l) => l.status !== "PUBLISHED").reduce((s, l) => s + l._count, 0);
  const nd = (v: React.ReactNode, has: boolean) => (has ? v : <NoData />);
  const [apRun, apPending] = await Promise.all([
    db.autopilotRun.findFirst({ orderBy: { startedAt: "desc" }, include: { actions: { select: { status: true } } } }),
    db.autopilotAction.count({ where: { status: "needs_approval" } }),
  ]);
  return (
    <>
      <PageTitle title="SEO Kontrol Merkezi" desc="Yalnızca ölçülen veri. Veri kaynağı bağlı değilse “Henüz veri yok” yazılır; 0 ile veri yokluğu aynı şey değildir." actions={<JobButton kind="daily" back="/yonetim" />} />
      {sp.yetkisiz && <div className="mb-4"><Notice tone="bad">Bu ekran için yetkiniz yok (gerekli izin: {String(sp.yetkisiz)}).</Notice></div>}
      {!p28 && <Notice tone="warn">Search Console bağlı değil veya henüz senkronize edilmedi: organik performans, hızlı kazanımlar ve lokasyon talebi <b>Henüz veri yok</b> durumunda. <Link href="/yonetim/ayarlar?sekme=entegrasyon" className="underline">Bağlantı kur</Link></Notice>}

      <Section title="SEO Otopilot" href="/yonetim/autopilot" link="Otopilot paneli">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Son haftalık döngü" value={apRun ? apRun.weekKey : "—"} hint={apRun ? `${fmtDate(apRun.startedAt, true)} · ${apRun.status === "ok" ? "tamam" : apRun.status === "partial" ? "kısmi" : apRun.status}` : "Henüz çalışmadı"} />
          <Stat label="Bu döngüde uygulanan" value={apRun ? apRun.actions.filter((a) => a.status === "applied").length : "—"} hint="Sürüm geçmişli, geri alınabilir" />
          <Stat label="Onay bekleyen" value={apPending} tone={apPending ? "warn" : undefined} hint={<Link href="/yonetim/autopilot?sekme=onay" className="underline">İncele</Link>} />
        </div>
      </Section>

      <Section title="Açık bulgular (SEO ajanı izliyor; yapabileceklerini kendisi uygular)" href="/yonetim/firsatlar" link="Tüm bulgular">
        <Card>
          {tasks.length ? (
            <ol className="space-y-3">
              {tasks.map((task, i) => (
                <li key={task.id} className="flex flex-wrap items-start gap-3">
                  <span className="w-6 text-right font-semibold tabular-nums text-muted">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><SeverityBadge s={task.severity} /><span className="font-medium">{task.title}</span><span className="text-xs text-muted">öncelik {task.priority}</span></div>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted">{task.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/yonetim/firsatlar/${task.id}`} className="rounded-full border border-line px-3 py-1 text-xs">DETAY</Link>
                    {task.pageId && <FixButton small pageId={task.pageId} query={(task.data as { query?: string } | null)?.query ?? null} category={task.code} back="/yonetim" />}
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="text-muted">Açık görev yok. “Günlük işi çalıştır” ile fırsatları yenileyin.</p>}
        </Card>
      </Section>

      <Section title="Organik performans (28 gün)" href="/yonetim/search-console" link="Search Console">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tıklama" value={nd(fmtNum(t?.clicks), !!t)} hint={p28 ? delta(t!.clicks, p28.previous.clicks, (n) => fmtNum(n)) : undefined} />
          <Stat label="Gösterim" value={nd(fmtNum(t?.impressions), !!t)} hint={p28 ? delta(t!.impressions, p28.previous.impressions, (n) => fmtNum(n)) : undefined} />
          <Stat label="CTR" value={nd(t?.ctr != null ? `%${fmtNum(t.ctr * 100, 2)}` : "—", !!t)} hint={p28 ? delta(t!.ctr, p28.previous.ctr, (n) => `${fmtNum(n * 100, 2)} puan`) : undefined} />
          <Stat label="Ortalama pozisyon" value={nd(t?.position != null ? fmtNum(t.position, 1) : "—", !!t)} hint={p28 ? delta(t!.position, p28.previous.position, (n) => fmtNum(n, 1), true) : undefined} />
        </div>
      </Section>

      <Section title="Fırsatlar" href="/yonetim/hizli-kazanimlar" link="Hızlı kazanımlar">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
          <Stat label="İlk sayfa fırsatı" value={nd(qwCount("FIRST_PAGE"), qw.hasData)} />
          <Stat label="CTR fırsatı" value={nd(qwCount("CTR"), qw.hasData)} />
          <Stat label="İçerik fırsatı" value={nd(qwCount("CONTENT"), qw.hasData)} />
          <Stat label="Cannibalization" value={count("CANNIBAL_INTENT", "CANNIBAL_SERP")} hint="niyet + Search Console" />
          <Stat label="Orphan / az link" value={count("ORPHAN", "LOW_INLINKS")} />
          <Stat label="İndeksleme" value={count("NOT_INDEXED")} hint="URL Inspection sonucu" />
          <Stat label="Teknik" value={count("CRAWL_*", "SCHEMA_ERROR", "TITLE", "MISSING_META")} />
        </div>
      </Section>

      <Section title="Lokasyon" href="/yonetim/lokasyon-talebi" link="Lokasyon talebi">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Talep gelen il" value={nd(demand.rows.filter((r) => !r.districtId).length, demand.hasGsc)} />
          <Stat label="Talep gelen ilçe" value={nd(demand.rows.filter((r) => r.districtId).length, demand.hasGsc)} />
          <Stat label="Talep var, sayfa yok" value={nd(demand.rows.filter((r) => r.verdict === "YOK").length, demand.hasGsc)} />
          <Stat label="İçerikli taslak lokasyon" value={locDraft} />
          <Stat label="Yayındaki lokasyon" value={locPublished} />
        </div>
      </Section>

      <Section title="İçerik">
        <div className="grid gap-4 lg:grid-cols-4">
          <Card title="En çok tıklanan sayfalar"><Table head={["Sayfa", "Tık"]} empty="Henüz veri yok.">{topPages.map((p) => <tr key={p.page}><td className="max-w-40 truncate text-xs">{new URL(p.page).pathname}</td><td>{fmtNum(p._sum.clicks)}</td></tr>)}</Table></Card>
          <Card title="En çok tıklanan sorgular"><Table head={["Sorgu", "Tık"]} empty="Henüz veri yok.">{topQueries.map((q) => <tr key={q.query}><td className="text-xs">{q.query}</td><td>{fmtNum(q._sum.clicks)}</td></tr>)}</Table></Card>
          <Card title="Yükselen sorgular"><Table head={["Sorgu", "Göst."]} empty="Henüz veri yok.">{qw.items.filter((i) => i.category === "RISING").slice(0, 5).map((i) => <tr key={i.query}><td className="text-xs">{i.query}</td><td>{fmtNum(i.impressions)}</td></tr>)}</Table></Card>
          <Card title="Düşen sorgular"><Table head={["Sorgu", "Tık"]} empty="Henüz veri yok.">{qw.items.filter((i) => i.category === "DECLINE").slice(0, 5).map((i) => <tr key={i.query}><td className="text-xs">{i.query}</td><td>{fmtNum(i.prevClicks)} → {fmtNum(i.clicks)}</td></tr>)}</Table></Card>
        </div>
      </Section>

      <Section title="AI görünürlüğü" href="/yonetim/ai-gorunurluk" link="Ayrıntı">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="llms.txt" value={entries.length ? "Yayında" : "Boş"} tone={entries.length ? "ok" : "bad"} hint={`${entries.length} indekslenebilir URL`} />
          <Stat label="llms-full.txt" value={entries.length ? "Yayında" : "Boş"} tone={entries.length ? "ok" : "bad"} />
          <Stat label="AI crawler izinleri" value={`${aiAllowed} / ${AI_ENGINES.length}`} hint="robots.txt ayrıştırması" tone={aiAllowed === AI_ENGINES.length ? "ok" : "warn"} />
          <Stat label="Anahtar kelime takibi" value={buckets.total} hint={buckets.none === buckets.total ? "Pozisyon: Henüz veri yok" : `${buckets.total - buckets.none} tanesinde pozisyon var`} />
        </div>
      </Section>

      <Section title="Teknik" href="/yonetim/seo-sagligi" link="SEO sağlığı">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="Sitemap" value={`${entries.length} URL`} hint={lastSitemapCheck ? `Son kontrol: ${lastSitemapCheck.status === "ok" ? "başarılı" : lastSitemapCheck.status === "error" ? "BAŞARISIZ" : lastSitemapCheck.status} · ${fmtDate(lastSitemapCheck.startedAt, true)}` : "Doğrulama çalışmadı"} tone={lastSitemapCheck?.status === "error" ? "bad" : undefined} />
          <Stat label="Robots" value={/^User-agent: \*\nAllow: \//.test(robots) ? "Açık" : "Kontrol et"} tone="ok" />
          <Stat label="Canonical sorunları" value={crawl ? count("CRAWL_CANONICAL_MISSING") : <NoData />} hint="Son taramadan" />
          <Stat label="Schema hataları" value={count("SCHEMA_ERROR", "CRAWL_SCHEMA_INVALID")} />
          <Stat label="HTTPS" value={https ? "Evet" : "Hayır"} tone={https ? "ok" : "warn"} hint={https ? siteUrl() : "Yerel geliştirme adresi (http)"} />
          <Stat label="Crawler sağlığı" value={crawl?.healthScore ?? <NoData />} hint={crawl ? `${crawl.pagesCrawled} sayfa · ${fmtDate(crawl.startedAt, true)}` : undefined} />
        </div>
        <p className="mt-2 text-xs text-muted">IndexNow son durum: {lastIndexNow ? `${lastIndexNow.status === "ok" ? "Başarılı" : lastIndexNow.status === "retry" ? "Başarısız — yeniden deneme planlandı" : lastIndexNow.status === "skipped" ? "Atlandı" : "Başarısız"} · ${lastIndexNow.message} · ${fmtDate(lastIndexNow.createdAt, true)}` : "Henüz gönderim yok"}</p>
      </Section>

      <Section title="Bu hafta">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Haftalık rapor">
            <ul className="space-y-1.5 text-[13px]">
              <li>{report.movement ? <><b className="text-ok">+{report.movement.up}</b> keyword yükseldi, <b className="text-bad">−{report.movement.down}</b> düştü</> : "Keyword hareketi: Henüz veri yok"}</li>
              <li>{report.clicksDelta != null ? <><b>{report.clicksDelta >= 0 ? "+" : ""}{fmtNum(report.clicksDelta)}</b> tıklama (önceki 7 güne göre)</> : "Tıklama: Henüz veri yok"}</li>
              <li>{report.impressionsPct != null ? <><b>{report.impressionsPct >= 0 ? "+" : ""}{fmtNum(report.impressionsPct, 0)}%</b> gösterim</> : "Gösterim: Henüz veri yok"}</li>
              <li>{report.newIndexed != null ? <><b>+{report.newIndexed}</b> sayfa bu hafta taranıp indekste</> : "İndeks: Henüz veri yok"}</li>
              <li><b className={report.critical ? "text-bad" : ""}>{report.critical}</b> kritik, <b>{report.openTasks}</b> açık görev · <b>{report.leads}</b> yeni teklif talebi</li>
            </ul>
          </Card>
          <Card title="Yeni leadler" actions={<Link href="/yonetim/leadler" className="text-xs underline">Tümü</Link>}>
            {newLeads.length ? <ul className="divide-y divide-line">{newLeads.map((l) => <li key={l.id} className="py-2"><Link href={`/yonetim/leadler?id=${l.id}`} className="font-medium hover:underline">{l.name}</Link><div className="text-xs text-muted">{[l.company, l.city, l.service].filter(Boolean).join(" · ")}</div></li>)}</ul> : <p className="text-muted">Yeni talep yok.</p>}
          </Card>
        </div>
      </Section>
    </>
  );
}
