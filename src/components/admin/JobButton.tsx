import { runJobAction } from "@/app/yonetim/(panel)/actions";
import { db } from "@/lib/db";
import { fmtDate } from "./ui";

const LABEL: Record<string, string> = {
  analyze: "Analizi çalıştır", opportunities: "Fırsatları yenile", crawl: "Siteyi tara", "gsc-sync": "Search Console'u senkronla",
  "rank-update": "Sıralamaları güncelle", "index-inspect": "İndeks durumunu kontrol et", daily: "Günlük işi çalıştır",
  indexnow: "IndexNow gönder / yeniden dene", "sitemap-check": "Sitemap'i doğrula",
  autopilot: "Otopilot döngüsünü şimdi çalıştır", alarms: "Alarmları kontrol et", "weekly-email": "Haftalık raporu şimdi gönder", "daily-email": "Günlük raporu şimdi gönder",
  "auto-apply-proposals": "Süresi dolan önerileri şimdi işle",
  "content-opportunity-scan": "İçerik yenileme taraması", "service-page-opportunity": "Hizmet sayfası taraması", "local-seo-opportunity": "İlçe (lokal SEO) taraması",
  "competitor-discovery": "Rakip adayı keşfi", "competitor-crawl": "Rakipleri tara", "competitor-opportunity-scan": "Rakip fırsatlarını tara",
};

/** İşi tetikleyen buton + son çalıştırma durumu. */
export async function JobButton({ kind, back }: { kind: string; back: string }) {
  const last = await db.jobRun.findFirst({ where: { kind }, orderBy: { startedAt: "desc" } });
  return (
    <form action={runJobAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="back" value={back} />
      <button className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-paper" disabled={last?.status === "running"}>
        {last?.status === "running" ? "Çalışıyor…" : LABEL[kind] ?? kind}
      </button>
      {last && (
        <span className={`text-xs ${last.status === "error" ? "text-bad" : "text-muted"}`} title={last.message ?? ""}>
          Son: {fmtDate(last.startedAt, true)} · {last.status === "ok" ? "tamam" : last.status === "error" ? "hata" : last.status === "skipped" ? "atlandı" : "çalışıyor"}
          {last.message ? ` — ${last.message.slice(0, 90)}` : ""}
        </span>
      )}
    </form>
  );
}
