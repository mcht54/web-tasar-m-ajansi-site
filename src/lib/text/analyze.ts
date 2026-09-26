// Metin ölçümleri ve kopya/benzer içerik tespiti.
//
// Programatik SEO'nun en büyük riski "sadece şehir adı değiştirilmiş" sayfalardır.
// Benzerlik hesabından önce her sayfanın kendi lokasyon adları ortak bir yer
// tutucuya çevrilir; böylece "Sakarya'da web tasarım" ile "Ankara'da web tasarım"
// metinleri özdeş sayılır ve kopya olarak yakalanır.

import { foldKeyword, trLower } from "./slug";

export function words(text: string): string[] {
  return trLower(text)
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return words(text).length;
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Ortalama cümle uzunluğu (kelime). Türkçe web metni için 12–20 rahat okunur. */
export function avgSentenceLength(text: string): number {
  const s = sentences(text);
  if (s.length === 0) return 0;
  return wordCount(text) / s.length;
}

/** Bir ifadenin metindeki yoğunluğu (%) — keyword stuffing tespiti için. */
export function phraseDensity(text: string, phrase: string): number {
  const total = wordCount(text);
  if (!total || !phrase.trim()) return 0;
  const hay = ` ${foldKeyword(text)} `;
  const needle = ` ${foldKeyword(phrase)}`;
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  const phraseWords = phrase.trim().split(/\s+/).length;
  return (count * phraseWords * 100) / total;
}

/** Lokasyon adlarını (ekleriyle birlikte) yer tutucuya çevirir. */
export function maskNames(text: string, names: string[]): string {
  let out = ` ${foldKeyword(text)} `;
  const folded = names
    .map((n) => foldKeyword(n))
    .filter((n) => n.length > 1)
    .sort((a, b) => b.length - a.length);
  for (const n of folded) {
    // "sakarya", "sakaryada", "sakarya'nin" → "__loc__"
    const re = new RegExp(`(^|\\s)${escapeRe(n)}[\\p{L}']*`, "gu");
    out = out.replace(re, "$1__loc__");
  }
  return out.trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 5 kelimelik kaydırmalı parçaların (shingle) özet kümesi. */
export function shingles(text: string, size = 5): Set<number> {
  const w = text.split(/\s+/).filter(Boolean);
  const out = new Set<number>();
  if (w.length < size) {
    if (w.length) out.add(hash(w.join(" ")));
    return out;
  }
  for (let i = 0; i + size <= w.length; i++) out.add(hash(w.slice(i, i + size).join(" ")));
  return out;
}

function hash(s: string): number {
  // FNV-1a 32 bit — çakışma oranı bu ölçekte (binlerce sayfa) önemsiz.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Jaccard benzerliği 0–1. */
export function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Kapsama benzerliği: küçük metnin ne kadarı büyük metinde de var (0–1).
 * Kısa bir sayfa uzun bir sayfanın alt kümesiyse Jaccard düşük çıkar ama bu
 * yine kopyadır; bu yüzden ikisinin büyüğünü kullanırız.
 */
export function containment(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  return inter / small.size;
}

export function similarity(a: Set<number>, b: Set<number>): number {
  return Math.max(jaccard(a, b), containment(a, b) * 0.9);
}

export function fingerprintText(text: string, locationNames: string[]): Set<number> {
  return shingles(maskNames(text, locationNames));
}
