import "server-only";
// Google Search Console — OAuth 2.0 bağlantısı (panelden "Google Search Console'u Bağla").
// İstemci kimliği ayarlarda, istemci sırrı ve yenileme token'ı şifreli sır tablosunda
// saklanır; token'lar hiçbir ekranda gösterilmez. Kapsam yalnızca okuma (webmasters.readonly).

import { getSecret, getSettingsFresh, setSecret, deleteSecret } from "../settings";
import { siteUrl } from "../env";
import { hmac } from "../crypto";

export const GSC_OAUTH_SECRET = "gsc.oauth"; // { refreshToken, email, connectedAt }
export const GSC_CLIENT_SECRET = "gsc.oauthClientSecret";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const tokenCache = new Map<string, { token: string; exp: number }>();

export type OAuthConnection = { refreshToken: string; email: string | null; connectedAt: string };

export const redirectUri = () => `${siteUrl()}/api/integrations/gsc/callback`;

/** CSRF koruması: state = zaman damgası + oturum kullanıcısına bağlı HMAC. */
export function makeState(userId: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${hmac(`gsc-oauth:${userId}:${ts}`).slice(0, 32)}`;
}
export function checkState(state: string | null, userId: string, now = Date.now()): boolean {
  if (!state) return false;
  const [ts, sig] = state.split(".");
  if (!ts || !sig || now - Number(ts) > 15 * 60_000) return false;
  return hmac(`gsc-oauth:${userId}:${ts}`).slice(0, 32) === sig;
}

export async function oauthConfig(): Promise<{ clientId: string; clientSecret: string } | null> {
  const [s, secret] = await Promise.all([getSettingsFresh(), getSecret(GSC_CLIENT_SECRET)]);
  return s.integrations.gscClientId && secret ? { clientId: s.integrations.gscClientId, clientSecret: secret } : null;
}

export async function authUrl(userId: string): Promise<string> {
  const cfg = await oauthConfig();
  if (!cfg) throw new Error("Önce Google OAuth istemci kimliği ve sırrını girin");
  const q = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: redirectUri(), response_type: "code", scope: `${GSC_SCOPE} openid email`,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: makeState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function exchangeCode(code: string, fetchImpl: typeof fetch = fetch): Promise<OAuthConnection> {
  const cfg = await oauthConfig();
  if (!cfg) throw new Error("OAuth istemci ayarı yok");
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const data = (await res.json()) as { refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.refresh_token) throw new Error(`Google yetkilendirmesi başarısız: ${data.error_description ?? data.error ?? "yenileme token'ı alınamadı"}`);
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from(String(data.id_token).split(".")[1], "base64url").toString()).email ?? null;
  } catch {
    email = null;
  }
  const conn = { refreshToken: data.refresh_token, email, connectedAt: new Date().toISOString() };
  await setSecret(GSC_OAUTH_SECRET, JSON.stringify(conn));
  tokenCache.clear();
  return conn;
}

export async function oauthConnection(): Promise<OAuthConnection | null> {
  const raw = await getSecret(GSC_OAUTH_SECRET);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthConnection;
  } catch {
    return null;
  }
}

/** Yenileme token'ından erişim token'ı (önbellekli). */
export function oauthTokenSource(conn: OAuthConnection, cfg: { clientId: string; clientSecret: string }) {
  return async (fetchImpl: typeof fetch): Promise<string> => {
    const c = tokenCache.get(conn.refreshToken);
    if (c && c.exp > Date.now() + 60_000) return c.token;
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: conn.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }),
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !data.access_token) throw new Error(`Search Console bağlantısı yenilenemedi (${data.error ?? res.status}): yeniden bağlanın`);
    tokenCache.set(conn.refreshToken, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 });
    return data.access_token;
  };
}

/** Bağlantıyı kes: Google tarafında token'ı iptal et ve şifreli kaydı sil. */
export async function disconnect(fetchImpl: typeof fetch = fetch): Promise<void> {
  const conn = await oauthConnection();
  if (conn) await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refreshToken)}`, { method: "POST" }).catch(() => undefined);
  await deleteSecret(GSC_OAUTH_SECRET);
  tokenCache.clear();
}
