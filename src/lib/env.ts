// Ortam değişkenleri tek yerden okunur; eksik kritik değer erken ve açık hata verir.

export function siteUrl(): string {
  const raw = process.env.SITE_URL || "http://localhost:3300";
  return raw.replace(/\/+$/, "");
}

export function siteHost(): string {
  return new URL(siteUrl()).host;
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return siteUrl() + (path.startsWith("/") ? path : `/${path}`);
}

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new Error("APP_SECRET en az 32 karakter olmalı (openssl rand -base64 32)");
  }
  return s;
}

export function mediaDir(): string {
  return process.env.MEDIA_DIR || "./storage/media";
}

export const isProduction = process.env.NODE_ENV === "production";
