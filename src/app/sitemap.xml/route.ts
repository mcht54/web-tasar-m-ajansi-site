import { sitemapIndexXml, xmlResponse } from "@/lib/seo/sitemap";

export const revalidate = 3600;

export async function GET() {
  return xmlResponse(await sitemapIndexXml());
}
