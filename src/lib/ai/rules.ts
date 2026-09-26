// Kural tabanlı sağlayıcı: API anahtarı gerekmez, sadece sistemdeki veriden
// öneri üretir. Yaratıcı metin yazmaz; şablon ve kontrol listesi sunar.

import type { AiOutput, PageContext } from "./types";
import { truncate } from "../seo/meta";
import { trUpperFirst } from "../text/slug";

export function ruleMeta(c: PageContext): AiOutput {
  const kw = c.primaryKeyword ? trUpperFirst(c.primaryKeyword) : c.name;
  const base = c.intro || c.bodyExcerpt;
  const opts = [
    { seoTitle: truncate(`${kw} | ${c.siteName}`, 60), h1: c.h1 || kw },
    { seoTitle: truncate(`${kw}: ${c.name === kw ? "Süreç, Kapsam ve Teklif" : c.name}`, 60), h1: kw },
  ].map((o) => ({
    ...o,
    metaDescription: truncate(base || `${kw} hakkında bilgi alın ve ücretsiz ön analiz isteyin.`, 158),
    rationale: "Kural tabanlı: ana kelime başta, marka sonda; açıklama giriş paragrafından. Metni kendi cümlelerinizle iyileştirin.",
  }));
  return { kind: "meta", data: { options: opts } };
}

export function ruleBrief(c: PageContext): AiOutput {
  const kw = c.primaryKeyword ?? c.name;
  const loc = c.location;
  return {
    kind: "brief",
    data: {
      searchIntent: `“${kw}” arayan kişi ${c.type.includes("BLOG") ? "bilgi" : "hizmet sağlayıcı / teklif"} arıyor.`,
      audience: loc ? `${loc} bölgesindeki işletmeler` : "Türkiye genelindeki işletmeler",
      outline: [
        { h2: loc ? `${loc} işletmeleri için yaklaşımımız` : "Bu hizmet neyi çözer?", points: ["Hedef müşterinin somut problemi", "Sunulan çözüm ve kapsam"] },
        { h2: "Süreç nasıl işler?", points: ["Adımlar", "Süre ve teslim"] },
        { h2: "Fiyatı etkileyen etkenler", points: ["Kapsam kalemleri", "Teklif nasıl hazırlanır"] },
        { h2: "Sık sorulan sorular", points: ["Karar aşamasındaki sorular"] },
      ],
      faq: [`${kw} ne kadar sürer?`, `${kw} fiyatı neye göre değişir?`, "Siteyi kendim güncelleyebilir miyim?"],
      mustVerify: [
        ...(loc ? [`${loc} için gerçek yerel bilgiler (sektörler, müşteri profili)${c.localNotes ? " — yerel notlar mevcut" : " — yerel not girilmemiş"}`] : []),
        "Varsa gerçek, izinli referans çalışmalar",
        "İşletmenin gerçekte sunduğu hizmet kapsamı",
      ],
      avoid: ["Başka sayfanın metnini şehir adı değiştirerek kullanmak", "Doğrulanamayan rakam ve iddialar", "Anahtar kelimeyi doğal olmayan sıklıkta tekrarlamak"],
    },
  };
}

export function ruleImprove(c: PageContext): AiOutput {
  return {
    kind: "improve",
    data: {
      suggestions: c.failingChecks.map((f) => ({ area: "SEO kontrolü", problem: f, suggestion: "Analiz panelindeki açıklamaya göre düzeltin.", priority: "orta" as const })),
    },
  };
}
