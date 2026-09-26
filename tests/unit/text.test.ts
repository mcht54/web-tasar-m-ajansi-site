import { describe, expect, it } from "vitest";
import { containsPhrase, normalizeKeyword, slugify } from "@/lib/text/slug";
import { fingerprintText, phraseDensity, similarity, wordCount } from "@/lib/text/analyze";
import { extractMarkdown, renderMarkdown } from "@/lib/text/markdown";

describe("slugify", () => {
  it("Türkçe karakterleri çevirir, küçük harf ve tire kullanır", () => {
    expect(slugify("Web Tasarım İstanbul")).toBe("web-tasarim-istanbul");
    expect(slugify("Çorum / Ağrı  Iğdır")).toBe("corum-agri-igdir");
    expect(slugify("  Diş Kliniği & Güzellik ")).toBe("dis-klinigi-ve-guzellik");
  });
});

describe("normalizeKeyword", () => {
  it("Türkçe büyük I'yı ı yapar", () => {
    expect(normalizeKeyword("WEB TASARIM  Iğdır")).toBe("web tasarım ığdır");
  });
});

describe("containsPhrase", () => {
  it("ekli ve farklı sıradaki kullanımı yakalar", () => {
    expect(containsPhrase("Sakarya'da web tasarım hizmeti", "web tasarım sakarya")).toBe(true);
    expect(containsPhrase("Kurumsal siteler", "web tasarım")).toBe(false);
  });
});

describe("benzerlik", () => {
  const tpl = (city: string) =>
    `${city} bölgesindeki işletmeler için web tasarım hizmeti sunuyoruz. ${city}'da faaliyet gösteren firmaların dijital ihtiyaçlarını analiz ediyor, ${city} pazarına uygun hızlı ve SEO uyumlu web siteleri hazırlıyoruz. Süreç keşif görüşmesiyle başlar, tasarım ve geliştirme ile devam eder, yayın sonrası destekle sürer.`;
  it("yalnızca şehir adı değişmiş metni kopya sayar", () => {
    const names = ["Sakarya", "Ankara"];
    const s = similarity(fingerprintText(tpl("Sakarya"), names), fingerprintText(tpl("Ankara"), names));
    expect(s).toBeGreaterThan(0.9);
  });
  it("farklı metinleri kopya saymaz", () => {
    const other =
      "Ankara'da kamu kurumlarına hizmet veren tedarikçiler ihale dokümanlarını ve referanslarını hızlıca gösterebilmeli. Bu nedenle erişilebilirlik ve güven unsurları öne çıkar, iletişim formları sade tutulur.";
    const s = similarity(fingerprintText(tpl("Sakarya"), ["Sakarya", "Ankara"]), fingerprintText(other, ["Sakarya", "Ankara"]));
    expect(s).toBeLessThan(0.1);
  });
  it("keyword yoğunluğunu ölçer", () => {
    const stuffed = "web tasarım web tasarım web tasarım en iyi web tasarım";
    expect(phraseDensity(stuffed, "web tasarım")).toBeGreaterThan(50);
    expect(wordCount("Bir iki üç.")).toBe(3);
  });
});

describe("markdown", () => {
  it("ham HTML ve javascript: linklerini etkisizleştirir", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](/iletisim)');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="/iletisim"');
  });
  it("gövdedeki H1'i H2'ye indirir", () => {
    expect(renderMarkdown("# Başlık")).toContain("<h2");
    expect(renderMarkdown("# Başlık")).not.toContain("<h1");
  });
  it("dış linke rel=noopener ekler, görsele lazy loading verir", () => {
    const html = renderMarkdown("[g](https://developers.google.com) ![alt metin](/medya/a.webp)");
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('loading="lazy"');
  });
  it("başlık, link ve görsel yapısını çıkarır", () => {
    const f = extractMarkdown("## A\n\nMetin [link](/a) ![](/b.webp)\n\n### B\n\n- madde");
    expect(f.headings).toEqual([{ depth: 2, text: "A" }, { depth: 3, text: "B" }]);
    expect(f.links[0].href).toBe("/a");
    expect(f.images[0].alt).toBe("");
    expect(f.text).toContain("madde");
  });
});
