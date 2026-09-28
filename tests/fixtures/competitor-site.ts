// Gerçek HTTP sunucusu olarak sahte rakip sitesi (testler için). Sürüm 1 → sürüm 2 geçişiyle
// yeni/silinen/taşınan sayfa ve title değişikliği üretir. İstek sayacı ve ETag/304 destekler.
import http from "node:http";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";

const words = (topic: string, n: number) => Array.from({ length: n }, (_, i) => `${topic} konusunda ${i + 1}. açıklama cümlesi burada yer alır.`).join(" ");

type PageDef = { title: string; h1: string; h2: string[]; body: string; schema: string[]; links: string[]; meta?: string; canonical?: string };

// Gerçek HTTP yönlendirmeleri: A→B, A→B→C, döngü, dış siteye
const REDIRECTS: Record<string, [number, string]> = {
  "/eski-ads": [301, "/google-ads-yonetimi"],
  "/zincir-a": [302, "/zincir-b"],
  "/zincir-b": [307, "/seo"],
  "/dongu-a": [301, "/dongu-b"],
  "/dongu-b": [301, "/dongu-a"],
  "/dis-site": [301, "https://example.com/"],
  "/pxl-template/header": [301, "/"],
};

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
  // Aynı içerikli 200 sayfalar: /kopya-2 canonical ile /kopya-1'e işaret eder (güçlü sinyal),
  // /kopya-3 aynı içerik ama kendi canonical'ı (zayıf sinyal → kopya sayılmaz)
  const dup = words("kopya içerik", 60);
  p["/kopya-1"] = { title: "Kopya bir", h1: "Kopya", h2: [], body: dup, schema: [], links: [], canonical: "/kopya-1" };
  p["/kopya-2"] = { title: "Kopya iki", h1: "Kopya", h2: [], body: dup, schema: [], links: [], canonical: "/kopya-1" };
  p["/kopya-3"] = { title: "Kopya üç", h1: "Kopya", h2: [], body: dup, schema: [], links: [] };
  // Lokasyon sınıflandırması: şehir adı geçen yayın/blog ≠ lokasyon; hizmet + şehir = lokasyon
  p["/sakarya-davetiyeci"] = { title: "Sakarya Davetiyeci", h1: "Sakarya Davetiyeci", h2: [], body: words("davetiye", 30), schema: ["Article", "WebPage"], links: [] };
  p["/blog/sakarya-haber"] = { title: "Sakarya'dan haber", h1: "Haber", h2: [], body: words("haber", 30), schema: [], links: [] };
  p["/sakarya/web-tasarim"] = { title: "Sakarya Web Tasarım", h1: "Sakarya Web Tasarım", h2: [], body: words("sakarya web", 30), schema: [], links: [] };
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
  return `<!doctype html><html><head><title>${d.title}</title>${d.meta ? `<meta name="description" content="${d.meta}">` : ""}<link rel="canonical" href="${origin}${d.canonical ?? path}">${ld}</head><body><main><h1>${d.h1}</h1>${d.h2.map((h) => `<h2>${h}</h2>`).join("")}<p>${d.body}</p><img src="/a.png">${d.links.map((l) => `<a href="${l}">${l}</a>`).join(" ")}</main></body></html>`;
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
      // Sitemap'te yönlendirme kaynakları ve aynı URL'nin tekrarı da var (gerçek sitelerdeki gibi)
      const locs = [...Object.keys(pages).filter((p) => !p.startsWith("/gizli")), ...Object.keys(REDIRECTS), "/google-ads-yonetimi"];
      return res.end(`<?xml version="1.0"?><urlset>${locs.map((p) => `<url><loc>${origin}${p}</loc></url>`).join("")}</urlset>`);
    }
    const redir = REDIRECTS[path];
    if (redir) { res.statusCode = redir[0]; res.setHeader("location", redir[1]); return res.end(); }
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
