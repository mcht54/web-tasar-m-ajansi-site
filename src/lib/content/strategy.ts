// İçerik stratejisi (saf): arama niyetine göre anlatım açısı, CTA biçimi ve güvenli
// üretim bütçesi. Amaç "her sayfa farklı olsun" diye anlamsız metin değil; aynı niyetteki
// sayfaların aynı iskeleti tekrar etmemesi. Açı sayfa yolundan deterministik seçilir
// (aynı sayfa her üretimde aynı açıyı alır; komşu sayfalar farklı açılara dağılır).

import { createHash } from "node:crypto";

export type Angle = { key: string; structure: string; cta: string };

const ANGLES: Record<string, Angle[]> = {
  INFORMATIONAL: [
    { key: "adimlar", structure: "Adım adım rehber: kısa yanıt → sıralı adımlar (### alt başlıklar) → sık yapılan hatalar", cta: "Kendi durumunuz için ücretsiz ön analiz isteyin" },
    { key: "kontrol-listesi", structure: "Karar kontrol listesi: kısa yanıt → kontrol maddeleri (liste) → her maddenin neden önemli olduğu", cta: "Listeyi sitenizde birlikte kontrol edelim" },
    { key: "karsilastirma", structure: "Seçenek karşılaştırması: kısa yanıt → seçenekler → hangi durumda hangisi (tablo kullanılabilir)", cta: "Hangi seçeneğin size uygun olduğunu konuşalım" },
    { key: "soru-cevap", structure: "Soru-cevap akışı: kısa yanıt → okuyucunun sırayla soracağı 3-4 soru (### başlık) ve yanıtları", cta: "Sorunuz kaldıysa bize yazın" },
  ],
  COMMERCIAL: [
    { key: "kimler-icin", structure: "Kimler için uygun: kısa tanım → uygun olduğu işletme durumları → kapsam → süreç", cta: "İhtiyacınıza uygun kapsamı birlikte belirleyelim" },
    { key: "teslimler", structure: "Teslim edilenler: kısa tanım → iş kalemleri (liste) → her kalemin işletmeye katkısı", cta: "Kalem kalem açıklanmış teklif alın" },
    { key: "secim-sorulari", structure: "Hizmet alırken sorulacak sorular: kısa tanım → 4-5 soru ve neden önemli oldukları", cta: "Bu soruları bize de sorun — ücretsiz ön görüşme" },
    { key: "maliyet-kalemleri", structure: "Kapsamı ve maliyeti etkileyen kalemler (rakam vermeden) → karar önerileri", cta: "Size özel kapsam ve teklif için iletişime geçin" },
  ],
  TRANSACTIONAL: [
    { key: "surec", structure: "Süreç: ilk görüşmeden teslime adımlar → her adımda sizden istenenler", cta: "Hemen teklif isteyin" },
    { key: "hazirlik", structure: "Başlamadan önce hazırlamanız gerekenler → süreç → teslim", cta: "Hazırsanız teklif formunu doldurun" },
  ],
  LOCAL: [
    { key: "yerel-ihtiyac", structure: "Bu bölgedeki işletmelerin dijital ihtiyacı (yalnızca doğrulanmış olgularla) → uzaktan çalışma süreci → kapsam", cta: "Uzaktan, görüntülü görüşmeyle başlayalım" },
    { key: "yerel-surec", structure: "Uzaktan proje süreci → işletmeden alınacak yerel bilgiler → teslim", cta: "Ücretsiz ön analiz için yazın" },
  ],
};

function h(s: string): number {
  return parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);
}

export function angleFor(path: string, intent: string): Angle {
  const list = ANGLES[intent] ?? ANGLES.COMMERCIAL;
  return list[h(path) % list.length];
}

export type BudgetInput = {
  indexablePages: number; // yayında + indekslenebilir sayfa sayısı
  weakPages: number; // yenileme adayı sayısı
  maxNewPagesPerWeek: number; // ayar üst sınırı
  maxChangesPerWeek: number; // ayar üst sınırı
  createdLast7: { newPages: number; refresh: number }; // son 7 günde hazırlanan (bekleyen + uygulanan)
};

export type Budget = {
  newPagesPerWeek: number;
  refreshPerWeek: number;
  newPagesThisRun: number;
  refreshThisRun: number;
  rationale: string[];
};

/**
 * Güvenli üretim bütçesi (sabit sayı değil, sitenin verisinden):
 * - Yeni sayfa: haftada yayındaki indekslenebilir sayfaların en çok %5'i (en az 1), ayar üst
 *   sınırını aşmaz. Küçük sitede ölçekli içerik (doorway) sinyalini engeller.
 * - Yenileme: zayıf sayfa birikimini ~4 haftada eritecek hız (ceil(zayıf/4)), en az 1,
 *   haftalık değişiklik sınırını aşmaz.
 * - Tek çalıştırmada haftalık bütçenin en çok üçte biri (günlük iş haftayı bir güne yığmaz).
 */
export function contentBudget(i: BudgetInput): Budget {
  const growthCap = Math.max(1, Math.floor(i.indexablePages * 0.05));
  const newPagesPerWeek = Math.min(i.maxNewPagesPerWeek, growthCap);
  const refreshPerWeek = i.weakPages ? Math.min(i.maxChangesPerWeek, Math.max(1, Math.ceil(i.weakPages / 4))) : 0;
  const perRun = (w: number) => Math.max(w ? 1 : 0, Math.ceil(w / 3));
  const newLeft = Math.max(0, newPagesPerWeek - i.createdLast7.newPages);
  const refLeft = Math.max(0, refreshPerWeek - i.createdLast7.refresh);
  return {
    newPagesPerWeek, refreshPerWeek,
    newPagesThisRun: Math.min(newLeft, perRun(newPagesPerWeek)),
    refreshThisRun: Math.min(refLeft, perRun(refreshPerWeek)),
    rationale: [
      `Yeni sayfa: yayındaki ${i.indexablePages} indekslenebilir sayfanın %5'i = ${growthCap}/hafta (ayar sınırı ${i.maxNewPagesPerWeek}) → ${newPagesPerWeek}; son 7 günde ${i.createdLast7.newPages} hazırlandı.`,
      `Yenileme: ${i.weakPages} zayıf/eski sayfa ~4 haftada → ${refreshPerWeek}/hafta (ayar sınırı ${i.maxChangesPerWeek}); son 7 günde ${i.createdLast7.refresh} hazırlandı.`,
      "Tek çalıştırmada haftalık bütçenin en çok üçte biri üretilir.",
    ],
  };
}
