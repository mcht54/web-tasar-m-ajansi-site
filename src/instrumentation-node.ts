// Otonom SEO zamanlayıcısı (yalnızca Node.js çalışma ortamında yüklenir; bkz. instrumentation.ts).
import { createHash, createHmac } from "node:crypto";

const TICK_MS = 2 * 60_000; // zamanlayıcı + worker (kuyruk) aralığı

export function startScheduler() {
  if (process.env.AUTOPILOT_SCHEDULER === "off") return;
  const g = globalThis as unknown as { __wtaScheduler?: boolean };
  if (g.__wtaScheduler) return;
  g.__wtaScheduler = true;
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) return;
  // lib/crypto.ts hmac() ile aynı türetme
  const key = createHash("sha256").update(`hmac:${secret}`).digest();
  const token = createHmac("sha256", key).update("internal-tick").digest("hex");
  const url = `${process.env.APP_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3300}`}/api/internal/tick`;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(url, { method: "POST", headers: { "x-internal-token": token } });
      if (!res.ok) console.warn(`[otopilot] zamanlayıcı yanıtı HTTP ${res.status}`);
    } catch (e) {
      console.warn(`[otopilot] zamanlayıcı çağrısı başarısız: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, TICK_MS).unref?.();
}
