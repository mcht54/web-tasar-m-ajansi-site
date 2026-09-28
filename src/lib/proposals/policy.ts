// Öneri politikası (saf, yan etkisiz): risk düzeyi, otomatik uygulanabilirlik ve yasak
// alanlar. Uygulama hattı bu kuralları hem öneri oluşturulurken hem de uygulamadan hemen
// önce yeniden uygular (ayar veya veri sonradan değişmiş olabilir).

import { createHash } from "node:crypto";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Category = "SEO" | "CONTENT" | "COMPETITOR" | "SERVICE" | "LOCAL" | "PERFORMANCE" | "TECH";

export const CATEGORY_LABELS: Record<Category, string> = {
  SEO: "SEO", CONTENT: "İçerik", COMPETITOR: "Rakip analizi", SERVICE: "Hizmet sayfası",
  LOCAL: "Lokal SEO", PERFORMANCE: "Performans", TECH: "Teknik SEO",
};
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek", CRITICAL: "Kritik" };

export const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Onay bekliyor", applying: "Uygulanıyor", applied: "Uygulandı", failed: "Başarısız",
  rejected: "Reddedildi", rolled_back: "Geri alındı", blocked: "Uygulanamaz (ön koşul eksik)",
  needs_approval: "İnsan kararı gerekli", skipped: "Atlandı", planned: "Planlandı", approved: "Onaylandı (eski kayıt)",
};

/** Beklenen SEO etkisi (tahmin değil, değişikliğin hedeflediği mekanizma; sonuç deneyle ölçülür). */
export const EXPECTED_IMPACT: Record<string, string> = {
  TITLE: "Arama sonucunda tıklama oranı (CTR) artışı hedeflenir; sonuç Search Console deneyiyle ölçülür.",
  META: "Arama sonucundaki açıklama sorguyla eşleşir; CTR artışı hedeflenir, deneyle ölçülür.",
  INTERNAL_LINK: "Hedef sayfaya bağlamsal iç link: taranabilirlik ve site içi otorite artar.",
  BROKEN_LINK: "Kırık link düzelir: ziyaretçi ve tarayıcı 404'e/zincire düşmez.",
  CONTENT: "Sayfa arama niyetini daha kapsamlı karşılar; ilgili sorgularda görünürlük hedeflenir.",
  NEW_PAGE: "Karşılanmayan gerçek arama talebi için yeni sayfa; mevcut sayfalarla yarışmaz.",
  LOCATION: "Gerçek yerel talep için sayfa kararı (insan onayı).",
  H1: "Sayfanın tek ve açık bir ana başlığı olur.",
  KEYWORD: "Sayfanın hedef kelimesi tanımlanır: analiz, iç link ve sıralama takibi bu kelimeyle çalışır.",
  SECONDARY_KEYWORDS: "Sayfanın gerçekte göründüğü sorgular ikincil kelime olarak izlenir.",
  EXCERPT: "Liste ve paylaşımlarda sayfanın kendi girişinden kısa özet görünür.",
  OG_IMAGE: "Sosyal paylaşımlarda sayfanın kendi görseli kullanılır.",
  ALT_TEXT: "Görseller erişilebilir olur ve görsel aramada anlaşılır.",
  INTRO: "Sayfanın ilk paragrafı arama niyetine doğrudan yanıt verir.",
  FAQ: "Sık sorulan sorular sayfadaki bilgilerle yanıtlanır; 2+ soru FAQPage verisini açar.",
  TECH: "Teknik/indeksleme kararı (insan onayı).",
};

/** Süre dolunca otomatik uygulanabilecek türler (yalnızca LOW/MEDIUM risk ile). */
export const AUTO_APPLY_TYPES = new Set(["TITLE", "META", "INTERNAL_LINK", "BROKEN_LINK", "CONTENT", "NEW_PAGE", "H1", "KEYWORD", "SECONDARY_KEYWORDS", "EXCERPT", "OG_IMAGE", "ALT_TEXT", "INTRO", "FAQ"]);

/** Yayın durumunu (status) değiştirebilen TEK tür: yeni sayfanın taslak → yayın geçişi. */
export const STATUS_CHANGE_TYPES = new Set(["NEW_PAGE"]);

/**
 * Otomatik uygulamada ASLA değiştirilmeyen alanlar: URL yapısı, indeksleme, canonical.
 * (Yönlendirme, robots.txt, kullanıcı, sır, DNS, hosting, ödeme ve silme bu hattın
 * değiştirebileceği alanlar arasında hiç yoktur.)
 */
export const FORBIDDEN_FIELDS = new Set(["path", "canonical", "robotsIndex", "robotsFollow", "schemaDisabled"]);

export type ChangeLike = { field: string; before: unknown; after: unknown };
export type ChangeSetLike = { pages: { pageId: string; path: string; changes: ChangeLike[] }[] };

/** Değişikliklerin risk düzeyi: tür riski + dokunulan alanlar. */
export function riskLevelFor(risk: string, changes: ChangeSetLike | null, type?: string): RiskLevel {
  const fields = (changes?.pages ?? []).flatMap((p) => p.changes.map((c) => c.field));
  if (fields.some((f) => f === "canonical" || f === "robotsIndex" || f === "robotsFollow" || f === "path")) return "CRITICAL";
  if (fields.some((f) => FORBIDDEN_FIELDS.has(f))) return "HIGH";
  // Durum değişikliği yalnızca yeni sayfanın yayına alınması olabilir (silme/arşivleme değil)
  if (fields.includes("status") && !(type === "NEW_PAGE" && changes!.pages.every((p) => p.changes.every((c) => c.field !== "status" || (c.before === "DRAFT" && c.after === "PUBLISHED"))))) return "HIGH";
  return risk === "AUTO" ? "LOW" : risk === "CONTROLLED" ? "MEDIUM" : "HIGH";
}

export function hasChanges(changes: ChangeSetLike | null | undefined): changes is ChangeSetLike {
  return Boolean(changes?.pages?.some((p) => p.changes.length > 0));
}

/** Otomatik uygulamaya uygun mu? Neden uygun değilse nedeni döner. */
export function autoApplyBlocker(p: { type: string; riskLevel: string | null; proposedChanges: unknown }): string | null {
  const changes = p.proposedChanges as ChangeSetLike | null;
  if (!hasChanges(changes)) return "Uygulanacak somut değişiklik yok";
  if (!AUTO_APPLY_TYPES.has(p.type)) return "Bu tür otomatik uygulanmaz";
  if (p.riskLevel !== "LOW" && p.riskLevel !== "MEDIUM") return `Risk düzeyi ${p.riskLevel ?? "bilinmiyor"}: yalnızca insan onayıyla`;
  const bad = changes.pages.flatMap((x) => x.changes).find((c) => FORBIDDEN_FIELDS.has(c.field));
  if (bad) return `“${bad.field}” alanı otomatik değiştirilemez`;
  return null;
}

/** Onay penceresinin sonu. */
export function expiryFor(createdAt: Date, windowHours: number): Date {
  return new Date(createdAt.getTime() + windowHours * 3600_000);
}

/** Aynı önerinin (aynı tür + hedef + aynı yeni değer) tekrar üretilmesini engelleyen parmak izi. */
export function fingerprintOf(key: string, changes: ChangeSetLike | null): string {
  const body = JSON.stringify((changes?.pages ?? []).map((p) => [p.pageId, p.changes.map((c) => [c.field, c.after])]));
  return `${key}#${createHash("sha1").update(body).digest("hex").slice(0, 16)}`;
}

/** Kalan süre metni (panel ve rapor). */
export function remainingText(expiresAt: Date | null, now: Date): string | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return "süre doldu";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}
