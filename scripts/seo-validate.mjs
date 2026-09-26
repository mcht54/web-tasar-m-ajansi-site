// SEO doğrulaması: çalışan siteye karşı sitemap'teki her URL'yi denetler.
//   npm run seo:validate            (varsayılan http://localhost:3300)
//   SEO_BASE=https://webtasarimajansi.net npm run seo:validate
import { parse } from "node-html-parser";

const BASE = (process.env.SEO_BASE || "http://localhost:3300").replace(/\/$/, "");
const problems = [];
const warn = [];
const fail = (url, msg) => problems.push(`${url}: ${msg}`);

const text = async (u) => {
  const r = await fetch(u, { redirect: "manual" });
  return { status: r.status, headers: r.headers, body: await r.text() };
};

const idx = await text(`${BASE}/sitemap.xml`);
if (idx.status !== 200) throw new Error(`sitemap.xml ${idx.status}`);
const subs = [...idx.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const urls = [];
for (const s of subs) {
  const r = await text(s.replace(/^https?:\/\/[^/]+/, BASE));
  urls.push(...[...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}
if (!urls.length) fail("sitemap", "hiç URL yok");
const canonicalBase = urls[0]?.match(/^https?:\/\/[^/]+/)?.[0] ?? BASE;
const titles = new Map();
const descs = new Map();

for (const u of urls) {
  const local = u.replace(canonicalBase, BASE);
  const r = await text(local);
  if (r.status !== 200) { fail(u, `HTTP ${r.status}`); continue; }
  const root = parse(r.body);
  const title = root.querySelector("title")?.textContent.trim() ?? "";
  const desc = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  const robots = root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  const h1 = root.querySelectorAll("h1");
  if (!title) fail(u, "title yok");
  else if (title.length > 65 || title.length < 15) warn.push(`${u}: title ${title.length} karakter`);
  if (!desc) fail(u, "meta description yok");
  else if (desc.length > 170 || desc.length < 70) warn.push(`${u}: meta description ${desc.length} karakter`);
  if (h1.length !== 1) fail(u, `${h1.length} adet H1`);
  if (/noindex/.test(robots)) fail(u, "sitemap'te ama noindex");
  if (canonical.replace(/\/$/, "") !== u.replace(/\/$/, "")) fail(u, `canonical farklı: ${canonical}`);
  if (!root.querySelector('meta[name="viewport"]')) fail(u, "viewport yok");
  if (!/max-snippet:-1/.test(robots)) fail(u, "robots max-snippet:-1 yok (AI/Google alıntısı kısıtlı)");
  if (!root.querySelector('meta[property="og:image"]')) fail(u, "og:image yok");
  if (root.querySelector("html")?.getAttribute("lang") !== "tr") fail(u, "html lang=tr değil");
  const ld = root.querySelectorAll('script[type="application/ld+json"]');
  if (!ld.length) fail(u, "JSON-LD yok");
  for (const s of ld) {
    try {
      const d = JSON.parse(s.textContent);
      const types = (d["@graph"] ?? [d]).map((n) => n["@type"]);
      if (u.replace(/\/$/, "") !== canonicalBase && !types.includes("BreadcrumbList")) fail(u, "BreadcrumbList yok");
      if (types.includes("LocalBusiness") && !/\/(iletisim)?$/.test(new URL(u).pathname)) fail(u, "LocalBusiness ana sayfa/iletişim dışında");
      if (types.some((t) => /Review|AggregateRating/.test(t))) fail(u, "puan/yorum schema'sı var");
    } catch {
      fail(u, "JSON-LD ayrıştırılamadı");
    }
  }
  for (const a of root.querySelectorAll("a[href]")) {
    const h = a.getAttribute("href");
    if (/^javascript:/i.test(h)) fail(u, "javascript: linki");
  }
  titles.set(title, [...(titles.get(title) ?? []), u]);
  descs.set(desc, [...(descs.get(desc) ?? []), u]);
}
for (const [t, list] of titles) if (list.length > 1) fail(list.join(", "), `aynı title: ${t}`);
for (const [d, list] of descs) if (d && list.length > 1) warn.push(`aynı meta description: ${list.join(", ")}`);

// Yapay zekâ görünürlüğü
const llms = await text(`${BASE}/llms.txt`);
if (llms.status !== 200 || !/^# /.test(llms.body)) fail("/llms.txt", `durum ${llms.status}`);
const llmsFull = await text(`${BASE}/llms-full.txt`);
if (llmsFull.status !== 200 || llmsFull.body.length < 1000) fail("/llms-full.txt", "boş veya erişilemiyor");
for (const bot of ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "GPTBot"]) {
  if (!new RegExp(`User-agent: ${bot}`).test(await (await fetch(`${BASE}/robots.txt`)).text())) warn.push(`robots.txt: ${bot} için kural yok`);
}
const og = await fetch(`${BASE}/og/_home`);
if (og.status !== 200 || !/image\/png/.test(og.headers.get("content-type") ?? "")) fail("/og/_home", `paylaşım görseli üretilemiyor (${og.status})`);

// Sitemap dışı davranışlar
const robotsTxt = await text(`${BASE}/robots.txt`);
if (!/Sitemap: /.test(robotsTxt.body)) fail("robots.txt", "Sitemap satırı yok");
if (/^Disallow: \/\s*$/m.test(robotsTxt.body)) fail("robots.txt", "site tamamen kapalı");
const draft = await text(`${BASE}/web-tasarim/sivas`);
if (draft.status !== 404 && !urls.some((u) => u.endsWith("/web-tasarim/sivas"))) fail("/web-tasarim/sivas", `taslak il sayfası ${draft.status} döndü (404 beklenir)`);
const param = await fetch(`${BASE}/web-tasarim?utm_source=test`, { redirect: "manual" });
if (!/noindex/.test(param.headers.get("x-robots-tag") ?? "")) fail("parametreli URL", "X-Robots-Tag: noindex yok");
const upper = await fetch(`${BASE}/Web-Tasarim`, { redirect: "manual" });
if (upper.status !== 301) fail("/Web-Tasarim", `büyük harf ${upper.status} (301 beklenir)`);
const admin = await fetch(`${BASE}/yonetim`, { redirect: "manual" });
if (!/noindex/.test(admin.headers.get("x-robots-tag") ?? "")) fail("/yonetim", "noindex başlığı yok");
if (urls.some((u) => u.includes("kvkk"))) fail("sitemap", "NOINDEX KVKK sayfası sitemap'te");

console.log(`${urls.length} URL denetlendi (${subs.length} alt sitemap).`);
for (const w of warn) console.log("UYARI  " + w);
for (const p of problems) console.log("HATA   " + p);
console.log(problems.length ? `\n${problems.length} hata` : "\nSEO doğrulaması: hata yok");
process.exit(problems.length ? 1 : 0);
