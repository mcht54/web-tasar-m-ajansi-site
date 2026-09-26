// Otonom SEO motorunun saf fonksiyonları: niyet, küme, skor, seçim, kalite kapısı, deney yargısı.
import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/autopilot/intent";
import { matchTopic } from "@/lib/autopilot/clusters";
import { judge } from "@/lib/autopilot/experiments";
import { checkAnchor, checkDescription, checkSection, checkTitle } from "@/lib/autopilot/qc";
import { ruleDescription, ruleTitles } from "@/lib/autopilot/execute";
import { scoreCandidate, selectTop, type Candidate } from "@/lib/autopilot/decide";
import { weekKey } from "@/lib/autopilot/run";
import { istanbul } from "@/lib/autopilot/scheduler";

const m = (impressions: number, clicks: number, position: number) => ({ impressions, clicks, ctr: clicks / impressions, position, days: 28, perDayImpr: impressions / 28, perDayClicks: clicks / 28 });

describe("arama niyeti", () => {
  it("bilgi, işlem, ticari ve yerel niyeti ayırır", () => {
    expect(classifyIntent("e-ticaret sitesi nasıl kurulur", { hasLocation: false }).primary).toBe("INFORMATIONAL");
    expect(classifyIntent("web sitesi yaptırma", { hasLocation: false }).primary).toBe("TRANSACTIONAL");
    expect(classifyIntent("web tasarım ajansı", { hasLocation: false }).primary).toBe("COMMERCIAL");
    const local = classifyIntent("sakarya web tasarım", { hasLocation: true });
    expect(local.intents).toContain("LOCAL");
    expect(classifyIntent("mcht tasarım", { hasLocation: false, brandTokens: ["mcht"] }).primary).toBe("NAVIGATIONAL");
  });
});

describe("konu kümeleri", () => {
  it("sorguyu doğru hedef sayfanın kümesine atar", () => {
    expect(matchTopic("web tasarım fiyatları 2026")?.target).toBe("/web-tasarim-fiyatlari");
    expect(matchTopic("e-ticaret sitesi yaptırma")?.target).toBe("/e-ticaret-web-tasarim");
    expect(matchTopic("web tasarım ajansı")?.target).toBe("/web-tasarim-ajansi");
    expect(matchTopic("pizza tarifi")).toBeNull();
  });
});

describe("fırsat skoru", () => {
  const base = { ctr: 0.01, trend: null, relevance: 8, intent: "COMMERCIAL", seoScore: 70, techIssue: false, learning: 1 } as const;
  it("0–100 aralığında; ilk sayfaya yakın ve yüksek gösterimli olan önde", () => {
    const near = scoreCandidate({ ...base, impressions: 2000, position: 6, risk: "AUTO" });
    const far = scoreCandidate({ ...base, impressions: 50, position: 35, risk: "AUTO" });
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.score).toBeLessThanOrEqual(100);
    expect(far.score).toBeGreaterThanOrEqual(0);
  });
  it("veri yoksa görünürlük/pozisyon bileşenleri 0 ve işaretli", () => {
    const s = scoreCandidate({ ...base, impressions: null, position: null, ctr: null, risk: "AUTO" });
    expect(s.parts.noData).toBe(true);
    expect(s.parts.visibility + s.parts.position + s.parts.ctrGap).toBe(0);
  });
  it("öğrenme çarpanı ve risk eforu skoru etkiler", () => {
    const a = scoreCandidate({ ...base, impressions: 500, position: 8, risk: "AUTO", learning: 1.3 });
    const b = scoreCandidate({ ...base, impressions: 500, position: 8, risk: "HUMAN", learning: 0.7 });
    expect(a.score).toBeGreaterThan(b.score);
  });
  it("en değerli 10: aynı sayfada aynı türden tek işlem, kaynak başına en çok 3 iç link", () => {
    const c = (i: number, type: Candidate["type"], pageId: string, path = "/a"): Candidate => ({ key: `${type}:${i}`, type, risk: "AUTO", title: `t${i}`, reason: "", pageId, pagePath: path, query: null, clusterId: null, score: 100 - i, parts: {} as never, payload: {} });
    const list = [c(1, "TITLE", "p1"), c(2, "TITLE", "p1"), c(3, "META", "p1"), ...[4, 5, 6, 7, 8].map((i) => c(i, "INTERNAL_LINK", "p2", "/src")), ...[9, 10, 11, 12, 13, 14, 15].map((i) => c(i, "META", `m${i}`))];
    const top = selectTop(list, 10);
    expect(top).toHaveLength(10);
    expect(top.filter((x) => x.type === "TITLE")).toHaveLength(1);
    expect(top.filter((x) => x.type === "INTERNAL_LINK")).toHaveLength(3);
  });
});

describe("kalite kapısı", () => {
  const others = new Set(["kurumsal web tasarım | ajans"]);
  it("title: uzunluk, odak sorgu, benzersizlik, abartı", () => {
    expect(checkTitle("Kurumsal Web Sitesi Tasarımı | Web Tasarım Ajansı", { query: "kurumsal web sitesi", current: "Eski", otherTitles: others }).ok).toBe(true);
    expect(checkTitle("Kısa", { query: null, current: "", otherTitles: others }).problems.join()).toMatch(/Uzunluk/);
    expect(checkTitle("En iyi kurumsal web sitesi tasarımı | Ajans", { query: "kurumsal web sitesi", current: "", otherTitles: others }).ok).toBe(false);
    expect(checkTitle("Kurumsal Web Tasarım | Ajans ve daha fazlası", { query: "e-ticaret", current: "", otherTitles: others }).problems).toContain("Odak sorguyu içermiyor");
    expect(checkTitle("kurumsal web tasarım | ajans", { query: null, current: "", otherTitles: new Set(["kurumsal web tasarım | ajans"]) }).ok).toBe(false);
    expect(checkTitle("Web tasarım [DOĞRULANMALI: x] başlık örneği", { query: null, current: "", otherTitles: others }).ok).toBe(false);
  });
  it("meta: 110–160 karakter, sayfada olmayan rakamlı iddia yok", () => {
    const good = "Kurumsal web sitesi projelerinde keşiften yayına kadar izlediğimiz süreci, teslim edilenleri ve fiyatı etkileyen etkenleri anlatıyoruz.";
    expect(checkDescription(good, { query: "kurumsal web sitesi", current: "", sourceText: "" }).ok).toBe(true);
    const fake = "Kurumsal web sitesi projelerinde 250 müşteri ile çalıştık; keşiften yayına kadar izlediğimiz süreci ve teslim edilenleri anlatıyoruz.";
    expect(checkDescription(fake, { query: null, current: "", sourceText: "metinde rakam yok" }).ok).toBe(false);
  });
  it("içerik: %40'tan büyük artış, yeni sayı ve dış link reddedilir", () => {
    const md = "Teslimden sonra yönetim panelinde sayfa ekleme, görsel değiştirme ve başlık düzenleme adımlarını birlikte uyguluyoruz. Eğitim sırasında ekibinizin sık yaptığı işlemleri not alıp kısa bir kullanım rehberi hazırlıyoruz. Yayın sonrası ilk haftalarda gelen soruları aynı kanal üzerinden yanıtlıyoruz. Böylece site yalnızca teslim edilmiş olmaz, günlük işlerinizde kullanılabilir hale gelir. Panelde yapılan her değişikliğin kaydı tutulduğu için hatalı bir düzenleme önceki haline döndürülebilir.";
    expect(checkSection(md, { query: null, sourceText: "Kurumsal web sitesi projelerinde keşif görüşmesiyle başlıyor, içerik mimarisini ve tasarımı birlikte planlıyoruz.", beforeWords: 400, addedWords: 90 })).toEqual({ ok: true, problems: [] });
    expect(checkSection(md, { query: null, sourceText: md, beforeWords: 100, addedWords: 90 }).problems.join()).toMatch(/%40/);
    expect(checkSection(`${md} Fiyat 15.000 TL.`, { query: null, sourceText: md, beforeWords: 400, addedWords: 90 }).ok).toBe(false);
    expect(checkSection(`${md} https://ornek.com`, { query: null, sourceText: md, beforeWords: 400, addedWords: 90 }).ok).toBe(false);
  });
  it("anchor: anlamsız ve aşırı tekrarlanan anchor reddedilir", () => {
    expect(checkAnchor("kurumsal web tasarım", []).ok).toBe(true);
    expect(checkAnchor("tıkla", []).ok).toBe(false);
    expect(checkAnchor("web tasarım", ["web tasarım", "Web Tasarım", "web tasarım"]).ok).toBe(false);
  });
});

describe("kural tabanlı üretim yalnızca sayfanın kendi metnini kullanır", () => {
  it("meta açıklamayı sayfadaki cümlelerden kurar", () => {
    const text = "Kurumsal web sitesi, firmanızın internetteki vitrinidir ve güven oluşturur. Sayfa hızını, mobil uyumu ve teknik SEO'yu baştan planlıyoruz. Süreç keşif görüşmesiyle başlar.";
    const d = ruleDescription(text, "kurumsal web sitesi")!;
    expect(d.length).toBeGreaterThanOrEqual(110);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.startsWith("Kurumsal web sitesi")).toBe(true);
    for (const s of d.split(/(?<=\.)\s+/)) expect(text).toContain(s);
    expect(ruleDescription("Çok kısa.", null)).toBeNull();
  });
  it("title alternatifleri odak sorguyu başa alır", () => {
    const t = ruleTitles("kurumsal web sitesi", "Kurumsal Web Tasarım", "Kurumsal Web Tasarım", "Web Tasarım Ajansı");
    expect(t[0]).toBe("Kurumsal web sitesi | Web Tasarım Ajansı");
  });
});

describe("deney yargısı (gözlenen değişim)", () => {
  it("title/meta CTR ile, diğerleri pozisyon/tıklama ile değerlendirilir", () => {
    expect(judge("TITLE", m(1000, 10, 6), m(1000, 20, 6)).outcome).toBe("positive");
    expect(judge("TITLE", m(1000, 20, 6), m(1000, 10, 6)).outcome).toBe("negative");
    expect(judge("INTERNAL_LINK", m(1000, 10, 12), m(1000, 10, 9)).outcome).toBe("positive");
    expect(judge("META", m(1000, 10, 6), m(1000, 10.5, 6)).outcome).toBe("neutral");
    const few = judge("TITLE", m(50, 1, 6), m(60, 3, 6));
    expect(few.outcome).toBe("insufficient");
    expect(judge("TITLE", m(1000, 10, 6), m(1000, 20, 6)).summary.startsWith("Gözlenen değişim")).toBe(true);
  });
});

describe("zaman", () => {
  it("ISO hafta Türkiye saatine göre", () => {
    expect(weekKey(new Date("2026-09-25T12:00:00Z"))).toBe("2026-W39");
    expect(weekKey(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    // Pazar 22:00 UTC = Pazartesi 01:00 İstanbul → yeni hafta
    expect(weekKey(new Date("2026-09-27T22:00:00Z"))).toBe("2026-W40");
    expect(istanbul(new Date("2026-09-27T20:30:00Z"))).toEqual({ day: 0, hour: 23 });
  });
});
