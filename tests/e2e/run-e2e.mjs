// Uçtan uca testler — gerçek tarayıcı (sistem Chrome'u) ile, TEST veritabanına
// bağlı ayrı bir sunucuya karşı çalışır:  npm run test:e2e
import assert from "node:assert/strict";
import sharp from "sharp";
import { browser, login } from "./helpers.mjs";

const BASE = process.env.E2E_BASE || "http://localhost:3310";
const ADMIN = { email: "test-admin@example.com", password: "TestSifre123456" };
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["✓", name]);
  } catch (e) {
    results.push(["✗", name, e.message.split("\n")[0]]);
  }
}
const html = async (p) => (await fetch(BASE + p, { redirect: "manual" }));
const meta = (s, n) => (new RegExp(`<meta name="${n}" content="([^"]*)"`).exec(s) ?? [])[1];

const b = await browser();
const ctx = await b.newContext({ baseURL: BASE });
const page = await ctx.newPage();
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(e.message));
const stamp = Date.now().toString(36);

await step("Teklif formu: KVKK onayı olmadan gönderilmez", async () => {
  await page.goto("/teklif-al");
  await page.fill('input[name="name"]', "E2E Test");
  await page.fill('input[name="phone"]', "0555 000 00 00");
  await page.click('button:has-text("Gönder")');
  await page.waitForSelector("text=Aydınlatma metnini onaylamanız gerekiyor");
});

await step("Teklif formu: geçerli başvuru kaydedilir", async () => {
  await page.check('input[name="consent"]');
  await page.fill('input[name="company"]', `Firma ${stamp}`);
  await page.selectOption('select[name="city"]', "Sakarya");
  await page.click('button:has-text("Gönder")');
  await page.waitForSelector("text=Talebiniz alındı");
});

await step("Yönetim: giriş", async () => {
  await login(page, ADMIN);
  assert.equal(new URL(page.url()).pathname, "/yonetim");
});

await step("Giriş: kullanıcı adıyla da yapılabilir", async () => {
  const ctx2 = await b.newContext({ baseURL: BASE });
  const p = await ctx2.newPage();
  await login(p, { email: "e2eadmin", password: ADMIN.password });
  assert.equal(new URL(p.url()).pathname, "/yonetim");
  await ctx2.close();
});

await step("Lead yönetimde görünür ve durumu güncellenir", async () => {
  await page.goto("/yonetim/leadler");
  await page.click(`text=E2E Test >> nth=0`);
  await page.selectOption('select[name="status"]', "CALLED");
  await page.fill('textarea[name="notes"]', "E2E notu");
  await page.click('button:has-text("Kaydet")');
  await page.waitForSelector("text=Kaydedildi.");
  assert.ok(await page.locator("text=Yeni → Arandı").count());
});

let editUrl = "";
await step("Sayfa düzenleme: meta description kaydedilir, logda ve sitede görünür", async () => {
  await page.goto("/yonetim/sayfalar?tur=SERVICE");
  await Promise.all([page.waitForURL(/\/yonetim\/sayfalar\/\w+/), page.click("a:has-text('Kurumsal Web Tasarım')")]);
  editUrl = page.url();
  const desc = `E2E açıklaması ${stamp}: kurumsal web tasarım için yeterince uzun ve anlamlı bir meta açıklama metni yazıyoruz burada.`;
  await page.fill('textarea[name="metaDescription"]', desc);
  await page.click('button:text-is("Kaydet")');
  await page.waitForSelector("text=Kaydedildi");
  await page.reload();
  assert.ok(await page.locator(`text=E2E açıklaması ${stamp}`).count(), "değişiklik logunda yok");
  const pub = await (await html("/kurumsal-web-tasarim")).text();
  assert.equal(meta(pub, "description"), desc);
});

await step("NOINDEX yapmak açık onay ister; onaylanınca sayfa noindex olur ve sitemap'ten çıkar", async () => {
  await page.goto(editUrl);
  await page.uncheck('input[name="robotsIndex"]');
  await page.click('button:text-is("Kaydet")');
  await page.waitForSelector("text=Onay gerekiyor");
  await page.check('input[name="confirmNoindex"]');
  await page.click('button:text-is("Kaydet")');
  await page.waitForSelector("text=Kaydedildi");
  const pub = await (await html("/kurumsal-web-tasarim")).text();
  assert.match(meta(pub, "robots"), /noindex/);
  const sm = await (await html("/sitemap-services.xml")).text();
  assert.ok(!sm.includes("/kurumsal-web-tasarim<"), "noindex sayfa sitemap'te");
  // geri al
  await page.goto(editUrl);
  await page.check('input[name="robotsIndex"]');
  await page.click('button:text-is("Kaydet")');
  await page.waitForSelector("text=Kaydedildi");
  assert.match(meta(await (await html("/kurumsal-web-tasarim")).text(), "robots"), /^index/);
});

await step("Yönlendirme: 301 oluşturulur ve proxy uygular", async () => {
  await page.goto("/yonetim/yonlendirmeler");
  await page.fill('input[name="fromPath"]', `/eski-${stamp}`);
  await page.fill('input[name="toPath"]', "/web-tasarim");
  await page.click('form:has(input[name="fromPath"]) button:has-text("Ekle")');
  await page.waitForSelector("text=Kaydedildi.");
  await new Promise((r) => setTimeout(r, 300));
  const r = await html(`/eski-${stamp}`);
  assert.equal(r.status, 301);
  assert.match(r.headers.get("location"), /\/web-tasarim$/);
});

await step("404 kaydı ve tek tıkla yönlendirme", async () => {
  const r = await fetch(`${BASE}/kayip-${stamp}`, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) Chrome/130" } });
  assert.equal(r.status, 404);
  await new Promise((res) => setTimeout(res, 500));
  await page.goto("/yonetim/yonlendirmeler?sekme=404");
  const row = page.locator(`tr:has-text("/kayip-${stamp}")`);
  await row.locator('input[name="toPath"]').fill("/iletisim");
  await row.locator('button:has-text("301")').click();
  await page.waitForSelector("text=Kaydedildi.");
  await new Promise((res) => setTimeout(res, 300));
  assert.equal((await html(`/kayip-${stamp}`)).status, 301);
});

await step("robots.txt güvenlik kilidi: siteyi kapatan kural reddedilir", async () => {
  await page.goto("/yonetim/ayarlar?sekme=robots");
  await page.fill('textarea[name="extraRules"]', "User-agent: *\nDisallow: /");
  await page.click('button:has-text("Kaydet")');
  await page.waitForSelector("text=sitenin tamamını Google'a kapatır");
  assert.ok(!(await (await html("/robots.txt")).text()).includes("Disallow: /\n"));
});

await step("Site geneli indeksleme onaysız kapatılamaz", async () => {
  await page.goto("/yonetim/ayarlar?sekme=seo");
  await page.uncheck('input[name="allowIndexing"]');
  await page.click('button:has-text("Kaydet")');
  await page.waitForSelector("text=İndekslemeyi kapatmak için");
  assert.match(meta(await (await html("/")).text(), "robots"), /^index/);
});

await step("AI asistanı (kural tabanlı): öneri onaylanınca sayfaya uygulanır", async () => {
  await page.goto("/yonetim/ai-asistan");
  await page.selectOption('select[name="kind"]', "meta");
  const opt = await page.locator('select[name="pageId"] option', { hasText: "/seo-hizmeti" }).first().getAttribute("value");
  await page.selectOption('select[name="pageId"]', opt);
  await page.click('button:has-text("Üret")');
  await page.waitForSelector("text=Onay bekliyor");
  await page.waitForSelector('button:has-text("Bu seçeneği sayfaya uygula")');
  const suggestionUrl = page.url();
  const currentTitle = () => html("/seo-hizmeti").then((r) => r.text()).then((t) => (/<title>(.*?)<\/title>/.exec(t) ?? [])[1].replace(/&amp;/g, "&"));
  const titles = (await page.locator("div.rounded-xl p.font-semibold").allTextContents()).map((t) => t.replace(/\s*\(\d+\)$/, "").trim());
  const before = await currentTitle();
  // Mevcutla aynı seçenek: "uygulandı" DENMEZ, hata gösterilir, sayfa değişmez
  const same = titles.indexOf(before);
  if (same >= 0) {
    await page.click(`button:has-text("Bu seçeneği sayfaya uygula") >> nth=${same}`);
    await page.waitForSelector("text=Değişiklik oluşmadı");
    assert.equal(await page.locator("text=ve sayfaya uygulandı").count(), 0, "değişiklik yokken başarı gösterildi");
    assert.equal(await currentTitle(), before);
    await page.goto(suggestionUrl);
  }
  // Farklı seçenek: gerçekten uygulanır ve sitede görünür
  const diff = titles.findIndex((t) => t !== before);
  assert.ok(diff >= 0, "farklı seçenek yok");
  await page.click(`button:has-text("Bu seçeneği sayfaya uygula") >> nth=${diff}`);
  await page.waitForSelector("text=ve sayfaya uygulandı");
  assert.equal(await currentTitle(), titles[diff], `title uygulanmadı: ${titles[diff]}`);
});

await step("Medya: yükleme WebP/AVIF varyantları üretir", async () => {
  const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#e8531f" } }).png().toBuffer();
  await page.goto("/yonetim/medya");
  await page.setInputFiles('input[name="file"]', { name: "test.png", mimeType: "image/png", buffer: png });
  await page.fill('input[name="seoName"]', `e2e-gorsel-${stamp}`);
  await page.fill('input[name="alt"]', "Turuncu deneme görseli");
  await page.click('button:has-text("Yükle")');
  await page.waitForSelector(`text=e2e-gorsel-${stamp}.webp`);
  const r = await html(`/medya/e2e-gorsel-${stamp}-640.avif`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/avif");
});

await step("Rol yetkisi: editör ayarlara erişemez, teknik alanlar kilitli", async () => {
  await page.goto("/yonetim/kullanicilar");
  await page.fill('form:has(input[name="email"]) input[name="name"]', "E2E Editör");
  await page.fill('input[name="email"]', `editor-${stamp}@example.com`);
  await page.selectOption('form:has(input[name="email"]) select[name="role"]', "EDITOR");
  await page.fill('form:has(input[name="email"]) input[name="password"]', "EditorSifre12345");
  await page.click('button:has-text("Oluştur")');
  await page.waitForSelector("text=Kaydedildi.");
  const c2 = await b.newContext({ baseURL: BASE });
  const p2 = await c2.newPage();
  await login(p2, { email: `editor-${stamp}@example.com`, password: "EditorSifre12345" });
  await p2.goto("/yonetim/ayarlar");
  await p2.waitForSelector("text=Bu ekran için yetkiniz yok");
  await p2.goto(editUrl);
  assert.ok(await p2.locator('fieldset[disabled] input[name="robotsIndex"]').count(), "robots alanı editöre açık");
  assert.equal(await p2.locator('input[name="path"][readonly]').count(), 1);
  await c2.close();
});

await step("Hatalı girişler hesabı kilitler (5 deneme)", async () => {
  const c3 = await b.newContext({ baseURL: BASE });
  const p3 = await c3.newPage();
  for (let i = 0; i < 6; i++) {
    await p3.goto("/yonetim/giris");
    await p3.fill('input[name="email"]', `editor-${stamp}@example.com`);
    await p3.fill('input[name="password"]', "yanlis-sifre-000");
    await Promise.all([p3.waitForResponse((r) => r.request().method() === "POST"), p3.click('button:has-text("Giriş yap")')]);
    await p3.waitForSelector('p[role="alert"]');
  }
  assert.ok(await p3.locator("text=geçici olarak kilitlendi").count());
  await c3.close();
});

await step("Lokasyon talebi ekranı ve yapay zekâ görünürlüğü dosyaları", async () => {
  await page.goto("/yonetim/lokasyon-talebi");
  // Search Console verisi yokken nüfus talep gibi gösterilmez; açıkça "Henüz veri yok"
  await page.waitForSelector("text=Henüz veri yok.");
  assert.equal(await page.locator("text=nüfusa göre potansiyel").count(), 0);
  const llms = await (await html("/llms.txt")).text();
  assert.match(llms, /^# /);
  assert.ok(llms.includes("/kurumsal-web-tasarim"));
  assert.ok(!llms.includes("/kvkk-aydinlatma-metni"), "NOINDEX sayfa llms.txt'de");
  const robots = await (await html("/robots.txt")).text();
  assert.match(robots, /User-agent: OAI-SearchBot/);
});

await step("İletişim bilgileri ve WhatsApp bağlantısı sitede", async () => {
  const home = await (await html("/")).text();
  assert.ok(home.includes('href="tel:+905319729336"'), "telefon yok");
  assert.ok(home.includes("mailto:mchttasarim@gmail.com"), "e-posta yok");
  assert.ok(home.includes("https://wa.me/905319729336"), "WhatsApp yok");
  const contact = await (await html("/iletisim")).text();
  assert.ok(contact.includes("+90 531 972 93 36"));
});

await step("Lokasyon kalite kapısı: yayınlama pasif, nedenler görünür", async () => {
  await page.goto("/yonetim/sayfalar?tur=CITY&q=sakarya");
  await Promise.all([page.waitForURL(/\/yonetim\/sayfalar\/\w+/), page.click("a:has-text('Sakarya Web Tasarım')")]);
  await page.waitForSelector("text=Lokasyon kalite kapısı");
  assert.ok(await page.locator("text=YAYINA HAZIR DEĞİL").count());
  assert.equal(await page.locator('select[name="status"] option[value="PUBLISHED"]').evaluate((o) => o.disabled), true);
});

await step("Veri yokken hızlı kazanımlar tahmin göstermez", async () => {
  await page.goto("/yonetim/hizli-kazanimlar");
  await page.waitForSelector("text=Henüz veri yok.");
  await page.goto("/yonetim");
  assert.ok(await page.locator("text=Henüz veri yok").count() >= 4, "kontrol merkezinde veri yok ayrımı yok");
});

await step("AI Görünürlüğü: bot izinleri robots.txt'den", async () => {
  await page.goto("/yonetim/ai-gorunurluk");
  const row = page.locator("tr", { hasText: "OAI-SearchBot" });
  assert.ok((await row.textContent()).includes("İzinli"));
});

await step("ÇÖZÜM ÖNER: MEVCUT/ÖNERİLEN → düzenle → uygula → sitede → geri al", async () => {
  await page.goto("/yonetim/ai-asistan");
  await page.selectOption('select[name="kind"]', "fix");
  const opt = await page.locator('select[name="pageId"] option', { hasText: "/google-ads-yonetimi" }).first().getAttribute("value");
  await page.selectOption('select[name="pageId"]', opt);
  await Promise.all([page.waitForURL(/\/yonetim\/ai-asistan\/\w+/), page.click('button:has-text("Üret")')]);
  await page.waitForSelector("text=MEVCUT vs ÖNERİLEN");
  const original = (await (await html("/google-ads-yonetimi")).text()).match(/<title>(.*?)<\/title>/)[1];
  const newTitle = `Google Ads Yönetimi E2E ${stamp}`;
  await page.fill('textarea[name="seoTitle"]', newTitle);
  await page.check('input[name="use_seoTitle"]');
  await page.click('button:has-text("Önizle")');
  await page.waitForSelector(`text=${newTitle}`);
  await page.click('button:text-is("Uygula")');
  await page.waitForSelector("text=Uygulandı; değişiklik sürüm geçmişine");
  assert.ok((await (await html("/google-ads-yonetimi")).text()).includes(`<title>${newTitle}</title>`), "uygulanmadı");
  await page.click('button:has-text("Geri al")');
  await page.waitForSelector("text=Geri alındı");
  assert.ok((await (await html("/google-ads-yonetimi")).text()).includes(`<title>${original}</title>`), "geri alınmadı");
});

await step("Ayarlar → SEO E-posta: kaydedilir, SMTP şifresi gösterilmez, test raporu kaydedilir", async () => {
  await page.goto("/yonetim/ayarlar?sekme=eposta");
  assert.equal(await page.inputValue('input[name="recipient"]'), "mchttasarim@gmail.com");
  await page.selectOption('select[name="day"]', "1");
  await page.selectOption('select[name="hour"]', "9");
  await page.fill('input[name="smtpPassword"]', `gizli-e2e-${stamp}`);
  await Promise.all([page.waitForURL(/kaydedildi=1/), page.click('form:has(input[name="recipient"]) button:text-is("Kaydet")')]);
  assert.equal(await page.inputValue('select[name="day"]'), "1");
  assert.equal(await page.inputValue('select[name="hour"]'), "9");
  assert.ok(!(await page.content()).includes(`gizli-e2e-${stamp}`), "SMTP şifresi sayfada görünüyor");
  await page.waitForSelector("text=Kayıtlı (şifreli saklanır, gösterilmez)");
  await Promise.all([page.waitForURL(/test=/), page.click('button:has-text("Test raporu gönder")')]);
  await page.waitForSelector("text=Test e-postası kaydedildi");
  // Temizlik: şifreyi sil, varsayılan gün/saate dön
  await page.check('input[name="removeSmtp"]');
  await page.selectOption('select[name="day"]', "0");
  await page.selectOption('select[name="hour"]', "23");
  await Promise.all([page.waitForURL(/kaydedildi=1/), page.click('form:has(input[name="recipient"]) button:text-is("Kaydet")')]);
  await page.waitForSelector("text=Kayıtlı değil. AES-256-GCM");
});

await step("SEO Otopilot: 23 aşama, dürüst veri uyarısı, rapor önizlemesi ve e-posta geçmişi", async () => {
  await page.goto("/yonetim/autopilot");
  await page.waitForSelector("text=Henüz gerçek Google verisi alınamadı.");
  await page.waitForSelector("text=Güvenli otomatik uygulama");
  assert.equal(await page.locator("ol li").count(), 23);
  await page.goto("/yonetim/autopilot?sekme=rapor");
  const frame = page.frameLocator('iframe[title="Haftalık rapor"]');
  await frame.locator("text=Gelecek hafta planı").waitFor();
  assert.ok(await frame.locator("text=Henüz gerçek Google verisi alınamadı.").count() > 0);
  await page.goto("/yonetim/autopilot?sekme=eposta");
  await page.waitForSelector("text=[TEST] Haftalık SEO Raporu");
  await page.goto("/yonetim/ayarlar?sekme=otopilot");
  assert.equal(await page.inputValue('input[name="maxChangesPerWeek"]'), "10");
});

await step("Teknik SEO: robots, sitemap (200, noindex yok, kopya yok, canonical tutarlı), llms, favicon", async () => {
  const robots = await (await html("/robots.txt")).text();
  assert.match(robots, /User-agent: \*\nAllow: \/\nDisallow: \/yonetim\nDisallow: \/api\//);
  assert.match(robots, /User-agent: OAI-SearchBot[\s\S]*?Allow: \//);
  assert.match(robots, /Sitemap: http:\/\/localhost:3310\/sitemap\.xml/);
  const idx = await (await html("/sitemap.xml")).text();
  const subs = [...idx.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  for (const sub of subs) urls.push(...[...(await (await fetch(sub)).text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]));
  assert.ok(urls.length > 10, "sitemap boş");
  assert.equal(new Set(urls).size, urls.length, "sitemap'te kopya URL");
  for (const u of urls) {
    const r = await fetch(u, { redirect: "manual" });
    assert.equal(r.status, 200, `${u} → ${r.status}`);
    const h = await r.text();
    assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(h), `${u} noindex`);
    const canon = (/<link rel="canonical" href="([^"]*)"/.exec(h) ?? [])[1];
    assert.equal(canon?.replace(/\/$/, ""), u.replace(/\/$/, ""), `${u} canonical ${canon}`);
    assert.ok(!h.includes("[DOĞRULANMALI"), `${u} doğrulanmamış içerik`);
  }
  const llms = await (await html("/llms.txt")).text();
  assert.ok(llms.includes("/web-tasarim)") && !llms.includes("/hakkimizda") && !llms.includes("/yonetim"), "llms.txt yalnızca yayındaki sayfaları içermeli");
  const full = await html("/llms-full.txt");
  assert.equal(full.status, 200);
  assert.ok((await full.text()).length > 5000);
  const fav = await html("/favicon.ico");
  assert.equal(fav.status, 200, "favicon.ico 200 dönmeli");
  assert.match(fav.headers.get("content-type") ?? "", /image\/(x-icon|vnd\.microsoft\.icon)/);
  const ico = Buffer.from(await fav.arrayBuffer());
  assert.equal(ico.readUInt32LE(0), 0x00010000, "geçerli ICO imzası");
  assert.equal(ico.readUInt16LE(4), 3, "16/32/48 boyutları");
  const home = await (await html("/")).text();
  assert.match(home, /<link rel="icon" href="\/favicon\.ico\?[^"]+"[^>]*type="image\/x-icon"/);
  assert.match(home, /<link rel="apple-touch-icon" href="\/apple-icon\.png\?[^"]+" sizes="180x180"/);
  assert.match(home, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  const apple = await html("/apple-icon.png");
  assert.equal(apple.status, 200);
  assert.equal(apple.headers.get("content-type"), "image/png");
  const man = await (await html("/manifest.webmanifest")).json();
  assert.deepEqual(man.icons.map((i) => i.sizes).slice(0, 2), ["192x192", "512x512"]);
  for (const i of man.icons) assert.equal((await html(i.src)).status, 200, i.src);
  assert.equal((await html("/web-tasarim/")).status, 308);
  assert.equal((await html("/Web-Tasarim")).status, 301);
  assert.equal((await html("/web-tasarim/sakarya")).status, 404, "taslak lokasyon sayfası 404 olmalı");
  assert.match((await html("/web-tasarim?utm_source=x")).headers.get("x-robots-tag") ?? "", /noindex/);
});

await step("Otopilot: denetim → fırsat → kalite kapısı → uygula → sitede doğrula → geri al; sağlık özeti 10 kategori", async () => {
  await page.goto("/yonetim/autopilot");
  await Promise.all([page.waitForURL(/is=autopilot/), page.click('button:has-text("Otopilot döngüsünü şimdi çalıştır")')]);
  // Arka plandaki döngünün bitmesini bekle (en çok 3 dk)
  let done = false;
  for (let i = 0; i < 90 && !done; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await page.goto("/yonetim/autopilot");
    done = (await page.locator("text=Son çalıştırma").locator("..").innerText()).match(/tamam|kısmi/) != null;
  }
  assert.ok(done, "otopilot döngüsü bitmedi");
  assert.equal(await page.locator("[data-health]").count(), 10);
  assert.match(await page.locator('[data-health="google"] summary').innerText(), /NOT VERIFIABLE/);
  assert.equal(await page.locator("ol li").filter({ hasText: "tamam" }).count() + await page.locator("ol li").filter({ hasText: "atlandı" }).count(), 23);
  // 48 saatlik onay: döngü iç link önerisini hazırlar ama hemen uygulamaz
  await page.goto("/yonetim/oneriler");
  assert.ok(await page.locator("article[data-status=pending_approval]", { hasText: "iç link" }).count() >= 2, "onay bekleyen iç link önerisi yok");
  assert.ok(await page.locator("[data-countdown]").count() > 0, "geri sayım yok");
  assert.match(await page.locator("[data-timer]").first().innerText(), /onaylanmazsa otomatik uygulanacak/);
});

const related = async (src) => (/İlgili sayfalar([\s\S]*?)<\/section>|İlgili sayfalar([\s\S]*?)<\/ul>/.exec(await (await html(src)).text()) ?? [""])[0];
const linkOf = async (card) => {
  const [, src, target] = /(\/\S*) → (\/\S*) iç link/.exec(await card.locator("h2").innerText()) ?? [];
  assert.ok(src && target, "öneri başlığı ayrıştırılamadı");
  return { id: await card.getAttribute("data-proposal"), src, target };
};

await step("Öneri → Şimdi Uygula → DB + sürüm + denetim logu + sitede + UI durumu → Rollback", async () => {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await page.goto("/yonetim/oneriler");
    const card = page.locator("article[data-status=pending_approval]", { hasText: "iç link" }).first();
    const { id, src, target } = await linkOf(card);
    assert.ok(!(await related(src)).includes(`href="${target}"`), "uygulamadan önce link zaten var");
    const versions = Number((await c.query('select count(*) from "PageVersion" v join "Page" p on p.id=v."pageId" where p.path=$1', [src])).rows[0].count);
    await Promise.all([page.waitForURL(/ok=/), card.locator('button:text-is("Şimdi Uygula")').click()]);
    await page.waitForSelector("text=sürüm geçmişine ve denetim loguna yazıldı");
    // DB: gerçek değişiklik, sürüm, denetim logu, durum
    const row = (await c.query('select status, "appliedVia", "appliedAt", "rollbackAvailable" from "AutopilotAction" where id=$1', [id])).rows[0];
    assert.equal(row.status, "applied");
    assert.equal(row.appliedVia, "manual");
    assert.ok(row.appliedAt && row.rollbackAvailable);
    const links = (await c.query('select "relatedLinks" from "Page" where path=$1', [src])).rows[0].relatedLinks;
    assert.ok(links.some((l) => l.path === target), "DB'de link yok");
    assert.ok(Number((await c.query('select count(*) from "PageVersion" v join "Page" p on p.id=v."pageId" where p.path=$1', [src])).rows[0].count) > versions, "sürüm oluşmadı");
    assert.equal(Number((await c.query(`select count(*) from "AuditLog" where "entityId"=$1 and action='proposal.apply'`, [id])).rows[0].count), 1, "denetim logu yok");
    // Sitede
    assert.ok((await related(src)).includes(`href="${target}"`), `${src} sayfasında ${target} linki görünmüyor`);
    // UI durumu + uygulama hattı adımları
    await page.goto(`/yonetim/oneriler/${id}`);
    assert.match(await page.locator("main").innerText(), /Uygulandı/);
    assert.match(await page.locator("[data-steps]").innerText(), /Doğrulama[\s\S]*Uygulama[\s\S]*Veritabanı testi[\s\S]*SEO doğrulama[\s\S]*Tarama kontrolü[\s\S]*Geri alma noktası/);
    // Rollback
    await Promise.all([page.waitForURL(/ok=/), page.click('button:has-text("Rollback")')]);
    await page.waitForSelector("text=Geri alındı");
    assert.ok(!(await related(src)).includes(`href="${target}"`), "geri alma sonrası link sitede");
    assert.equal((await c.query('select status from "AutopilotAction" where id=$1', [id])).rows[0].status, "rolled_back");
  } finally {
    await c.end();
  }
});

await step("48 saat dolunca (test saati) zamanlayıcı işi öneriyi otomatik uygular; UI 'otomatik uygulandı' der; rollback", async () => {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await page.goto("/yonetim/oneriler");
    const card = page.locator("article[data-status=pending_approval]", { hasText: "iç link" }).first();
    const { id, src, target } = await linkOf(card);
    // 48 saat beklemek yerine yalnızca TEST veritabanında süre geçmişe alınır
    // Prisma zamanları UTC (saat dilimsiz) saklar: yerel now() değil, UTC kullanılır
    const upd = await c.query(`update "AutopilotAction" set "expiresAt" = (now() at time zone 'utc') - interval '1 minute' where id=$1 and "autoApply"=true`, [id]);
    assert.equal(upd.rowCount, 1, "öneri otomatik uygulanabilir değil");
    await Promise.all([page.waitForURL(/is=auto-apply-proposals/), page.click('button:has-text("Süresi dolan önerileri şimdi işle")')]);
    let status = "";
    for (let i = 0; i < 30 && status !== "applied"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      status = (await c.query('select status from "AutopilotAction" where id=$1', [id])).rows[0].status;
    }
    assert.equal(status, "applied", "otomatik uygulanmadı");
    assert.equal((await c.query('select "appliedVia" from "AutopilotAction" where id=$1', [id])).rows[0].appliedVia, "auto_48h");
    assert.equal(Number((await c.query(`select count(*) from "AuditLog" where "entityId"=$1 and action='proposal.auto_apply'`, [id])).rows[0].count), 1);
    assert.ok((await related(src)).includes(`href="${target}"`), "otomatik uygulama sitede görünmüyor");
    await page.goto("/yonetim/oneriler?sekme=uygulanan");
    const applied = page.locator(`article[data-proposal="${id}"]`);
    assert.match(await applied.innerText(), /48 saatlik onay süresi doldu — otomatik uygulandı/);
    await Promise.all([page.waitForURL(/ok=/), applied.locator('button:has-text("Rollback")').click()]);
    await page.waitForSelector("text=Geri alındı");
    assert.ok(!(await related(src)).includes(`href="${target}"`), "geri alma sonrası link sitede");
  } finally {
    await c.end();
  }
});

await step("İçerik önerisi → Şimdi Uygula → yeni bölüm gerçek HTML'de; canonical/sitemap bozulmaz → Rollback", async () => {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const path = "/otel-web-tasarimi";
  const heading = `Rezervasyon adımlarının sadeleştirilmesi ${stamp}`;
  try {
    const p = (await c.query('select id, body from "Page" where path=$1', [path])).rows[0];
    const after = `${p.body.trimEnd()}\n\n## ${heading}\n\nOtel sitesinde ziyaretçi oda seçiminden rezervasyon talebine kadar az adımda ilerlemelidir. Tarih, oda tipi ve iletişim bilgisi aynı ekranda istenir; zorunlu olmayan alanlar kaldırılır. Mobilde form alanları büyük ve okunaklı olur, hata mesajları alanın hemen altında gösterilir.`;
    const id = `e2econtent${stamp}`;
    await c.query(`insert into "AutopilotAction" (id, type, risk, status, score, title, reason, "pageId", category, source, "riskLevel", "autoApply", "expiresAt", fingerprint, "proposedChanges", "createdAt")
      values ($1, 'CONTENT', 'CONTROLLED', 'pending_approval', 40, $2, 'E2E içerik testi', $3, 'CONTENT', 'content', 'MEDIUM', true, (now() at time zone 'utc') + interval '48 hours', $1, $4, now() at time zone 'utc')`,
      [id, `${path} içerik yenileme (E2E)`, p.id, JSON.stringify({ pages: [{ pageId: p.id, path, changes: [{ field: "body", before: p.body, after }] }] })]);
    await page.goto(`/yonetim/oneriler/${id}`);
    assert.match(await page.locator("#degisiklikler").innerText(), /Eklenecek bölüm/);
    await Promise.all([page.waitForURL(/ok=/), page.click('button:text-is("Şimdi Uygula")')]);
    await page.waitForSelector("text=sürüm geçmişine ve denetim loguna yazıldı");
    const pub = await (await html(path)).text();
    assert.ok(pub.includes(heading), "yeni bölüm sitede yok");
    assert.match(pub, new RegExp(`<link rel="canonical" href="[^"]*${path}"`));
    assert.match(await page.locator("[data-steps]").innerText(), /Tarama kontrolü[\s\S]*yeni bölüm görünüyor/);
    await Promise.all([page.waitForURL(/ok=/), page.click('button:has-text("Rollback")')]);
    await page.waitForSelector("text=Geri alındı");
    assert.ok(!(await (await html(path)).text()).includes(heading), "geri alma sonrası bölüm sitede");
  } finally {
    await c.end();
  }
});

await step("İçerik Planı: veriye dayalı bütçe, hizmet kararları, ilçe önceliği (doğrulanamayan kriter ayrı)", async () => {
  await page.goto("/yonetim/icerik-plani");
  await page.waitForSelector("text=Bütçe nasıl hesaplandı");
  assert.match(await page.locator('[data-service="/seo-hizmeti"]').innerText(), /Mevcut sayfa karşılıyor/);
  assert.match(await page.locator('[data-service="/teknik-seo"]').innerText(), /genişletilmeli/);
  assert.equal(await page.locator("[data-district]").count(), 30);
  assert.ok((await page.content()).includes("doğrulanamadı"));
});

await step("Reddedilen öneri uygulanmaz", async () => {
  await page.goto("/yonetim/oneriler");
  const card = page.locator("article[data-status=pending_approval]").first();
  const id = await card.getAttribute("data-proposal");
  await Promise.all([page.waitForURL(/ok=/), card.locator('button:text-is("Reddet")').click()]);
  await page.waitForSelector("text=Reddedildi; bu öneri uygulanmayacak");
  await page.goto("/yonetim/oneriler?sekme=gecmis");
  assert.equal(await page.locator(`article[data-proposal="${id}"][data-status=rejected]`).count(), 1);
});

await step("SEO ajanı panelleri: mod, puan düşüşleri, sayfa envanteri, anahtar kelime kararları, günlük rapor ve sistem durumu", async () => {
  await page.goto("/yonetim/ayarlar?sekme=otopilot");
  assert.equal(await page.inputValue('select[name="mode"]'), "AUTONOMOUS");
  assert.equal(await page.inputValue('input[name="maxNewPagesPerWeek"]'), "3");
  await page.goto("/yonetim/autopilot");
  const score = await page.locator("[data-overall-score]").getAttribute("data-overall-score");
  assert.match(score ?? "", /^\d+$/, "genel sağlık skoru hesaplanmalı");
  assert.ok(Number(score) < 100 ? (await page.locator("[data-deductions] li").count()) > 0 : true, "skor 100 değilse düşüşler listelenmeli");
  assert.match(await page.locator("[data-overall-score]").innerText(), /Deterministik/);
  await page.goto("/yonetim/autopilot?sekme=sayfalar");
  await page.waitForSelector('[data-inventory="Lokasyon"]');
  assert.match(await page.locator('[data-inventory="Lokasyon"]').innerText(), /doorway|scaled|İşletme adı/);
  await page.goto("/yonetim/autopilot?sekme=kelimeler");
  await page.waitForSelector("text=Anahtar kelime ölçümü ve ajan kararları");
  assert.ok((await page.locator("tbody tr").count()) > 5);
  await page.goto("/yonetim/autopilot?sekme=gunluk");
  assert.equal(await page.locator("[data-system]").count(), 8);
  await page.frameLocator('iframe[title="Günlük rapor"]').locator("text=Bugün ajanın yaptığı").waitFor();
});

await step("Panelden entegrasyonlar: Search Console OAuth, Anthropic anahtarı (maskeli), SMTP şifrelemesi; /health", async () => {
  await page.goto("/yonetim/ayarlar?sekme=entegrasyon");
  await page.waitForSelector("text=Google Search Console (Google hesabıyla bağlan)");
  assert.match(await page.locator("[data-gsc-status]").innerText(), /Bağlı değil/);
  assert.match(await page.content(), /\/api\/integrations\/gsc\/callback/);
  assert.equal(await page.locator('input[name="anthropicKey"]').getAttribute("type"), "password");
  // Geçersiz anahtar reddedilir ve kaydedilmez
  await page.fill('input[name="anthropicKey"]', "gecersiz-anahtar");
  await Promise.all([page.waitForURL(/hata=/), page.click('form:has(input[name="anthropicKey"]) button:text-is("Kaydet")')]);
  await page.waitForSelector("text=Geçerli bir Anthropic API anahtarı değil");
  await page.goto("/yonetim/ayarlar?sekme=eposta");
  assert.equal(await page.inputValue('select[name="smtpEncryption"]'), "starttls");
  assert.equal(await page.locator('input[name="smtpFromName"]').count(), 1);
  const h = await (await html("/health")).json();
  assert.deepEqual(Object.keys(h.checks), ["web", "database", "scheduler", "worker", "queue", "ai", "searchConsole", "smtp"]);
  assert.equal(h.checks.database.status, "ok");
  const start = await fetch(BASE + "/api/integrations/gsc/start", { redirect: "manual" });
  assert.equal(start.status, 403, "oturumsuz OAuth başlatılamaz");
});

await step("Tarayıcı konsolunda JavaScript hatası yok", async () => {
  assert.deepEqual(jsErrors, []);
});

await b.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} uçtan uca test geçti`);
process.exit(failed ? 1 : 0);
