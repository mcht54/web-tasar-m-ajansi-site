// Aday hizmet kataloğu (saf; veritabanından bağımsız). Mevcut hizmetler de listededir.

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
