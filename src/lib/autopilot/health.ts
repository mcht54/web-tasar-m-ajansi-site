import "server-only";
// SEO SAĞLIK ÖZETİ: tek bir Lighthouse skoru değil, 10 ayrı kategori.
// Her kontrol PASS / WARNING / FAIL / NOT_VERIFIABLE döner. Ölçülemeyen şey
// asla PASS sayılmaz; "veri yok" (NOT_VERIFIABLE) ile "kötü" (FAIL) ayrıdır.
// Kaynaklar: canlı HTTP (robots, sitemap, llms), site durumu/analiz, son tarama,
// Search Console tabloları ve ayarlar.

import { db } from "../db";
import { siteUrl } from "../env";
import { getSettingsFresh } from "../settings";
import { businessIsComplete } from "../settings-schema";
import { gscConnected as isGscConnected } from "../gsc/sync";
import { analyzePage, loadSiteState } from "../seo/analyzer";
import { linkStats, orphans, weaklyLinked } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { checkSitemap } from "../seo/sitemap-check";
import { AI_SEARCH_BOTS, robotsAllows } from "../seo/robots";
import { resolveCanonical, resolveDescription, resolveRobots, resolveTitle, isSelfCanonical } from "../seo/meta";
import { UNVERIFIED_RE } from "../seo/analyzer-shared";
import { trLower } from "../text/slug";
import { addDays, lastDataDay, pct } from "./metrics";

export type HealthStatus = "PASS" | "WARNING" | "FAIL" | "NOT_VERIFIABLE";
export type HealthCheck = { label: string; status: HealthStatus; evidence: string; core?: boolean };
export type HealthCategoryKey = "technical" | "indexability" | "content" | "links" | "structured" | "performance" | "local" | "google" | "bing" | "ai";
export type HealthCategory = { key: HealthCategoryKey; label: string; status: HealthStatus; score: number | null; checks: HealthCheck[] };
export type SeoHealth = { generatedAt: string; categories: HealthCategory[] };

export const HEALTH_LABELS: Record<HealthCategoryKey, string> = {
  technical: "Teknik SEO", indexability: "İndekslenebilirlik", content: "İçerik kalitesi", links: "İç linkler",
  structured: "Yapılandırılmış veri", performance: "Performans", local: "Yerel SEO", google: "Google Search",
  bing: "Bing", ai: "AI görünürlüğü",
};
export const STATUS_LABELS: Record<HealthStatus, string> = { PASS: "PASS", WARNING: "WARNING", FAIL: "FAIL", NOT_VERIFIABLE: "NOT VERIFIABLE" };

const ok = (label: string, evidence: string, core = false): HealthCheck => ({ label, status: "PASS", evidence, core });
const warn = (label: string, evidence: string, core = false): HealthCheck => ({ label, status: "WARNING", evidence, core });
const fail = (label: string, evidence: string, core = false): HealthCheck => ({ label, status: "FAIL", evidence, core });
const nv = (label: string, evidence: string, core = false): HealthCheck => ({ label, status: "NOT_VERIFIABLE", evidence, core });

/**
 * Kategori durumu: FAIL > WARNING; temel (core) kontrol doğrulanamıyorsa
 * NOT_VERIFIABLE; hiç doğrulanabilir kontrol yoksa NOT_VERIFIABLE; aksi PASS.
 * Skor yalnızca doğrulanabilir kontrollerden (PASS 1, WARNING 0,5, FAIL 0).
 */
export function summarize(key: HealthCategoryKey, checks: HealthCheck[]): HealthCategory {
  const verifiable = checks.filter((c) => c.status !== "NOT_VERIFIABLE");
  let status: HealthStatus;
  if (checks.some((c) => c.status === "FAIL")) status = "FAIL";
  else if (checks.some((c) => c.status === "WARNING")) status = "WARNING";
  else if (!verifiable.length || checks.some((c) => c.core && c.status === "NOT_VERIFIABLE")) status = "NOT_VERIFIABLE";
  else status = "PASS";
  const score = status === "NOT_VERIFIABLE" || !verifiable.length
    ? null
    : Math.round((100 * verifiable.reduce((s, c) => s + (c.status === "PASS" ? 1 : c.status === "WARNING" ? 0.5 : 0), 0)) / verifiable.length);
  return { key, label: HEALTH_LABELS[key], status, score, checks };
}

/** Favicon: /favicon.ico gerçek ICO (200, image/x-icon, ICO imzası), apple-touch-icon ve manifest. */
async function faviconCheck(f: typeof fetch, base: string): Promise<HealthCheck> {
  try {
    const r = await f(`${base}/favicon.ico`, { redirect: "manual", cache: "no-store" });
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get("content-type") ?? "";
    if (r.status !== 200) return fail("Favicon", `/favicon.ico HTTP ${r.status}${r.headers.get("location") ? ` → ${r.headers.get("location")}` : ""}`);
    if (!/icon/.test(type) || buf.readUInt32LE(0) !== 0x00010000) return fail("Favicon", `/favicon.ico geçerli bir ICO değil (${type})`);
    const [apple, manifest] = await Promise.all([f(`${base}/apple-icon.png`, { cache: "no-store" }), f(`${base}/manifest.webmanifest`, { cache: "no-store" })]);
    const extras = [apple.status === 200 && /png/.test(apple.headers.get("content-type") ?? "") ? null : "apple-touch-icon yok", manifest.status === 200 ? null : "web manifest yok"].filter(Boolean);
    return extras.length ? warn("Favicon", `favicon.ico geçerli (${buf.readUInt16LE(4)} boyut); ${extras.join(", ")}`) : ok("Favicon", `favicon.ico (${buf.readUInt16LE(4)} boyut, ${type}), apple-touch-icon ve manifest yayında`);
  } catch {
    return nv("Favicon", "Site erişilemedi");
  }
}

async function fetchText(f: typeof fetch, url: string): Promise<{ status: number; text: string } | null> {
  try {
    const r = await f(url, { cache: "no-store", redirect: "manual" });
    return { status: r.status, text: await r.text() };
  } catch {
    return null;
  }
}

export async function computeSeoHealth(opts: { fetchImpl?: typeof fetch } = {}): Promise<SeoHealth> {
  const f = opts.fetchImpl ?? fetch;
  const base = siteUrl();
  const [settings, state, crawl, gscConnected, lastDay] = await Promise.all([
    getSettingsFresh(), loadSiteState(), db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" } }), isGscConnected(), lastDataDay(),
  ]);
  const published = state.pages.filter((p) => p.status === "PUBLISHED");
  const indexable = published.filter((p) => resolveRobots(p, settings.seo.allowIndexing, isSelfCanonical(p, base)).indexable);
  const analyses = new Map(indexable.map((p) => [p.id, analyzePage(p, state)]));
  // Sitemap'e hiç ulaşılamıyorsa (ağ hatası) bu "boş sitemap" değil, "doğrulanamaz"dır
  const sitemapProbe = await fetchText(f, `${base}/sitemap.xml`);
  const [robotsTxt, sitemapCheck, llms, llmsFull] = await Promise.all([
    fetchText(f, `${base}/robots.txt`),
    sitemapProbe ? checkSitemap(f).catch(() => null) : Promise.resolve(null),
    fetchText(f, `${base}/llms.txt`),
    fetchText(f, `${base}/llms-full.txt`),
  ]);
  const cats: HealthCategory[] = [];

  // 1) Teknik SEO — son tarama
  {
    const c: HealthCheck[] = [];
    if (!crawl) c.push(nv("Site taraması", "Henüz başarılı tarama yok", true));
    else {
      const bySev = await db.crawlIssue.groupBy({ by: ["severity"], where: { runId: crawl.id }, _count: true });
      const n = (s: string) => bySev.find((x) => x.severity === s)?._count ?? 0;
      const ev = `${crawl.pagesCrawled} sayfa, sağlık ${crawl.healthScore ?? "—"}; kritik ${n("CRITICAL")}, yüksek ${n("HIGH")}, orta ${n("MEDIUM")} (${crawl.startedAt.toISOString().slice(0, 10)})`;
      c.push(n("CRITICAL") ? fail("Tarama sorunları", ev) : n("HIGH") ? warn("Tarama sorunları", ev) : ok("Tarama sorunları", ev));
      const codes = await db.crawlIssue.groupBy({ by: ["code"], where: { runId: crawl.id }, _count: true });
      const has = (code: string) => codes.find((x) => x.code === code)?._count ?? 0;
      c.push(has("BROKEN_INTERNAL_LINK") ? fail("Kırık iç link", `${has("BROKEN_INTERNAL_LINK")} kırık iç link`) : ok("Kırık iç link", "Kırık iç link yok"));
      c.push(has("REDIRECT_CHAIN") ? warn("Yönlendirme zinciri", `${has("REDIRECT_CHAIN")} zincir`) : ok("Yönlendirme zinciri", "Zincir yok"));
    }
    c.push(base.startsWith("https://") ? ok("HTTPS", base) : warn("HTTPS", `SITE_URL https değil: ${base} (yerel geliştirmede beklenir)`));
    c.push(await faviconCheck(f, base));
    if (crawl) {
      const img = await db.crawlPage.aggregate({ where: { runId: crawl.id }, _sum: { images: true, imagesNoAlt: true } });
      const total = img._sum.images ?? 0, missing = img._sum.imagesNoAlt ?? 0;
      c.push(missing ? warn("Görsel alt metni", `${missing}/${total} görselde alt metni yok`) : ok("Görsel alt metni", total ? `${total} görselin hepsinde alt var` : "Sayfalarda içerik görseli yok"));
    }
    cats.push(summarize("technical", c));
  }

  // 2) İndekslenebilirlik — robots, sitemap, noindex, canonical
  {
    const c: HealthCheck[] = [];
    c.push(settings.seo.allowIndexing ? ok("Site geneli indeksleme", "Açık") : fail("Site geneli indeksleme", "Kapalı — tüm sayfalar NOINDEX"));
    if (!robotsTxt || robotsTxt.status !== 200) c.push(nv("robots.txt", robotsTxt ? `HTTP ${robotsTxt.status}` : "Site erişilemedi", true));
    else {
      const blocked = indexable.flatMap((p) => ["Googlebot", "Bingbot"].filter((bot) => !robotsAllows(robotsTxt.text, bot, p.path).allowed).map((bot) => `${bot} → ${p.path}`));
      c.push(blocked.length ? fail("robots.txt erişimi", `Engellenen: ${blocked.slice(0, 5).join(", ")}`) : ok("robots.txt erişimi", `Googlebot ve Bingbot ${indexable.length} indekslenebilir sayfaya erişebiliyor`));
    }
    if (!sitemapProbe) c.push(nv("Sitemap", "Site erişilemedi — sitemap doğrulanamadı", true));
    else if (sitemapProbe.status !== 200) c.push(fail("Sitemap", `sitemap.xml HTTP ${sitemapProbe.status}`));
    else if (!sitemapCheck || sitemapCheck.urls === 0) c.push(fail("Sitemap", "Sitemap boş veya ayrıştırılamadı"));
    else c.push(sitemapCheck.problems.length ? warn("Sitemap", `${sitemapCheck.urls} URL, ${sitemapCheck.problems.length} sorun: ${sitemapCheck.problems.slice(0, 3).map((p) => p.problem).join("; ")}`) : ok("Sitemap", `${sitemapCheck.urls} URL; tümü 200, indekslenebilir, canonical kendisi`));
    const important = published.filter((p) => ["HOME", "SERVICE"].includes(p.type) && !indexable.includes(p));
    c.push(important.length ? fail("Önemli sayfalar indekslenebilir", `İndekslenemeyen: ${important.map((p) => p.path).join(", ")}`) : ok("Önemli sayfalar indekslenebilir", "Ana sayfa ve tüm hizmet sayfaları indekslenebilir"));
    const foreignCanon = published.filter((p) => p.canonical && !isSelfCanonical(p, base));
    c.push(foreignCanon.length ? warn("Canonical", `${foreignCanon.length} sayfa başka URL'yi canonical gösteriyor: ${foreignCanon.slice(0, 3).map((p) => `${p.path} → ${resolveCanonical(p, base)}`).join(", ")}`) : ok("Canonical", "Tüm yayındaki sayfalar kendi URL'sini canonical gösteriyor"));
    const idx = await db.gscIndexStatus.findMany({ where: { verdict: { not: "PASS" } } });
    c.push(!gscConnected ? nv("Google indeks durumu", "Search Console bağlı değil") : idx.length ? warn("Google indeks durumu", `${idx.length} URL indekslenmemiş/uyarılı`) : ok("Google indeks durumu", "Denetlenen URL'lerde sorun yok"));
    cats.push(summarize("indexability", c));
  }

  // 3) İçerik kalitesi — kopya title/meta/H1, ince içerik, doğrulanmamış işaret
  {
    const c: HealthCheck[] = [];
    const dup = (vals: [string, string][]) => {
      const m = new Map<string, string[]>();
      for (const [path, v] of vals) if (v) m.set(trLower(v.trim()), [...(m.get(trLower(v.trim())) ?? []), path]);
      return [...m.values()].filter((v) => v.length > 1);
    };
    const dt = dup(indexable.map((p) => [p.path, resolveTitle(p, settings.seo)]));
    const dd = dup(indexable.map((p) => [p.path, resolveDescription(p, settings.seo)]));
    const dh = dup(indexable.map((p) => [p.path, p.h1 ?? p.name]));
    c.push(dt.length ? fail("Kopya title", dt.map((g) => g.join(" = ")).join("; ")) : ok("Kopya title", `${indexable.length} sayfada kopya title yok`));
    c.push(dd.length ? warn("Kopya meta açıklama", dd.map((g) => g.join(" = ")).join("; ")) : ok("Kopya meta açıklama", "Kopya yok"));
    c.push(dh.length ? warn("Kopya H1", dh.map((g) => g.join(" = ")).join("; ")) : ok("Kopya H1", "Kopya yok"));
    const longT = indexable.filter((p) => resolveTitle(p, settings.seo).length > 65);
    c.push(longT.length ? warn("Title uzunluğu", `65 karakterden uzun: ${longT.map((p) => p.path).join(", ")}`) : ok("Title uzunluğu", "Tüm title'lar 65 karakter veya altında"));
    const thin = indexable.filter((p) => analyses.get(p.id)!.seo.checks.some((x) => x.id === "length" && x.status === "FAIL"));
    c.push(thin.length ? warn("İnce içerik", `Kelime eşiğinin altında: ${thin.map((p) => p.path).join(", ")}`) : ok("İnce içerik", "Eşik altında sayfa yok"));
    const marker = published.filter((p) => UNVERIFIED_RE.test(`${p.intro ?? ""} ${p.body ?? ""} ${JSON.stringify(p.faq)}`));
    c.push(marker.length ? fail("Doğrulanmamış içerik yayında", marker.map((p) => p.path).join(", ")) : ok("Doğrulanmamış içerik yayında", "Yayındaki sayfalarda [DOĞRULANMALI] yok"));
    const similar = indexable.filter((p) => (analyses.get(p.id)!.similar.score ?? 0) >= settings.seo.duplicateThreshold);
    c.push(similar.length ? warn("Benzer içerik", similar.map((p) => `${p.path} ≈ ${analyses.get(p.id)!.similar.path}`).join(", ")) : ok("Benzer içerik", `Eşik (%${Math.round(settings.seo.duplicateThreshold * 100)}) üstünde benzer sayfa yok`));
    const noMeta = indexable.filter((p) => !p.metaDescription?.trim() && p.type !== "BLOG_INDEX");
    c.push(noMeta.length ? warn("Meta açıklama elle yazılmış", `Girişten türetilen: ${noMeta.map((p) => p.path).join(", ")}`) : ok("Meta açıklama elle yazılmış", "Tüm indekslenebilir sayfalarda"));
    cats.push(summarize("content", c));
  }

  // 4) İç linkler
  {
    const lp = toLinkPages(state);
    const stats = linkStats(lp, state.edges).filter((s) => indexable.some((p) => p.path === s.path));
    const orph = orphans(stats), weak = weaklyLinked(stats).filter((s) => !["STATIC", "BLOG_INDEX"].includes(s.type));
    const self = state.edges.filter((e) => e.from === e.to && e.kind !== "nav");
    cats.push(summarize("links", [
      orph.length ? fail("Orphan sayfa", orph.map((s) => s.path).join(", ")) : ok("Orphan sayfa", "Tüm indekslenebilir sayfalar link alıyor"),
      weak.length ? warn("Zayıf linkli sayfa", `${weak.length} sayfa 2'den az bağlamsal link alıyor: ${weak.slice(0, 5).map((s) => s.path).join(", ")}`) : ok("Zayıf linkli sayfa", "Yok"),
      self.length ? warn("Kendine link", `${self.length} sayfa kendine link veriyor`) : ok("Kendine link", "Yok"),
    ]));
  }

  // 5) Yapılandırılmış veri
  {
    const c: HealthCheck[] = [];
    const issues = [...analyses].flatMap(([id, a]) => a.schemaIssues.filter((i) => i.level === "error").map((i) => `${indexable.find((p) => p.id === id)!.path}: ${i.type} ${i.message}`));
    c.push(issues.length ? fail("Schema hataları", issues.slice(0, 5).join("; ")) : ok("Schema hataları", `${indexable.length} sayfada zorunlu alan hatası yok`));
    const b = settings.business;
    c.push(b.name ? ok("Organization adı", `“${b.name}”`) : warn("Organization adı", `Gerçek işletme adı girilmemiş; Organization ve WebSite adı site adından (“${settings.site.siteName}”) geliyor`));
    c.push(b.name && trLower(b.name) !== trLower(settings.site.siteName) ? warn("Varlık adı tutarlılığı", `İşletme adı “${b.name}”, site adı “${settings.site.siteName}” — schema, başlık ve llms.txt farklı adlar gösterir`) : ok("Varlık adı tutarlılığı", "Tek ad kullanılıyor"));
    const social = Object.values(settings.site.social).filter(Boolean);
    c.push(social.length ? ok("sameAs", `${social.length} doğrulanmış profil`) : nv("sameAs", "Sosyal profil girilmemiş (uydurulmaz)"));
    c.push(settings.site.logoId ? ok("Logo", "Organization logosu var") : warn("Logo", "Logo seçilmemiş; Organization'da logo yok"));
    const noCrumb = indexable.filter((p) => p.path !== "/" && !analyses.get(p.id)!.schemaTypes.includes("BreadcrumbList"));
    c.push(noCrumb.length ? warn("Breadcrumb", `BreadcrumbList yok: ${noCrumb.map((p) => p.path).join(", ")}`) : ok("Breadcrumb", "Ana sayfa dışındaki tüm sayfalarda BreadcrumbList"));
    cats.push(summarize("structured", c));
  }

  // 6) Performans — alan verisi (CrUX) yok; tarama yanıt süresi yalnızca bilgi
  {
    const c: HealthCheck[] = [nv("Core Web Vitals (LCP, INP, CLS)", "Alan verisi (CrUX / Search Console CWV raporu) sisteme bağlı değil; Lighthouse yalnızca komut satırından ölçülüyor", true)];
    if (crawl) {
      const t = await db.crawlPage.aggregate({ where: { runId: crawl.id, status: 200 }, _avg: { loadMs: true, bytes: true }, _max: { loadMs: true } });
      const avg = Math.round(t._avg.loadMs ?? 0), max = t._max.loadMs ?? 0, kb = Math.round((t._avg.bytes ?? 0) / 1024);
      c.push(avg > 1500 ? warn("Sunucu yanıt süresi (tarama)", `Ortalama ${avg} ms, en yavaş ${max} ms, ortalama HTML ${kb} KB`) : ok("Sunucu yanıt süresi (tarama)", `Ortalama ${avg} ms, en yavaş ${max} ms, ortalama HTML ${kb} KB`));
    }
    cats.push(summarize("performance", c));
  }

  // 7) Yerel SEO
  {
    const c: HealthCheck[] = [];
    const b = settings.business;
    c.push(businessIsComplete(b) ? ok("İşletme bilgileri (NAP)", `${b.name}, ${b.phone}, ${b.city}`) : warn("İşletme bilgileri (NAP)", `Eksik: ${[!b.name && "ad", !b.phone && "telefon", !(b.street && b.city) && "adres"].filter(Boolean).join(", ")} — LocalBusiness bilerek üretilmiyor`));
    const locPub = published.filter((p) => ["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"].includes(p.type));
    c.push(ok("Toplu lokasyon sayfası yok", `Yayında ${locPub.length} lokasyon sayfası; taslaklar 404 ve sitemap dışı (doorway yok)`));
    c.push(lastDay ? ok("Yerel talep verisi", "Search Console sorgularından hesaplanıyor") : nv("Yerel talep verisi", "Gerçek Google verisi alınamadı — hangi il/ilçede talep olduğu bilinmiyor", true));
    cats.push(summarize("local", c));
  }

  // 8) Google Search — yalnızca Search Console
  {
    const c: HealthCheck[] = [];
    if (!gscConnected) c.push(nv("Search Console", "Bağlı değil — Gerçek Google verisi alınamadı.", true));
    else if (!lastDay) c.push(nv("Search Console", "Bağlı ama henüz veri alınamadı", true));
    else {
      const sum = async (from: Date, to: Date) => (await db.gscDailyTotal.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { clicks: true, impressions: true } }))._sum;
      const now = await sum(addDays(lastDay, -27), lastDay), prev = await sum(addDays(lastDay, -55), addDays(lastDay, -28));
      const d = pct(now.clicks ?? 0, prev.clicks ?? 0);
      const ev = `Son 28 gün ${now.clicks ?? 0} tıklama / ${now.impressions ?? 0} gösterim; önceki 28 gün ${prev.clicks ?? 0} / ${prev.impressions ?? 0}`;
      c.push(d != null && d <= -30 ? fail("Organik tıklama trendi", ev, true) : d != null && d <= -10 ? warn("Organik tıklama trendi", ev, true) : ok("Organik tıklama trendi", ev, true));
      const stale = Date.now() - lastDay.getTime() > 7 * 86400_000;
      c.push(stale ? warn("Veri güncelliği", `Son veri günü ${lastDay.toISOString().slice(0, 10)}`) : ok("Veri güncelliği", `Son veri günü ${lastDay.toISOString().slice(0, 10)}`));
    }
    c.push(nv("Manuel işlemler / geliştirmeler raporu", "Search Console API bu raporları sunmuyor; Search Console arayüzünden kontrol edilmeli"));
    cats.push(summarize("google", c));
  }

  // 9) Bing — ön koşullar doğrulanabilir; Bing dizin/performans verisi bağlı değil
  {
    const c: HealthCheck[] = [];
    c.push(settings.integrations.bingVerification ? ok("Bing Webmaster doğrulaması", "msvalidate.01 etiketi yayında") : warn("Bing Webmaster doğrulaması", "Doğrulama etiketi girilmemiş (Ayarlar → SEO Entegrasyonları)"));
    if (!settings.integrations.indexNow) c.push(warn("IndexNow", "Ayarlardan kapalı"));
    else {
      const last = await db.indexNowSubmission.findFirst({ where: { status: { in: ["ok", "failed", "retry"] } }, orderBy: { createdAt: "desc" } });
      c.push(!last ? nv("IndexNow", "Henüz gerçek gönderim yok (yerel adreste gönderilmez)") : last.status === "ok" ? ok("IndexNow", `Son gönderim kabul edildi (${last.createdAt.toISOString().slice(0, 10)}); kabul ≠ indekslendi`) : warn("IndexNow", `Son gönderim: ${last.status} — ${last.message}`));
    }
    c.push(nv("Bing dizin ve performans verisi", "Bing Webmaster API bağlı değil — indekslenme ve tıklama bilinmiyor", true));
    cats.push(summarize("bing", c));
  }

  // 10) AI görünürlüğü — erişim ve varlık altyapısı (alıntılanma verisi yok)
  {
    const c: HealthCheck[] = [];
    if (robotsTxt?.status === 200) {
      const blocked = AI_SEARCH_BOTS.filter((bot) => !robotsAllows(robotsTxt.text, bot, "/").allowed);
      c.push(blocked.length ? warn("AI arama botları", `Engellenen: ${blocked.join(", ")}`) : ok("AI arama botları", `${AI_SEARCH_BOTS.length} AI arama/yanıt botu içeriğe erişebiliyor; /yonetim ve /api kapalı`));
    } else c.push(nv("AI arama botları", "robots.txt okunamadı"));
    const llmsOk = llms?.status === 200 && llms.text.includes("](") && !UNVERIFIED_RE.test(llms.text);
    c.push(!llms ? nv("llms.txt", "Site erişilemedi") : llmsOk ? ok("llms.txt", `${(llms.text.match(/\]\(/g) ?? []).length} bağlantı, yalnızca yayındaki sayfalar`) : fail("llms.txt", `HTTP ${llms.status} veya içerik geçersiz`));
    c.push(!llmsFull ? nv("llms-full.txt", "Site erişilemedi") : llmsFull.status === 200 && llmsFull.text.length > 1000 ? ok("llms-full.txt", `${Math.round(llmsFull.text.length / 1024)} KB tam metin`) : fail("llms-full.txt", `HTTP ${llmsFull.status}`));
    const b = settings.business;
    c.push(b.phone || b.email || settings.site.email ? ok("İletişim bilgisi", [b.phone, b.email || settings.site.email].filter(Boolean).join(" · ")) : warn("İletişim bilgisi", "Telefon/e-posta yok"));
    const withFaq = indexable.filter((p) => Array.isArray(p.faq) && (p.faq as unknown[]).length >= 2).length;
    c.push(ok("Doğrudan yanıtlar (SSS)", `${withFaq}/${indexable.length} indekslenebilir sayfada sayfaya özgü SSS; FAQ zengin sonucu beklenmez (Google 2023'ten beri yalnızca resmî/sağlık sitelerinde gösteriyor)`));
    c.push(nv("AI yanıtlarında kaynak gösterilme", "AI Overviews / Copilot / ChatGPT alıntı verisi sunan bir API bağlı değil"));
    cats.push(summarize("ai", c));
  }

  return { generatedAt: new Date().toISOString(), categories: cats };
}

// ─── Genel skor (deterministik) ────────────────────────────────────────────
// Her kontrolün sabit ağırlığı var. PASS ağırlığın tamamını, WARNING yarısını,
// FAIL hiçbirini kazanır. NOT_VERIFIABLE kontroller paydadan çıkarılır (veri yok ≠ kötü).
// Skor = 100 × kazanılan / mümkün. Her düşüş hangi kontrolden geldiğiyle listelenir.
export const CHECK_WEIGHTS: Record<string, number> = {
  "technical:Site taraması": 8, "technical:Tarama sorunları": 8, "technical:Kırık iç link": 5, "technical:Yönlendirme zinciri": 2, "technical:HTTPS": 4, "technical:Favicon": 3, "technical:Görsel alt metni": 2,
  "indexability:Site geneli indeksleme": 10, "indexability:robots.txt erişimi": 8, "indexability:robots.txt": 8, "indexability:Sitemap": 6, "indexability:Önemli sayfalar indekslenebilir": 8, "indexability:Canonical": 4, "indexability:Google indeks durumu": 3,
  "content:Kopya title": 4, "content:Kopya meta açıklama": 2, "content:Kopya H1": 2, "content:Title uzunluğu": 1, "content:İnce içerik": 3, "content:Doğrulanmamış içerik yayında": 5, "content:Benzer içerik": 3, "content:Meta açıklama elle yazılmış": 1,
  "links:Orphan sayfa": 4, "links:Zayıf linkli sayfa": 2, "links:Kendine link": 1,
  "structured:Schema hataları": 5, "structured:Organization adı": 2, "structured:Varlık adı tutarlılığı": 1, "structured:sameAs": 1, "structured:Logo": 2, "structured:Breadcrumb": 2,
  "performance:Core Web Vitals (LCP, INP, CLS)": 6, "performance:Sunucu yanıt süresi (tarama)": 3,
  "local:İşletme bilgileri (NAP)": 3, "local:Toplu lokasyon sayfası yok": 2, "local:Yerel talep verisi": 2,
  "google:Search Console": 6, "google:Organik tıklama trendi": 5, "google:Veri güncelliği": 1, "google:Manuel işlemler / geliştirmeler raporu": 1,
  "bing:Bing Webmaster doğrulaması": 2, "bing:IndexNow": 2, "bing:Bing dizin ve performans verisi": 2,
  "ai:AI arama botları": 3, "ai:llms.txt": 2, "ai:llms-full.txt": 1, "ai:İletişim bilgisi": 2, "ai:Doğrudan yanıtlar (SSS)": 1, "ai:AI yanıtlarında kaynak gösterilme": 1,
};
export const weightOf = (cat: string, label: string) => CHECK_WEIGHTS[`${cat}:${label}`] ?? 1;

export type Deduction = { category: string; label: string; status: HealthStatus; weight: number; points: number; evidence: string };
export type OverallScore = { score: number | null; earned: number; possible: number; deductions: Deduction[]; notVerifiable: { category: string; label: string; weight: number; evidence: string }[] };

export function overallScore(h: SeoHealth): OverallScore {
  let earned = 0, possible = 0;
  const lost: Omit<Deduction, "points">[] = [];
  const notVerifiable: OverallScore["notVerifiable"] = [];
  for (const c of h.categories) for (const x of c.checks) {
    const w = weightOf(c.key, x.label);
    if (x.status === "NOT_VERIFIABLE") { notVerifiable.push({ category: c.label, label: x.label, weight: w, evidence: x.evidence }); continue; }
    possible += w;
    const got = x.status === "PASS" ? w : x.status === "WARNING" ? w / 2 : 0;
    earned += got;
    if (got < w) lost.push({ category: c.label, label: x.label, status: x.status, weight: w - got, evidence: x.evidence });
  }
  const score = possible ? Math.round((100 * earned) / possible) : null;
  // Gösterilen düşüşler (0,1 hassasiyet) toplamı tam olarak 100 − skor olsun:
  // en büyük kalan yöntemiyle dağıtılır (deterministik; sıra: ağırlık, sonra etiket).
  const exact = lost.map((d) => (possible ? (100 * d.weight) / possible : 0));
  const sumExact = exact.reduce((a, b) => a + b, 0);
  const tenths = score == null ? 0 : (100 - score) * 10;
  const scaled = exact.map((x) => (sumExact ? (x * tenths) / sumExact : 0));
  const units = scaled.map(Math.floor);
  let rest = tenths - units.reduce((a, b) => a + b, 0);
  const order = scaled.map((x, i) => ({ i, frac: x - Math.floor(x), w: lost[i].weight, l: lost[i].label })).sort((a, b) => b.frac - a.frac || b.w - a.w || a.l.localeCompare(b.l));
  for (const o of order) { if (rest <= 0) break; units[o.i]++; rest--; }
  const deductions = lost.map((d, i) => ({ ...d, points: units[i] / 10 })).sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));
  return { score, earned, possible, deductions, notVerifiable };
}
