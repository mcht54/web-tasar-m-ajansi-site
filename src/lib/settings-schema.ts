// Ayar şemaları ve varsayılanlar (DB'siz; hem sunucu hem test kullanır).
// Varsayılanlar bilerek boştur: işletme bilgisi tahmin edilmez, yönetici girer.

import { z } from "zod";

const optStr = z.string().trim().max(500).optional().default("");

export const siteSchema = z.object({
  siteName: z.string().trim().min(2).max(80).default("Web Tasarım Ajansı"),
  logoId: optStr,
  faviconId: optStr,
  email: optStr,
  whatsapp: optStr, // yalnızca rakam, ülke koduyla: 905xxxxxxxxx
  social: z
    .object({
      instagram: optStr,
      facebook: optStr,
      linkedin: optStr,
      x: optStr,
      youtube: optStr,
    })
    .default({ instagram: "", facebook: "", linkedin: "", x: "", youtube: "" }),
});

export const seoSchema = z.object({
  titleTemplate: z.string().trim().max(120).default("%page% | Web Tasarım Ajansı"),
  defaultTitle: z.string().trim().max(120).default("Web Tasarım Ajansı | SEO Uyumlu Web Siteleri"),
  defaultDescription: z
    .string()
    .trim()
    .max(300)
    .default("Google'da bulunur, hızlı ve dönüşüm odaklı web siteleri. Kurumsal web tasarım, e-ticaret ve SEO hizmetleri için ücretsiz ön analiz alın."),
  defaultOgImageId: optStr,
  // Site genelinde indekslemeyi kapatmak yalnızca yazılı onayla mümkündür.
  allowIndexing: z.boolean().default(true),
  minWords: z
    .object({
      SERVICE: z.number().int().min(100).default(450),
      SERVICE_LOCATION: z.number().int().min(100).default(400),
      CITY: z.number().int().min(100).default(500),
      DISTRICT: z.number().int().min(100).default(300),
      SECTOR: z.number().int().min(100).default(350),
      SECTOR_LOCATION: z.number().int().min(100).default(350),
      BLOG_POST: z.number().int().min(100).default(500),
    })
    .default({ SERVICE: 450, SERVICE_LOCATION: 400, CITY: 500, DISTRICT: 300, SECTOR: 350, SECTOR_LOCATION: 350, BLOG_POST: 500 }),
  // Yapay zekâ botları. Arama/yanıt botları (ChatGPT araması, Perplexity, Claude
  // araması) içeriği kaynak göstererek önerir; eğitim botları modellere öğretir.
  aiSearchBots: z.boolean().default(true),
  aiTrainingBots: z.boolean().default(true),
  // Aynı türdeki başka sayfaya benzerlik bu eşiği aşarsa "kopya" sayılır.
  duplicateThreshold: z.number().min(0.2).max(0.95).default(0.55),
});

export const openingHoursSchema = z.object({
  days: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])),
  opens: z.string().regex(/^\d{2}:\d{2}$/),
  closes: z.string().regex(/^\d{2}:\d{2}$/),
});

export const businessSchema = z.object({
  name: optStr,
  legalName: optStr,
  type: z.enum(["LocalBusiness", "ProfessionalService", "Organization"]).default("LocalBusiness"),
  phone: optStr,
  email: optStr,
  street: optStr,
  district: optStr,
  city: optStr,
  postalCode: optStr,
  lat: z.number().min(35).max(43).nullable().default(null),
  lng: z.number().min(25).max(45).nullable().default(null),
  openingHours: z.array(openingHoursSchema).default([]),
  services: z.array(z.string().trim().max(80)).default([]),
  foundingYear: z.number().int().min(1990).max(2100).nullable().default(null),
  priceRange: optStr,
});

export const integrationsSchema = z.object({
  gaId: z.string().trim().regex(/^(G-[A-Z0-9]{4,20})?$/, "GA4 kimliği G- ile başlamalı").default(""),
  gtmId: z.string().trim().regex(/^(GTM-[A-Z0-9]{4,12})?$/, "GTM kimliği GTM- ile başlamalı").default(""),
  gscProperty: optStr, // "sc-domain:webtasarimajansi.net" veya "https://webtasarimajansi.net/"
  gscVerification: optStr, // google-site-verification meta içeriği
  bingVerification: optStr, // msvalidate.01 — Bing Webmaster (ChatGPT araması Bing dizinini kullanır)
  yandexVerification: optStr,
  indexNow: z.boolean().default(true), // yayın/güncellemede Bing, Yandex vb. anında bildirim
  aiProvider: z.enum(["none", "anthropic"]).default("none"),
  gscClientId: optStr, // Google OAuth istemci kimliği (sırrı şifreli sır tablosunda)
  aiModel: z.string().trim().max(80).default("claude-opus-5"),
});

export const robotsSchema = z.object({
  extraRules: z.string().max(4000).default(""),
});

// Haftalık SEO e-postası ve alarmlar. Gün: 0=Pazar … 6=Cumartesi (İstanbul saati).
export const emailSchema = z.object({
  enabled: z.boolean().default(true),
  recipient: z.string().trim().max(200).default("mchttasarim@gmail.com"),
  day: z.number().int().min(0).max(6).default(0),
  hour: z.number().int().min(0).max(23).default(23),
  criticalAlarms: z.boolean().default(true),
  notifyRising: z.boolean().default(true),
  notifyFalling: z.boolean().default(true),
  dailyReport: z.boolean().default(true), // her gün SEO ajanı raporu
  dailyHour: z.number().int().min(0).max(23).default(9),
  smtpHost: optStr,
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: optStr,
  smtpFrom: optStr,
  smtpFromName: optStr,
  // none: şifresiz (önerilmez) · starttls: 587 · ssl: 465 (smtpSecure eski kayıtlarla uyum için korunur)
  smtpEncryption: z.enum(["none", "starttls", "ssl"]).optional(),
});

export function smtpEncryptionOf(e: z.infer<typeof emailSchema>): "none" | "starttls" | "ssl" {
  return e.smtpEncryption ?? (e.smtpSecure ? "ssl" : "starttls");
}

export const AGENT_MODES = ["OBSERVE", "ASSIST", "AUTONOMOUS"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const autopilotSchema = z.object({
  // OBSERVE: yalnızca ölç · ASSIST: önerileri hazırla (onayla uygulanır) · AUTONOMOUS: güvenli işlemleri kendisi uygular
  mode: z.enum(AGENT_MODES).default("AUTONOMOUS"),
  enabled: z.boolean().default(true), // geriye uyumluluk: false ise ASSIST gibi davranır
  maxNewPagesPerWeek: z.number().int().min(0).max(10).default(3), // ölçek içerik (doorway) koruması
  autoApplySafe: z.boolean().default(true), // title, meta, iç link, kırık link
  autoApplyControlled: z.boolean().default(true), // doğrulanmış bilgiyle içerik genişletme
  maxChangesPerWeek: z.number().int().min(0).max(50).default(10),
  // Öneri onay penceresi: bu süre içinde onaylanmayan düşük/orta riskli öneri otomatik
  // uygulanır. 0 = pencere yok (güvenli öneri döngü içinde hemen uygulanır; eski davranış).
  approvalWindowHours: z.number().int().min(0).max(168).default(48),
});

// Rakip tarayıcı sınırları (nazik tarama: tek rakip, düşük eşzamanlılık, istekler arası bekleme)
export const competitorsSchema = z.object({
  maxPages: z.number().int().min(1).max(300).default(60),
  maxDepth: z.number().int().min(0).max(5).default(2),
  concurrency: z.number().int().min(1).max(3).default(1),
  timeoutMs: z.number().int().min(2000).max(30000).default(10000),
  delayMs: z.number().int().min(250).max(10000).default(1000),
  cacheHours: z.number().int().min(1).max(720).default(72),
  maxBytes: z.number().int().min(100_000).max(5_000_000).default(2_000_000),
});

export const settingSchemas = {
  site: siteSchema,
  seo: seoSchema,
  business: businessSchema,
  integrations: integrationsSchema,
  robots: robotsSchema,
  email: emailSchema,
  autopilot: autopilotSchema,
  competitors: competitorsSchema,
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SiteSettings = z.infer<typeof siteSchema>;
export type SeoSettings = z.infer<typeof seoSchema>;
export type BusinessSettings = z.infer<typeof businessSchema>;
export type IntegrationSettings = z.infer<typeof integrationsSchema>;
export type RobotsSettings = z.infer<typeof robotsSchema>;
export type EmailSettings = z.infer<typeof emailSchema>;
export type AutopilotSettings = z.infer<typeof autopilotSchema>;
export type CompetitorSettings = z.infer<typeof competitorsSchema>;
export type AllSettings = {
  competitors: CompetitorSettings;
  site: SiteSettings;
  seo: SeoSettings;
  business: BusinessSettings;
  integrations: IntegrationSettings;
  robots: RobotsSettings;
  email: EmailSettings;
  autopilot: AutopilotSettings;
};

export function parseSetting<K extends SettingKey>(key: K, value: unknown): AllSettings[K] {
  const r = settingSchemas[key].safeParse(value ?? {});
  // Bozuk kayıt siteyi çökertmesin: varsayılana düş.
  return (r.success ? r.data : settingSchemas[key].parse({})) as AllSettings[K];
}

export function defaultSettings(): AllSettings {
  return {
    site: parseSetting("site", {}),
    seo: parseSetting("seo", {}),
    business: parseSetting("business", {}),
    integrations: parseSetting("integrations", {}),
    robots: parseSetting("robots", {}),
    email: parseSetting("email", {}),
    autopilot: parseSetting("autopilot", {}),
    competitors: parseSetting("competitors", {}),
  };
}

/** LocalBusiness schema'sı ancak ad + telefon + tam adres gerçekten girilmişse üretilir. */
export function businessIsComplete(b: BusinessSettings): boolean {
  return Boolean(b.name && b.phone && b.street && b.city);
}

/** Etkin ajan modu (eski "enabled=false" ayarı ASSIST sayılır). */
export function agentMode(a: z.infer<typeof autopilotSchema>): AgentMode {
  return a.mode === "AUTONOMOUS" && !a.enabled ? "ASSIST" : a.mode;
}
