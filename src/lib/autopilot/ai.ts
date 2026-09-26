import "server-only";
// Otopilot için yapay zekâ üretimi (resmi SDK, yapılandırılmış çıktı).
// Model yalnızca verilen sayfa metnini kullanır; yeni olgu (müşteri, proje,
// fiyat, adres, şehir bilgisi) uydurması yasaktır. Çıktı ayrıca kalite
// kontrolünden geçer (qc.ts); geçmezse uygulanmaz.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropicClient } from "../ai/claude";

const SYSTEM = `Sen Türkçe yazan kıdemli bir SEO editörüsün. Bir web tasarım ajansının sitesindeki mevcut sayfaları iyileştiriyorsun.
Kesin kurallar:
- Yalnızca verilen sayfa metnindeki bilgileri kullan. Müşteri, proje, referans, yorum, fiyat, adres, rakam, süre, garanti veya şehir hakkında bilgi UYDURMA.
- Metinde olmayan bir bilgi gerekiyorsa o cümleyi yazma.
- "En iyi", "1 numara", "garanti", "lider" gibi doğrulanamayan üstünlük iddiaları kullanma.
- Anahtar kelimeyi doğal kullan; tekrar etme (keyword stuffing yok). Şehir adlarını art arda listeleme.
- Doğal, akıcı Türkçe; Türkçe karakterleri doğru kullan.`;

export const snippetSchema = z.object({
  titles: z.array(z.string()).describe("3 farklı title seçeneği, 30-60 karakter"),
  descriptions: z.array(z.string()).describe("3 farklı meta description seçeneği, 110-160 karakter"),
});

export const sectionSchema = z.object({
  heading: z.string().describe("Yeni ## başlık metni (# işareti olmadan)"),
  markdown: z.string().describe("Başlığın altındaki 80-250 kelimelik paragraf(lar); yalnızca sayfadaki bilgilerle"),
  rationale: z.string(),
});

async function parse<T extends z.ZodType>(schema: T, prompt: string, model: string, maxTokens = 8000): Promise<z.infer<T>> {
  const client = anthropicClient();
  const res = await client.beta.messages.parse({
    model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { format: betaZodOutputFormat(schema), effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("Model bu isteği yanıtlamadı (refusal)");
  if (res.stop_reason === "max_tokens") throw new Error("Yanıt uzunluk sınırında kesildi");
  if (!res.parsed_output) throw new Error("Yanıt şemaya uygun değildi");
  return res.parsed_output as z.infer<T>;
}

export type SnippetContext = { path: string; siteName: string; query: string | null; currentTitle: string; currentDescription: string; h1: string; intro: string; excerpt: string; ctr: number | null; position: number | null };

export function aiSnippets(c: SnippetContext, model: string) {
  return parse(snippetSchema, [
    "Arama sonucundaki tıklama oranını (CTR) artırmak için bu sayfaya title ve meta description alternatifleri yaz.",
    "- title 30-60 karakter, odak sorguyu doğal biçimde içersin; site adı sonda \" | \" ile gelebilir.",
    "- meta description 110-160 karakter; aramayı yapan kişiye sayfanın gerçekte ne sunduğunu anlatsın, sayfada olmayan vaat vermesin.",
    `URL: ${c.path}`, `Site adı: ${c.siteName}`, `Odak sorgu: ${c.query ?? "(yok — sayfanın ana konusu)"}`,
    c.position != null ? `Search Console: pozisyon ${c.position.toFixed(1)}, CTR %${((c.ctr ?? 0) * 100).toFixed(1)}` : "Search Console verisi yok",
    `Mevcut title: ${c.currentTitle}`, `Mevcut meta: ${c.currentDescription || "(yok)"}`, `H1: ${c.h1}`,
    `Giriş: ${c.intro}`, `Sayfa metni (özet):\n${c.excerpt}`,
  ].join("\n"), model);
}

export type SectionContext = { path: string; query: string | null; h1: string; headings: string[]; body: string; gaps: string[] };

export function aiSection(c: SectionContext, model: string) {
  return parse(sectionSchema, [
    "Bu sayfaya, arama niyetini daha iyi karşılayan TEK bir yeni bölüm ekle.",
    "- Bölüm, sayfada zaten bulunan bilgileri bu arama niyetine göre açıklayıp düzenlesin; yeni olgu ekleme.",
    "- Mevcut başlıkları tekrar etme. 80-250 kelime. Liste kullanabilirsin.",
    "- Bilgi yetersizse kısa ve genel kal; asla uydurma.",
    `URL: ${c.path}`, `Odak sorgu: ${c.query ?? "(yok)"}`, `H1: ${c.h1}`,
    `Mevcut başlıklar:\n${c.headings.join("\n") || "(yok)"}`,
    `Eksik görülen noktalar:\n${c.gaps.join("\n") || "(yok)"}`,
    `Sayfa metni:\n${c.body.slice(0, 12000)}`,
  ].join("\n"), model, 12000);
}

export const pageSchema = z.object({
  seoTitle: z.string().describe("30-60 karakter"),
  metaDescription: z.string().describe("110-160 karakter"),
  h1: z.string(),
  intro: z.string().describe("2-3 cümlelik giriş; sorunun kısa, doğrudan yanıtı ilk cümlede"),
  body: z.string().describe("Markdown gövde: ## ve ### başlıklar, 600-900 kelime; iç linkler yalnızca verilen listeden"),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("2-4 gerçek kullanıcı sorusu; yanıtlar genel ve dürüst"),
  verifyNotes: z.array(z.string()).describe("Doğrulanması gereken ve bu yüzden metne yazılmayan bilgiler"),
});
export type AiPage = z.infer<typeof pageSchema>;

export type PageContext = {
  kind: "BLOG_POST" | "LOCATION";
  primary: string;
  queries: string[];
  intent: string;
  siteName: string;
  facts: string[]; // doğrulanmış olgular (işletme ayarları, resmî veriler)
  links: { path: string; title: string }[]; // kullanılabilecek iç linkler
  existingTitles: string[]; // kopya olmaması için
};

export function aiPage(c: PageContext, model: string) {
  return parse(pageSchema, [
    c.kind === "LOCATION"
      ? "Bu konumdaki işletmeler için web tasarım hizmet sayfasının içeriğini yaz."
      : "Aşağıdaki gerçek arama sorgularına yanıt veren tek bir rehber yazısı yaz (her sorgu için ayrı sayfa değil; hepsini tek, güçlü bir yazıda karşıla).",
    "Kesin kurallar:",
    "- Yalnızca 'Doğrulanmış olgular' ve genel, herkesçe bilinen web tasarım bilgisini kullan. Müşteri, proje, referans, yorum, fiyat, istatistik, süre garantisi, sıralama iddiası, ödül, yerel işletme/mekân adı UYDURMA.",
    "- Bilmediğin ama gerekli bir bilgi varsa metne yazma; verifyNotes'a ekle. Metinde [DOĞRULANMALI] işareti kullanabilirsin ama bu sayfanın otomatik yayınlanmasını engeller.",
    "- Anahtar kelimeyi doğal kullan (yoğunluk %2'yi geçmesin). Şehir adlarını art arda listeleme. Diğer sayfaların başlıklarını kopyalama.",
    "- İç linkleri Markdown olarak yalnızca verilen listeden, konuya uygun olanlardan 2-4 tane kullan. Dış link verme.",
    "- İlk paragrafta sorunun doğrudan, alıntılanabilir kısa yanıtını ver; sonra adım adım açıkla.",
    `Site: ${c.siteName}`,
    `Ana sorgu: ${c.primary}`,
    `Aynı niyetteki gerçek sorgular (Search Console): ${c.queries.join(", ")}`,
    `Arama niyeti: ${c.intent}`,
    `Doğrulanmış olgular:\n${c.facts.map((f) => `- ${f}`).join("\n") || "(yok)"}`,
    `Kullanılabilecek iç linkler:\n${c.links.map((l) => `- ${l.title}: ${l.path}`).join("\n")}`,
    `Mevcut sayfa başlıkları (kopyalama):\n${c.existingTitles.slice(0, 60).join("\n")}`,
  ].join("\n"), model, 16000);
}
