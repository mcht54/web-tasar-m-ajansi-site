import { z } from "zod";

// AI önerileri: her tür için çıktı şeması. Öneriler asla otomatik yayınlanmaz;
// "Onay bekliyor" olarak kaydedilir, insan onaylayınca uygulanır.

export const AI_KINDS = {
  fix: "ÇÖZÜM ÖNER (fırsat için düzeltme)",
  draft: "Yerel sayfa taslağı (il/ilçe)",
  meta: "Title / meta / H1 önerisi",
  brief: "İçerik brief'i",
  improve: "İçerik iyileştirme önerileri",
  links: "Internal link önerisi",
  clustering: "Anahtar kelime kümeleme",
} as const;
export type AiKind = keyof typeof AI_KINDS;

export const metaSchema = z.object({
  options: z.array(z.object({
    seoTitle: z.string().describe("30-60 karakter, ana kelime başa yakın"),
    metaDescription: z.string().describe("110-160 karakter, fayda + eylem çağrısı"),
    h1: z.string(),
    rationale: z.string().describe("Neden bu öneri (kısa)"),
  })).min(1).max(3),
});

export const briefSchema = z.object({
  searchIntent: z.string(),
  audience: z.string(),
  outline: z.array(z.object({ h2: z.string(), points: z.array(z.string()) })),
  faq: z.array(z.string()).describe("Kullanıcının sorabileceği sorular"),
  mustVerify: z.array(z.string()).describe("Yazar tarafından gerçek bilgiyle doldurulması gereken noktalar; uydurulmamalı"),
  avoid: z.array(z.string()),
});

export const improveSchema = z.object({
  suggestions: z.array(z.object({
    area: z.string().describe("ör. Giriş, Yapı, Bilgi değeri, Dönüşüm"),
    problem: z.string(),
    suggestion: z.string(),
    priority: z.enum(["yüksek", "orta", "düşük"]),
  })),
});

export const clusteringSchema = z.object({
  clusters: z.array(z.object({
    name: z.string(),
    intent: z.string(),
    keywords: z.array(z.string()),
    suggestedPath: z.string().describe("Bu kümenin hedef sayfası (mevcut veya önerilen URL)"),
    note: z.string(),
  })),
});

export const draftSchema = z.object({
  seoTitle: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  intro: z.string().describe("İlk paragraf; ana anahtar kelime doğal şekilde geçer"),
  body: z.string().describe("Markdown gövde: ## ve ### başlıklar, listeler, iç linkler"),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  verifyNotes: z.array(z.string()).describe("Editörün gerçek bilgiyle doldurması gereken noktalar"),
});

export type AiOutput =
  | { kind: "fix"; data: import("./fix").FixProposal; current: { seoTitle: string; metaDescription: string; h1: string }; applied?: { fromVersionId: string | null; fields: string[]; at: string; rolledBack?: boolean } }
  | { kind: "draft"; data: z.infer<typeof draftSchema> }
  | { kind: "meta"; data: z.infer<typeof metaSchema> }
  | { kind: "brief"; data: z.infer<typeof briefSchema> }
  | { kind: "improve"; data: z.infer<typeof improveSchema> }
  | { kind: "links"; data: { links: { source: string; anchor: string; reasons: string[] }[] } }
  | { kind: "clustering"; data: z.infer<typeof clusteringSchema> };

export type PageContext = {
  path: string;
  type: string;
  name: string;
  h1: string;
  intro: string;
  bodyExcerpt: string;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  currentTitle: string;
  currentDescription: string;
  failingChecks: string[];
  location: string | null;
  sector: string | null;
  service: string | null;
  localNotes: string | null;
  siteName: string;
  facts?: string; // doğrulanmış olgu sayfası (resmî veri + editör notları)
  links?: { path: string; label: string }[]; // yayındaki gerçek iç link hedefleri
};
