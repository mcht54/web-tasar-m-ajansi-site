import "server-only";
// İÇERİK FIRSATLARI: (1) yenilenmesi gereken sayfalar, (2) yeni hizmet sayfası kararları,
// (3) ilçe öncelik skoru. Yalnızca ölçülen veriyle karar verilir; ölçülemeyen kriter
// (işletme yoğunluğu, rekabet) skora katılmaz ve "doğrulanamadı" olarak gösterilir.

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { analyzePage, loadSiteState } from "../seo/analyzer";
import { computeQuickWins } from "../seo/quick-wins";
import { locationDemand } from "../seo/location-demand";
import { siteUrl } from "../env";
import { foldKeyword } from "../text/slug";
import { serviceVerified } from "../autopilot/new-page";

// ─── 1) İçerik yenileme ─────────────────────────────────────────────────────

export const STALE_DAYS = 180;
const SKIP_TYPES = new Set(["HOME", "STATIC", "BLOG_INDEX"]);

export type RefreshCandidate = { pageId: string; path: string; type: string; score: number; reasons: string[]; query: string | null };

/** Yayındaki, indekslenebilir sayfalar arasında zayıf/eski olanlar (önem sırasıyla). */
export async function refreshCandidates(now = new Date()): Promise<RefreshCandidate[]> {
  const [st, qw] = await Promise.all([loadSiteState(), computeQuickWins()]);
  const base = siteUrl();
  const declining = new Map<string, string>();
  for (const it of qw.items) if (it.category === "DECLINE" && it.page?.startsWith(base)) declining.set(it.page.slice(base.length) || "/", it.query);
  const out: RefreshCandidate[] = [];
  for (const p of st.pages) {
    if (p.status !== "PUBLISHED" || !p.robotsIndex || p.autoNoindex || SKIP_TYPES.has(p.type)) continue;
    const a = analyzePage(p, st);
    const reasons: string[] = [];
    let score = 0;
    const len = a.seo.checks.find((c) => c.id === "length");
    if (len?.status === "FAIL" || len?.status === "WARN") { reasons.push(`İçerik yetersiz: ${len.message}`); score += len.status === "FAIL" ? 40 : 25; }
    const ageDays = Math.floor((now.getTime() - new Date(p.contentUpdatedAt).getTime()) / 86400_000);
    if (ageDays >= STALE_DAYS) { reasons.push(`İçerik ${ageDays} gündür güncellenmedi`); score += 20; }
    if (a.quality.score < 70) { reasons.push(`İçerik kalite skoru ${a.quality.score}/100`); score += 15; }
    const q = declining.get(p.path);
    if (q) { reasons.push(`Search Console: “${q}” sorgusunda tıklama düşüşü`); score += 30; }
    if (reasons.length) out.push({ pageId: p.id, path: p.path, type: p.type, score, reasons, query: q ?? null });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ─── 2) Hizmet sayfaları ────────────────────────────────────────────────────

export type ServiceDef = { path: string; name: string; primary: string; patterns: string[]; weight: number; overlaps?: string; summary: string };

/** Aday hizmet kataloğu (ticari niyetli). Mevcut hizmetler de listededir → "kapsanıyor". */
export const SERVICE_CATALOG: ServiceDef[] = [
  { path: "/web-tasarim", name: "Web Tasarım", primary: "web tasarım", patterns: ["web tasarim"], weight: 10, summary: "" },
  { path: "/kurumsal-web-tasarim", name: "Kurumsal Web Tasarım", primary: "kurumsal web tasarım", patterns: ["kurumsal web"], weight: 10, summary: "" },
  { path: "/e-ticaret-web-tasarim", name: "E-Ticaret Web Tasarım", primary: "e-ticaret sitesi", patterns: ["e ticaret", "eticaret"], weight: 10, summary: "" },
  { path: "/seo-hizmeti", name: "SEO Hizmeti", primary: "seo hizmeti", patterns: ["seo hizmet", "seo ajans", "seo firma"], weight: 9, summary: "" },
  { path: "/google-ads-yonetimi", name: "Google Ads Yönetimi", primary: "google ads yönetimi", patterns: ["google ads", "adwords", "google reklam"], weight: 8, summary: "" },
  { path: "/ozel-web-yazilim", name: "Özel Web Yazılım", primary: "özel web yazılım", patterns: ["ozel yazilim", "web yazilim", "web uygulama"], weight: 8, summary: "" },
  { path: "/landing-page-tasarimi", name: "Landing Page Tasarımı", primary: "landing page tasarımı", patterns: ["landing page", "acilis sayfasi", "kampanya sayfasi"], weight: 8, summary: "Reklam ve kampanya trafiği için tek amaçlı, dönüşüm odaklı açılış sayfaları." },
  { path: "/google-isletme-profili-optimizasyonu", name: "Google İşletme Profili Optimizasyonu", primary: "google işletme profili optimizasyonu", patterns: ["google isletme", "benim isletmem", "isletme profili", "google haritalar kayit"], weight: 8, summary: "Google Haritalar ve yerel aramalar için işletme profilinin düzenlenmesi." },
  { path: "/wordpress-web-tasarim", name: "WordPress Web Tasarım", primary: "wordpress web tasarım", patterns: ["wordpress site", "wordpress web", "wordpress tema"], weight: 8, summary: "WordPress ile yönetilebilir kurumsal ve içerik siteleri." },
  { path: "/web-sitesi-bakim-hizmeti", name: "Web Sitesi Bakım Hizmeti", primary: "web sitesi bakım hizmeti", patterns: ["site bakim", "web sitesi bakim", "bakim anlasmasi"], weight: 7, summary: "Güncelleme, yedekleme, güvenlik ve içerik desteği." },
  { path: "/web-sitesi-hiz-optimizasyonu", name: "Web Sitesi Hız Optimizasyonu", primary: "web sitesi hız optimizasyonu", patterns: ["hiz optimizasyon", "site hizlandirma", "pagespeed", "core web vitals"], weight: 7, summary: "Core Web Vitals ve sayfa hızı iyileştirmeleri." },
  { path: "/sosyal-medya-yonetimi", name: "Sosyal Medya Yönetimi", primary: "sosyal medya yönetimi", patterns: ["sosyal medya"], weight: 7, summary: "Sosyal medya hesaplarının planlı içerikle yönetimi." },
  { path: "/dijital-pazarlama", name: "Dijital Pazarlama", primary: "dijital pazarlama ajansı", patterns: ["dijital pazarlama", "internet pazarlama"], weight: 7, summary: "Web sitesi, SEO, reklam ve sosyal medyanın birlikte planlanması." },
  { path: "/seo-icerik-yazarligi", name: "SEO İçerik Yazarlığı", primary: "seo içerik yazarlığı", patterns: ["icerik yazarligi", "icerik uretimi", "seo makale", "blog yazarligi"], weight: 6, summary: "Arama niyetine göre planlanan özgün site ve blog içerikleri." },
  { path: "/donusum-orani-optimizasyonu", name: "Dönüşüm Oranı Optimizasyonu", primary: "dönüşüm oranı optimizasyonu", patterns: ["donusum orani", "donusum optimizasyonu", "cro "], weight: 6, summary: "Ziyaretçiyi talebe dönüştüren sayfa ve form iyileştirmeleri." },
  { path: "/kurumsal-kimlik-tasarimi", name: "Kurumsal Kimlik Tasarımı", primary: "kurumsal kimlik tasarımı", patterns: ["kurumsal kimlik", "logo tasarim", "marka kimligi"], weight: 6, summary: "Logo, renk ve tipografi sistemini kapsayan marka kimliği." },
  { path: "/grafik-tasarim", name: "Grafik Tasarım", primary: "grafik tasarım", patterns: ["grafik tasarim"], weight: 5, summary: "Basılı ve dijital tanıtım materyalleri." },
  // Konusu mevcut SEO sayfasının içinde: ayrı sayfa cannibalization yaratır → mevcut sayfa genişletilir
  { path: "/teknik-seo", name: "Teknik SEO", primary: "teknik seo", patterns: ["teknik seo"], weight: 6, overlaps: "/seo-hizmeti", summary: "" },
];

export type ServiceDecisionKind = "COVERED" | "EXPAND_EXISTING" | "UNVERIFIED" | "NO_DEMAND_SIGNAL" | "NEW_SERVICE_PAGE";
export const SERVICE_DECISION_LABELS: Record<ServiceDecisionKind, string> = {
  COVERED: "Mevcut sayfa karşılıyor", EXPAND_EXISTING: "Mevcut sayfa genişletilmeli (ayrı sayfa cannibalization yaratır)",
  UNVERIFIED: "Hizmetin verildiği doğrulanmadı", NO_DEMAND_SIGNAL: "Talep sinyali yok (körlemesine sayfa açılmaz)", NEW_SERVICE_PAGE: "Yeni hizmet sayfası önerilir",
};

export type ServiceDecision = ServiceDef & { decision: ServiceDecisionKind; reason: string; coveredBy: string | null; gscImpressions: number | null; trackedKeywords: number; queries: string[]; score: number };

export async function serviceOpportunities(): Promise<{ rows: ServiceDecision[]; hasGsc: boolean }> {
  const since = new Date(Date.now() - 90 * 86400_000);
  const [settings, pages, keywords, gscRows] = await Promise.all([
    getSettingsFresh(),
    db.page.findMany({ where: { type: { in: ["SERVICE", "SECTOR", "BLOG_POST"] } }, select: { path: true, type: true, status: true, name: true, h1: true, primaryKeyword: true } }),
    db.keyword.findMany({ where: { status: "ACTIVE" }, select: { phrase: true } }),
    db.gscQueryDaily.groupBy({ by: ["query"], where: { date: { gte: since } }, _sum: { impressions: true } }),
  ]);
  const hasGsc = (await db.gscQueryDaily.count()) > 0;
  const match = (text: string, d: ServiceDef) => { const f = ` ${foldKeyword(text).replace(/-/g, " ")} `; return d.patterns.some((p) => f.includes(` ${p}`)); };
  const rows: ServiceDecision[] = SERVICE_CATALOG.map((d) => {
    const qs = gscRows.filter((r) => match(r.query, d));
    const gscImpressions = hasGsc ? qs.reduce((s, r) => s + (r._sum.impressions ?? 0), 0) : null;
    const trackedKeywords = keywords.filter((k) => match(k.phrase, d)).length;
    const score = Math.round(Math.min(100, d.weight * 5 + (gscImpressions ? Math.min(40, Math.log10(gscImpressions + 1) * 15) : 0) + Math.min(10, trackedKeywords * 2)));
    const base = { ...d, gscImpressions, trackedKeywords, queries: qs.sort((a, b) => (b._sum.impressions ?? 0) - (a._sum.impressions ?? 0)).slice(0, 8).map((r) => r.query), score, coveredBy: null as string | null };
    const own = pages.find((p) => p.path === d.path);
    if (own) return { ...base, decision: "COVERED" as const, coveredBy: own.path, reason: own.status === "PUBLISHED" ? "Bu hizmetin sayfası yayında" : `Taslak sayfa mevcut (${own.path})` };
    const other = pages.find((p) => p.type === "SERVICE" && p.status === "PUBLISHED" && match(`${p.primaryKeyword ?? ""} ${p.h1 ?? ""} ${p.name}`, d));
    if (other) return { ...base, decision: "COVERED" as const, coveredBy: other.path, reason: `Aynı niyeti ${other.path} karşılıyor` };
    if (d.overlaps && pages.some((p) => p.path === d.overlaps && p.status === "PUBLISHED")) return { ...base, decision: "EXPAND_EXISTING" as const, coveredBy: d.overlaps, reason: `Konu ${d.overlaps} sayfasının kapsamında; ayrı sayfa aynı sorgularda yarışır` };
    if (!serviceVerified(d.name, settings.business.services)) return { ...base, decision: "UNVERIFIED" as const, reason: `Ayarlar → İşletme → Hizmetler listesinde “${d.name}” yok. Verilmeyen hizmet için sayfa açılmaz.` };
    if (!(gscImpressions && gscImpressions >= 10) && trackedKeywords === 0) return { ...base, decision: "NO_DEMAND_SIGNAL" as const, reason: hasGsc ? "Search Console'da ilgili sorgu gösterimi yok ve takip edilen anahtar kelime yok" : "Search Console bağlı değil ve takip edilen anahtar kelime yok (Anahtar Kelimeler ekranından eklenebilir)" };
    return { ...base, decision: "NEW_SERVICE_PAGE" as const, reason: `Doğrulanmış hizmet; ${gscImpressions ? `${gscImpressions} gösterim (90 gün)` : ""}${gscImpressions && trackedKeywords ? ", " : ""}${trackedKeywords ? `${trackedKeywords} takip edilen kelime` : ""}` };
  });
  return { rows: rows.sort((a, b) => b.score - a.score), hasGsc };
}

// ─── 3) İlçe öncelik skoru ──────────────────────────────────────────────────

export const DISTRICT_CRITERIA = [
  { key: "population", label: "İlçe nüfusu (resmî)", max: 30, measured: true },
  { key: "province", label: "İl büyüklüğü (nüfus payı)", max: 10, measured: true },
  { key: "demand", label: "Search Console yerel talep (90 gün)", max: 30, measured: true },
  { key: "serviceArea", label: "Mchttasarım hizmet alanı (Ayarlar → İşletme → Şehir)", max: 15, measured: true },
  { key: "draft", label: "Hazır taslak sayfa", max: 5, measured: true },
  { key: "commerce", label: "Ticari/işletme yoğunluğu", max: 0, measured: false },
  { key: "competition", label: "Rekabet", max: 0, measured: false },
] as const;

export type DistrictPriority = {
  districtId: number; provinceId: number; name: string; province: string; path: string | null; pageId: string | null; pageStatus: string | null;
  population: number | null; score: number; parts: Record<string, number>; blockers: string[];
};

/** 973 ilçe için öncelik; yayında olanlar hariç. Blokörler: yayın kapısının insan gerektiren ön koşulları. */
export async function districtPriorities(): Promise<{ rows: DistrictPriority[]; hasGsc: boolean; notes: string[] }> {
  const [settings, districts, pages, demand] = await Promise.all([
    getSettingsFresh(),
    db.district.findMany({ include: { province: { select: { name: true, population: true } } } }),
    db.page.findMany({ where: { type: "DISTRICT" }, select: { id: true, path: true, status: true, districtId: true } }),
    locationDemand(90),
  ]);
  const maxPop = Math.max(1, ...districts.map((d) => d.population ?? 0));
  const maxProv = Math.max(1, ...districts.map((d) => d.province.population ?? 0));
  const city = settings.business.city ? foldKeyword(settings.business.city) : null;
  const businessReady = Boolean(settings.business.name);
  const byDistrict = new Map(demand.rows.filter((r) => r.districtId).map((r) => [r.districtId!, r]));
  const pageOf = new Map(pages.map((p) => [p.districtId!, p]));
  const rows: DistrictPriority[] = [];
  for (const d of districts) {
    const page = pageOf.get(d.id) ?? null;
    if (page?.status === "PUBLISHED") continue;
    const dem = byDistrict.get(d.id);
    const parts = {
      population: d.population ? Math.round((30 * Math.log10(d.population)) / Math.log10(maxPop)) : 0,
      province: d.province.population ? Math.round(10 * Math.sqrt(d.province.population / maxProv)) : 0,
      demand: dem ? Math.min(30, Math.round(Math.log10(dem.impressions + 1) * 12)) : 0,
      serviceArea: city && foldKeyword(d.province.name) === city ? 15 : 0,
      draft: page ? 5 : 0,
    };
    const blockers = [
      !businessReady && "İşletme adı girilmemiş (Ayarlar → İşletme)",
      !d.localNotes?.trim() && "İlçe için doğrulanmış yerel bilgi (editör notu) yok",
      !page && "İlçe sayfası yok",
    ].filter(Boolean) as string[];
    rows.push({ districtId: d.id, provinceId: d.provinceId, name: d.name, province: d.province.name, path: page?.path ?? null, pageId: page?.id ?? null, pageStatus: page?.status ?? null, population: d.population, score: Object.values(parts).reduce((s, x) => s + x, 0), parts, blockers });
  }
  const notes = [
    demand.hasGsc ? "Search Console yerel talebi skora dahil." : "Search Console bağlı değil: yerel talep 0 sayıldı (tahmin yapılmaz).",
    city ? `Hizmet alanı: ${settings.business.city}.` : "İşletme şehri girilmemiş: hizmet alanı Türkiye geneli (uzaktan) kabul edildi, bölge puanı verilmedi.",
    "Ticari/işletme yoğunluğu ve rekabet için güvenilir veri kaynağı bağlı değil: doğrulanamadı, skora katılmadı.",
  ];
  return { rows: rows.sort((a, b) => b.score - a.score || (b.population ?? 0) - (a.population ?? 0)), hasGsc: demand.hasGsc, notes };
}
