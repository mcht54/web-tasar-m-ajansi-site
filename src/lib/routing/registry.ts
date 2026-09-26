import "server-only";
// Proxy için bellek içi yönlendirme ve bilinen-yol önbelleği. Yönetim paneli
// değişiklikte invalidateRouting() çağırır; birden çok süreç varsa en geç 30 sn'de tazelenir.

import { db } from "../db";

type State = { redirects: Map<string, { id: string; to: string; code: number }>; published: Set<string>; at: number };
// Proxy ve sunucu eylemleri ayrı modül örneklerinde yüklenir; önbellek globalThis
// üzerinde tutulur ki invalidateRouting() proxy'nin gördüğü kopyayı da temizlesin.
const g = globalThis as unknown as { __wtaRouting?: { state: State | null; loading: Promise<State> | null } };
const box = (g.__wtaRouting ??= { state: null, loading: null });
const TTL = 30_000;

async function load(): Promise<State> {
  const [redirects, pages] = await Promise.all([
    db.redirect.findMany({ where: { active: true }, select: { id: true, fromPath: true, toPath: true, statusCode: true } }),
    db.page.findMany({ where: { status: "PUBLISHED" }, select: { path: true } }),
  ]);
  return {
    redirects: new Map(redirects.map((r) => [r.fromPath, { id: r.id, to: r.toPath, code: r.statusCode }])),
    published: new Set(pages.map((p) => p.path)),
    at: Date.now(),
  };
}

export async function routingState(): Promise<State> {
  if (box.state && Date.now() - box.state.at < TTL) return box.state;
  box.loading ??= load().finally(() => (box.loading = null));
  box.state = await box.loading;
  return box.state;
}

export function invalidateRouting() {
  box.state = null;
}

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|curl|wget|python|headless/i;

export async function recordNotFound(path: string, referrer: string | null, ua: string | null) {
  const isBot = BOT.test(ua ?? "");
  await db.notFoundLog.upsert({
    where: { path },
    create: { path: path.slice(0, 500), lastReferrer: referrer?.slice(0, 500), lastUserAgent: ua?.slice(0, 300), isBot },
    update: { hits: { increment: 1 }, lastSeenAt: new Date(), lastReferrer: referrer?.slice(0, 500), lastUserAgent: ua?.slice(0, 300), isBot, resolved: false },
  });
}

export async function recordRedirectHit(id: string) {
  await db.redirect.update({ where: { id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } });
}
