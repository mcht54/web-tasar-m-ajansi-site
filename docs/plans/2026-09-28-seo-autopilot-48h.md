# SEO otopilot: 48 saatlik onay, içerik/rakip/hizmet/lokal/performans motorları, ana sayfa

Tarih: 2026-09-28 · Dal: `feat/seo-autopilot-48h` · Push/deploy yok.

## A) Mevcut mimari (özet)

- Tek içerik tablosu `Page`; her kayıt `savePage` üzerinden geçer: yetki, doğrulama, alan logu
  (`SeoChangeLog`), sürüm (`PageVersion`), yayın kapısı (`[DOĞRULANMALI]`, yer tutucu, lokasyon
  kapısı), önbellek tazeleme (`refreshPublic`).
- Otopilot (`src/lib/autopilot/*`): 23 aşamalı döngü → aday işlemler (`decide.ts`) → skor → risk
  sınıfı (AUTO / CONTROLLED / HUMAN) → `AutopilotAction` → `executeAction` (kalite kapısı `qc.ts`)
  → deney + öğrenme. Geri alma alan bazında (`rollbackAction`).
- Kuyruk: `JobRun` (queued → running → ok/error, 3 deneme, çöken iş kurtarma, advisory lock).
  Zamanlayıcı `dueJobs()`; uygulama içinde `/api/internal/tick`, production'da ayrı
  `scheduler` + `worker` konteynerleri (`scripts/worker.ts`).
- İkinci öneri sistemi: `AiSuggestion` (AI Asistanı / ÇÖZÜM ÖNER), elle onaylanır.
- Rakip analizi: yalnızca herkese açık veri profili; fırsat üretmiyor.

Dev DB gerçek durumu (2026-09-28): 33 yayında + 1055 taslak sayfa; Search Console bağlı değil
(GSC satırı 0); yapay zekâ anahtarı yok; rakip kaydı yok; işletme adı boş; `business.services` boş.

## B) Sorunlar

1. **Uygula/Onayla gerçekte uygulamıyor** (aşağıda C).
2. Öneriler üç ayrı yerde (Otopilot "İnsan gerektirenler", SEO Fırsatları, AI Asistanı); süre,
   kaynak, risk, önce/sonra tek yerde görünmüyor.
3. Öneri üretildiğinde uygulanacak değer çoğu zaman belli değil (içerik uygulama anında
   üretiliyor) → kullanıcı neyi onayladığını göremiyor.
4. "Otomatik uygula" AUTONOMOUS modda anında oluyor; bekleme penceresi yok.
5. Aynı öneri için mükerrer koruma yalnızca hafta içi başlık eşleşmesi; tekrar tekrar başarısız
   olan işlem için soğuma yok.
6. Rakip analizi fırsat üretmiyor; hizmet / ilçe önceliklendirme motoru yok; performans ölçümü
   yalnızca yanıt süresi.

## C) Uygula neden çalışmıyordu

Kanıt (dev DB): bekleyen 11 öneri de `CONTENT` türünde, hiçbirinde uygulanacak bölüm yok
(`proposal.section` boş; not: "Yapay zekâ anahtarı yok"). Akış:

- `approveAction` → `CONTENT` + bölüm yok → son dal: durum `approved`, sayfaya dokunulmaz, dönüş
  `{status:"needs_approval", note:"Onaylandı; değişikliği sayfa editöründen yapın"}`.
- `approveAutopilotAction` bu notu **`?ok=` (yeşil başarı bildirimi)** olarak gösterir. Kart
  "Onay bekleyen" listesinden kaybolur (`approved` hiçbir sekmede listelenmez) → kullanıcı
  "uygulandı" sanır, sayfa değişmez.
- Aynı kalıp: `skipped` (kalite kapısını geçen title yok) ve `INTERNAL_LINK` onayı da yeşil
  mesajla döner.
- AI Asistanı "Uygula": önerilen değerler mevcutla aynıysa `savePage` değişiklik üretmez
  (`changed=[]`) ama öneri yine `APPROVED` / "Uygulandı" olur. Dev DB'deki 2 öneri tam böyle.

Düzeltme ilkesi: **uygulanabilir öneri = somut `proposedChanges` (alan → yeni değer)**. Değer
yoksa öneri "Uygulanamaz — ön koşul eksik" (`blocked`) durumunda gösterilir, Uygula düğmesi ve
geri sayım olmaz. Uygulama sonrası veritabanından tekrar okunarak doğrulanır; değişiklik yoksa
hata döner, başarı mesajı yalnızca `applied` için.

## D) 48 saatlik yaşam döngüsü

`AutopilotAction` genişletilir (yeni tablo yok; yalnızca eklemeli migration):
`category, source, riskLevel, expiresAt, autoApply, proposedChanges, beforeSnapshot,
afterSnapshot, rejectedAt, rollbackAvailable, appliedVia, decidedBy, fingerprint, validation,
attempts`; `runId` isteğe bağlı olur (rakip/performans taramasından gelen öneriler).

Durumlar: `pending_approval` → (`applying`) → `applied` | `failed` | `rejected` | `rolled_back`;
`blocked` (ön koşul eksik); eski `planned/needs_approval/approved/skipped` okunmaya devam eder.

- Oluşturma: `expiresAt = createdAt + 48 saat` (ayar: `approvalWindowHours`).
- `autoApply = true` yalnızca izinli tür + risk LOW/MEDIUM + somut değişiklik varsa.
- Yasak türler (URL, yönlendirme, index/noindex, canonical, robots, kullanıcı, sır, DNS, hosting,
  ödeme, altyapı, silme): `riskLevel=HIGH/CRITICAL`, `expiresAt=null`, asla otomatik uygulanmaz.
- Zamanlayıcı işi `auto-apply-proposals` (15 dk): süresi dolan uygun önerileri sırayla uygular.
- Uygulama hattı (manuel ve otomatik aynı): doğrulama (tür/risk/eskime: sayfa öneriden sonra
  değiştiyse iptal) → anlık görüntü → uygula (`savePage`) → DB'den tekrar okuma testi → SEO
  doğrulama (analiz, schema, indekslenebilirlik gerilemesi) → tarama kontrolü (HTTP 200 +
  yeni değer HTML'de; sunucu yoksa "doğrulanamadı") → geri alma noktası. Herhangi bir adım
  başarısızsa otomatik geri alma + `failed`. Her adım `validation` + `AuditLog`.
- Mükerrer koruma: `fingerprint` (tür + sayfa + alan + değer özeti). Bekleyen/uygulanmış/30 gün
  içinde reddedilmiş aynı öneri yeniden üretilmez; aynı tür+sayfa 14 günde 2 kez başarısızsa
  soğumaya girer.

## E) Motorlar

- **İçerik**: ince içerikli sayfalar için bölüm önerisi, öneri anında üretilir (yapay zekâ +
  kalite kapısı: benzerlik, stuffing, yeni sayı/iddia/yer adı yok). Anahtar yoksa `blocked`.
  Kural tabanlı içerik üretimi yapılmaz (uydurma/şablon riski).
- **Rakip**: herkese açık sayfalardan konu kapsamı (hizmet konusu sınıflandırma), içerik derinliği,
  başlık yapısı, schema, CTA/dönüşüm öğeleri, yerel sinyaller (LocalBusiness, adres, harita,
  işletme profili bağlantısı), sosyal bağlantılar, güncellik (sitemap lastmod), teknik (TTFB,
  HTML/JS/CSS boyutu). Görünürlük/keyword/backlink: sağlayıcı olmadan "Doğrulanamadı".
  Çıktı: "rakipte var, bizde yok / bizde zayıf" fırsatları → öneri.
- **Hizmet**: aday hizmet kataloğu × mevcut kapsam × cannibalization × GSC × rakip sinyali ×
  ticari niyet. Hizmetin gerçekten verildiği `business.services` ile doğrulanmadıkça öneri
  `blocked` (olmayan hizmet için sayfa açılmaz).
- **Lokal**: 973 ilçe için öncelik skoru (nüfus, il nüfusu/büyükşehir, GSC talebi, mevcut sayfa,
  hizmet alanı). Ölçülemeyen kriterler (işletme yoğunluğu, rekabet) skora katılmaz, "doğrulanamadı"
  olarak gösterilir. Haftalık en fazla N ilçe önerisi; mevcut lokasyon kalite kapısı aynen geçerli.
- **Performans**: sayfa başına TTFB, HTML/JS/CSS/görsel/font bayt, üçüncü taraf script, lazy
  loading, görsel boyut özniteliği; tarayıcı varsa laboratuvar LCP/CLS (INP laboratuvarda
  ölçülemez → doğrulanamadı). Otomatik uygulanan her değişiklikten sonra ilgili sayfa yeniden
  ölçülür; kötüleşme eşiği aşılırsa geri alınır. Kod düzeyindeki optimizasyonlar çalışma anında
  "otomatik uygulanamaz" — bunlar geliştirme işi olarak raporlanır.

## F) Ana sayfa

Sunucu tarafında üretilen içerik (H1/giriş/gövde/SSS veritabanından), yalnızca CSS animasyon +
küçük bir istemci bileşeni (IntersectionObserver ile açığa çıkma, sayaç). JS kapalıyken tüm içerik
görünür (`.js` sınıfı yoksa animasyon başlangıç durumu uygulanmaz); `prefers-reduced-motion`
desteklenir. Sahte istatistik yok: sayılar veritabanından canlı (hizmet/sektör/rehber sayısı,
sitenin kendi ölçülen SEO skoru) ya da Google'ın yayımladığı eşikler (açıkça etiketli).
Title, meta, canonical, schema, OG, sitemap değişmez; testle korunur.

## Commit sırası

1. fix: proposal apply pipeline · 2. feat: 48h approval and auto apply · 3. feat: content
autopilot · 4. feat: competitor intelligence · 5. feat: service and local SEO expansion ·
6. feat: performance autopilot · 7. feat: homepage creative redesign · 8. feat: integrated seo
autopilot
