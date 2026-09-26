import "server-only";
// IndexNow: yayınlanan/güncellenen/kaldırılan URL'leri Bing, Yandex, Seznam, Naver
// gibi arama motorlarına anında bildirir (ChatGPT araması Bing dizinini kullanır).
// Her gönderim gerçek HTTP sonucuyla IndexNowSubmission tablosuna ve denetim
// loguna yazılır; başarısızlık asla başarı gibi gösterilmez.

import { db } from "../db";
import { hmac } from "../crypto";
import { siteHost, siteUrl } from "../env";
import { getSettingsFresh } from "../settings";

export function indexNowKey(): string {
  return hmac("indexnow").slice(0, 32);
}

function isPublicHost(host: string): boolean {
  return !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(host) && host.includes(".");
}

const HTTP_MEANING: Record<number, string> = {
  200: "Kabul edildi",
  202: "Alındı (anahtar doğrulaması bekliyor)",
  400: "Geçersiz istek",
  403: "Anahtar geçersiz (/indexnow-key.txt doğrulanamadı)",
  422: "URL'ler bu alan adına ait değil veya anahtar uyuşmuyor",
  429: "Çok fazla istek (hız sınırı)",
};

const MAX_ATTEMPTS = 5;
const retryable = (code: number | null) => code === null || code === 429 || code >= 500;

export type IndexNowResult = { ok: boolean; status: "ok" | "failed" | "skipped" | "retry"; httpStatus: number | null; message: string };

export async function submitIndexNow(
  paths: string[],
  fetchImpl: typeof fetch = fetch,
  opts: { trigger?: string; attempt?: number } = {},
): Promise<IndexNowResult> {
  const settings = await getSettingsFresh();
  const base = siteUrl();
  const host = siteHost();
  const urlList = [...new Set(paths)].slice(0, 10_000).map((p) => (/^https?:/.test(p) ? p : p === "/" ? `${base}/` : base + p));
  const record = async (r: IndexNowResult) => {
    const attempt = opts.attempt ?? 1;
    await db.indexNowSubmission.create({
      data: {
        urls: urlList, status: r.status, httpStatus: r.httpStatus, message: r.message, attempt, trigger: opts.trigger ?? null,
        nextRetryAt: r.status === "retry" ? new Date(Date.now() + 2 ** attempt * 10 * 60_000) : null,
      },
    });
    await db.auditLog.create({ data: { action: `indexnow.${r.status}`, entity: "IndexNow", detail: { urls: urlList.length, httpStatus: r.httpStatus, message: r.message } } });
    return r;
  };
  if (!settings.integrations.indexNow) return record({ ok: false, status: "skipped", httpStatus: null, message: "IndexNow ayarlardan kapalı" });
  if (!isPublicHost(host)) return record({ ok: false, status: "skipped", httpStatus: null, message: `Yerel adres (${host}) — gönderilmedi` });
  if (!settings.seo.allowIndexing) return record({ ok: false, status: "skipped", httpStatus: null, message: "Site indekslemeye kapalı" });
  if (!urlList.length) return { ok: true, status: "skipped", httpStatus: null, message: "Bildirilecek URL yok" };
  let code: number | null = null;
  let detail = "";
  try {
    const res = await fetchImpl("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: indexNowKey(), keyLocation: `${base}/indexnow-key.txt`, urlList }),
      signal: AbortSignal.timeout(15_000),
    });
    code = res.status;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  const ok = code === 200 || code === 202;
  const attempt = opts.attempt ?? 1;
  const willRetry = !ok && retryable(code) && attempt < MAX_ATTEMPTS;
  const text = code === null ? `Bağlantı hatası: ${detail}` : `HTTP ${code} — ${HTTP_MEANING[code] ?? "beklenmeyen yanıt"}`;
  return record({
    ok,
    status: ok ? "ok" : willRetry ? "retry" : "failed",
    httpStatus: code,
    message: `${text} · ${urlList.length} URL${willRetry ? ` · yeniden deneme planlandı (deneme ${attempt + 1}/${MAX_ATTEMPTS})` : ""}`,
  });
}

/** Zamanı gelen yeniden denemeleri çalıştırır (günlük iş ve panelden). */
export async function processIndexNowRetries(fetchImpl: typeof fetch = fetch) {
  const due = await db.indexNowSubmission.findMany({ where: { status: "retry", nextRetryAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 20 });
  let ok = 0, failed = 0;
  for (const d of due) {
    // Eski kaydı kapat, yeni deneme kendi kaydını oluşturur
    await db.indexNowSubmission.update({ where: { id: d.id }, data: { status: "failed", nextRetryAt: null, message: `${d.message} · yeniden denendi` } });
    const r = await submitIndexNow(d.urls, fetchImpl, { trigger: "retry", attempt: d.attempt + 1 });
    if (r.ok) ok++;
    else failed++;
  }
  return { due: due.length, ok, failed };
}

/** Kaldırılma/adres değişikliği sinyali veren alanlar (sayfa artık yayında olmasa da bildirilir). */
const REMOVAL_FIELDS = new Set(["Yayın durumu", "Index", "URL", "Canonical"]);

/**
 * Gerçekten değişen URL'ler: alan değişikliği kaydından (SeoChangeLog) okunur.
 * Analiz skoru gibi içerik dışı yazımlar sayılmaz (updatedAt kullanılmaz). Son
 * değişiklikten sonra başarıyla bildirilmiş URL tekrar gönderilmez.
 */
export async function changedPathsSince(since: Date): Promise<string[]> {
  const changes = await db.seoChangeLog.findMany({ where: { createdAt: { gte: since } }, select: { path: true, field: true, before: true, createdAt: true, page: { select: { status: true, path: true } } } });
  const latest = new Map<string, Date>();
  const touch = (p: string | null | undefined, at: Date) => {
    if (!p || !p.startsWith("/")) return;
    if (!latest.has(p) || latest.get(p)! < at) latest.set(p, at);
  };
  for (const c of changes) {
    const published = c.page?.status === "PUBLISHED";
    if (published || REMOVAL_FIELDS.has(c.field)) touch(c.page?.path ?? c.path, c.createdAt);
    if (c.field === "URL") touch(c.before, c.createdAt); // eski adres (301) de bildirilir
  }
  if (!latest.size) return [];
  const base = siteUrl();
  const urlOf = (p: string) => (p === "/" ? `${base}/` : base + p);
  const sent = await db.indexNowSubmission.findMany({ where: { status: "ok", createdAt: { gte: since } }, select: { urls: true, createdAt: true } });
  return [...latest].filter(([p, at]) => !sent.some((s) => s.createdAt >= at && s.urls.includes(urlOf(p)))).map(([p]) => p).sort();
}
