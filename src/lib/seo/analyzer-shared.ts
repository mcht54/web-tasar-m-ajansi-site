// Analiz motoru ile render katmanının paylaştığı hafif yardımcılar.
export type FaqItem = { q: string; a: string };

export function parseFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is FaqItem => !!x && typeof x.q === "string" && typeof x.a === "string")
    .filter((x) => x.q.trim() && x.a.trim());
}

/** Doğrulanmamış (AI/şablon) işaret: yayına engel. */
export const UNVERIFIED_RE = /\[DOĞRULANMALI/;
/** Yer tutucu kalıntıları: şablon metinleri, lorem ipsum, doldurulmamış {{…}}. */
export const PLACEHOLDER_RE = /lorem ipsum|\{\{\s*\w+\s*\}\}|\bTODO\b|\bXXX\b|\[buraya/i;

export function unverifiedCount(...texts: (string | null | undefined)[]): number {
  return texts.reduce((n, t) => n + ((t ?? "").match(/\[DOĞRULANMALI/g) ?? []).length, 0);
}
