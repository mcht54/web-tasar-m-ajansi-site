import "server-only";
// SAYFA ENVANTERİ: kaç sayfa var, kaçı neden yok? Gerekçeler sabit metin değil,
// gerçek durumdan (Search Console, işletme bilgisi, içerik, taslak işaretleri) hesaplanır.

import { loadAiKey } from "../ai/key";
import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { businessIsComplete } from "../settings-schema";
import { gscConnected as isGscConnected } from "../gsc/sync";
import { UNVERIFIED_RE } from "../seo/analyzer-shared";
import { lastDataDay } from "./metrics";
import { claudeAvailable } from "../ai/claude";

export type InventoryRow = { category: string; published: number; draft: number; potential: number; reasons: string[] };
export type Inventory = { totals: { published: number; draft: number; archived: number; noindex: number; redirects: number }; rows: InventoryRow[]; generatedAt: string };

export async function pageInventory(pageDecisions: { decision: string }[] = []): Promise<Inventory> {
  await loadAiKey();
  const [pages, redirects, settings, gscConnected, lastDay, services, sectors] = await Promise.all([
    db.page.findMany({ select: { type: true, status: true, robotsIndex: true, autoNoindex: true, body: true, intro: true, path: true } }),
    db.redirect.count({ where: { active: true } }), getSettingsFresh(), isGscConnected(), lastDataDay(),
    db.service.count(), db.sector.count(),
  ]);
  const count = (types: string[], status?: string) => pages.filter((p) => types.includes(p.type) && (!status || p.status === status)).length;
  const hasGsc = Boolean(lastDay);
  const bizOk = businessIsComplete(settings.business);
  const ai = claudeAvailable();
  const newPageDecisions = pageDecisions.filter((d) => d.decision === "NEW_PAGE").length;
  const notNeeded = pageDecisions.filter((d) => d.decision === "PAGE_NOT_NEEDED").length;
  const LOC = ["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"];

  const locDraft = pages.filter((p) => LOC.includes(p.type) && p.status !== "PUBLISHED");
  const locEmpty = locDraft.filter((p) => !p.body?.trim()).length;
  const locationReasons = [
    !hasGsc && (gscConnected ? "Search Console bağlı ama henüz veri yok" : "Search Console bağlı değil → hangi il/ilçede gerçek talep olduğu bilinmiyor"),
    !bizOk && "İşletme adı/adresi doğrulanmadı → lokasyon kalite kapısının “Gerçek işletme bilgisi” maddesi geçilemez",
    `${locEmpty} taslak içeriksiz; şehir adı değiştirilmiş toplu metin (doorway / scaled content) bilinçli olarak üretilmez`,
    "Editörün doğruladığı yerel bilgi (il/ilçe notları) olmadan kalite kapısı geçilemez",
  ].filter(Boolean) as string[];

  const serviceDraft = count(["SERVICE"], "DRAFT"), sectorDraft = count(["SECTOR"], "DRAFT");
  const staticDrafts = pages.filter((p) => p.type === "STATIC" && p.status !== "PUBLISHED");
  const rows: InventoryRow[] = [
    {
      category: "Hizmet", published: count(["SERVICE"], "PUBLISHED"), draft: serviceDraft, potential: Math.max(0, services - count(["SERVICE"], "PUBLISHED")),
      reasons: serviceDraft || services > count(["SERVICE"], "PUBLISHED") ? ["Hizmet kaydı var ama yayında sayfası yok: gerçek hizmet bilgisi gerekir (otomatik hizmet uydurulmaz)"] : [`Tüm hizmetler (${services}) yayında; yeni hizmet sayfası ancak gerçek bir hizmet eklenirse açılır`],
    },
    {
      category: "Sektör", published: count(["SECTOR"], "PUBLISHED"), draft: sectorDraft, potential: Math.max(0, sectors - count(["SECTOR"], "PUBLISHED")),
      reasons: sectorDraft ? [`${sectorDraft} sektör taslağı: içerik tamamlanmamış`] : [`Tüm sektörler (${sectors}) yayında; yeni sektör sayfası için Search Console'da o sektörden gerçek talep gerekir${hasGsc ? "" : " (veri yok)"}`],
    },
    { category: "Lokasyon", published: count(LOC, "PUBLISHED"), draft: locDraft.length, potential: pageDecisions.filter((d) => d.decision === "FILL_LOCATION_DRAFT").length, reasons: locationReasons },
    {
      category: "Rehber (blog)", published: count(["BLOG_POST"], "PUBLISHED"), draft: count(["BLOG_POST"], "DRAFT"), potential: newPageDecisions,
      reasons: [
        hasGsc ? `${newPageDecisions} bilgi niyetli sorgu kümesi karşılanmamış (yeni rehber adayı)` : "Search Console verisi yok → karşılanmamış gerçek soru tespit edilemiyor",
        !ai && "Yapay zekâ anahtarı yok → yeni içerik uydurulmadan otomatik yazılamaz",
        notNeeded ? `${notNeeded} sorgu kümesi mevcut sayfalarla karşılanıyor (PAGE_NOT_NEEDED)` : null,
      ].filter(Boolean) as string[],
    },
    {
      category: "Diğer (kurumsal)", published: count(["STATIC", "HOME", "BLOG_INDEX"], "PUBLISHED"), draft: staticDrafts.length, potential: staticDrafts.length,
      reasons: staticDrafts.map((p) => `${p.path}: ${UNVERIFIED_RE.test(`${p.intro ?? ""} ${p.body ?? ""}`) ? "[DOĞRULANMALI] — gerçek işletme bilgisi (kuruluş, ekip) bekleniyor" : "taslak"}`),
    },
  ];
  return {
    totals: {
      published: pages.filter((p) => p.status === "PUBLISHED").length,
      draft: pages.filter((p) => p.status === "DRAFT").length,
      archived: pages.filter((p) => p.status === "ARCHIVED").length,
      noindex: pages.filter((p) => p.status === "PUBLISHED" && (!p.robotsIndex || p.autoNoindex)).length,
      redirects,
    },
    rows,
    generatedAt: new Date().toISOString(),
  };
}
