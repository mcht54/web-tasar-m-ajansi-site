import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, Notice, PageTitle, SeverityBadge, Stat, Table, fmtDate } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";
import { ISSUE_LABELS } from "@/lib/crawler/parse";

export const metadata = { title: "SEO Sağlığı" };

export default async function Health(props: PageProps<"/yonetim/seo-sagligi">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const runs = await db.crawlRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const run = runs.find((r) => r.id === sp.tarama) ?? runs.find((r) => r.status === "ok");
  const code = typeof sp.kod === "string" ? sp.kod : "";
  const [bySev, byCode, issues, slow] = run
    ? await Promise.all([
        db.crawlIssue.groupBy({ by: ["severity"], where: { runId: run.id }, _count: true }),
        db.crawlIssue.groupBy({ by: ["code", "severity"], where: { runId: run.id }, _count: true, orderBy: { _count: { code: "desc" } } }),
        db.crawlIssue.findMany({ where: { runId: run.id, ...(code ? { code } : {}) }, orderBy: [{ severity: "asc" }, { url: "asc" }], take: 300 }),
        db.crawlPage.findMany({ where: { runId: run.id }, orderBy: { loadMs: "desc" }, take: 10, select: { url: true, loadMs: true, bytes: true, status: true } }),
      ])
    : [[], [], [], []];
  const sev = (s: string) => bySev.find((x) => x.severity === s)?._count ?? 0;
  return (
    <>
      <PageTitle title="SEO Sağlığı" desc="Crawler siteyi gerçek bir ziyaretçi gibi tarar: HTTP durumları, title/meta/H1, canonical, robots, sitemap, yönlendirme zincirleri, kırık linkler, kopya ve zayıf içerik, schema, mobil, hız." actions={<JobButton kind="crawl" back="/yonetim/seo-sagligi" />} />
      {!run && <Notice tone="warn">Henüz tamamlanmış tarama yok.</Notice>}
      {run && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Sağlık skoru" value={run.healthScore ?? "—"} tone={(run.healthScore ?? 0) >= 80 ? "ok" : (run.healthScore ?? 0) >= 60 ? "warn" : "bad"} hint={fmtDate(run.startedAt, true)} />
            <Stat label="Taranan sayfa" value={run.pagesCrawled} />
            <Stat label="CRITICAL" value={sev("CRITICAL")} tone={sev("CRITICAL") ? "bad" : undefined} />
            <Stat label="HIGH" value={sev("HIGH")} tone={sev("HIGH") ? "bad" : undefined} />
            <Stat label="MEDIUM" value={sev("MEDIUM")} tone={sev("MEDIUM") ? "warn" : undefined} />
            <Stat label="LOW" value={sev("LOW")} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
            <Card title="Sorun türleri">
              <ul className="space-y-1.5 text-[13px]">
                <li><a href="?" className={!code ? "font-semibold" : "underline"}>Tümü ({run.issueCount})</a></li>
                {byCode.map((c) => (
                  <li key={c.code} className="flex items-center justify-between gap-2">
                    <a href={`?kod=${c.code}`} className={code === c.code ? "font-semibold" : "underline"}>{ISSUE_LABELS[c.code] ?? c.code}</a>
                    <span className="flex items-center gap-2"><SeverityBadge s={c.severity} /><span className="tabular-nums">{c._count}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={code ? ISSUE_LABELS[code] ?? code : "Tüm sorunlar"}>
              <Table head={["Önem", "URL", "Sorun"]} empty="Sorun yok.">
                {issues.map((i) => <tr key={i.id}><td><SeverityBadge s={i.severity} /></td><td className="max-w-xs break-all text-xs">{i.url}</td><td>{i.message}</td></tr>)}
              </Table>
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="En yavaş yanıtlar (sunucu, sayfa başı)">
              <Table head={["URL", "Durum", "Süre", "HTML"]}>
                {slow.map((s) => <tr key={s.url}><td className="max-w-xs truncate text-xs">{s.url}</td><td>{s.status}</td><td>{s.loadMs} ms</td><td>{Math.round((s.bytes ?? 0) / 1024)} KB</td></tr>)}
              </Table>
              <p className="mt-2 text-xs text-muted">Core Web Vitals (LCP/INP/CLS) gerçek kullanıcı verisidir; Search Console veya PageSpeed ile ölçülür. Bu tablo sunucu yanıt süresini gösterir.</p>
            </Card>
            <Card title="Tarama geçmişi">
              <Table head={["Tarih", "Durum", "Sayfa", "Sorun", "Skor", ""]}>
                {runs.map((r) => <tr key={r.id}><td>{fmtDate(r.startedAt, true)}</td><td>{r.status === "ok" ? "tamam" : r.status === "running" ? "çalışıyor" : "hata"}</td><td>{r.pagesCrawled}</td><td>{r.issueCount}</td><td>{r.healthScore ?? "—"}</td><td><a href={`?tarama=${r.id}`} className="text-xs underline">Göster</a></td></tr>)}
              </Table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
