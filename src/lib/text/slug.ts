// Türkçe metin yardımcıları. JavaScript'in varsayılan toLowerCase'i "I"yı "i"
// yapar; Türkçede doğrusu "ı"dır. Anahtar kelime eşleştirmesi ve slug üretimi
// bu farka duyarlı olduğu için hepsi buradan geçer.

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  â: "a", î: "i", û: "u",
};

export function trLower(input: string): string {
  return input.toLocaleLowerCase("tr-TR");
}

export function trUpperFirst(input: string): string {
  if (!input) return input;
  return input.charAt(0).toLocaleUpperCase("tr-TR") + input.slice(1);
}

/** SEO URL kuralı: küçük harf, Türkçe karakter yok, kelimeler tireyle. */
export function slugify(input: string): string {
  return trLower(input)
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ve ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Anahtar kelime karşılaştırması için: Türkçe küçük harf, noktalama yok, tek boşluk. */
export function normalizeKeyword(input: string): string {
  return trLower(input)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aksan/Türkçe karakter farkını da yok sayan gevşek karşılaştırma anahtarı. */
export function foldKeyword(input: string): string {
  return normalizeKeyword(input)
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch);
}

/** Bir metin bir ifadeyi (Türkçe ekleri tolere ederek) içeriyor mu? */
export function containsPhrase(text: string, phrase: string): boolean {
  const t = ` ${foldKeyword(text)} `;
  const p = foldKeyword(phrase);
  if (!p) return false;
  // "web tasarım sakarya" ifadesi "Sakarya'da web tasarım" cümlesinde sırası
  // farklı geçebilir; tam ifade yoksa tüm kelimelerin (ek almış hâlleri dahil)
  // geçtiğini kontrol ederiz.
  if (t.includes(` ${p}`)) return true;
  const words = p.split(" ").filter((w) => w.length > 1);
  return words.length > 0 && words.every((w) => t.includes(` ${w}`));
}
