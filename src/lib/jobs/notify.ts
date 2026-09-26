import "server-only";
import { hmac } from "../crypto";

/** Çalışan uygulamaya önbelleği tazelemesini söyler (CLI'dan; başarısızlık kritik değil). */
export async function notifyAppRevalidate(): Promise<boolean> {
  const url = process.env.APP_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3300}`;
  try {
    const res = await fetch(`${url}/api/internal/revalidate`, {
      method: "POST",
      headers: { "x-internal-token": hmac("internal-revalidate") },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
