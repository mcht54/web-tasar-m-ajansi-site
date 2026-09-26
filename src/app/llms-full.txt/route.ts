import { buildLlmsFullTxt } from "@/lib/seo/llms";

export const revalidate = 3600;

export async function GET() {
  return new Response(await buildLlmsFullTxt(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
