// Otomatik değişikliklerin kalite kapısı. Geçmeyen öneri uygulanmaz.

import { PLACEHOLDER_RE, UNVERIFIED_RE } from "../seo/analyzer-shared";
import { containsPhrase, foldKeyword, normalizeKeyword, trLower } from "../text/slug";
import { phraseDensity, shingles, similarity } from "../text/analyze";

export type QcResult = { ok: boolean; problems: string[] };

// Türkçe harfler için \b yetersiz (yalnızca ASCII); harf sınırı lookaround ile
const HYPE_RE = /(?<![\p{L}\p{N}])(en iyi|en ucuz|1 numara|bir numara|numara 1|garanti\p{L}*|lider\p{L}*|rakipsiz|%\s?100)(?![\p{L}\p{N}])/iu;
// Doğrulanamayan güven sinyalleri: kaynak metinde yoksa yeni metinde de olamaz
const TRUST_CLAIM_RE = /(?<![\p{L}\p{N}])(memnun müşteri\p{L}*|müşteri(miz|lerimiz)\p{L}*|referans\p{L}*|yorum\p{L}*|puan\p{L}*|yıldız\p{L}*|ödül\p{L}*|sertifika\p{L}*|yıllık (deneyim|tecrübe)|\d+\+?\s*(yıl|proje|müşteri|site)\p{L}*)/giu;
const RISKY_FACT_RE = /\b(\d+\s*(tl|₺|lira|yıl|müşteri|proje|referans))\b|\b(\d{2,}\+)\b/i;

function common(text: string, problems: string[]) {
  if (UNVERIFIED_RE.test(text)) problems.push("[DOĞRULANMALI] işareti içeriyor");
  if (PLACEHOLDER_RE.test(text)) problems.push("Yer tutucu metin içeriyor");
  if (HYPE_RE.test(text)) problems.push("Doğrulanamayan üstünlük iddiası (en iyi / garanti / lider vb.)");
}

/** Kaynakta olmayan yer adları (şehir spamı / doğrulanmamış yerel bilgi). */
export function foreignPlaces(text: string, sourceText: string, places: string[]): string[] {
  return places.filter((p) => containsPhrase(text, p) && !containsPhrase(sourceText, p));
}

function stuffing(text: string, phrase: string | null): boolean {
  if (!phrase) return false;
  const t = trLower(text);
  const p = trLower(phrase.trim());
  if (!p) return false;
  return t.split(p).length - 1 > 1;
}

export function checkTitle(title: string, opts: { query: string | null; current: string; otherTitles: Set<string>; sourceText?: string; places?: string[] }): QcResult {
  const problems: string[] = [];
  const t = title.trim();
  const fp = opts.places && opts.sourceText != null ? foreignPlaces(t, opts.sourceText, opts.places) : [];
  if (fp.length) problems.push(`Sayfada geçmeyen yer adı: ${fp.join(", ")} (yerel sayfa değilse yanıltıcı)`);
  if (t.length < 30 || t.length > 60) problems.push(`Uzunluk ${t.length} (30–60 olmalı)`);
  if (opts.query && !containsPhrase(t, opts.query)) problems.push("Odak sorguyu içermiyor");
  if (trLower(t) === trLower(opts.current.trim())) problems.push("Mevcut title ile aynı");
  if (opts.otherTitles.has(trLower(t))) problems.push("Başka bir sayfanın title'ı ile aynı");
  if (stuffing(t, opts.query)) problems.push("Anahtar kelime tekrarı");
  common(t, problems);
  return { ok: problems.length === 0, problems };
}

export function checkDescription(desc: string, opts: { query: string | null; current: string; sourceText: string; places?: string[] }): QcResult {
  const problems: string[] = [];
  const d = desc.trim();
  const fp = opts.places ? foreignPlaces(d, opts.sourceText, opts.places) : [];
  if (fp.length) problems.push(`Sayfada geçmeyen yer adı: ${fp.join(", ")}`);
  const claims = newTrustClaims(d, opts.sourceText);
  if (claims.length) problems.push(`Sayfada olmayan güven iddiası: ${claims.join(", ")}`);
  if (d.length < 110 || d.length > 160) problems.push(`Uzunluk ${d.length} (110–160 olmalı)`);
  if (trLower(d) === trLower(opts.current.trim())) problems.push("Mevcut açıklama ile aynı");
  if (stuffing(d, opts.query)) problems.push("Anahtar kelime tekrarı");
  common(d, problems);
  // Sayfada geçmeyen rakamlı iddia (fiyat, yıl, müşteri sayısı) yasak
  const m = d.match(RISKY_FACT_RE);
  if (m && !opts.sourceText.includes(m[0])) problems.push(`Sayfada olmayan rakamlı iddia: “${m[0]}”`);
  return { ok: problems.length === 0, problems };
}

function newTrustClaims(text: string, sourceText: string): string[] {
  const src = trLower(sourceText);
  return [...new Set([...text.matchAll(TRUST_CLAIM_RE)].map((m) => trLower(m[0])))].filter((c) => !src.includes(c));
}

export type SectionQcOptions = {
  query: string | null;
  sourceText: string;
  beforeWords: number;
  addedWords: number;
  places?: string[]; // il adları: kaynakta yoksa eklenemez
  otherPages?: { path: string; text: string }[]; // başka sayfalarla benzerlik
};

export function checkSection(md: string, opts: SectionQcOptions): QcResult {
  const problems: string[] = [];
  common(md, problems);
  const claims = newTrustClaims(md, opts.sourceText);
  if (claims.length) problems.push(`Sayfada olmayan müşteri/referans/yorum/deneyim iddiası: ${claims.slice(0, 3).join(", ")}`);
  const fp = opts.places ? foreignPlaces(md, opts.sourceText, opts.places) : [];
  if (fp.length) problems.push(`Doğrulanmamış yer bilgisi: ${fp.slice(0, 3).join(", ")}`);
  const mine = shingles(normalizeKeyword(md));
  const src = shingles(normalizeKeyword(opts.sourceText));
  const repeated = mine.size ? [...mine].filter((x) => src.has(x)).length / mine.size : 0; // yeni metnin kaynakta zaten olan oranı
  if (mine.size >= 5 && repeated > 0.5) problems.push("Mevcut içeriği büyük ölçüde tekrar ediyor (yeni bilgi yok)");
  for (const o of opts.otherPages ?? []) {
    if (mine.size >= 5 && similarity(mine, shingles(normalizeKeyword(o.text))) > 0.4) {
      problems.push(`Başka sayfayla yüksek benzerlik: ${o.path}`);
      break;
    }
  }
  if (opts.query && phraseDensity(md, opts.query) > 3) problems.push("Anahtar kelime yoğunluğu %3'ün üzerinde");
  if (opts.addedWords < 60) problems.push("Eklenen bölüm çok kısa");
  if (opts.beforeWords > 0 && opts.addedWords / opts.beforeWords > 0.4) problems.push("İçerik %40'tan fazla büyüyor: büyük değişiklik insan onayı gerektirir");
  const nums = md.match(/\d[\d.,]*/g) ?? [];
  const foreign = nums.filter((n) => !opts.sourceText.includes(n));
  if (foreign.length) problems.push(`Sayfada olmayan sayılar: ${foreign.slice(0, 3).join(", ")}`);
  if (/https?:\/\//i.test(md)) problems.push("Dış bağlantı içeriyor");
  if (opts.query && trLower(md).split(trLower(opts.query)).length - 1 > 3) problems.push("Anahtar kelime tekrarı");
  return { ok: problems.length === 0, problems };
}

export function checkAnchor(anchor: string, existingAnchorsToTarget: string[]): QcResult {
  const problems: string[] = [];
  const a = anchor.trim();
  if (a.length < 3 || a.length > 80) problems.push("Anchor uzunluğu uygun değil");
  if (/^(tıkla|buraya tıklayın|devamı|link)$/i.test(a)) problems.push("Anlamsız anchor");
  const same = existingAnchorsToTarget.filter((x) => trLower(x) === trLower(a)).length;
  if (same >= 3) problems.push("Aynı anchor bu hedefe çok kez kullanılmış");
  common(a, problems);
  return { ok: problems.length === 0, problems };
}

// ─── Konu uyumu (yanlış title koruması) ─────────────────────────────────────
// Bir ifade, sayfanın GERÇEK konusuyla (H1, ad, ana kelime, URL) uyumlu değilse o sayfanın title'ı
// olamaz. Genel kelimeler (web, site, tasarım, hizmet, fiyat…) ayırt edici sayılmaz; kalanlar
// ("restoran", "google ads", "e-ticaret"…) iki yönde karşılaştırılır:
//   • sayfanın ayırt edici kelimelerinin en az yarısı ifadede geçmeli (restoran sayfası → "restoran" olmalı)
//   • ifade sayfada olmayan yeni bir konu getirmemeli (/web-tasarim → "e-ticaret …" olamaz)
const GENERIC = new Set([
  "web", "site", "sitesi", "siteleri", "internet", "tasarim", "tasarimi", "tasarimci", "hizmet", "hizmeti", "hizmetleri",
  "firma", "firmasi", "firmalari", "ajans", "ajansi", "sirket", "sirketi", "fiyat", "fiyati", "fiyatlari", "ucret", "ucreti",
  "profesyonel", "yaptirma", "yapimi", "yapan", "olusturma", "nedir", "nasil", "neden", "kadar", "icin", "ile", "iyi", "blog", "rehber", "rehberi",
]);
const distinctive = (s: string) => [...new Set(foldKeyword(s).replace(/-/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !GENERIC.has(w)))];
// Türkçe ek toleransı: biri ötekinin başıysa (en az 4 harf) aynı kelime sayılır ("restoran" ~ "restoranlar")
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

export function titleTopicProblem(page: { h1: string | null; name: string; primaryKeyword: string | null; path: string }, phrase: string): string | null {
  const topic = distinctive(`${page.h1 ?? ""} ${page.name} ${page.primaryKeyword ?? ""} ${page.path.replace(/\//g, " ")}`);
  const q = distinctive(phrase);
  const covered = topic.filter((t) => q.some((w) => same(w, t)));
  if (topic.length && covered.length / topic.length < 0.5) return `Konu uyumsuz: sayfanın konusu (${topic.join(", ")}) “${phrase}” ifadesinde yok`;
  const foreign = q.filter((w) => !topic.some((t) => same(w, t)));
  if (foreign.length) return `Konu uyumsuz: “${foreign.join(", ")}” bu sayfanın konusu değil`;
  return null;
}
