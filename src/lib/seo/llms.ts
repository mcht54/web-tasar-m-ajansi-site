import "server-only";
// llms.txt (https://llmstxt.org): yapay zekâ modellerinin siteyi hızla anlaması
// için Markdown özet. Yalnızca yayında ve indekslenebilir sayfalar; işletme
// bilgisinden yalnızca girilmiş (doğrulanmış) alanlar yazılır.

import { unstable_cache } from "next/cache";
import { db } from "../db";
import { siteUrl } from "../env";
import { getSettings } from "../settings";
import { PAGES_TAG } from "../site/graph-data";
import { indexableEntries } from "./sitemap";
import { resolveDescription } from "./meta";
import { parseFaq } from "./analyzer-shared";
import { fillTokens } from "../site/public";

const SECTION: Record<string, string> = {
  SERVICE: "Hizmetler", SECTOR: "Sektörlere özel çözümler", CITY: "Şehir sayfaları", DISTRICT: "İlçe sayfaları",
  SERVICE_LOCATION: "Şehirlere göre hizmetler", SECTOR_LOCATION: "Şehir ve sektör sayfaları", BLOG_POST: "Rehber yazıları", STATIC: "Kurumsal",
};
const ORDER = ["SERVICE", "SECTOR", "CITY", "SERVICE_LOCATION", "SECTOR_LOCATION", "DISTRICT", "BLOG_POST", "STATIC"];

async function indexablePages() {
  const entries = await indexableEntries();
  const paths = entries.map((e) => e.path);
  return db.page.findMany({
    where: { path: { in: paths } },
    select: { path: true, type: true, name: true, h1: true, intro: true, metaDescription: true, body: true, faq: true, contentUpdatedAt: true },
    orderBy: { path: "asc" },
  });
}

function absolutize(md: string, base: string): string {
  return md.replace(/\]\((\/[^)\s]*)\)/g, (_m, p) => `](${base}${p})`);
}

export const buildLlmsTxt = unstable_cache(
  async () => {
    const [s, pages] = await Promise.all([getSettings(), indexablePages()]);
    const base = siteUrl();
    const b = s.business;
    const home = pages.find((p) => p.type === "HOME");
    const updated = pages.reduce((m, p) => (p.contentUpdatedAt > m ? p.contentUpdatedAt : m), new Date(0));
    const lines = [
      `# ${b.name || s.site.siteName}`, "",
      `> ${resolveDescription(home ?? { metaDescription: null, intro: null }, s.seo)}`, "",
      `Bu dosya ${base}/ adresindeki yayında ve indekslenebilir sayfalardan otomatik üretilir; her bağlantı kaynağı olan sayfadır. Son içerik güncellemesi: ${pages.length ? updated.toISOString().slice(0, 10) : "—"}.`, "",
    ];
    const facts = [
      b.legalName && `- Ticari unvan: ${b.legalName}`,
      b.phone && `- Telefon: ${b.phone}`,
      (b.email || s.site.email) && `- E-posta: ${b.email || s.site.email}`,
      [b.street, b.district, b.city].filter(Boolean).length && `- Adres: ${[b.street, b.district, b.city].filter(Boolean).join(", ")}`,
      b.foundingYear && `- Kuruluş yılı: ${b.foundingYear}`,
      b.services.length && `- Hizmetler: ${b.services.join(", ")}`,
        s.site.whatsapp && `- WhatsApp: https://wa.me/${s.site.whatsapp.replace(/\D/g, "")}`,
      `- Web sitesi: ${base}/`,
      `- Teklif ve ücretsiz ön analiz: ${base}/teklif-al`,
    ].filter(Boolean);
    lines.push(...(facts as string[]), "");
    for (const type of ORDER) {
      const list = pages.filter((p) => p.type === type);
      if (!list.length) continue;
      lines.push(`## ${SECTION[type]}`, "");
      for (const p of list) lines.push(`- [${p.h1 || p.name}](${base}${p.path}): ${resolveDescription(p, s.seo)}`);
      lines.push("");
    }
    lines.push("## İsteğe bağlı", "", `- [Tüm içerik (tek dosya)](${base}/llms-full.txt): Yayındaki sayfaların tam metni`, `- [Site haritası](${base}/sitemap.xml)`, "");
    return lines.join("\n");
  },
  ["llms-txt"],
  { tags: [PAGES_TAG, "settings"], revalidate: 3600 },
);

export const buildLlmsFullTxt = unstable_cache(
  async () => {
    const [s, pages] = await Promise.all([getSettings(), indexablePages()]);
    const base = siteUrl();
    const out = [`# ${s.site.siteName} — tam içerik`, "", `Kaynak: ${base}/ · Her bölüm bir sayfadır; alıntı yaparken sayfa URL'sini kaynak gösterin.`, ""];
    for (const p of pages) {
      out.push("---", "", `# ${p.h1 || p.name}`, "", `URL: ${base}${p.path === "/" ? "/" : p.path}`, `Son güncelleme: ${p.contentUpdatedAt.toISOString().slice(0, 10)}`, "");
      if (p.intro) out.push(p.intro, "");
      if (p.body) out.push(absolutize(p.type === "STATIC" ? fillTokens(p.body, s) : p.body, base), "");
      const faq = parseFaq(p.faq);
      if (faq.length) {
        out.push("## Sık sorulan sorular", "");
        for (const f of faq) out.push(`### ${f.q}`, "", f.a, "");
      }
    }
    return out.join("\n");
  },
  ["llms-full-txt"],
  { tags: [PAGES_TAG, "settings"], revalidate: 3600 },
);
