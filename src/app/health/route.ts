import { systemHealth } from "@/lib/health-check";

export const dynamic = "force-dynamic";

// Sağlık kontrolü: web, veritabanı, worker, zamanlayıcı, kuyruk, AI, Search Console, SMTP.
// Web + veritabanı çalışmıyorsa 503 (izleme ve Docker healthcheck için).
export async function GET() {
  const h = await systemHealth();
  return Response.json(h, { status: h.status === "fail" ? 503 : 200, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
