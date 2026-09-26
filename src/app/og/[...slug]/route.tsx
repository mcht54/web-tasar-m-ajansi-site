import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getPublicPage, getSiteChrome } from "@/lib/site/public";

// Özel paylaşım görseli olmayan sayfalar için otomatik Open Graph görseli (1200×630).
const fontData = readFile(path.join(process.cwd(), "src/assets/fonts/InstrumentSerif-Regular.ttf"));

export const revalidate = 86400;

export async function GET(_req: Request, ctx: RouteContext<"/og/[...slug]">) {
  const { slug } = await ctx.params;
  const pagePath = slug.join("/") === "_home" ? "/" : "/" + slug.map(decodeURIComponent).join("/");
  const [page, { settings }] = await Promise.all([getPublicPage(pagePath), getSiteChrome()]);
  if (!page) return new Response("Bulunamadı", { status: 404 });
  const title = page.h1 || page.name;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#14161a", color: "#f7f5f0", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: "#e8531f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>w</div>
          {settings.site.siteName}
        </div>
        <div style={{ fontSize: title.length > 40 ? 76 : 92, lineHeight: 1.02, letterSpacing: -1, maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#c9c6bd" }}>
          <span>{page.province?.name ? `${page.province.name} · web tasarım` : "SEO odaklı web tasarım"}</span>
          <span style={{ color: "#ff6a36" }}>Ücretsiz ön analiz →</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: "Instrument Serif", data: await fontData, style: "normal", weight: 400 }] },
  );
}
