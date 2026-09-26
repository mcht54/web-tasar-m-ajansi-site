// SEO denetimi sonrası eklenen korumalar: kanonik alan adı, varlık (entity)
// tutarlılığı, sağlık skorunun dürüstlüğü, sahte veri ve tekrar içerik kalite kapısı.
import { describe, expect, it } from "vitest";
import { canonicalRedirectUrl } from "@/lib/routing/host";
import { buildJsonLd, validateJsonLd } from "@/lib/seo/schema";
import { defaultSettings } from "@/lib/settings-schema";
import { summarize } from "@/lib/autopilot/health";
import { checkDescription, checkSection, checkTitle, foreignPlaces } from "@/lib/autopilot/qc";
import { blogPosts } from "../../prisma/content/blog";

describe("kanonik alan adı (www / https)", () => {
  const SITE = "https://webtasarimajansi.net";
  it("www varyantını çıplak alan adına 301 ile yönlendirir, yolu ve parametreyi korur", () => {
    expect(canonicalRedirectUrl(SITE, "www.webtasarimajansi.net", "https", "/web-tasarim?x=1")).toBe("https://webtasarimajansi.net/web-tasarim?x=1");
  });
  it("yönlendirici http bildirirse https'e yönlendirir", () => {
    expect(canonicalRedirectUrl(SITE, "webtasarimajansi.net", "http", "/")).toBe("https://webtasarimajansi.net/");
  });
  it("kanonik istekte, iç/yerel adreste ve bilinmeyen alan adında yönlendirmez (döngü yok)", () => {
    expect(canonicalRedirectUrl(SITE, "webtasarimajansi.net", "https", "/")).toBeNull();
    expect(canonicalRedirectUrl(SITE, "webtasarimajansi.net", null, "/")).toBeNull();
    expect(canonicalRedirectUrl(SITE, "127.0.0.1:3300", "http", "/")).toBeNull();
    expect(canonicalRedirectUrl(SITE, "baska-site.com", "https", "/")).toBeNull();
    expect(canonicalRedirectUrl("http://localhost:3300", "www.localhost", "http", "/")).toBeNull();
  });
  it("kanonik alan adı www ise çıplak alan adını www'ye yönlendirir", () => {
    expect(canonicalRedirectUrl("https://www.ornek.com", "ornek.com", "https", "/a")).toBe("https://www.ornek.com/a");
  });
});

describe("varlık (entity) tutarlılığı", () => {
  const s = defaultSettings();
  const input = {
    type: "BLOG_POST", path: "/blog/x", name: "X", h1: "X nedir?", description: "d", faq: [], publishedAt: new Date("2026-09-25"),
    updatedAt: new Date("2026-09-25"), authorName: null, imageUrl: null, serviceName: null, provinceName: null, districtName: null, sectorName: null, disabled: [],
  };
  it("blog yazarı ayrı bir Organization olarak yeniden tanımlanmaz; tek @id'ye bağlanır", () => {
    const nodes = buildJsonLd(input, { base: "https://x.net", site: s.site, business: s.business, logoUrl: null, crumbs: [] });
    const post = nodes.find((n) => n["@type"] === "BlogPosting")!;
    expect(post.author).toEqual({ "@id": "https://x.net/#organization" });
    const orgs = nodes.filter((n) => n["@type"] === "Organization");
    expect(new Set(orgs.map((o) => o["@id"]))).toEqual(new Set(["https://x.net/#organization"]));
    expect(validateJsonLd(nodes).filter((i) => i.level === "error")).toEqual([]);
  });
  it("gerçek yazar girilmişse Person olarak gösterilir", () => {
    const nodes = buildJsonLd({ ...input, authorName: "Ayşe Yılmaz" }, { base: "https://x.net", site: s.site, business: s.business, logoUrl: null, crumbs: [] });
    expect(nodes.find((n) => n["@type"] === "BlogPosting")!.author).toEqual({ "@type": "Person", name: "Ayşe Yılmaz" });
  });
  it("şemada sahte puan, yorum, çalışan sayısı, kuruluş yılı veya ödül üretilmez", () => {
    const nodes = buildJsonLd({ ...input, type: "HOME", path: "/" }, { base: "https://x.net", site: s.site, business: s.business, logoUrl: null, crumbs: [] });
    const json = JSON.stringify(nodes);
    for (const k of ["aggregateRating", "review", "numberOfEmployees", "foundingDate", "award", "sameAs"]) expect(json).not.toContain(`"${k}"`);
  });
  it("tohum içerikte geriye tarihli yayın tarihi yok", () => {
    for (const p of blogPosts) expect((p as Record<string, unknown>).publishedAt).toBeUndefined();
  });
});

describe("SEO sağlık skoru dürüstlüğü", () => {
  it("veri yoksa NOT_VERIFIABLE ve skor yok; kötü ile karıştırılmaz", () => {
    const c = summarize("google", [{ label: "Search Console", status: "NOT_VERIFIABLE", evidence: "Bağlı değil", core: true }]);
    expect(c.status).toBe("NOT_VERIFIABLE");
    expect(c.score).toBeNull();
  });
  it("temel kontrol doğrulanamıyorsa diğerleri geçse de PASS verilmez", () => {
    const c = summarize("performance", [
      { label: "CWV", status: "NOT_VERIFIABLE", evidence: "alan verisi yok", core: true },
      { label: "Sunucu", status: "PASS", evidence: "200 ms" },
    ]);
    expect(c.status).toBe("NOT_VERIFIABLE");
  });
  it("FAIL her şeyin önüne geçer; skor yalnızca doğrulanabilir kontrollerden", () => {
    const c = summarize("content", [
      { label: "a", status: "PASS", evidence: "" }, { label: "b", status: "FAIL", evidence: "" }, { label: "c", status: "NOT_VERIFIABLE", evidence: "" },
    ]);
    expect(c.status).toBe("FAIL");
    expect(c.score).toBe(50);
    const w = summarize("links", [{ label: "a", status: "PASS", evidence: "" }, { label: "b", status: "WARNING", evidence: "" }]);
    expect(w).toMatchObject({ status: "WARNING", score: 75 });
  });
});

describe("kalite kapısı: sahte veri, şehir spamı ve tekrar", () => {
  const source = "Kurumsal web sitesi projelerinde keşif görüşmesiyle başlıyor, içerik mimarisini ve tasarımı birlikte planlıyoruz. Teslimde yönetim paneli eğitimi veriyoruz.";
  const fresh = "Yayından sonraki ilk haftalarda gelen soruları aynı kanal üzerinden yanıtlıyor, panelde sık yapılan işlemler için kısa bir kullanım rehberi hazırlıyoruz. Böylece ekibiniz sayfa ekleme, görsel değiştirme ve başlık düzenleme gibi günlük işleri kendi başına yapabilir. Yapılan her değişikliğin kaydı tutulduğu için hatalı bir düzenleme önceki haline döndürülebilir.";
  const opts = { query: null, sourceText: source, beforeWords: 500, addedWords: 70 };
  it("yeni bilgi katan, sayfaya sadık bölüm geçer", () => {
    expect(checkSection(fresh, opts)).toEqual({ ok: true, problems: [] });
  });
  it("sahte müşteri, referans, yorum ve deneyim iddiası reddedilir", () => {
    for (const claim of ["Memnun müşterilerimiz bunu doğruluyor.", "Referanslarımız arasında büyük markalar var.", "Google yorumlarımız çok iyi.", "Ödüllü ekibimiz çalışır.", "Yıllık deneyim ile hizmet veriyoruz."]) {
      const r = checkSection(`${fresh} ${claim}`, opts);
      expect(r.ok, claim).toBe(false);
      expect(r.problems.join(), claim).toMatch(/iddiası/);
    }
  });
  it("sayfada geçmeyen şehir adı (doğrulanmamış yerel bilgi) reddedilir", () => {
    const r = checkSection(`${fresh} İstanbul'daki işletmeler için özel çözümler sunuyoruz.`, { ...opts, places: ["İstanbul", "Sakarya"] });
    expect(r.problems.join()).toMatch(/Doğrulanmamış yer bilgisi: İstanbul/);
    expect(foreignPlaces("Sakarya web tasarım", "Sakarya'da hizmet", ["Sakarya"])).toEqual([]);
    expect(checkTitle("Sakarya Web Tasarım | Web Tasarım Ajansı", { query: null, current: "", otherTitles: new Set(), sourceText: "genel hizmet sayfası", places: ["Sakarya"] }).ok).toBe(false);
    expect(checkDescription("Sakarya'daki işletmeler için web tasarım: süreç, teslim edilenler ve fiyatı etkileyen etkenleri bu sayfada sade bir dille anlatıyoruz.", { query: null, current: "", sourceText: "genel", places: ["Sakarya"] }).ok).toBe(false);
  });
  it("mevcut içeriği tekrar eden bölüm reddedilir", () => {
    const r = checkSection(source + " " + source, { ...opts, sourceText: source + " Ek bir cümle daha." });
    expect(r.problems.join()).toMatch(/tekrar ediyor/);
  });
  it("başka bir sayfaya çok benzeyen bölüm reddedilir", () => {
    const r = checkSection(fresh, { ...opts, otherPages: [{ path: "/web-tasarim", text: `Giriş. ${fresh}` }] });
    expect(r.problems.join()).toMatch(/Başka sayfayla yüksek benzerlik: \/web-tasarim/);
  });
  it("[DOĞRULANMALI] ve anahtar kelime doldurma reddedilir", () => {
    expect(checkSection(`${fresh} [DOĞRULANMALI: kuruluş yılı]`, opts).ok).toBe(false);
    const stuffed = `${fresh} web tasarım web tasarım web tasarım web tasarım`;
    expect(checkSection(stuffed, { ...opts, query: "web tasarım" }).problems.join()).toMatch(/yoğunluğu|tekrarı/);
  });
  it("Türkçe harfli abartı ifadeleri de yakalanır", () => {
    expect(checkSection(`${fresh} %100 memnuniyet garantisi veriyoruz.`, opts).problems.join()).toMatch(/üstünlük/);
  });
});

/** encodeURIComponent(...) çağrılarını dengeli parantezle çıkarır (içindeki metin zaten kodlanır). */
function stripEncoded(src: string): string {
  let out = "", i = 0;
  const key = "encodeURIComponent(";
  while (i < src.length) {
    if (src.startsWith(key, i)) {
      let depth = 1, j = i + key.length;
      while (j < src.length && depth) { if (src[j] === "(") depth++; else if (src[j] === ")") depth--; j++; }
      i = j;
    } else out += src[i++];
  }
  return out;
}

describe("yönlendirme başlıkları", () => {
  it("redirect() adreslerinde kodlanmamış Türkçe karakter yok (x-action-redirect ERR_INVALID_CHAR)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
    walk(join(process.cwd(), "src"));
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/redirect\((.*)$/g)) {
          const literals = stripEncoded(m[1]).match(/(["'`])(?:(?!\1).)*\1/g) ?? [];
          if (literals.some((l) => /[^\x00-\x7F]/.test(l))) bad.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
