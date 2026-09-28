import type { Permission } from "@/lib/auth/permissions";

export type MenuItem = { href: string; label: string; perm?: Permission };
export type MenuSection = { title: string; items: MenuItem[] };

export const MENU: MenuSection[] = [
  { title: "Genel", items: [
    { href: "/yonetim", label: "Dashboard" },
    { href: "/yonetim/web-sitesi", label: "Web Sitesi" },
  ] },
  { title: "İçerik", items: [
    { href: "/yonetim/sayfalar", label: "Sayfalar", perm: "content" },
    { href: "/yonetim/hizmetler", label: "Hizmetler", perm: "content" },
    { href: "/yonetim/lokasyonlar", label: "Lokasyonlar", perm: "content" },
    { href: "/yonetim/sektorler", label: "Sektörler", perm: "content" },
    { href: "/yonetim/blog", label: "Blog", perm: "content" },
    { href: "/yonetim/referanslar", label: "Referanslar", perm: "content" },
    { href: "/yonetim/medya", label: "Medya", perm: "media" },
  ] },
  { title: "SEO", items: [
    { href: "/yonetim/oneriler", label: "Öneriler (48 saat onay)", perm: "seo" },
    { href: "/yonetim/icerik-plani", label: "İçerik Planı", perm: "seo" },
    { href: "/yonetim/autopilot", label: "SEO Otopilot", perm: "seo" },
    { href: "/yonetim/anahtar-kelimeler", label: "Anahtar Kelimeler", perm: "seo" },
    { href: "/yonetim/seo-analiz", label: "SEO Analiz", perm: "seo" },
    { href: "/yonetim/siralama", label: "Sıralama Takibi", perm: "seo" },
    { href: "/yonetim/hizli-kazanimlar", label: "Hızlı Kazanımlar", perm: "seo" },
    { href: "/yonetim/lokasyon-talebi", label: "Lokasyon Talebi", perm: "seo" },
    { href: "/yonetim/search-console", label: "Search Console", perm: "seo" },
    { href: "/yonetim/rakipler", label: "Rakip Analizi", perm: "seo" },
    { href: "/yonetim/ic-linkler", label: "Internal Linkler", perm: "seo" },
    { href: "/yonetim/firsatlar", label: "SEO Fırsatları", perm: "seo" },
    { href: "/yonetim/seo-sagligi", label: "SEO Sağlığı", perm: "seo" },
    { href: "/yonetim/schema", label: "Schema", perm: "seo" },
    { href: "/yonetim/yonlendirmeler", label: "Redirects / 404", perm: "seo" },
    { href: "/yonetim/sitemap", label: "Sitemap", perm: "seo" },
    { href: "/yonetim/ai-asistan", label: "AI Asistanı", perm: "seo" },
    { href: "/yonetim/ai-gorunurluk", label: "AI Görünürlüğü", perm: "seo" },
  ] },
  { title: "İş", items: [
    { href: "/yonetim/leadler", label: "Lead / Teklif Talepleri", perm: "leads" },
  ] },
  { title: "Sistem", items: [
    { href: "/yonetim/ayarlar", label: "Ayarlar", perm: "settings" },
    { href: "/yonetim/kullanicilar", label: "Kullanıcılar", perm: "users" },
    { href: "/yonetim/loglar", label: "Loglar", perm: "logs" },
  ] },
];
