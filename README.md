# webtasarimajansi.net — SEO-first web platformu

Türkiye genelinde "web tasarım" aramalarını hedefleyen site + bu aramaları ölçen, analiz eden ve her gün
"bugün yapılması gereken SEO işleri"ni çıkaran yönetim paneli.

**Öncelik sırası:** SEO > içerik mimarisi > performans > teknik altyapı > dönüşüm > görsel tasarım.
**Kırmızı çizgiler:** keyword stuffing, gizli metin/link, cloaking, şehir adı değiştirilmiş kopya sayfalar,
sahte yorum/referans/işletme bilgisi yok. Sistem bunları hem üretmez hem de tespit eder.

## Hızlı başlangıç

```bash
cp .env.example .env            # DATABASE_URL, APP_SECRET (openssl rand -base64 32), SITE_URL
npm install
npx prisma migrate deploy
npm run db:seed                 # 81 il, 973 ilçe, hizmet/sektör/blog içerikleri, ilk yönetici
npm run dev                     # http://localhost:3300 — panel: /yonetim
```

İlk yöneticinin şifresi `.local/ilk-yonetici.txt` dosyasına yazılır (yalnızca bu makinede). İlk girişte
**Kullanıcılar** ekranından şifreyi değiştirip dosyayı silin.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` / `build` / `start` | Geliştirme / üretim derlemesi / üretim sunucusu (port 3300) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | 71 birim + entegrasyon testi (yalnızca `*_test` veritabanında çalışır) |
| `npm run test:e2e` | 21 uçtan uca tarayıcı testi (sistem Chrome'u, test DB'sine bağlı ayrı sunucu, port 3310) |
| `npm run seo:validate` | Çalışan sitede sitemap'teki her URL'yi SEO kurallarına göre denetler (`SEO_BASE=` ile hedef) |
| `npm run job -- <iş>` | `daily`, `gsc-sync`, `rank-update`, `index-inspect`, `crawl`, `analyze`, `opportunities`, `indexnow`, `sitemap-check`, `autopilot`, `alarms`, `weekly-email`, `daily-email` · `npm run worker` (ayrı süreçte zamanlayıcı+worker) |

### Günlük iş (cron)

```cron
0 6 * * *  cd /srv/webtasarimajansi && APP_INTERNAL_URL=http://127.0.0.1:3300 npm run job -- daily
```

`daily` sırasıyla: Search Console senkronu → sıralama güncellemesi → indeks kontrolü → site taraması →
SEO analizi → fırsat motoru → IndexNow bildirimi ve yeniden denemeler → canlı sitemap doğrulaması. Herhangi bir adım başarısız olursa iş **hata** olarak kaydedilir (Loglar > İş geçmişi). İş bitince çalışan uygulamaya önbellek tazeleme bildirimi gönderilir
(`/api/internal/revalidate`, `APP_SECRET`'tan türetilmiş token ile korunur). Tüm işler yönetim
panelinden de tek tıkla çalıştırılabilir.

## Mimari

- **Next.js 16 (App Router) + TypeScript + Tailwind 4 + PostgreSQL + Prisma 7.**
- **Tek sayfa tablosu:** sitedeki her URL bir `Page` satırıdır (hizmet, il, ilçe, sektör, hizmet+il,
  sektör+il, blog, sabit sayfa). SEO skoru, sitemap, sürüm geçmişi, iç link grafiği ve crawler aynı tabloyu okur.
  İl/ilçe/hizmet/sektör tabloları yalnızca olgusal veriyi taşır.
- **Render:** herkese açık sayfalar sunucuda HTML olarak üretilir, ISR ile 1 saat önbelleklenir, panelde
  kayıt yapılınca anında tazelenir. İstemci JavaScript'i yalnızca teklif formunda var. CSS HTML'e gömülür.
- **Proxy (`src/proxy.ts`):** 301/302 yönlendirmeler, büyük harfli URL → küçük harf 301, parametreli URL'lere
  `X-Robots-Tag: noindex`, 404 kaydı, `/yonetim` için noindex + oturum ön kontrolü.
- **Site grafiği (`src/lib/seo/graph.ts`):** şablonun gösterdiği iç linkler (ilçeler, ilgili hizmetler,
  yakın şehirler…) ile iç link analizinin gördüğü linkler aynı fonksiyondan gelir.

### URL yapısı

| Tür | Örnek |
| --- | --- |
| Hizmet | `/web-tasarim`, `/kurumsal-web-tasarim`, `/e-ticaret-web-tasarim`, `/web-tasarim-fiyatlari`, `/web-sitesi-yaptirma`, `/web-tasarim-ajansi`, `/seo-hizmeti`, `/google-ads-yonetimi`, `/ozel-web-yazilim` |
| İl / ilçe | `/web-tasarim/sakarya`, `/web-tasarim/sakarya/adapazari` |
| Hizmet + il | `/kurumsal-web-tasarim/sakarya` |
| Sektör / sektör + il | `/restoran-web-tasarimi`, `/web-tasarim/sakarya/restoran` |
| Blog | `/blog`, `/blog/web-tasarim-nedir` |
| Teknik | `/sitemap.xml` + `sitemap-{pages,services,locations,blog}.xml`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/og/...`, `/indexnow-key.txt` |

### Programatik SEO koruması

- 81 il ve 973 ilçe sayfası **taslak ve içeriksiz** oluşturulur: ziyaretçiye 404, sitemap'te yok.
- Yayındaki il/ilçe/kombinasyon sayfası, tür için belirlenen kelime eşiğinin altındaysa veya başka bir sayfayla
  şehir adları yok sayıldığında %55+ benzerse **otomatik NOINDEX** olur (eşikler Ayarlar > SEO'dan).
- Lokasyon ekranı yazara yalnızca sistemdeki olgusal veriden bir içerik brief'i verir; doğrulanması gereken
  yerel bilgiyi işaretler. Nüfus verisi girilmediyse "Doğrulanamadı" gösterilir.

### SEO skoru (0–100)

Teknik 25 · İçerik 25 · Sayfa içi 20 · İç link 10 · Performans 10 · Yapısal veri 5 · UX 5.
Ölçülemeyen kontrol (ör. performans verisi yoksa) toplamdan düşülür, puan uydurulmaz. Kritik sorunlar
skora tavan koyar (kopya içerik ≤ 60, thin content ≤ 65, indekslenemez ≤ 50, cannibalization ≤ 75).
Ayrıca içerik kalite skoru ve "Google'a gönderilmeye hazır mı?" (PASS / WARNING / FAIL) listesi.

### Schema

WebSite, Organization/LocalBusiness, WebPage, BreadcrumbList, Service, BlogPosting, FAQPage — sayfa verisinden
otomatik. LocalBusiness yalnızca işletme adı + telefon + adres girilmişse ve yalnızca ana sayfa/iletişimde
üretilir (şehir sayfalarına sahte şube bilgisi basılmaz). FAQPage en az 2 görünür soru varsa. Puan/yorum
schema'sı hiçbir zaman üretilmez.

## Yapay zekâ görünürlüğü (GEO) ve yerel talep

- **`/llms.txt` ve `/llms-full.txt`:** yayındaki, indekslenebilir sayfaların AI modelleri için özet haritası ve tam
  Markdown metni (llmstxt.org biçimi). NOINDEX ve taslak sayfalar girmez; işletme bilgisinden yalnızca girilmiş alanlar yazılır.
- **AI botları:** robots.txt'de yanıt/arama botları (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot…) ve
  eğitim botları (GPTBot, ClaudeBot, Google-Extended…) için ayrı, açık kurallar; Ayarlar > SEO'dan açılıp kapatılır.
- **Alıntıya izin:** robots meta `max-snippet:-1, max-image-preview:large` — Google ve AI yanıtları metni kaynak gösterip kullanabilir.
- **IndexNow:** sayfa yayınlanınca/güncellenince/yayından kalkınca Bing, Yandex ve diğerlerine anında bildirim
  (ChatGPT araması Bing dizinini kullanır). Anahtar `APP_SECRET`'tan türetilir, `/indexnow-key.txt`'de yayınlanır;
  yerel adreste gönderilmez. Bing Webmaster ve Yandex doğrulama etiketleri Ayarlar'dan.
- **Otomatik paylaşım görseli:** özel görseli olmayan her sayfa için `/og/...` (1200×630) üretilir; OG, Twitter ve
  BlogPosting/WebPage schema'sında kullanılır.
- **Varlık (entity) verisi:** Organization `knowsAbout`, Service `areaServed` il→ilçe→Türkiye hiyerarşisiyle.
- **Lokasyon Talebi ekranı:** Search Console sorgularında il/ilçe adı + hizmet niyeti geçen aramalar konuma göre
  toplanır (gösterim, tıklama, pozisyon) ve o konumun sayfa durumuyla eşleşir: *Sayfa yok / Taslak / NOINDEX / Zayıf /
  Yayında*. Aynı adlı ilçeler yalnızca sorguda il adı da varsa atanır. Fırsat motoru "Sakarya'dan web tasarım
  aranıyor, sayfası taslak" görevlerini buradan üretir. Search Console verisi yokken liste resmî nüfusa göre sıralanır
  (açıkça "arama verisi değildir" etiketiyle).
- **Resmî lokasyon verisi:** 81 il ve 973 ilçenin 2025 nüfusu, yüzölçümü, mahalle sayısı, büyükşehir/kıyı bilgisi
  (TürkiyeAPI 2025, kaynak TÜİK ADNKS) depoda sabit veri olarak durur ve sayfalarda kaynağıyla gösterilir.
- **AI yerel taslağı:** il/ilçe sayfası için Claude'a yalnızca doğrulanmış olgular (resmî veri + editör notları +
  gerçek iç linkler) verilir; yerel ayrıntı gereken yerlere `[DOĞRULANMALI: …]` koyar. Taslak sayfaya yazılır ama
  sayfa taslak kalır; işaretler temizlenmeden hazırlık kontrolü FAIL verir ve sayfa yayında olsa bile otomatik NOINDEX olur.

> Hiçbir sistem Google'da veya AI yanıtlarında belirli bir sırayı garanti edemez. 973 ilçe için şablon sayfayı toplu
> yayınlamak Google'ın "doorway page" tanımına girer ve tüm siteyi cezalandırabilir; bu yüzden yerel sayfalar talebe
> göre önceliklendirilip gerçek bilgiyle yazıldıkça yayına alınır.

## CI/CD: GitHub → Actions → VPS

```
kod değişikliği → git commit → git push (main)
      → GitHub Actions: lint · typecheck · test · build · Docker imaj kontrolü
      → images: webtasarimajansi-{web,tools}:<commit> → ghcr.io/mcht54/…  (sunucuda DERLEME YOK)
      → (DEPLOY_ENABLED=true ise) SSH → /opt/mcht/webtasarimajansi/scripts/deploy.sh
      → GHCR'dan indir + commit doğrula → yedek → migration → yeni container'lar
      → sağlık kontrolü → önbellek yenileme + ısıtma → başarısızsa önceki sürüme otomatik dönüş
```

**Neden GHCR?** Aynı sunucuda başka projeler de çalışıyor; Next.js derlemesi ve `npm ci` anlık 1,5–2 GB RAM ve birkaç GB disk ister. Derleme GitHub Actions'ta yapılır, sunucu yalnızca hazır imajı indirir. İmajlar derleme sırasında geçici bir veritabanıyla önceden oluşturulur; dağıtım bitince uygulama önbelleği geçersiz kılınır ve sayfalar production veritabanından yeniden oluşturulur (eski/örnek içerik yayında kalmaz).

**GHCR paket görünürlüğü:** İlk `images` çalıştırmasından sonra GitHub → Packages altında `webtasarimajansi-web` ve `webtasarimajansi-tools` görünür. Public bırakılabilir (kaynak kod zaten public; imajlarda sır yoktur, sırlar çalışma zamanında `.env` ve veritabanından gelir). Private yapılırsa sunucudaki `.env` içine `GHCR_USER` ve yalnızca `read:packages` yetkili bir `GHCR_TOKEN` girilir; kimlik bilgisi yalnızca `/opt/mcht/webtasarimajansi/.docker` altında tutulur.

**Günlük geliştirme**

```bash
git pull
# kod değişikliği
npm run lint && npm run typecheck && npm test
git add -A && git commit -m "…"
git push            # main'e push → test → build → VPS dağıtımı → sağlık kontrolü (otomatik)
```

Pull request'lerde yalnızca test/build çalışır; dağıtım yalnızca `main`'e push'ta ve tüm testler geçtiğinde yapılır. Aynı anda tek dağıtım (Actions `concurrency` + sunucuda `flock` kilidi).

**GitHub Secrets** (Settings → Secrets and variables → Actions; `production` environment'ı da kullanılabilir):

| Secret | Değer |
|---|---|
| `VPS_HOST` | sunucu IP'si (değer yalnızca GitHub Secrets'ta) |
| `VPS_USER` | SSH kullanıcısı |
| `VPS_PORT` | `22` |
| `VPS_PROJECT_PATH` | `/opt/mcht/webtasarimajansi` (boşsa varsayılan) |
| `VPS_SSH_KEY` | dağıtım için özel SSH anahtarı (yalnızca bu amaçla üretilmiş; README'ye/repoya yazılmaz) |
| `VPS_KNOWN_HOSTS` | sunucu parmak izi: `ssh-keyscan -p <port> <sunucu>` çıktısı (ortadaki adam saldırısına karşı zorunlu) |

**Dağıtım anahtarı:** Settings → Secrets and variables → Actions → *Variables* → `DEPLOY_ENABLED=true`. Tanımlı değilken `main`'e push yalnızca test ve build çalıştırır; sunucu hazırlanmadan dağıtım denenmez.

Uygulama sırları (Anthropic, Search Console OAuth, SMTP, Bing/IndexNow) GitHub'a **girmez**; production'da yönetim panelinden girilir ve veritabanında şifreli saklanır. Sunucudaki `.env` (veritabanı şifresi, `APP_SECRET`, ilk yönetici şifresi) Git'ten gelmez, sunucuda kalır.

**VPS'in ilk hazırlığı** (bir kez; aynı sunucudaki diğer projelere dokunulmaz):

```bash
# 1) Sunucuda salt-okunur GitHub deploy key (repo → Settings → Deploy keys; yazma izni YOK)
ssh-keygen -t ed25519 -N "" -f /root/.ssh/webtasarimajansi_github -C webtasarimajansi-github
printf 'Host github-webtasarimajansi\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/webtasarimajansi_github\n  IdentitiesOnly yes\n' >> /root/.ssh/config
# 2) Kodu al
git clone git@github-webtasarimajansi:<kullanıcı>/<repo>.git /opt/mcht/webtasarimajansi
cd /opt/mcht/webtasarimajansi
# 3) Production .env (sırlar sunucuda üretilir) — sonra SEED_ADMIN_PASSWORD girin
bash deploy/init-env.sh && nano .env
# 4) İlk dağıtım, Nginx + SSL, günlük yedek
./scripts/deploy.sh
bash deploy/install-nginx.sh      # DNS kontrolü, nginx -t, certbot webroot, nginx -t, reload
bash deploy/install-cron.sh
# 5) GitHub Actions'ın bağlanacağı anahtarın public kısmı authorized_keys'e eklenir
```

**Manuel dağıtım** (sunucuda): `cd /opt/mcht/webtasarimajansi && ./scripts/deploy.sh` — Actions ile aynı adımlar, aynı kilit.

**`scripts/deploy.sh` güvenceleri**
- Yalnızca `*/webtasarimajansi` kökünde ve `docker compose -p webtasarimajansi -f deploy/docker-compose.yml --env-file .env` ile çalışır; `down`, `down -v`, volume silme, `git clean` yoktur.
- Sunucuda imaj derlemez; yalnızca `ghcr.io/mcht54/webtasarimajansi-{web,tools}:<commit>` indirir, imajdaki `org.opencontainers.image.revision` etiketini commit ile karşılaştırır. Boş disk `MIN_FREE_GB`'ın (varsayılan 3) altındaysa başlamaz. Eski imajlardan yalnızca bu projeninkileri siler (şimdiki ve önceki sürüm korunur).
- Diğer projelerin container/network/volume/compose durumu öncesi–sonrası karşılaştırılır (`deploy/snapshots/`).
- Migration'dan önce veritabanı yedeği (`backups/`, varsayılan 7 gün; `BACKUP_RETENTION_DAYS`).
- Yeni imajlar eski container'lar çalışırken derlenir; geçişte yalnızca container'lar yeniden oluşturulur (birkaç saniyelik kesinti).
- Başarısız sayılanlar: `/health` 200 değil, veritabanı bağlantısı yok, `/`, `/sitemap.xml`, `/robots.txt` 200 değil, container çalışmıyor veya yeniden başlıyor (crash loop), HTML'de yerel adres. Bu durumda önceki imajlar (`:previous`) ve önceki commit geri yüklenir.
- Veritabanı otomatik geri alınmaz: migration'lar yalnızca ileri ve eklemelidir (veri silmez); gerekirse `backups/` altındaki yedekten elle dönülür.
- Dağıtım geçmişi: `deploy-history.log`, son başarılı sürüm: `.last-successful-deploy`.

## Production dağıtımı (VPS, diğer projelerden yalıtılmış)

Hedef: `/opt/mcht/webtasarimajansi`, Compose projesi `webtasarimajansi`. Aynı sunucudaki başka projelerin dizinine, container/network/volume'lerine, `.env`'ine, Nginx bloğuna ve sertifikasına dokunulmaz.

| Servis | Container | Not |
|---|---|---|
| Web (Next.js) | `webtasarimajansi-web` | yalnızca `127.0.0.1:3400` (host Nginx) |
| PostgreSQL 16 | `webtasarimajansi-db` | host portu yok, `webtasarimajansi-db-network` (internal) |
| SEO ajanı worker | `webtasarimajansi-worker` | kuyruğu işler (retry, kurtarma, kilit) |
| Zamanlayıcı | `webtasarimajansi-scheduler` | işleri kuyruğa koyar; internete çıkışı yok |
| migrate / builder | tek seferlik (`--profile ops`) | migration+seed / DB'ye bağlı üretim derlemesi |

Redis kullanılmıyor (kuyruk ve kilitler PostgreSQL'de). Volume'ler: `webtasarimajansi_postgres_data`, `webtasarimajansi_media`. Tüm servisler `restart: unless-stopped`, bellek sınırlı.

**Adımlar** (DNS A kaydı `webtasarimajansi.net` ve `www` → sunucu IP'si olduktan sonra):

```bash
# Olağan yol: GitHub (yukarıdaki CI/CD). GitHub olmadan acil durum: deploy/push.sh kullanıcı@SUNUCU (rsync)
ssh kullanıcı@SUNUCU
cd /opt/mcht/webtasarimajansi
cp deploy/.env.production.example .env && nano .env   # yalnızca SEED_ADMIN_PASSWORD (diğer sırlar otomatik)
./scripts/deploy.sh                    # yedek → migrate → derleme → servisler → /health → diğer projeler değişmedi mi?
bash deploy/install-nginx.sh           # DNS kontrolü → nginx -t → sertifika (certbot webroot) → nginx -t → reload
bash deploy/install-cron.sh            # günlük DB yedeği → /opt/mcht/webtasarimajansi/backups (7 gün)
```

`deploy.sh` diğer projelerin container/network/volume/compose durumunun öncesi–sonrası anlık görüntüsünü `deploy/snapshots/` altına yazar ve fark varsa hata verir. `install-nginx.sh` `nginx -t` başarısızsa reload etmez ve dosyayı eski hâline döndürür.

**Panelden yönetilen entegrasyonlar** (SSH gerekmez): Ayarlar → Entegrasyonlar → *Google Search Console* (OAuth: istemci kimliği/sırrı, "Bağla", mülk seçimi, yeniden bağlan, bağlantıyı kes) ve *Yapay zekâ* (Anthropic anahtarı şifreli, maskeli, "Bağlantıyı test et"); Ayarlar → Bildirimler (SMTP host/port/kullanıcı/şifre/şifreleme/gönderen adı-e-postası, test e-postası). Bing doğrulaması ve IndexNow Entegrasyonlar sekmesinde. Sağlık: `GET /health`.

## SEO ajanı (otonom mod)

Döngü: **ÖLÇ → ANALİZ → FIRSAT → DEĞİŞİKLİK ÜRET → KALİTE KAPISI → YAYINLA → SITEMAP → INDEXNOW → SONUCU İZLE → RAPORLA**. Ayarlar → SEO Otopilot'tan mod seçilir:

| Mod | Davranış |
|---|---|
| OBSERVE | Yalnızca ölçer ve raporlar; işlem oluşturmaz |
| ASSIST | Önerileri ve taslakları hazırlar; onayla uygulanır |
| AUTONOMOUS (varsayılan) | Güvenli SEO işlemlerini, doğrulanmış içerik iyileştirmelerini ve kalite kapısını geçen yeni sayfaları kendisi uygular/yayınlar |

**Anahtar kelime ajanı** (`agent-keywords.ts`): her kelime Search Console'dan ölçülür (28 gün / önceki 28 gün; gösterim, tık, CTR, pozisyon, trend, hedef URL, niyet, konum) ve karar `Keyword.decision`'a yazılır. 1–3 koru · 4–10 (≥20 gösterim) title/meta/içerik/iç link/schema işlemi · 11–30 (≥40 gösterim) içerik genişletme · uygun URL yok → sayfa karar motoru. Veri yoksa karar verilmez.

**Sayfa karar motoru** (`page-decision.ts`): uygun sayfası olmayan gerçek sorgular niyete göre kümelenir (konum → konu kuralı → kelime örtüşmesi); keyword başına sayfa açılmaz. Kararlar: `PAGE_NOT_NEEDED`, `CANNIBALIZATION` (insan), `FILL_LOCATION_DRAFT`, `NEW_PAGE` (bilgi niyetli rehber), `HUMAN_REQUIRED` (yeni hizmet/sektör).

**Yeni sayfa motoru** (`new-page.ts`): yalnızca doğrulanmış olgularla yapay zekâ içeriği → TASLAK → gelen iç link → kalite kapısı (benzersiz title/meta/H1, niyet uyumu, kelime eşiği, özgünlük, stuffing, cannibalization, iç/dış link, canonical, breadcrumb, schema, görsel alt, `[DOĞRULANMALI]`, yer tutucu, sahte iddia/sayı/yer adı; lokasyonda lokasyon kapısı) → AUTONOMOUS'ta yayın → yayın sonrası doğrulama (sitemap uygunluğu, canonical, schema, analiz, denetim logu, Search Console deneyi) → IndexNow. Kritik hata varsa sayfa TASLAK kalır. Haftalık yeni sayfa sınırı (varsayılan 3). Geri alma sayfayı silmez, taslağa alır.

**Zamanlayıcı + kuyruk + worker** (`scheduler.ts`, `jobs/runner.ts`): Türkiye saatiyle 02:00'den sonra veri hattı (`daily`: GSC, sıralama, indeks, tarama, analiz, fırsatlar, IndexNow, sitemap) → ajan (`autopilot`, veri hattı bitmeden başlamaz) → günlük rapor (`daily-email`, varsayılan 09:00) → haftalık rapor → saatlik alarmlar. İşler veritabanı kuyruğunda atomik sahiplenilir (iki worker aynı işi alamaz), hata olursa 5/10 dk geri çekilmeyle en çok 3 deneme, yarıda kalan iş 2 saat sonra kurtarılır. Varsayılan olarak uygulama sürecinde çalışır (instrumentation → `/api/internal/tick`, 2 dk'da bir); istenirse ayrıca `npm run worker`. Sinyaller: `AlarmState` `heartbeat:scheduler` / `heartbeat:worker`.

**Docker:** zamanlayıcı ve worker konteynerin içinde kendiliğinden çalışır; ek servis gerekmez. `SITE_URL` derleme ve çalışma zamanında aynı olmalı (sitemap derlemede önceden oluşturulur).

**Sağlık skoru (deterministik):** her kontrolün sabit ağırlığı var (`CHECK_WEIGHTS`, `health.ts`); PASS tam, WARNING yarım, FAIL sıfır; veri olmayan kontroller paydadan çıkarılır. Skor = 100 × kazanılan / mümkün; panelde her düşüş hangi kontrolden geldiğiyle gösterilir.

**Güvenlik sınırı:** ajan kodu kullanıcı, oturum, sır, ayar veya şifre tablolarına yazmaz; sayfaları yalnızca `savePage` (sürüm geçmişi + alan logu) ile değiştirir — testle korunur.

**Yönetim girişi:** e-posta veya kullanıcı adı (`User.username`). Üretimde ilk yönetici `SEED_ADMIN_EMAIL` / `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` ile oluşturulur; şifre kaynak koda yazılmaz.

**Favicon:** `npm run icons` marka ikon setini tek SVG kaynaktan üretir (favicon.ico 16/32/48, apple-icon 180, manifest 192/512); harici servis yok.

## SEO büyüme döngüsü (Search Console verisiyle)

Search Console → günlük saklama (sorgu, sayfa, cihaz, ülke, tarih; ilk senkronda ~16 ay) → **Hızlı Kazanımlar**
(ilk sayfa, içerik, CTR, performans düşüşü, yükselen sorgu, cannibalization — "yüksek gösterim" eşiği sitenin kendi
medyanı) → **Lokasyon Talebi** (sorgulardan il/ilçe eşleşmesi, sayfa durumu, indeks, içerik kalitesi, fırsat skoru)
→ **Fırsat motoru** → kontrol merkezindeki **Bugün ne yapmalıyım?** (en fazla 10 görev) → **DETAY** → **ÇÖZÜM ÖNER**
(mevcut/önerilen title-meta-H1, içerik eksikleri, başlık, SSS, iç link, schema) → **Önizle / Düzenle / Uygula / Reddet**
→ sürüm geçmişi → **Geri al**. Search Console bağlı değilken tüm bu ekranlar "Henüz veri yok" gösterir; nüfus veya
başka bir veri arama talebi yerine kullanılmaz.

- **Lokasyon kalite kapısı:** il/ilçe/kombinasyon sayfası benzersiz title/meta/H1, yeterli ve özgün içerik, editörün
  girdiği doğrulanmış yerel not, işletme bilgisi, hizmet–lokasyon ilişkisi, iç link, breadcrumb, canonical, schema,
  `[DOĞRULANMALI]`/yer tutucu yokluğu ve doorway riski kontrollerinden kritik biri başarısızsa **yayınlanamaz**
  (sunucu tarafında; editör, AI onayı ve sürüme dönüş dahil).
- **Sürüm güvenliği:** her kayıttan önce sürüm geçmişi mevcut durumla karşılaştırılır; fark varsa önce gerçek durum
  "Değişiklik öncesi durum" olarak saklanır — geri alma her zaman değişiklik öncesine döner.
- **IndexNow:** her gönderimin gerçek HTTP sonucu Sitemap ekranında; 429/5xx için yeniden deneme planlanır.
- **AI Görünürlüğü ekranı:** robots.txt'nin ChatGPT/Perplexity/Claude/Gemini/Copilot botlarına gerçek izinleri
  (ayrıştırılarak), llms.txt denetimi, içerik hazırlığı.

## Otonom SEO motoru (Otopilot)

Yönetim → **SEO Otopilot**. Her hafta (Ayarlar → SEO E-posta'daki gün/saat, varsayılan Pazar 23:00, Türkiye saati) 23 aşamalı döngü çalışır:
ANALİZ (GSC senkronu, kelime keşfi, kümeleme, niyet, sayfa performansı, tarama, içerik, iç link, lokasyon talebi, trend + deney ölçümü) →
KARAR (fırsat üretimi, 0–100 skor, en değerli 10 işlem, çözüm üretimi, risk sınıfı) →
UYGULA (kalite kapısı, güvenli otomatik uygulama, sitemap, IndexNow) → ÖLÇ/ÖĞREN (deney kaydı, anlık görüntü) → rapor + e-posta.

- **Veri kaynakları:** yalnızca Search Console ve sitenin kendisi. Google SERP kazıma yok. Veri yoksa "Henüz gerçek Google verisi alınamadı." yazılır; skorun GSC bileşenleri 0 olur.
- **Keşif:** çekirdek havuz (`src/lib/autopilot/discovery.ts`) + GSC'de ≥5 gösterimli, bir konu/lokasyon kümesine düşen gerçek sorgular (`source=discovered`).
- **Risk sınıfları:** OTOMATİK (title, meta, iç link, kırık link), KONTROLLÜ (içerik genişletme — yalnızca yapay zekâ anahtarı varken, sayfadaki bilgiyle, ≤%40 büyüme, yeni sayı/dış link yok), İNSAN ONAYI (yeni/lokasyon sayfası, büyük içerik değişikliği, yönlendirme, canonical, NOINDEX, URL, indekslenmeyen sayfa, cannibalization). Haftalık otomatik değişiklik sınırı: 10 (ayarlanabilir).
- **Kalite kapısı** (`qc.ts`): title 30–60 karakter + odak sorgu + benzersiz, meta 110–160, [DOĞRULANMALI]/yer tutucu/"en iyi–garanti" yok, sayfada olmayan rakamlı iddia yok, anchor doğal ve hedefin kendi konusu.
- **Sürüm ve geri alma:** her değişiklik `savePage` ile sürüm geçmişine + alan loguna yazılır ("SEO Otopilot"). Geri alma alan bazında (iç linkte bağlantı bazında); alan sonradan elle değiştiyse reddedilir.
- **Deney/öğrenme:** taban = uygulama öncesi 28 gün; 7. gün ara, 28. gün nihai ölçüm (+3 gün GSC gecikmesi), en az 100 gösterim. Sonuç "Gözlenen değişim" — nedensellik iddiası yok. İşlem türlerinin başarı oranı ((olumlu+1)/(toplam+2)) ≥3 sonuçtan sonra skoru 0,7–1,3 ile çarpar.
- **E-posta:** haftalık rapor + kritik alarmlar (tıklamada ≥%40 düşüş, indekslenebilirlik, sitemap, GSC bağlantısı, tarayıcı). SMTP Ayarlar → SEO E-posta'dan; şifre şifreli saklanır, gösterilmez. SMTP yoksa rapor üretilir ve panelde okunur (`EmailLog: not_configured`). `EMAIL_TRANSPORT=log` gönderimi kapatır (testler).
- **Zamanlayıcı:** `src/instrumentation.ts` 10 dakikada bir `/api/internal/tick` çağırır (HMAC token): günlük iş (04:00 sonrası, son 20 saatte çalışmadıysa — cron ile çakışmaz), haftalık döngü, saatlik alarm. Harici cron kullanılacaksa `AUTOPILOT_SCHEDULER=off` ve `npm run job -- autopilot|alarms`.

### SEO sağlık özeti (10 kategori)

Otopilotun 21. aşamasında hesaplanır (`src/lib/autopilot/health.ts`), `/yonetim/autopilot` ekranında ve haftalık e-postada "SEO Sağlık Özeti" olarak görünür: Teknik SEO, İndekslenebilirlik, İçerik, İç linkler, Yapılandırılmış veri, Performans, Yerel SEO, Google Search, Bing, AI görünürlüğü. Her kontrol PASS / WARNING / FAIL / NOT VERIFIABLE döner; ölçülemeyen şey PASS sayılmaz, "veri yok" skor üretmez. Kaynaklar canlı HTTP (robots, sitemap, llms), site analizi, son tarama, Search Console ve ayarlardır. Core Web Vitals alan verisi, Bing dizin verisi ve AI alıntı verisi bağlı olmadığı için bu kontroller NOT VERIFIABLE'dır.

### Denetim korumaları

- **Kanonik alan adı:** `www` varyantı ve yönlendiricinin bildirdiği `http` istekleri `SITE_URL`'ye 301 (`src/lib/routing/host.ts`); yerel/iç adreslerde devre dışı.
- **IndexNow:** günlük iş yalnızca alan değişikliği kaydı (SeoChangeLog) olan URL'leri gönderir; analiz yazımları "değişiklik" sayılmaz, başarıyla bildirilmiş URL tekrar gönderilmez. Yayından kaldırma ve URL değişikliği (eski adres) de bildirilir.
- **İş kilidi:** `runJob` kontrol + kaydı Postgres advisory kilidiyle atomik yapar (iki sunucu / cron + panel aynı işi aynı anda çalıştıramaz). Otopilot işlemleri "planned → applying" sahiplenmesiyle tek kez uygulanır.
- **Elle düzenleme koruması:** bir alan son 30 günde elle düzenlendiyse otopilot üzerine yazmaz; öneri onaya düşer.
- **İçerik kalite kapısı:** sayfada olmayan müşteri/referans/yorum/ödül/deneyim iddiası, sayfada geçmeyen il adı, mevcut içeriği tekrar eden veya başka sayfaya çok benzeyen bölüm, %3 üstü kelime yoğunluğu reddedilir. Konumlu sorgular genel sayfanın title/meta'sına yazılmaz (lokasyon fırsatı olarak onaya gider).
- **Tarih doğruluğu:** yayın tarihi elle geriye atılmaz; schema `dateModified` içerik değişim zamanıdır.

## Entegrasyonlar

- **Google Search Console:** Ayarlar > SEO Entegrasyonları. Google Cloud'da servis hesabı oluşturun,
  Search Console API'yi etkinleştirin, JSON anahtarını yapıştırın, servis hesabının e-postasını Search
  Console'da mülke kullanıcı olarak ekleyin, "Bağlantıyı test et". Anahtar AES-256-GCM ile şifreli saklanır.
  Sıralama pozisyonları Search Console'un günlük ortalama pozisyonudur (canlı SERP değildir).
- **GA4 / GTM:** Ayarlar'dan kimlik girilir; script'ler sayfa yüklendikten sonra yüklenir.
- **AI asistanı (isteğe bağlı):** `ANTHROPIC_API_KEY` ortam değişkeni + Ayarlar'da sağlayıcı "Anthropic".
  Varsayılan model `claude-opus-5`; reddetme durumunda sunucu tarafı yedek model (`fallbacks: "default"`)
  açıktır. Anahtar yoksa kural tabanlı öneriler üretilir. Hiçbir öneri onaysız yayınlanmaz.

## Güvenlik

scrypt ile şifre özeti · httpOnly + SameSite çerez, DB'de yalnızca token özeti · 12 saat hareketsizlik /
7 gün mutlak oturum süresi · 5 hatalı girişte 15 dk hesap kilidi + IP başına hız sınırı · Server Action
köken (CSRF) kontrolü · zod ile girdi doğrulama · Prisma (parametreli sorgu) · Markdown'da ham HTML ve
`javascript:` linkleri etkisiz · güvenlik başlıkları (HSTS, nosniff, frame, referrer) · denetim ve SEO değişiklik
logları · roller: Yönetici / Editör / SEO Uzmanı (teknik SEO alanları yalnızca SEO yetkisiyle).

## Üretime alma

```bash
docker build --build-arg DATABASE_URL=... --build-arg SITE_URL=https://webtasarimajansi.net \
  --build-arg APP_SECRET=... -t webtasarimajansi .
docker run -e DATABASE_URL=... -e SITE_URL=https://webtasarimajansi.net -e APP_SECRET=... \
  -v wta-media:/app/storage/media -p 3300:3300 webtasarimajansi
```

- `SITE_URL` kanonik adrestir: canonical, sitemap ve schema URL'leri buradan üretilir.
- Migration: `npx prisma migrate deploy` (yeni sürümden önce). Medya klasörünü kalıcı birimde tutun.
- Ters vekil (nginx/Caddy) `X-Forwarded-For` başlığını iletmeli (hız sınırı ve 404 logu için).

## Bilinen güvenlik notu

`npm audit` Prisma CLI paketinin bağımlılıklarında (`deepmerge-ts`, `mysql2`) yüksek önemli uyarı gösterir. Bu paketler
yalnızca geliştirme/migration aracında bulunur, üretim paketinde (`.next/standalone`) yoktur; kararlı bir Prisma 7
düzeltmesi yayımlanınca güncellenmelidir.

## Bilinçli olarak yapılmayanlar / sınırlar

- Rakip analizinde trafik, keyword ve görünürlük verisi yok: üçüncü taraf sağlayıcı (Ahrefs/Semrush/DataForSEO)
  bağlanmadan bu veriler bilinemez; panel "Doğrulanamadı" gösterir.
- Canlı SERP sıralama sağlayıcısı bağlı değil; pozisyonlar Search Console'dan gelir.
- Core Web Vitals saha verisi (CrUX) çekilmiyor; crawler sunucu yanıt süresi ve HTML boyutunu ölçer.
- Çerez onayı (KVKK) bandı yok; GA/GTM etkinleştirmeden önce hukuki gereksinimi değerlendirin.
- KVKK aydınlatma metni genel bir şablondur (NOINDEX); yayından önce hukukçu kontrolü gerekir.
