import { indexNowKey } from "@/lib/seo/indexnow";

export function GET() {
  return new Response(indexNowKey(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
