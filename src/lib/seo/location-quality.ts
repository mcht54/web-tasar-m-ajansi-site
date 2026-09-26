import "server-only";
// Lokasyon kalite kapısı: il/ilçe/kombinasyon sayfası yayınlanmadan önce gerçek,
// ölçülebilir sinyallerle kontrol edilir. Kritik bir kontrol başarısızsa sayfa
// "YAYINA HAZIR DEĞİL" sayılır ve yayınlama sunucu tarafında engellenir.

import { db } from "../db";
import { type SiteState, analyzePage, loadSiteState } from "./analyzer";
import { PLACEHOLDER_RE, parseFaq, unverifiedCount } from "./analyzer-shared";
import { buildBreadcrumbs } from "./breadcrumbs";
import { resolveTitle } from "./meta";
import { containsPhrase, foldKeyword } from "../text/slug";
import { extractMarkdown } from "../text/markdown";
import { wordCount } from "../text/analyze";
import { locationDemand } from "./location-demand";

export const LOCATION_TYPES = new Set(["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"]);

export type GateItem = { key: string; label: string; status: "PASS" | "WARN" | "FAIL"; critical: boolean; note: string };
export type LocationGate = { ready: boolean; score: number; items: GateItem[]; demand: { impressions: number; clicks: number } | null };

const SERVICE_TERMS = ["web", "site", "tasarım", "e-ticaret", "seo", "yazılım", "ajans", "google ads"];

export async function locationGate(
  pageId: string,
  state?: SiteState,
  demandData?: { rows: { path: string; provinceId: number; districtId: number | null; impressions: number; clicks: number }[]; hasGsc: boolean },
): Promise<LocationGate | null> {
  const st = state ?? (await loadSiteState());
  const page = st.pages.find((p) => p.id === pageId);
  if (!page || !LOCATION_TYPES.has(page.type)) return null;
  const a = analyzePage(page, st);
  const md = extractMarkdown(page.body);
  const faq = parseFaq(page.faq);
  const items: GateItem[] = [];
  const add = (key: string, label: string, ok: boolean | "warn", critical: boolean, note: string) =>
    items.push({ key, label, status: ok === "warn" ? "WARN" : ok ? "PASS" : "FAIL", critical, note });

  const others = st.pages.filter((p) => p.id !== page.id && (p.status === "PUBLISHED" || p.body?.trim()));
  const title = resolveTitle(page, st.settings.seo);
  const titleDup = others.find((p) => resolveTitle(p, st.settings.seo).toLocaleLowerCase("tr-TR") === title.toLocaleLowerCase("tr-TR"));
  add("title", "Benzersiz title", !titleDup, true, titleDup ? `${titleDup.path} ile aynı` : title);
  const meta = page.metaDescription?.trim() ?? "";
  const metaDup = meta && others.find((p) => p.metaDescription?.trim() === meta);
  add("meta", "Benzersiz meta description", Boolean(meta) && !metaDup, true, !meta ? "Elle yazılmamış" : metaDup ? `${metaDup.path} ile aynı` : `${meta.length} karakter`);
  const h1 = (page.h1 ?? "").trim();
  const h1Dup = h1 && others.find((p) => (p.h1 ?? "").trim().toLocaleLowerCase("tr-TR") === h1.toLocaleLowerCase("tr-TR"));
  add("h1", "Benzersiz H1", Boolean(h1) && !h1Dup, true, h1Dup ? `${h1Dup.path} ile aynı` : h1 || "H1 yok");

  const wc = wordCount(`${page.intro ?? ""} ${md.text}`);
  const minWords = (st.settings.seo.minWords as Record<string, number>)[page.type] ?? 400;
  add("thin", "Thin content yok", wc >= minWords, true, `${wc} kelime (en az ${minWords})`);
  const threshold = st.settings.seo.duplicateThreshold;
  add("unique", "Yeterli özgün içerik", a.similar.score < threshold, true,
    a.similar.path ? `En benzer: ${a.similar.path} %${Math.round(a.similar.score * 100)} (şehir adları yok sayılarak)` : "Benzer sayfa yok");

  const [province, district] = await Promise.all([
    page.provinceId ? db.province.findUnique({ where: { id: page.provinceId }, select: { localNotes: true, name: true } }) : null,
    page.districtId ? db.district.findUnique({ where: { id: page.districtId }, select: { localNotes: true, name: true } }) : null,
  ]);
  const notes = (page.type === "DISTRICT" ? district?.localNotes : province?.localNotes)?.trim() ?? "";
  add("local", "Gerçek yerel bilgi", notes.length >= 80, true,
    notes ? `Editör notu ${notes.length} karakter` : `${page.type === "DISTRICT" ? "İlçe" : "İl"} için doğrulanmış yerel not girilmemiş (Lokasyonlar ekranı)`);

  const b = st.settings.business;
  const bizOk = Boolean(b.name && b.phone && (b.email || b.street));
  add("business", "Gerçek işletme bilgisi", bizOk, true,
    bizOk ? `${b.name} · ${b.phone}` : `Eksik: ${[!b.name && "işletme adı", !b.phone && "telefon", !b.email && !b.street && "e-posta veya adres"].filter(Boolean).join(", ")} (Ayarlar > İşletme)`);

  const kw = page.primaryKeyword ?? "";
  const locName = district?.name ?? province?.name ?? "";
  const relation = Boolean(page.serviceId) && SERVICE_TERMS.some((t) => foldKeyword(kw).includes(foldKeyword(t))) && containsPhrase(kw, locName);
  add("relation", "Hizmet–lokasyon ilişkisi", relation, true, relation ? `“${kw}”` : "Ana kelime hizmet ve konum adını birlikte içermeli; sayfa bir hizmete bağlı olmalı");

  add("links", "Internal link", a.inlinks + a.navInlinks >= 1 && a.outlinks >= 2, true, `${a.inlinks} gelen${a.potentialInlinks ? " (yayınlanınca)" : ""}, ${a.outlinks} giden bağlamsal link`);
  const crumbs = buildBreadcrumbs(page.path, page.breadcrumbLabel || page.name, st.graph);
  add("breadcrumb", "Breadcrumb", crumbs.length >= 3, true, crumbs.map((c) => c.label).join(" › "));
  add("canonical", "Canonical", !page.canonical || page.canonical.endsWith(page.path), true, page.canonical ? page.canonical : "Kendi URL'si");
  const schemaErr = a.schemaIssues.filter((i) => i.level === "error");
  add("schema", "Schema", schemaErr.length === 0, true, schemaErr.length ? schemaErr.map((e) => `${e.type}: ${e.message}`).join("; ") : a.schemaTypes.join(", "));

  if (faq.length) {
    const relevant = faq.filter((f) => containsPhrase(f.q + " " + f.a, locName) || SERVICE_TERMS.some((t) => foldKeyword(f.q).includes(foldKeyword(t))));
    const dupQ = faq.filter((f) => others.some((p) => parseFaq(p.faq).some((o) => o.q.trim() === f.q.trim())));
    add("faq", "SSS gerçek ve alakalı", relevant.length === faq.length && dupQ.length === 0 ? true : "warn", false,
      `${faq.length} soru; ${faq.length - relevant.length} tanesi konum/hizmetle ilgisiz görünüyor; ${dupQ.length} tanesi başka sayfada birebir var`);
  }
  const unv = unverifiedCount(page.intro, page.body, page.h1, page.seoTitle, page.metaDescription, JSON.stringify(page.faq ?? ""));
  add("unverified", "[DOĞRULANMALI] kalmadı", unv === 0, true, unv ? `${unv} işaret var` : "Yok");
  const ph = [page.intro, page.body, page.h1, page.seoTitle, page.metaDescription].some((t) => t && PLACEHOLDER_RE.test(t));
  add("placeholder", "Yer tutucu kalmadı", !ph, true, ph ? "Şablon/yer tutucu metin bulundu" : "Yok");

  // Doorway riski: başka konumun metnine benzeyen veya yerel bilgisi olmayan sayfa
  const doorwayHigh = a.similar.score >= threshold * 0.8 || notes.length < 80;
  add("doorway", "Doorway page riski", !doorwayHigh, true,
    doorwayHigh ? "Yüksek: sayfa başka bir konum sayfasına çok benziyor veya konuma özgü doğrulanmış bilgi içermiyor" : "Düşük");

  // Arama talebi: yalnızca bilgi — veri yoksa açıkça "Henüz veri yok"
  const loc = demandData ?? (await locationDemand(90));
  const gscCount = loc.hasGsc ? 1 : 0;
  const row = loc.rows.find((r) => r.path === page.path || (r.provinceId === page.provinceId && (r.districtId ?? null) === (page.districtId ?? null)));
  const demand = gscCount ? { impressions: row?.impressions ?? 0, clicks: row?.clicks ?? 0 } : null;
  add("demand", "Gerçek arama talebi (Search Console)", demand ? (demand.impressions > 0 ? true : "warn") : "warn", false,
    demand ? (demand.impressions ? `${demand.impressions} gösterim, ${demand.clicks} tıklama (90 gün)` : "Search Console'da bu konumla eşleşen sorgu kaydı yok") : "Henüz veri yok (Search Console bağlı değil)");

  const ready = !items.some((i) => i.critical && i.status === "FAIL");
  const weightTotal = items.reduce((s, i) => s + (i.critical ? 2 : 1), 0);
  const got = items.reduce((s, i) => s + (i.status === "PASS" ? (i.critical ? 2 : 1) : i.status === "WARN" ? (i.critical ? 1 : 0.5) : 0), 0);
  return { ready, score: Math.round((got / weightTotal) * 100), items, demand };
}

