import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { buildRobotsTxt } from "@/lib/seo/robots";

export const revalidate = 3600;

export async function GET() {
  const s = await getSettings();
  return new Response(buildRobotsTxt(siteUrl(), s.robots.extraRules, { search: s.seo.aiSearchBots, training: s.seo.aiTrainingBots }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
