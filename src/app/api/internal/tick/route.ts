import { timingSafeEqual } from "node:crypto";
import { hmac } from "@/lib/crypto";
import { schedulerTick, workerTick } from "@/lib/autopilot/scheduler";

// Arka plan zamanlayıcısının tetik noktası (yalnızca instrumentation çağırır).
// Token APP_SECRET'tan türetilir; dışarıdan tahmin edilemez.
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function POST(req: Request) {
  const token = req.headers.get("x-internal-token") ?? "";
  const expected = hmac("internal-tick");
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return new Response("Yetkisiz", { status: 401 });
  }
  const queued = await schedulerTick();
  const ran = await workerTick();
  return Response.json({ ok: true, queued, ran });
}
