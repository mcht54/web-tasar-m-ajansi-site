// Gerçek HTTP sunucusu olarak sahte rakip sitesi (testler için). Sürüm 1 → sürüm 2 geçişiyle
// yeni/silinen/taşınan sayfa ve title değişikliği üretir. İstek sayacı ve ETag/304 destekler.
import http from "node:http";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";

const words = (topic: string, n: number) => Array.from({ length: n }, (_, i) => `${topic} konusunda ${i + 1}. açıklama cümlesi burada yer alır.`).join(" ");

type PageDef = { title: string; h1: string; h2: string[]; body: string; schema: string[]; links: string[]; meta?: string };

function pagesFor(v: 1 | 2): Record<string, PageDef> {
  const nav = ["/", "/google-ads-yonetimi", "/seo", "/grafik-tasarim", "/blog/eski-rehber", "/web-tasarim/sakarya/serdivan", "/iletisim", "/gizli/panel"];
  const p: Record<string, PageDef> = {
    "/": { title: "Rakip Ajans | Ana Sayfa", h1: "Rakip Ajans", h2: ["Hizmetler"], body: words("ajans", 40), schema: ["Organization", "LocalBusiness"], links: nav },
    "/google-ads-yonetimi": { title: "Google Ads Yönetimi | Rakip", h1: "Google Ads Yönetimi", h2: ["Kampanya kurulumu", "Anahtar kelime planı", "Dönüşüm ölçümü", "Bütçe dağılımı", "Raporlama", "Sık sorulanlar", "Süreç"], body: words("google ads", 160), schema: ["Service", "BreadcrumbList"], links: nav, meta: "Google Ads kampanyaları." },
    "/seo": { title: v === 1 ? "SEO Hizmeti | Rakip" : "SEO Danışmanlığı | Rakip", h1: "SEO", h2: ["Teknik SEO", "İçerik"], body: words("seo", 90), schema: ["Service"], links: nav, meta: "SEO hizmeti." },
    "/blog/eski-rehber": { title: "Web sitesi fiyatları rehberi", h1: "Web sitesi fiyatları", h2: ["Maliyet kalemleri"], body: words("fiyat", 70), schema: ["Article"], links: nav },
    "/web-tasarim/sakarya/serdivan": { title: "Serdivan Web Tasarım", h1: "Serdivan Web Tasarım", h2: ["Bölge"], body: words("serdivan", 50), schema: [], links: nav },
    "/iletisim": { title: "İletişim", h1: "İletişim", h2: [], body: words("iletişim", 10), schema: [], links: nav },
    "/gizli/panel": { title: "Gizli", h1: "Gizli", h2: [], body: "gizli", schema: [], links: [] },
  };
  if (v === 1) p["/grafik-tasarim"] = { title: "Grafik Tasarım | Rakip", h1: "Grafik Tasarım", h2: ["Logo"], body: words("grafik", 60), schema: ["Service"], links: nav };
  if (v === 2) {
    p["/sosyal-medya-yonetimi"] = { title: "Sosyal Medya Yönetimi | Rakip", h1: "Sosyal Medya Yönetimi", h2: ["İçerik planı"], body: words("sosyal medya", 80), schema: ["Service"], links: nav };
    p["/rehber/web-sitesi-fiyatlari"] = p["/blog/eski-rehber"]; // aynı içerik yeni adreste (URL değişikliği)
    delete p["/blog/eski-rehber"];
  }
  return p;
}

function html(path: string, d: PageDef, origin: string) {
  const ld = d.schema.map((t) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${t}"}</script>`).join("");
  return `<!doctype html><html><head><title>${d.title}</title>${d.meta ? `<meta name="description" content="${d.meta}">` : ""}<link rel="canonical" href="${origin}${path}">${ld}</head><body><main><h1>${d.h1}</h1>${d.h2.map((h) => `<h2>${h}</h2>`).join("")}<p>${d.body}</p><img src="/a.png">${d.links.map((l) => `<a href="${l}">${l}</a>`).join(" ")}</main></body></html>`;
}

export async function startCompetitorSite() {
  const state = { version: 1 as 1 | 2, hits: new Map<string, number>(), notModified: 0 };
  const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const path = new URL(req.url ?? "/", origin).pathname;
    state.hits.set(path, (state.hits.get(path) ?? 0) + 1);
    const pages = pagesFor(state.version);
    if (path === "/robots.txt") return res.end(`User-agent: *\nDisallow: /gizli\nCrawl-delay: 0\nSitemap: ${origin}/sitemap.xml\n`);
    if (path === "/sitemap.xml") {
      res.setHeader("content-type", "application/xml");
      return res.end(`<?xml version="1.0"?><urlset>${Object.keys(pages).filter((p) => !p.startsWith("/gizli")).map((p) => `<url><loc>${origin}${p}</loc></url>`).join("")}</urlset>`);
    }
    if (path === "/yavas") { setTimeout(() => res.end("geç"), 3000); return; }
    if (path === "/sikistirilmis-br" || path === "/sikistirilmis-gzip") {
      // Gerçek sitelerdeki gibi sıkıştırılmış yanıt (example.com Brotli gönderir)
      const raw = Buffer.from(`<!doctype html><html><head><title>Sıkıştırılmış Sayfa</title></head><body><main><h1>Brotli ve gzip</h1><p>${words("sıkıştırma", 200)}</p></main></body></html>`);
      const br = path.endsWith("br");
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("content-encoding", br ? "br" : "gzip");
      return res.end(br ? zlib.brotliCompressSync(raw) : zlib.gzipSync(raw));
    }
    if (path === "/metadata-yonlendir") { res.statusCode = 302; res.setHeader("location", "http://169.254.169.254/latest/meta-data/"); return res.end(); }
    const d = pages[path];
    if (!d) { res.statusCode = 404; res.setHeader("content-type", "text/html"); return res.end("<h1>Bulunamadı</h1>"); }
    const body = html(path, d, origin);
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 12)}"`;
    if (req.headers["if-none-match"] === etag) { state.notModified++; res.statusCode = 304; return res.end(); }
    res.setHeader("etag", etag);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { origin: `http://127.0.0.1:${port}`, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}
