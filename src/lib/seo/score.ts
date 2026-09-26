// SEO skoru (0–100), içerik kalite skoru ve yayına hazırlık kontrolü.
//
// Ağırlıklar: Teknik 25, İçerik 25, Sayfa içi 20, İç link 10, Performans 10,
// Yapısal veri 5, UX 5. Ölçülemeyen kontrol (ör. performans verisi yoksa)
// "Ölçülmedi" olur ve toplamdan düşülür — var olmayan veriye puan uydurulmaz.

import { avgSentenceLength, phraseDensity, wordCount } from "../text/analyze";
import { containsPhrase, isValidSlug } from "../text/slug";

export type CheckStatus = "PASS" | "WARN" | "FAIL" | "NA";
export type Category = "technical" | "content" | "onPage" | "internal" | "performance" | "structured" | "ux";

export type Check = {
  id: string;
  category: Category;
  label: string;
  status: CheckStatus;
  points: number;
  max: number;
  message: string;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  technical: "Teknik SEO",
  content: "İçerik",
  onPage: "Sayfa içi",
  internal: "İç linkler",
  performance: "Performans",
  structured: "Yapısal veri",
  ux: "Kullanıcı deneyimi",
};

export type AnalysisInput = {
  type: string;
  path: string;
  title: string;
  metaDescription: string | null; // elle girilmiş açıklama
  h1: string;
  intro: string;
  bodyText: string; // gövde + SSS düz metni
  headings: { depth: number; text: string }[];
  bodyLinks: { href: string; internal: boolean }[];
  images: { alt: string }[];
  rawMarkdown: string;
  faqCount: number;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  wouldBeIndexable: boolean; // yayında olsa indekslenebilir mi
  noindexReasons: string[];
  selfCanonical: boolean;
  schemaTypes: string[];
  schemaErrors: number;
  inlinks: number; // bağlamsal (nav hariç) gelen link
  navInlinks: number;
  outlinks: number; // bağlamsal giden link (şablon + gövde)
  maxSimilarity: { score: number; path: string | null };
  duplicateThreshold: number;
  cannibalWith: string[]; // aynı ana kelimeyi hedefleyen diğer sayfalar
  minWords: number | null;
  perf: { loadMs: number | null; bytes: number | null; hasViewport: boolean } | null;
  hasOgImage: boolean;
};

export type ScoreResult = {
  score: number;
  categories: Record<Category, { points: number; max: number }>;
  checks: Check[];
  wordCount: number;
};

const has = (s: string | null | undefined) => Boolean(s && s.trim());

export function computeSeoScore(a: AnalysisInput): ScoreResult {
  const checks: Check[] = [];
  const push = (c: Omit<Check, "points"> & { points?: number }) =>
    checks.push({
      ...c,
      points: c.status === "NA" ? 0 : (c.points ?? (c.status === "PASS" ? c.max : c.status === "WARN" ? Math.round(c.max / 2) : 0)),
    });
  const kw = a.primaryKeyword?.trim() || null;
  const fullText = `${a.intro}\n${a.bodyText}`;
  const wc = wordCount(`${a.h1} ${fullText}`);

  // ── Teknik (25)
  push({
    id: "indexability", category: "technical", label: "İndekslenebilirlik", max: 7,
    status: a.wouldBeIndexable ? "PASS" : "FAIL",
    message: a.wouldBeIndexable ? "Sayfa indekslenebilir" : `İndekslenemez: ${a.noindexReasons.join("; ")}`,
  });
  push({
    id: "canonical", category: "technical", label: "Canonical", max: 5,
    status: a.selfCanonical ? "PASS" : "WARN",
    message: a.selfCanonical ? "Canonical sayfanın kendisini gösteriyor" : "Canonical başka URL'yi gösteriyor — bilinçli değilse düzeltin",
  });
  const segs = a.path.split("/").filter(Boolean);
  const urlOk = segs.every(isValidSlug) && a.path.length <= 75 && segs.length <= 3;
  push({
    id: "url", category: "technical", label: "URL yapısı", max: 4,
    status: urlOk ? "PASS" : segs.every(isValidSlug) ? "WARN" : "FAIL",
    message: urlOk ? "Kısa, küçük harf, tireli URL" : segs.every(isValidSlug) ? "URL uzun veya çok derin" : "URL'de geçersiz karakter var",
  });
  const sim = a.maxSimilarity.score;
  push({
    id: "duplicate", category: "technical", label: "Kopya içerik", max: 5,
    status: sim >= a.duplicateThreshold ? "FAIL" : sim >= a.duplicateThreshold * 0.7 ? "WARN" : "PASS",
    message:
      sim >= a.duplicateThreshold * 0.7
        ? `${a.maxSimilarity.path} ile %${Math.round(sim * 100)} benzer (şehir adları yok sayılarak)`
        : `En yüksek benzerlik %${Math.round(sim * 100)}`,
  });
  push({
    id: "cannibalization", category: "technical", label: "Keyword cannibalization", max: 4,
    status: !kw ? "NA" : a.cannibalWith.length ? "FAIL" : "PASS",
    message: !kw
      ? "Ana anahtar kelime tanımlı değil"
      : a.cannibalWith.length
        ? `Aynı kelimeyi hedefleyen sayfa(lar): ${a.cannibalWith.join(", ")}`
        : "Bu kelimeyi başka sayfa hedeflemiyor",
  });

  // ── İçerik (25)
  if (a.minWords) {
    push({
      id: "length", category: "content", label: "İçerik uzunluğu / thin content", max: 8,
      status: wc >= a.minWords ? "PASS" : wc >= a.minWords * 0.6 ? "WARN" : "FAIL",
      message: `${wc} kelime (bu sayfa türü için hedef en az ${a.minWords})`,
    });
  } else {
    push({ id: "length", category: "content", label: "İçerik uzunluğu", max: 8, status: wc >= 250 ? "PASS" : "WARN", message: `${wc} kelime` });
  }
  push({
    id: "kw-intro", category: "content", label: "Anahtar kelime ilk paragrafta", max: 4,
    status: !kw ? "NA" : containsPhrase(a.intro.slice(0, 400), kw) ? "PASS" : "FAIL",
    message: !kw ? "Ana anahtar kelime tanımlı değil" : containsPhrase(a.intro.slice(0, 400), kw) ? "Giriş paragrafında geçiyor" : "Giriş paragrafında geçmiyor",
  });
  const sec = a.secondaryKeywords.filter(Boolean);
  const secHit = sec.filter((s) => containsPhrase(fullText, s)).length;
  push({
    id: "semantic", category: "content", label: "Semantik / ikincil kelimeler", max: 4,
    status: sec.length === 0 ? "WARN" : secHit / sec.length >= 0.5 ? "PASS" : "WARN",
    message: sec.length === 0 ? "İkincil kelime tanımlanmamış" : `${sec.length} ikincil kelimeden ${secHit} tanesi metinde geçiyor`,
  });
  const h2 = a.headings.filter((h) => h.depth === 2).length;
  const firstH3 = a.headings.findIndex((h) => h.depth >= 3);
  const firstH2 = a.headings.findIndex((h) => h.depth === 2);
  const orderOk = firstH3 === -1 || (firstH2 !== -1 && firstH2 < firstH3);
  const utility = a.type === "STATIC" || a.type === "BLOG_INDEX"; // form/liste sayfaları
  push({
    id: "headings", category: "content", label: "H2/H3 yapısı", max: 5,
    status: utility && h2 === 0 ? "NA" : h2 >= 2 && orderOk ? "PASS" : h2 >= 1 ? "WARN" : "FAIL",
    message: `${h2} adet H2${orderOk ? "" : "; H3, H2'den önce geliyor"}`,
  });
  const density = kw ? phraseDensity(fullText, kw) : 0;
  push({
    id: "stuffing", category: "content", label: "Keyword stuffing", max: 4,
    status: !kw ? "NA" : density > 3.5 ? "FAIL" : density > 2.5 ? "WARN" : "PASS",
    message: !kw ? "Ana anahtar kelime tanımlı değil" : `Ana kelime yoğunluğu %${density.toFixed(1)} (doğal aralık ≤ %2,5)`,
  });

  // ── Sayfa içi (20)
  const tl = a.title.length;
  push({
    id: "title-length", category: "onPage", label: "Title uzunluğu", max: 5,
    status: tl >= 30 && tl <= 60 ? "PASS" : tl >= 20 && tl <= 70 ? "WARN" : "FAIL",
    message: `${tl} karakter (ideal 30–60)`,
  });
  push({
    id: "kw-title", category: "onPage", label: "Anahtar kelime title'da", max: 4,
    status: !kw ? "NA" : containsPhrase(a.title, kw) ? "PASS" : "FAIL",
    message: !kw ? "Ana anahtar kelime tanımlı değil" : containsPhrase(a.title, kw) ? "Title'da geçiyor" : "Title'da geçmiyor",
  });
  push({
    id: "h1", category: "onPage", label: "H1 var", max: 3,
    status: has(a.h1) ? "PASS" : "FAIL",
    message: has(a.h1) ? `"${a.h1}"` : "H1 yok",
  });
  push({
    id: "kw-h1", category: "onPage", label: "Anahtar kelime H1'de", max: 3,
    status: !kw ? "NA" : containsPhrase(a.h1, kw) ? "PASS" : "FAIL",
    message: !kw ? "Ana anahtar kelime tanımlı değil" : containsPhrase(a.h1, kw) ? "H1'de geçiyor" : "H1'de geçmiyor",
  });
  const ml = a.metaDescription?.trim().length ?? 0;
  push({
    id: "meta", category: "onPage", label: "Meta description", max: 5,
    status: ml >= 110 && ml <= 160 ? "PASS" : ml > 0 ? "WARN" : "FAIL",
    message: ml ? `${ml} karakter (ideal 110–160)` : "Meta description eksik — girişten otomatik türetiliyor",
  });

  // ── İç linkler (10)
  const totalIn = a.inlinks + a.navInlinks;
  push({
    id: "inlinks", category: "internal", label: "Gelen iç linkler", max: 5,
    status: a.type === "HOME" || a.inlinks >= 2 ? "PASS" : totalIn >= 1 ? "WARN" : "FAIL",
    message: totalIn === 0 ? "Hiçbir sayfa bu sayfaya link vermiyor (orphan)" : `${a.inlinks} bağlamsal, ${a.navInlinks} menü linki`,
  });
  push({
    id: "outlinks", category: "internal", label: "Giden iç linkler", max: 3,
    status: a.outlinks >= 3 ? "PASS" : a.outlinks >= 1 ? "WARN" : "FAIL",
    message: `${a.outlinks} bağlamsal iç link`,
  });
  const ext = a.bodyLinks.filter((l) => !l.internal).length;
  push({
    id: "external", category: "internal", label: "Dış kaynak referansı", max: 2,
    status: a.type !== "BLOG_POST" ? "NA" : ext >= 1 ? "PASS" : "WARN",
    message: a.type !== "BLOG_POST" ? "Bu sayfa türünde beklenmiyor" : `${ext} dış kaynak linki`,
  });

  // ── Performans (10) — yalnızca crawler ölçtüyse
  if (a.perf && a.perf.loadMs != null) {
    push({
      id: "ttfb", category: "performance", label: "Sunucu yanıt süresi", max: 5,
      status: a.perf.loadMs < 600 ? "PASS" : a.perf.loadMs < 1500 ? "WARN" : "FAIL",
      message: `${a.perf.loadMs} ms (son tarama)`,
    });
    const kb = Math.round((a.perf.bytes ?? 0) / 1024);
    push({
      id: "weight", category: "performance", label: "HTML boyutu", max: 5,
      status: kb < 120 ? "PASS" : kb < 300 ? "WARN" : "FAIL",
      message: `${kb} KB HTML`,
    });
  } else {
    push({ id: "ttfb", category: "performance", label: "Performans", max: 10, status: "NA", message: "Ölçülmedi — SEO Sağlığı'ndan tarama başlatın" });
  }

  // ── Yapısal veri (5)
  push({
    id: "schema", category: "structured", label: "Schema", max: 5,
    status: a.schemaTypes.length === 0 ? "FAIL" : a.schemaErrors > 0 ? "WARN" : "PASS",
    message: a.schemaTypes.length ? `${a.schemaTypes.join(", ")}${a.schemaErrors ? ` — ${a.schemaErrors} hata` : ""}` : "Schema yok",
  });

  // ── UX (5)
  const noAlt = a.images.filter((i) => !i.alt.trim()).length;
  push({
    id: "alt", category: "ux", label: "Görsel ALT metinleri", max: 3,
    status: a.images.length === 0 ? "NA" : noAlt === 0 ? "PASS" : "FAIL",
    message: a.images.length === 0 ? "Gövdede görsel yok" : noAlt ? `${noAlt} görselde ALT eksik` : "Tüm görsellerde ALT var",
  });
  const viewport = a.perf ? a.perf.hasViewport : true;
  push({
    id: "mobile", category: "ux", label: "Mobil uyum", max: 2,
    status: viewport ? "PASS" : "FAIL",
    message: a.perf ? (viewport ? "Viewport etiketi var (tarama)" : "Viewport etiketi yok") : "Şablon duyarlı; tarama ile doğrulanmadı",
  });

  const categories = Object.fromEntries(
    (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
      const list = checks.filter((x) => x.category === c && x.status !== "NA");
      return [c, { points: list.reduce((s, x) => s + x.points, 0), max: list.reduce((s, x) => s + x.max, 0) }];
    }),
  ) as ScoreResult["categories"];
  const earned = checks.reduce((s, c) => s + c.points, 0);
  const possible = checks.filter((c) => c.status !== "NA").reduce((s, c) => s + c.max, 0);
  return { score: applyCaps(possible ? Math.round((earned / possible) * 100) : 0, checks), categories, checks, wordCount: wc };
}

/**
 * Ağırlıklı toplam tek başına yanıltabilir: kopya bir sayfa diğer her şeyi
 * doğru yaptığı için 80+ alabilir. Kritik sorunlar skora tavan koyar.
 */
export const SCORE_CAPS: Record<string, number> = { indexability: 50, duplicate: 60, length: 65, cannibalization: 75 };

export function applyCaps(score: number, checks: Check[]): number {
  let capped = score;
  for (const c of checks) {
    const cap = SCORE_CAPS[c.id];
    if (cap != null && c.status === "FAIL") capped = Math.min(capped, cap);
  }
  return capped;
}

// ─── İçerik kalite skoru ─────────────────────────────────────────────────────

export type QualityResult = { score: number; parts: { label: string; points: number; max: number; note: string }[] };

export function computeContentQuality(a: AnalysisInput, seo: ScoreResult): QualityResult {
  const parts: QualityResult["parts"] = [];
  const add = (label: string, max: number, ratio: number, note: string) =>
    parts.push({ label, max, points: Math.round(Math.max(0, Math.min(1, ratio)) * max), note });
  const wc = seo.wordCount;
  const min = a.minWords ?? 400;
  const lists = (a.rawMarkdown.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) ?? []).length;
  const tables = (a.rawMarkdown.match(/^\s*\|.*\|\s*$/gm) ?? []).length > 1 ? 1 : 0;
  const numbers = (a.bodyText.match(/\d/g) ?? []).length > 0 ? 1 : 0;
  const h2 = a.headings.filter((h) => h.depth === 2).length;
  const h3 = a.headings.filter((h) => h.depth === 3).length;
  const asl = avgSentenceLength(`${a.intro}\n${a.bodyText}`);

  add("Özgünlük", 20, 1 - a.maxSimilarity.score / Math.max(a.duplicateThreshold, 0.01), `En yakın sayfaya benzerlik %${Math.round(a.maxSimilarity.score * 100)}`);
  add("Kapsam", 15, (Math.min(wc / min, 1) * 2 + Math.min(h2 / 4, 1)) / 3, `${wc} kelime, ${h2} ana bölüm`);
  const intentOk = a.type === "BLOG_POST" ? h2 >= 3 : a.faqCount >= 2;
  add("Kullanıcı amacı", 10, intentOk ? 1 : 0.4, a.type === "BLOG_POST" ? "Soruyu bölümlere ayırarak yanıtlıyor mu" : "Karar aşamasındaki sorular (SSS) yanıtlanmış mı");
  add("Bilgi değeri", 15, (Math.min(lists / 3, 1) + tables + numbers + Math.min(a.faqCount / 4, 1)) / 4, `${lists} liste maddesi, ${tables ? "tablo var" : "tablo yok"}, ${a.faqCount} SSS`);
  add("İç linkler", 10, (Math.min(a.inlinks / 3, 1) + Math.min(a.outlinks / 4, 1)) / 2, `${a.inlinks} gelen, ${a.outlinks} giden`);
  add("Görseller", 5, a.images.length > 0 || a.hasOgImage ? 1 : 0, a.images.length ? `${a.images.length} görsel` : a.hasOgImage ? "Yalnızca paylaşım görseli" : "Görsel yok");
  add("Yapı", 10, (Math.min(h2 / 3, 1) * 2 + (h3 > 0 ? 1 : 0.5)) / 3, `${h2} H2, ${h3} H3`);
  add("Okunabilirlik", 10, asl === 0 ? 0 : asl <= 20 ? 1 : asl <= 26 ? 0.6 : 0.2, asl ? `Ortalama cümle ${asl.toFixed(1)} kelime` : "Metin yok");
  add("SEO", 5, seo.score / 100, `SEO skoru ${seo.score}`);
  // Tüm şablonlarda teklif çağrısı bulunur; blog yazısında da bitiş kutusu var.
  add("Dönüşüm", 0, 1, "Şablon teklif çağrısı içeriyor");
  const max = parts.reduce((s, p) => s + p.max, 0);
  const got = parts.reduce((s, p) => s + p.points, 0);
  return { score: Math.round((got / max) * 100), parts };
}

// ─── Yayına hazırlık ("Google'a gönderilmeye hazır mı?") ─────────────────────

export type ReadinessItem = { label: string; status: "PASS" | "WARNING" | "FAIL"; note: string };
export type Readiness = { ready: boolean; items: ReadinessItem[] };

export function computeReadiness(a: AnalysisInput, seo: ScoreResult): Readiness {
  const byId = new Map(seo.checks.map((c) => [c.id, c]));
  const fromCheck = (id: string, label: string): ReadinessItem => {
    const c = byId.get(id);
    if (!c || c.status === "NA") return { label, status: "WARNING", note: c?.message ?? "Değerlendirilemedi" };
    return { label, status: c.status === "PASS" ? "PASS" : c.status === "WARN" ? "WARNING" : "FAIL", note: c.message };
  };
  const items: ReadinessItem[] = [
    { label: "SEO Skoru", status: seo.score >= 80 ? "PASS" : seo.score >= 60 ? "WARNING" : "FAIL", note: `${seo.score}/100` },
    fromCheck("indexability", "Indexability"),
    fromCheck("duplicate", "Unique Content"),
    fromCheck("canonical", "Canonical"),
    fromCheck("schema", "Schema"),
    {
      label: "Internal Links",
      status: a.inlinks >= 1 && a.outlinks >= 2 ? "PASS" : a.inlinks + a.navInlinks >= 1 ? "WARNING" : "FAIL",
      note: `${a.inlinks} gelen / ${a.outlinks} giden bağlamsal link${a.inlinks === 0 ? " — yayınlandığında üst sayfa link verecekse bu normaldir" : ""}`,
    },
    fromCheck("length", "Thin Content"),
    fromCheck("cannibalization", "Cannibalization"),
    {
      label: "Title / Meta",
      status: has(a.metaDescription) && a.title.length <= 65 ? "PASS" : "WARNING",
      note: has(a.metaDescription) ? `Title ${a.title.length} karakter` : "Meta description elle girilmemiş",
    },
  ];
  const unverified = (a.rawMarkdown.match(/\[DOĞRULANMALI/g) ?? []).length + (a.intro.includes("[DOĞRULANMALI") ? 1 : 0);
  items.push({
    label: "Doğrulanmış bilgi",
    status: unverified ? "FAIL" : "PASS",
    note: unverified ? `${unverified} adet [DOĞRULANMALI] işareti var — gerçek bilgiyle doldurun` : "Doğrulama bekleyen işaret yok",
  });
  return { ready: !items.some((i) => i.status === "FAIL"), items };
}

/** Programatik sayfalar (il, ilçe, kombinasyon) yetersizse otomatik NOINDEX. */
export const PROGRAMMATIC_TYPES = new Set(["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"]);

export function autoNoindexDecision(a: AnalysisInput, wc: number): { noindex: boolean; reason: string | null } {
  // Doğrulanmamış işaret her sayfa türünde indekslemeyi engeller.
  if (/\[DOĞRULANMALI/.test(a.rawMarkdown) || a.intro.includes("[DOĞRULANMALI") || a.h1.includes("[DOĞRULANMALI") || a.title.includes("[DOĞRULANMALI"))
    return { noindex: true, reason: "Doğrulanmamış [DOĞRULANMALI] işaretleri var" };
  if (!PROGRAMMATIC_TYPES.has(a.type)) return { noindex: false, reason: null };
  if (a.minWords && wc < a.minWords)
    return { noindex: true, reason: `İçerik yetersiz: ${wc} kelime (en az ${a.minWords} gerekli)` };
  if (a.maxSimilarity.score >= a.duplicateThreshold)
    return {
      noindex: true,
      reason: `${a.maxSimilarity.path} ile %${Math.round(a.maxSimilarity.score * 100)} benzer (şehir adı değiştirilmiş kopya)`,
    };
  return { noindex: false, reason: null };
}
