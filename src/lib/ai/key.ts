import "server-only";
// Anthropic API anahtarı: yönetim panelinden girilir, AES-256-GCM ile şifreli
// saklanır (sır tablosu), hiçbir ekranda düz metin gösterilmez. ANTHROPIC_API_KEY
// ortam değişkeni varsa geriye uyumluluk için o da kabul edilir.
// Senkron erişim için süreç içi önbellek: her AI kullanımından önce loadAiKey().

import { getSecret } from "../settings";

export const ANTHROPIC_SECRET = "anthropic.apiKey";
const TTL_MS = 60_000;
const cache: { key: string | null; at: number } = { key: null, at: 0 };

export async function loadAiKey(force = false): Promise<string | null> {
  if (!force && Date.now() - cache.at < TTL_MS) return cache.key ?? process.env.ANTHROPIC_API_KEY ?? null;
  cache.key = (await getSecret(ANTHROPIC_SECRET).catch(() => null)) || null;
  cache.at = Date.now();
  return cache.key ?? process.env.ANTHROPIC_API_KEY ?? null;
}

/** Önbellekteki anahtar (loadAiKey sonrası). */
export function cachedAiKey(): string | null {
  return cache.key ?? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? null;
}

/** Panel kaydından sonra süreç içi önbelleği hemen tazelemek için. */
export function resetAiKeyCache() {
  cache.at = 0;
}

export function maskKey(k: string | null): string | null {
  return k ? `${k.slice(0, 7)}…${k.slice(-4)}` : null;
}
