import "server-only";
// Google Search Console API istemcisi. Servis hesabı JSON anahtarıyla çalışır:
// Search Console'da mülke servis hesabının e-postası "kullanıcı" olarak eklenmelidir.

import { createSign } from "node:crypto";

export type ServiceAccount = { client_email: string; private_key: string; project_id?: string };

export function parseServiceAccount(json: string): ServiceAccount {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new Error("Geçerli bir JSON değil");
  }
  const sa = v as Partial<ServiceAccount> & { type?: string };
  if (sa.type !== "service_account" || !sa.client_email || !sa.private_key?.includes("PRIVATE KEY")) {
    throw new Error("Servis hesabı JSON anahtarı bekleniyor (type: service_account, client_email, private_key)");
  }
  return { client_email: sa.client_email, private_key: sa.private_key, project_id: sa.project_id };
}

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const tokenCache = new Map<string, { token: string; exp: number }>();

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export async function accessToken(sa: ServiceAccount, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${header}.${claim}`).sign(sa.private_key);
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google kimlik doğrulaması başarısız: ${data.error_description ?? data.error ?? res.status}`);
  tokenCache.set(sa.client_email, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

/** Erişim token'ı kaynağı: servis hesabı JWT'si veya OAuth yenileme token'ı. */
export type TokenSource = (fetchImpl: typeof fetch) => Promise<string>;

export class GscClient {
  private token: TokenSource;
  constructor(auth: ServiceAccount | TokenSource, private property: string, private fetchImpl: typeof fetch = fetch) {
    this.token = typeof auth === "function" ? auth : (f) => accessToken(auth, f);
  }

  private async call<T>(url: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${await this.token(this.fetchImpl)}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
      if (!res.ok) throw new Error(`Search Console API hatası (${res.status}): ${data.error?.message ?? "bilinmiyor"}`);
      return data;
    }
  }

  async listSites(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
    const r = await this.call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("https://www.googleapis.com/webmasters/v3/sites");
    return r.siteEntry ?? [];
  }

  /** Tüm satırları sayfalayarak getirir (API sayfa başına en fazla 25.000 satır döner). */
  async searchAnalytics(q: { startDate: string; endDate: string; dimensions: ("date" | "query" | "page" | "device" | "country")[]; maxRows?: number }) {
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.property)}/searchAnalytics/query`;
    const rows: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] = [];
    const max = q.maxRows ?? 200_000;
    for (let startRow = 0; startRow < max; startRow += 25_000) {
      const r = await this.call<{ rows?: typeof rows }>(url, {
        startDate: q.startDate, endDate: q.endDate, dimensions: q.dimensions, rowLimit: 25_000, startRow, type: "web",
      });
      rows.push(...(r.rows ?? []));
      if (!r.rows || r.rows.length < 25_000) break;
    }
    return rows;
  }

  async inspectUrl(url: string) {
    return this.call<{ inspectionResult?: { indexStatusResult?: Record<string, unknown> } }>(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      { inspectionUrl: url, siteUrl: this.property, languageCode: "tr-TR" },
    );
  }
}
