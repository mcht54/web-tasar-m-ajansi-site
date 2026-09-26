import { revalidatePath, revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { hmac } from "@/lib/crypto";
import { PAGES_TAG } from "@/lib/site/graph-data";
import { SETTINGS_TAG } from "@/lib/settings";
import { MEDIA_TAG } from "@/lib/site/public";
import { invalidateRouting } from "@/lib/routing/registry";

// CLI işleri (cron) veritabanını değiştirdiğinde çalışan uygulamanın önbelleğini
// tazelemek için. Token APP_SECRET'tan türetilir; dışarıdan tahmin edilemez.
export async function POST(req: Request) {
  const token = req.headers.get("x-internal-token") ?? "";
  const expected = hmac("internal-revalidate");
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return new Response("Yetkisiz", { status: 401 });
  }
  revalidateTag(PAGES_TAG, { expire: 0 });
  revalidateTag(SETTINGS_TAG, { expire: 0 });
  revalidateTag(MEDIA_TAG, { expire: 0 });
  revalidatePath("/", "layout");
  invalidateRouting();
  return Response.json({ ok: true });
}
