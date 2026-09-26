import { sitemapXml, xmlResponse } from "@/lib/seo/sitemap";

export const revalidate = 3600;

export async function GET() {
  return xmlResponse(await sitemapXml("services"));
}
