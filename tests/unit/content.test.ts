import { describe, expect, it } from "vitest";
import { sanitizeAiText, sanitizeDeep, unsafeMarkup } from "@/lib/content/sanitize";
import { angleFor, contentBudget } from "@/lib/content/strategy";

describe("yapay zekâ çıktısı temizliği (XSS)", () => {
  it("HTML etiketi, script, olay özniteliği ve javascript: bağlantısı kaldırılır", () => {
    const bad = `Giriş <script>alert(1)</script> metni <img src=x onerror="alert(2)"> ve [tıkla](javascript:alert(3)) ‮gizli`;
    expect(unsafeMarkup(bad)).toEqual(expect.arrayContaining(["HTML etiketi", "tehlikeli bağlantı şeması", "olay özniteliği (on…=)", "görünmez/kontrol karakteri"]));
    const clean = sanitizeAiText(bad);
    expect(clean).not.toMatch(/<|javascript:|alert\(1\)|‮/);
    expect(unsafeMarkup(clean)).toEqual([]);
    expect(clean).toContain("Giriş");
  });
  it("Markdown korunur; iç içe nesneler de temizlenir", () => {
    const md = "## Başlık\n\n- madde\n\n[SEO hizmeti](/seo-hizmeti)";
    expect(sanitizeAiText(md)).toBe(md);
    expect(sanitizeDeep({ a: "<b>x</b>", faq: [{ q: "<i>s</i>?", a: "y" }] })).toEqual({ a: "x", faq: [{ q: "s?", a: "y" }] });
  });
});

describe("içerik stratejisi", () => {
  it("anlatım açısı sayfaya göre deterministik; komşu sayfalar farklı açılara dağılır", () => {
    expect(angleFor("/a", "COMMERCIAL")).toEqual(angleFor("/a", "COMMERCIAL"));
    const keys = new Set(["/kurumsal-web-tasarim", "/e-ticaret-web-tasarim", "/seo-hizmeti", "/google-ads-yonetimi", "/ozel-web-yazilim", "/web-tasarim"].map((p) => angleFor(p, "COMMERCIAL").key));
    expect(keys.size).toBeGreaterThan(1);
  });
  it("bütçe veriden türetilir: küçük sitede haftada 1 yeni sayfa, yenileme birikimi ~4 haftada", () => {
    const b = contentBudget({ indexablePages: 33, weakPages: 11, maxNewPagesPerWeek: 3, maxChangesPerWeek: 10, createdLast7: { newPages: 0, refresh: 0 } });
    expect(b.newPagesPerWeek).toBe(1); // 33 × %5 = 1
    expect(b.refreshPerWeek).toBe(3); // ceil(11 / 4)
    expect(b.refreshThisRun).toBe(1); // haftalığın en çok üçte biri
    const big = contentBudget({ indexablePages: 400, weakPages: 0, maxNewPagesPerWeek: 3, maxChangesPerWeek: 10, createdLast7: { newPages: 0, refresh: 0 } });
    expect(big.newPagesPerWeek).toBe(3); // ayar sınırı aşılmaz
    expect(big.refreshPerWeek).toBe(0);
    const used = contentBudget({ indexablePages: 33, weakPages: 11, maxNewPagesPerWeek: 3, maxChangesPerWeek: 10, createdLast7: { newPages: 1, refresh: 3 } });
    expect(used.newPagesThisRun).toBe(0);
    expect(used.refreshThisRun).toBe(0);
  });
});
