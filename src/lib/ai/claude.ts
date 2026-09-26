import "server-only";
// Claude sağlayıcısı (resmi SDK). Kimlik bilgisi ortamdan okunur
// (ANTHROPIC_API_KEY); anahtar hiçbir zaman veritabanında tutulmaz.
// Yapılandırılmış çıktı Zod şemasıyla doğrulanır; reddetme durumunda
// sunucu tarafı yedek model (fallbacks: "default") devreye girer.

import Anthropic from "@anthropic-ai/sdk";
import { cachedAiKey } from "./key";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { type AiKind, type AiOutput, type PageContext, briefSchema, clusteringSchema, draftSchema, improveSchema, metaSchema } from "./types";
import { type FixProposal, fixSchema } from "./fix";

const SYSTEM = `Sen Türkçe yazan kıdemli bir SEO editörüsün. Bir web tasarım ajansının sitesi için öneri üretiyorsun.
Kurallar:
- Yalnızca verilen bağlamdaki bilgileri kullan. İşletme, rakam, müşteri, referans, yorum veya yerel bilgi uydurma; bilinmeyeni "doğrulanmalı" diye işaretle.
- Anahtar kelimeyi doğal kullan; keyword stuffing yapma. Şehir adlarını art arda listeleme.
- Google'ın spam politikalarına aykırı hiçbir yöntem önerme.
- Doğal, akıcı Türkçe; Türkçe karakterleri doğru kullan.
- Önerilerin bir insan tarafından onaylanacak; kısa gerekçe ver.`;

export function claudeAvailable(): boolean {
  return Boolean(cachedAiKey());
}

/** Anahtar panelden (şifreli sır) veya ortamdan gelir. */
export function anthropicClient(): Anthropic {
  const apiKey = cachedAiKey();
  if (!apiKey) throw new Error("Anthropic API anahtarı tanımlı değil (Ayarlar → Entegrasyonlar → Yapay zekâ)");
  return new Anthropic({ apiKey });
}

/** Bağlantı testi: anahtarın geçerliliğini ve modele erişimi doğrular (içerik üretmez). */
export async function testAnthropic(model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const m = await anthropicClient().models.retrieve(model);
    return { ok: true, message: `Bağlantı başarılı: ${m.display_name ?? m.id}` };
  } catch (e) {
    return { ok: false, message: aiErrorMessage(e) };
  }
}

function contextText(c: PageContext): string {
  return [
    `Site: ${c.siteName}`,
    `URL: ${c.path} (tür: ${c.type})`,
    `Sayfa adı: ${c.name}`,
    `Mevcut title: ${c.currentTitle}`,
    `Mevcut meta description: ${c.currentDescription || "(yok)"}`,
    `H1: ${c.h1}`,
    `Ana anahtar kelime: ${c.primaryKeyword ?? "(tanımsız)"}`,
    `İkincil kelimeler: ${c.secondaryKeywords.join(", ") || "(yok)"}`,
    c.service && `Hizmet: ${c.service}`,
    c.location && `Lokasyon: ${c.location}`,
    c.sector && `Sektör: ${c.sector}`,
    c.localNotes && `Editörün doğruladığı yerel notlar:\n${c.localNotes}`,
    c.facts && `Doğrulanmış olgular (yalnızca bunları kullan):\n${c.facts}`,
    c.links?.length && `Kullanabileceğin iç linkler (yalnızca bunlar):\n${c.links.map((l) => `- ${l.label}: ${l.path}`).join("\n")}`,
    `Başarısız/uyarı veren SEO kontrolleri: ${c.failingChecks.join("; ") || "(yok)"}`,
    `Giriş paragrafı:\n${c.intro || "(yok)"}`,
    `İçerik (özet/ilk bölüm):\n${c.bodyExcerpt || "(yok)"}`,
  ].filter(Boolean).join("\n");
}

const TASKS: Record<Exclude<AiKind, "links" | "fix">, { schema: z.ZodType; prompt: string }> = {
  draft: {
    schema: draftSchema,
    prompt: `Bu il/ilçe için web tasarım hizmet sayfasının TASLAĞINI yaz. Kurallar:
- 550-800 kelime gövde; ## ve ### başlıklarla. Önerilen bölümler: bu konumdaki işletmeler için web tasarım yaklaşımı; burada web sitesi yaptırırken dikkat edilecekler; hizmetler (iç linklerle); süreç; ilçeler/yakın bölgeler (varsa).
- Yalnızca "Doğrulanmış olgular" ve "yerel notlar"daki bilgileri kullan. Yerel ekonomi, sanayi bölgesi, turistik yer, işletme adı, müşteri, rakam UYDURMA. Yerel bir ayrıntı sayfayı güçlendirecekse onun yerine şu işareti bırak: [DOĞRULANMALI: editörün eklemesi gereken bilgi].
- Nüfus gibi resmî verileri kaynağıyla kullanabilirsin.
- Ana anahtar kelimeyi giriş paragrafında ve H1'de doğal geçir; yoğunluk %2'yi aşmasın. Şehir adlarını art arda listeleme.
- 3-5 SSS: bu konumdaki bir işletme sahibinin gerçekten soracağı sorular; yanıtlar genel ve dürüst olsun, yerel söz vermesin.
- seoTitle 30-60, metaDescription 110-160 karakter.
- İç linkleri Markdown olarak yalnızca verilen listeden kullan.
- verifyNotes: editörün sayfayı yayınlamadan önce doldurması gereken gerçek bilgiler.`,
  },
  meta: { schema: metaSchema, prompt: "Bu sayfa için 3 farklı title / meta description / H1 seçeneği öner. Title 30-60, meta 110-160 karakter olsun." },
  brief: { schema: briefSchema, prompt: "Bu sayfa için yazara içerik brief'i hazırla: arama niyeti, hedef kitle, H2 taslağı, SSS soruları ve yazarın gerçek bilgiyle doldurması gereken noktalar." },
  improve: { schema: improveSchema, prompt: "Mevcut içeriği değerlendir ve somut iyileştirme önerileri ver (yapı, bilgi değeri, arama niyeti, dönüşüm). Yeniden yazma; öneri listele." },
  clustering: { schema: clusteringSchema, prompt: "Verilen anahtar kelimeleri arama niyetine göre kümele; her küme için tek bir hedef sayfa öner. Aynı niyetteki kelimeleri farklı sayfalara dağıtma (cannibalization)." },
};

export async function claudeSuggest(kind: Exclude<AiKind, "links" | "fix">, context: PageContext | { keywords: string[]; pages: string[] }, model: string): Promise<AiOutput> {
  const client = anthropicClient();
  const task = TASKS[kind];
  const input = "path" in context ? contextText(context) : `Anahtar kelimeler:\n${context.keywords.join("\n")}\n\nMevcut sayfalar:\n${context.pages.join("\n")}`;
  const res = await client.beta.messages.parse({
    model,
    max_tokens: kind === "draft" ? 32000 : 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { format: betaZodOutputFormat(task.schema), effort: "medium" },
    messages: [{ role: "user", content: `${task.prompt}\n\n${input}` }],
  });
  if (res.stop_reason === "refusal") throw new Error("Model bu isteği yanıtlamadı (refusal)");
  if (res.stop_reason === "max_tokens") throw new Error("Yanıt uzunluk sınırında kesildi");
  if (!res.parsed_output) throw new Error("Yanıt şemaya uygun değildi");
  return { kind, data: res.parsed_output } as AiOutput;
}

export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "API anahtarı geçersiz (ANTHROPIC_API_KEY)";
  if (e instanceof Anthropic.RateLimitError) return "Hız sınırına takıldı; biraz sonra tekrar deneyin";
  if (e instanceof Anthropic.BadRequestError) return `İstek reddedildi: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `API hatası (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/** ÇÖZÜM ÖNER: yalnızca verilen gerçek bağlamla yapılandırılmış düzeltme önerisi. */
export async function claudeFix(context: string, model: string): Promise<FixProposal> {
  const client = anthropicClient();
  const res = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { format: betaZodOutputFormat(fixSchema), effort: "medium" },
    messages: [{
      role: "user",
      content: `Aşağıdaki gerçek verilere dayanarak bu sayfa için SEO düzeltme önerisi hazırla:
- seoTitle 30-60, metaDescription 110-160 karakter; odak sorguyu doğal kullan.
- contentGaps: yalnızca verideki sorgulardan ve başarısız kontrollerden çıkar.
- headings ve faq: gerçek sorgulara dayansın; yanıt için bilgi yoksa "[DOĞRULANMALI: …]" yaz, uydurma.
- internalLinks: yalnızca verilen adaylardan seç.
- schema: yalnızca verilen schema bilgisine göre.
- Sıralama/trafik vaadi verme.

${context}`,
    }],
  });
  if (res.stop_reason === "refusal") throw new Error("Model bu isteği yanıtlamadı (refusal)");
  if (!res.parsed_output) throw new Error("Yanıt şemaya uygun değildi");
  return res.parsed_output;
}
