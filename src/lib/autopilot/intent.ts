// Arama niyeti sınıflandırması (kural tabanlı, açıklanabilir).
// Birincil niyet + ek niyetler (ör. "sakarya web tasarım" → commercial + local).

import { foldKeyword } from "../text/slug";

export type Intent = "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "NAVIGATIONAL" | "LOCAL";

const has = (q: string, words: string[]) => words.some((w) => new RegExp(`(^|\\s)${w}`).test(q));

const INFO = ["nedir", "nasil", "ne demek", "neden", "nelerdir", "nedir", "rehber", "ornek", "ipucu", "farki", "mi$", "mı$", "kac gun", "ne kadar surer", "avantaj", "dezavantaj", "hakkinda"];
const TRANS = ["yaptirma", "yaptir", "yaptirmak", "teklif", "satin al", "siparis", "kurdurma", "hemen", "iletisim", "basvuru"];
const COMM = ["ajans", "firma", "sirket", "en iyi", "profesyonel", "hizmet", "fiyat", "ucret", "paket", "tasarimci", "yapan yer", "yapan firma", "yapimi", "tasarimi", "kurumsal", "e ticaret", "eticaret", "seo", "google ads", "yazilim", "web sitesi", "web tasarim", "site"];

export function classifyIntent(query: string, opts: { hasLocation: boolean; brandTokens?: string[] }): { primary: Intent; intents: Intent[]; reason: string } {
  const q = foldKeyword(query).replace(/-/g, " ");
  const intents = new Set<Intent>();
  let primary: Intent;
  let reason: string;
  if (opts.brandTokens?.some((b) => b && q.includes(foldKeyword(b)))) {
    primary = "NAVIGATIONAL";
    reason = "Marka adı geçiyor";
  } else if (has(q, INFO) || /\?$/.test(query.trim())) {
    primary = "INFORMATIONAL";
    reason = "Soru/bilgi kalıbı (nedir, nasıl…)";
  } else if (has(q, TRANS)) {
    primary = "TRANSACTIONAL";
    reason = "Eylem kalıbı (yaptırma, teklif…)";
  } else if (has(q, COMM) || opts.hasLocation) {
    primary = "COMMERCIAL";
    reason = opts.hasLocation ? "Konumlu hizmet araması" : "Hizmet/sağlayıcı araştırması";
  } else {
    primary = "INFORMATIONAL";
    reason = "Belirgin ticari kalıp yok";
  }
  intents.add(primary);
  if (opts.hasLocation) intents.add("LOCAL");
  return { primary, intents: [...intents], reason };
}
