// Yapay zekâ çıktısını veritabanına yazmadan önce temizler (saf). Site Markdown'ı zaten
// güvenli işler (ham HTML kaçışlanır, bağlantı şemaları beyaz listede); bu katman ayrıca
// saklanan metnin de temiz olmasını ve güvenlik açığı taşıyan çıktının fark edilmesini sağlar.

const TAG = /<\/?[a-z!][^>]*>/gi;
const DANGEROUS_LINK = /\]\(\s*(javascript|data|vbscript|file):[^)]*\)/gi;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

/** HTML etiketi, tehlikeli bağlantı şeması veya görünmez/yön değiştiren karakter var mı? */
export function unsafeMarkup(s: string): string[] {
  const out: string[] = [];
  if (new RegExp(TAG.source, "i").test(s)) out.push("HTML etiketi");
  if (new RegExp(DANGEROUS_LINK.source, "i").test(s)) out.push("tehlikeli bağlantı şeması");
  if (/on\w+\s*=\s*["']/i.test(s)) out.push("olay özniteliği (on…=)");
  if (new RegExp(CONTROL.source).test(s)) out.push("görünmez/kontrol karakteri");
  return out;
}

/** Etiketleri ve tehlikeli bağlantıları kaldırır; görünmez karakterleri siler. */
export function sanitizeAiText(s: string): string {
  return s
    .replace(CONTROL, "")
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(TAG, "")
    .replace(DANGEROUS_LINK, "(#)")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Nesnedeki tüm metin alanlarını temizler (derin). */
export function sanitizeDeep<T>(v: T): T {
  if (typeof v === "string") return sanitizeAiText(v) as T;
  if (Array.isArray(v)) return v.map((x) => sanitizeDeep(x)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitizeDeep(x)])) as T;
  return v;
}
