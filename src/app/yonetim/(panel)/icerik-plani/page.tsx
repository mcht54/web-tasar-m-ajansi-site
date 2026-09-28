import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { claudeAvailable } from "@/lib/ai/claude";
import { loadAiKey } from "@/lib/ai/key";
import { contentBudget } from "@/lib/content/strategy";
import { DISTRICT_CRITERIA, SERVICE_DECISION_LABELS, districtPriorities, refreshCandidates, serviceOpportunities } from "@/lib/content/opportunities";
import { Badge, Card, Notice, PageTitle, Stat, Table, fmtNum } from "@/components/admin/ui";
import { JobButton } from "@/components/admin/JobButton";

export const metadata = { title: "İçerik Planı" };

const DECISION_TONE = { COVERED: "muted", EXPAND_EXISTING: "warn", UNVERIFIED: "muted", NO_DEMAND_SIGNAL: "muted", NEW_SERVICE_PAGE: "ok" } as const;

const weekAgo = () => new Date(Date.now() - 7 * 86400_000);

export default async function ContentPlan() {
  await requireUser("seo");
  await loadAiKey();
  const since = weekAgo();
  const [settings, refresh, services, districts, indexable, newPages, refreshed] = await Promise.all([
    getSettingsFresh(), refreshCandidates(), serviceOpportunities(), districtPriorities(),
    db.page.count({ where: { status: "PUBLISHED", robotsIndex: true, autoNoindex: false } }),
    db.autopilotAction.count({ where: { type: "NEW_PAGE", createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
    db.autopilotAction.count({ where: { type: "CONTENT", createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
  ]);
  const b = contentBudget({ indexablePages: indexable, weakPages: refresh.length, maxNewPagesPerWeek: settings.autopilot.maxNewPagesPerWeek, maxChangesPerWeek: settings.autopilot.maxChangesPerWeek, createdLast7: { newPages, refresh: refreshed } });
  const ai = claudeAvailable();
  const ready = districts.rows.filter((d) => !d.blockers.length).length;
  return (
    <>
      <PageTitle
        title="İçerik Planı"
        desc="İçerik otopilotunun ne üreteceği ve neden. Her üretim önce öneridir (48 saat onay), kalite kapısından geçer; ilçe sayfaları yalnızca insan onayıyla yayınlanır. Veri olmayan kriter tahmin edilmez."
        actions={<div className="flex flex-wrap gap-2"><JobButton kind="content-opportunity-scan" back="/yonetim/icerik-plani" /><JobButton kind="service-page-opportunity" back="/yonetim/icerik-plani" /><JobButton kind="local-seo-opportunity" back="/yonetim/icerik-plani" /></div>}
      />
      {!ai && <div className="mb-4"><Notice tone="warn"><b>Yapay zekâ anahtarı bağlı değil.</b> İçerik kural tabanlı üretilmez (uydurma riski); öneriler “Uygulanamaz” olarak görünür. Ayarlar → Entegrasyonlar’dan anahtar ekleyin.</Notice></div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Yeni sayfa bütçesi" value={`${b.newPagesPerWeek}/hafta`} hint={`Bu çalıştırmada en çok ${b.newPagesThisRun}`} />
        <Stat label="Yenileme bütçesi" value={`${b.refreshPerWeek}/hafta`} hint={`Bu çalıştırmada en çok ${b.refreshThisRun}`} />
        <Stat label="Yenileme adayı" value={refresh.length} />
        <Stat label="Yayına hazır ilçe" value={`${ready}/${districts.rows.length}`} hint="Ön koşulları tamam olan ilçe" tone={ready ? undefined : "warn"} />
      </div>
      <Card title="Bütçe nasıl hesaplandı" className="mb-6"><ul className="list-disc space-y-1 pl-5 text-[13px]">{b.rationale.map((r) => <li key={r}>{r}</li>)}</ul></Card>

      <Card title="Yeni hizmet sayfası kararları" className="mb-6">
        <p className="mb-3 text-xs text-muted">Karar sırası: mevcut sayfa karşılıyor mu → konu mevcut bir sayfanın içinde mi (cannibalization) → hizmet gerçekten veriliyor mu (Ayarlar → İşletme → Hizmetler: {settings.business.services.join(", ") || "boş"}) → talep sinyali var mı (Search Console veya takip edilen anahtar kelime).</p>
        <Table head={["Hizmet", "Karar", "Search Console (90 gün)", "Takip edilen kelime", "Skor", "Gerekçe"]}>
          {services.rows.map((s) => (
            <tr key={s.path} data-service={s.path}>
              <td><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.path}</div></td>
              <td><Badge tone={DECISION_TONE[s.decision]}>{SERVICE_DECISION_LABELS[s.decision]}</Badge></td>
              <td className="tabular-nums">{s.gscImpressions == null ? "Doğrulanamadı" : fmtNum(s.gscImpressions)}</td>
              <td className="tabular-nums">{s.trackedKeywords}</td>
              <td className="tabular-nums">{s.score}</td>
              <td className="max-w-md text-xs">{s.reason}{s.coveredBy && s.coveredBy !== s.path ? <> · <Link href={s.coveredBy} className="underline">{s.coveredBy}</Link></> : null}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="İlçe öncelik skoru (ilk 30)" className="mb-6">
        <ul className="mb-3 list-disc pl-5 text-xs text-muted">{districts.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="mb-3 text-xs text-muted">Kriterler: {DISTRICT_CRITERIA.map((c) => `${c.label}${c.measured ? ` (≤${c.max})` : " — doğrulanamadı"}`).join(" · ")}</p>
        <Table head={["#", "İlçe", "Nüfus", "Skor", "Bileşenler", "Yayın ön koşulları"]}>
          {districts.rows.slice(0, 30).map((d, i) => (
            <tr key={d.districtId} data-district={d.districtId}>
              <td className="tabular-nums">{i + 1}</td>
              <td><div className="font-medium">{d.name}, {d.province}</div><div className="text-xs text-muted">{d.path ?? "sayfa yok"}</div></td>
              <td className="tabular-nums">{d.population == null ? "—" : fmtNum(d.population)}</td>
              <td className="font-semibold tabular-nums">{d.score}</td>
              <td className="text-xs">{Object.entries(d.parts).map(([k, v]) => `${k} ${v}`).join(" · ")}</td>
              <td className="text-xs">{d.blockers.length ? <span className="text-warn">{d.blockers.join("; ")}</span> : <span className="text-ok">Hazır</span>}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="İçerik yenileme adayları">
        <Table head={["Sayfa", "Öncelik", "Neden"]} empty="Zayıf veya eski yayında sayfa yok.">
          {refresh.map((r) => <tr key={r.pageId}><td><Link href={`/yonetim/sayfalar/${r.pageId}`} className="underline">{r.path}</Link></td><td className="tabular-nums">{r.score}</td><td className="text-xs">{r.reasons.join(" · ")}</td></tr>)}
        </Table>
      </Card>
    </>
  );
}
