import type { SeedPage } from "./types";

// Hizmet sayfaları. Her sayfa farklı bir arama niyetine hizmet eder:
//  web-tasarim            → genel hizmet (ana kategori, il/ilçe sayfalarının atası)
//  web-tasarim-ajansi     → ajans seçimi (karşılaştırma niyeti)
//  web-sitesi-yaptirma    → süreç / "nasıl yaptırırım" niyeti
//  web-tasarim-fiyatlari  → fiyat araştırması
//  kurumsal / e-ticaret   → site türü
//  seo / google-ads / web-yazilim → tamamlayıcı hizmetler
// Aynı kelimeyi iki sayfa hedeflemesin diye ana kelimeler bilerek ayrıştırıldı.

export const services: (SeedPage & {
  slug: string;
  serviceName: string;
  shortName: string;
  summary: string;
  sortOrder: number;
  allowLocationPages: boolean;
  showInNav: boolean;
})[] = [
  {
    slug: "web-tasarim",
    serviceName: "Web Tasarım",
    shortName: "Web Tasarım",
    summary: "Google'da bulunabilen, hızlı ve ziyaretçiyi müşteriye çeviren web siteleri.",
    sortOrder: 1,
    allowLocationPages: true,
    showInNav: true,
    path: "/web-tasarim",
    name: "Web Tasarım",
    seoTitle: "Web Tasarım | SEO Uyumlu, Hızlı ve Dönüşüm Odaklı Siteler",
    metaDescription:
      "Web tasarım sürecini arama motoru, hız ve dönüşüm odağıyla planlıyoruz. Kurumsal siteden e-ticarete, işinize uygun yapıyı birlikte belirleyelim.",
    h1: "Web Tasarım",
    intro:
      "Web tasarım, bir işletmenin internetteki vitrinini oluşturmaktan fazlasıdır: doğru kurgulanmış bir site Google'da bulunur, hızlı açılır, ziyaretçiye aradığını birkaç saniyede gösterir ve onu telefon açmaya ya da form doldurmaya yönlendirir. Bu sayfada iyi bir web sitesinin hangi parçalardan oluştuğunu ve sürecin nasıl ilerlediğini anlatıyoruz.",
    primaryKeyword: "web tasarım",
    secondaryKeywords: ["web sitesi", "mobil uyumlu", "seo uyumlu", "kullanıcı deneyimi", "hız"],
    body: `## İyi bir web tasarımı neyi çözer?

Çoğu işletme web sitesini "olması gereken bir şey" olarak görür ve site yayına girdikten sonra unutulur. Oysa site; potansiyel müşterinin sizi ilk kez değerlendirdiği yerdir. Ziyaretçi birkaç saniye içinde üç sorunun yanıtını arar:

- **Doğru yerde miyim?** Sunduğunuz hizmet ve hizmet verdiğiniz bölge ilk ekranda anlaşılmalı.
- **Güvenebilir miyim?** Gerçek iletişim bilgileri, gerçek çalışmalar, net süreç anlatımı.
- **Şimdi ne yapmalıyım?** Arama, WhatsApp, teklif formu gibi tek ve belirgin bir sonraki adım.

Bu üç soruya yanıt vermeyen bir site ne kadar şık görünürse görünsün ziyaretçiyi kaybeder.

## Tasarımdan önce: arama niyeti ve içerik mimarisi

Bir sayfanın Google'da görünmesi için önce hangi aramaya cevap verdiğinin belli olması gerekir. "Kurumsal web tasarım" arayan biriyle "web tasarım fiyatları" arayan biri aynı şeyi istemez. Bu yüzden projeye sayfa listesiyle değil, **arama niyeti haritasıyla** başlıyoruz: hangi hizmet, hangi soru, hangi bölge için ayrı bir sayfa gerektiğini belirliyor; birbirinin rakibi olacak sayfalar üretmekten kaçınıyoruz.

Bu haritadan menü yapısı, URL'ler ve iç link kurgusu çıkar. Örneğin il bazında hizmet veriyorsanız [şehirlere göre web tasarım sayfaları](/web-tasarim) ancak gerçekten o şehre özgü bilgi içerdiğinde yayına alınır; aksi hâlde aynı metnin şehir adı değiştirilmiş kopyaları oluşur ve bu, Google'ın açıkça spam saydığı bir yöntemdir.

## Hız ve Core Web Vitals

Google, sayfa deneyimini ölçerken üç metriğe bakar: en büyük içeriğin yüklenme süresi (LCP), etkileşime yanıt süresi (INP) ve sayfanın kayması (CLS). Hedeflerimiz:

| Metrik | Hedef | Neyi etkiler |
| --- | --- | --- |
| LCP | 2,5 saniyenin altı | İlk izlenim, hemen çıkma oranı |
| INP | 200 ms'nin altı | Butonların ve formların tepkisi |
| CLS | 0,1'in altı | Okurken içeriğin zıplaması |

Bunun için gereksiz eklenti ve script kullanmıyor, görselleri WebP/AVIF biçiminde ve doğru boyutta sunuyor, yazı tiplerini sayfayı bekletmeyecek şekilde yüklüyoruz.

## Mobil öncelikli tasarım

Türkiye'de web trafiğinin büyük bölümü telefondan geliyor ve Google siteleri mobil sürümüne göre değerlendiriyor. Tasarımı önce küçük ekranda kuruyoruz: başparmakla rahat tıklanan butonlar, okunaklı yazı boyutları, tek elle doldurulabilen formlar ve ekranın altında sabit duran arama/WhatsApp kısayolu.

## Süreç nasıl işler?

1. **Keşif görüşmesi:** İşinizi, müşteri profilinizi, rakiplerinizi ve hedeflerinizi konuşuyoruz.
2. **Site haritası ve içerik planı:** Hangi sayfaların neden var olduğunu birlikte netleştiriyoruz.
3. **Tasarım:** Önce mobil, sonra masaüstü; marka kimliğinize uygun ama okunabilirliği bozmayan bir arayüz.
4. **Geliştirme:** Hızlı, güvenli ve arama motorunun ilk taramada anlayabileceği HTML.
5. **Teknik SEO kontrolü:** Başlıklar, meta açıklamalar, yapılandırılmış veri, site haritası ve yönlendirmeler.
6. **Yayın ve ölçüm:** Search Console ve analitik kurulumu; ilk haftalardaki verilere göre iyileştirme.

Sürecin ayrıntılarını [web sitesi yaptırma rehberimizde](/web-sitesi-yaptirma) adım adım anlattık.

## Hangi site türü size uygun?

- Firmanızı, hizmetlerinizi ve referanslarınızı anlatacaksanız: [kurumsal web tasarım](/kurumsal-web-tasarim).
- İnternetten doğrudan satış yapacaksanız: [e-ticaret web tasarım](/e-ticaret-web-tasarim).
- Hazır sistemlerin karşılamadığı bir iş akışınız varsa: [özel web yazılım](/ozel-web-yazilim).

Maliyeti hangi kalemlerin belirlediğini merak ediyorsanız [web tasarım fiyatları](/web-tasarim-fiyatlari) sayfamıza göz atabilirsiniz.`,
    faq: [
      {
        q: "Web tasarım ile web yazılım arasındaki fark nedir?",
        a: "Web tasarım sitenin yapısını, görünümünü ve kullanıcı deneyimini kapsar. Web yazılım ise rezervasyon, üyelik, teklif hesaplama gibi özel iş akışlarının programlanmasıdır. Çoğu kurumsal sitede ikisi birlikte yürür.",
      },
      {
        q: "Web sitem Google'da hemen çıkar mı?",
        a: "Hayır. Yeni bir sitenin taranıp indekslenmesi günler, rekabetli aramalarda üst sıralara çıkması aylar sürebilir. Doğru teknik altyapı ve özgün içerik bu süreyi kısaltır ama kimse belirli bir sıralamayı garanti edemez.",
      },
      {
        q: "Mevcut sitemi yeniden tasarlarsanız sıralamalarım düşer mi?",
        a: "URL'ler değişecekse eski adreslerden yenilerine 301 yönlendirme kurulmadan yapılan yenilemeler trafik kaybına yol açar. Yenilemeden önce mevcut sayfaları ve aldıkları trafiği çıkarıp yönlendirme planı hazırlıyoruz.",
      },
      {
        q: "Siteyi kendim güncelleyebilir miyim?",
        a: "Evet. Metin, görsel, blog yazısı ve SEO alanlarını teknik bilgi gerektirmeden düzenleyebileceğiniz bir yönetim paneli teslim ediyoruz.",
      },
    ],
  },
  {
    slug: "kurumsal-web-tasarim",
    serviceName: "Kurumsal Web Tasarım",
    shortName: "Kurumsal",
    summary: "Firmanızı, hizmetlerinizi ve güven unsurlarınızı net anlatan kurumsal siteler.",
    sortOrder: 2,
    allowLocationPages: true,
    showInNav: true,
    path: "/kurumsal-web-tasarim",
    name: "Kurumsal Web Tasarım",
    seoTitle: "Kurumsal Web Tasarım | Güven Veren, Teklif Getiren Siteler",
    metaDescription:
      "Kurumsal web tasarımda hizmet sayfaları, referanslar ve teklif akışı nasıl kurgulanmalı? Firmanızı doğru anlatan, Google'da bulunan bir site planlayalım.",
    h1: "Kurumsal Web Tasarım",
    intro:
      "Kurumsal web tasarım, bir firmanın kim olduğunu, ne yaptığını ve neden tercih edilmesi gerektiğini internette tek bir yerde anlatmasıdır. İyi bir kurumsal site; satın alma sorumlusunun, bayinin ya da son kullanıcının aradığı bilgiyi bulmasını kolaylaştırır ve onu teklif istemeye yönlendirir.",
    primaryKeyword: "kurumsal web tasarım",
    secondaryKeywords: ["kurumsal web sitesi", "firma web sitesi", "referanslar", "teklif formu", "çok dilli"],
    body: `## Kurumsal site kimin için yapılır?

Kurumsal sitenin tek bir okuru yoktur. Aynı sayfayı bir potansiyel müşteri, bir iş ortağı, bir tedarikçi ve iş başvurusu yapmak isteyen biri ziyaret eder. Bu nedenle yapıyı, her ziyaretçi grubunun en kısa yoldan aradığına ulaşacağı şekilde kuruyoruz:

- **Potansiyel müşteri:** Hizmetler, çözümler, süreç ve teklif formu.
- **Kurumsal alıcı:** Belgeler, sertifikalar, kapasite ve referans projeler.
- **İş ortağı / bayi:** İletişim kanalları ve bölge bilgileri.
- **Aday çalışan:** Kariyer sayfası ve şirket kültürü.

## Bir kurumsal sitede olması gereken sayfalar

### Hizmet ya da ürün sayfaları
Her ana hizmet için ayrı bir sayfa, hem ziyaretçi hem Google için en önemli parçadır. Tüm hizmetleri tek bir "Hizmetlerimiz" sayfasına sığdırmak, her birinin ayrı ayrı aranabilirliğini ortadan kaldırır.

### Referanslar ve projeler
Kurumsal alıcılar karar vermeden önce benzer işleri görmek ister. Proje sayfalarında müşterinin sektörünü, çözülen problemi ve sonucu kısa ama somut şekilde anlatmak, genel bir logo duvarından çok daha ikna edicidir. Referansların gerçek ve izinli olması şarttır.

### Hakkımızda
"Kaliteli hizmet anlayışıyla" gibi her firmanın kullandığı ifadeler yerine kuruluş hikâyesi, ekip, üretim veya hizmet kapasitesi gibi doğrulanabilir bilgiler tercih edilmeli.

### İletişim ve teklif
Telefon, e-posta, adres, harita ve çalışma saatleri eksiksiz olmalı. Teklif formu kısa tutulmalı; ilk temasta yalnızca gerçekten gerekli bilgiler istenmeli.

## Kurumsal sitede güven unsurları

Güven, tasarımın içine gömülü küçük ayrıntılardan oluşur: güncel bir telefon numarası, gerçek bir adres, çalışan bir SSL sertifikası, KVKK aydınlatma metni, düzenli güncellenen içerik. Bunlardan biri eksik olduğunda ziyaretçi firmanın hâlâ faaliyette olup olmadığından bile şüphe edebilir.

## Çok dilli yapı

İhracat yapan veya yabancı müşterisi olan firmalar için her dilin ayrı URL'de yayınlanması ve sayfalar arasında doğru dil etiketlerinin (hreflang) kurulması gerekir. Otomatik çeviri eklentileri çoğu zaman arama motoruna ayrı sayfalar sunmadığı için bu ihtiyacı karşılamaz.

## Kurumsal sitenin SEO tarafı

Kurumsal siteler genellikle "firma adı" aramalarında çıkar ama asıl yeni müşteri, hizmet adıyla yapılan aramalardan gelir. Bu yüzden hizmet sayfalarını, müşterinin kullandığı kelimelerle yazıyor ve her birine net bir arama niyeti atıyoruz. Konuyla ilgili ayrıntıları [SEO hizmeti](/seo-hizmeti) sayfamızda bulabilirsiniz.

Sektörünüze özel ihtiyaçları görmek için [inşaat firması web tasarımı](/insaat-firmasi-web-tasarimi) veya [sanayi firması web sitesi](/sanayi-firmasi-web-sitesi) sayfalarımıza göz atabilirsiniz.`,
    faq: [
      {
        q: "Kurumsal web sitesi kaç sayfa olmalı?",
        a: "Sabit bir sayı yok. Her ana hizmetin kendi sayfası, bir hakkımızda, bir iletişim ve varsa referans/proje sayfaları temel yapıyı oluşturur. Sayfa sayısını arama niyeti belirler; içeriği olmayan sayfa eklemek fayda sağlamaz.",
      },
      {
        q: "Kurumsal sitede blog gerekli mi?",
        a: "Zorunlu değil ama müşterilerin sık sorduğu soruları yanıtlayan rehber içerikler, hizmet sayfalarının tek başına yakalayamayacağı bilgi aramalarından trafik getirir.",
      },
      {
        q: "Katalog ve teknik dokümanları siteye koyabilir miyiz?",
        a: "Evet. PDF katalogların yanında en önemli ürün bilgilerini HTML sayfa olarak da yayınlamanızı öneriyoruz; Google HTML içeriği PDF'e göre çok daha iyi anlar ve mobilde okunması kolaydır.",
      },
    ],
  },
  {
    slug: "e-ticaret-web-tasarim",
    serviceName: "E-Ticaret Web Tasarım",
    shortName: "E-Ticaret",
    summary: "Ürün, ödeme ve kargo süreçleri düşünülerek kurgulanan satış odaklı e-ticaret siteleri.",
    sortOrder: 3,
    allowLocationPages: true,
    showInNav: true,
    path: "/e-ticaret-web-tasarim",
    name: "E-Ticaret Web Tasarım",
    seoTitle: "E-Ticaret Web Tasarım | Satış Odaklı E-Ticaret Sitesi Kurulumu",
    metaDescription:
      "E-ticaret sitesi kurarken altyapı, ödeme, kargo, ürün sayfası ve SEO nasıl planlanır? Satışa odaklı e-ticaret web tasarım sürecini anlatıyoruz.",
    h1: "E-Ticaret Web Tasarım",
    intro:
      "E-ticaret web tasarımında hedef, ziyaretçinin ürünü bulup sepete eklemesi ve ödemeyi tamamlamasıdır; aradaki her gereksiz adım satış kaybıdır. Bu sayfada bir e-ticaret sitesi kurarken verilmesi gereken kararları, altyapı seçiminden ürün sayfasına kadar sırayla ele alıyoruz.",
    primaryKeyword: "e-ticaret web tasarım",
    secondaryKeywords: ["e-ticaret sitesi", "online mağaza", "ödeme altyapısı", "ürün sayfası", "sanal pos"],
    body: `## Altyapı seçimi: hazır platform mu, özel yazılım mı?

E-ticarete başlarken ilk karar altyapıdır. Üç yaygın seçenek var:

| Seçenek | Avantajı | Dikkat edilmesi gereken |
| --- | --- | --- |
| Kiralık (SaaS) platform | Hızlı başlangıç, bakım derdi yok | Aylık ücret, özelleştirme sınırı, taşınabilirlik |
| Açık kaynak (ör. WooCommerce) | Esneklik, geniş eklenti ekosistemi | Güncelleme, güvenlik ve performans bakımı sizde |
| Özel yazılım | İş akışına tam uyum | Daha yüksek başlangıç maliyeti ve süre |

Doğru seçim; ürün sayısına, varyant yapısına, entegrasyon ihtiyacına (ERP, muhasebe, pazaryeri) ve ekibinizin teknik kapasitesine göre değişir. Keşif görüşmesinde bu soruları birlikte yanıtlıyoruz.

## Kategori ve filtre yapısı

Ürün sayısı arttıkça ziyaretçinin aradığını bulması zorlaşır. Kategori ağacını müşterinin düşünme biçimine göre (örneğin kullanım alanı, beden, malzeme) kurmak gerekir. SEO açısından kritik nokta, filtre kombinasyonlarının binlerce anlamsız URL üretmesini engellemektir: yalnızca aranan kombinasyonlar (ör. "erkek deri ayakkabı") indekslenebilir sayfa olmalı, diğerleri canonical ile ana kategoriye bağlanmalıdır.

## Satış getiren ürün sayfası

Ürün sayfası e-ticaretin kalbidir. Bir ürün sayfasında şunlar bulunmalı:

- Birden çok açıdan, yakınlaştırılabilir ve hızlı yüklenen görseller
- Üretici açıklamasının kopyası değil, sizin yazdığınız özgün ürün metni
- Net fiyat, stok, kargo süresi ve iade koşulları
- Beden/ölçü tablosu gibi karar vermeyi kolaylaştıran bilgiler
- Mobilde ekranın altında sabit duran "Sepete ekle" butonu

Üretici açıklamalarını aynen kullanmak, aynı ürünü satan yüzlerce siteyle aynı metni yayınlamak demektir; Google bu durumda sizin sayfanızı öne çıkarmak için bir neden bulamaz.

## Sepet ve ödeme adımları

Ödeme adımında her ek alan, terk oranını artırır. Üye olmadan alışveriş seçeneği, otomatik adres tamamlama, taksit seçeneklerinin açıkça gösterilmesi ve güvenli ödeme sayfası (3D Secure) temel beklentilerdir. Sanal POS ve ödeme kuruluşu seçiminde komisyon oranlarının yanında paranın hesaba geçme süresini de karşılaştırmak gerekir.

## Yasal yükümlülükler

Türkiye'de e-ticaret sitelerinde mesafeli satış sözleşmesi, ön bilgilendirme formu, iade ve cayma hakkı koşulları, KVKK aydınlatma metni ve çerez politikası bulunmalıdır. Bu metinlerin işletmenize göre hukukçu tarafından hazırlanmasını öneriyoruz.

## E-ticarette SEO

Kategori sayfaları genellikle en değerli trafik kaynağıdır; ürün sayfaları ise uzun kuyruklu aramalardan gelir. Kategori sayfalarına kısa, gerçekten bilgi veren bir açıklama; ürünlere yapılandırılmış veri (Product) ve stokta olmayan ürünler için doğru bir strateji (sayfayı silmek yerine alternatif önermek) belirlemek gerekir. Ayrıntılı rehberimiz: [e-ticaret sitesi nasıl kurulur?](/blog/e-ticaret-sitesi-nasil-kurulur)

Online satışı yeni düşünüyorsanız önce [Google Ads yönetimi](/google-ads-yonetimi) ile hangi ürünlerin talep gördüğünü test etmek de akıllıca bir başlangıç olabilir.`,
    faq: [
      {
        q: "E-ticaret sitesi için şirket kurmak gerekir mi?",
        a: "Düzenli satış yapacaksanız vergi mükellefiyeti gerekir; sanal POS ve ödeme kuruluşları da başvuruda şirket ya da şahıs işletmesi bilgisi ister. Hangi yapının uygun olduğunu mali müşavirinizle konuşmanızı öneririz.",
      },
      {
        q: "Pazaryerlerinde satıyorum, ayrıca siteye ihtiyacım var mı?",
        a: "Pazaryeri müşteri getirir ama müşteri ilişkisi ve komisyon pazaryerinin kontrolündedir. Kendi siteniz tekrar eden müşterileri ve markanızı sizin elinizde tutar. İkisini stok entegrasyonuyla birlikte yürütmek yaygın bir yöntemdir.",
      },
      {
        q: "Ürünleri kendim ekleyebilir miyim?",
        a: "Evet. Ürün, varyant, stok, kampanya ve sipariş yönetimini yönetim panelinden yapabilirsiniz; toplu ürün yükleme için Excel/CSV aktarımı da kurulabilir.",
      },
    ],
  },
  {
    slug: "web-sitesi-yaptirma",
    serviceName: "Web Sitesi Yaptırma",
    shortName: "Site Yaptırma",
    summary: "Web sitesi yaptırmak isteyenler için adım adım süreç ve karar rehberi.",
    sortOrder: 4,
    allowLocationPages: true,
    showInNav: false,
    path: "/web-sitesi-yaptirma",
    name: "Web Sitesi Yaptırma",
    seoTitle: "Web Sitesi Yaptırma | Adım Adım Süreç ve Hazırlık Listesi",
    metaDescription:
      "Web sitesi yaptırmadan önce neleri hazırlamalısınız, süreç nasıl ilerler, teslimde neleri kontrol etmelisiniz? Adım adım yol haritası.",
    h1: "Web Sitesi Yaptırma: Adım Adım Süreç",
    intro:
      "Web sitesi yaptırma kararı verdiğinizde ilk soru genellikle \"nereden başlamalıyım?\" olur. Bu sayfada ilk görüşmeden yayın gününe kadar süreci adım adım anlatıyor, hazırlamanız gereken bilgileri ve teslimde kontrol etmeniz gereken noktaları listeliyoruz.",
    primaryKeyword: "web sitesi yaptırma",
    secondaryKeywords: ["web sitesi yaptırmak", "site yaptırma süreci", "alan adı", "hosting", "teslim"],
    body: `## Başlamadan önce hazırlamanız gerekenler

Görüşmeye aşağıdaki bilgilerle gelmeniz süreci ciddi şekilde hızlandırır:

1. **Amaç:** Site telefon mu getirecek, satış mı yapacak, bayilere bilgi mi verecek?
2. **Hedef müşteri:** Kim, hangi şehirde, hangi cihazdan, hangi kelimelerle arıyor?
3. **Beğendiğiniz ve beğenmediğiniz siteler:** Rakip olmaları gerekmez; nedenini not etmeniz yeterli.
4. **Mevcut materyaller:** Logo, kurumsal renkler, fotoğraflar, broşür metinleri.
5. **Alan adı ve hosting bilgileri:** Varsa kimin adına kayıtlı olduğunu kontrol edin.

## Alan adı ve hosting kimin adına olmalı?

Alan adının **firmanızın adına** kayıtlı olması ve yönetim bilgilerinin sizde bulunması gerekir. Ajans değiştirdiğinizde alan adına erişememek, yaşanabilecek en can sıkıcı sorunlardan biridir. Hosting için de aynı ilke geçerlidir: fatura ve erişim bilgileri sizde olmalı, ajans teknik yönetici olarak eklenmelidir.

## Süreç adımları

### 1. Keşif ve teklif
İhtiyaçlar konuşulur, kapsam yazılı hâle getirilir. Teklifte sayfa listesi, dahil olan özellikler, revizyon hakkı, teslim süresi ve sonrasındaki destek koşulları açıkça yer almalıdır.

### 2. Site haritası ve içerik
Hangi sayfaların olacağı ve her birinin neyi anlatacağı netleşir. İçeriği sizin mi yoksa ajansın mı yazacağı bu aşamada belirlenmelidir; gecikmelerin en sık nedeni içeriklerin geç gelmesidir.

### 3. Tasarım onayı
Önce ana sayfa ve bir iç sayfa tasarımı sunulur, onaylandıktan sonra diğer sayfalara geçilir. Tasarımı telefonda da görmeyi mutlaka isteyin.

### 4. Geliştirme ve test
Site test adresinde kurulur. Formların çalıştığı, e-postaların ulaştığı, sayfaların farklı cihazlarda düzgün göründüğü kontrol edilir.

### 5. Yayın
Alan adı yönlendirilir, SSL etkinleştirilir, eski site varsa eski URL'lerden yenilerine yönlendirmeler kurulur, Google Search Console'a site haritası gönderilir.

## Teslimde kontrol listesi

- Yönetim paneli erişiminiz ve kullanıcı yetkileriniz var mı?
- Her sayfanın başlığı ve açıklaması ayrı ayrı yazılmış mı?
- Site telefondan hızlı açılıyor mu?
- İletişim formu gerçekten size ulaşıyor mu?
- KVKK aydınlatma metni ve çerez bilgilendirmesi var mı?
- Search Console ve analitik kurulumu yapıldı mı, erişim sizde mi?
- Yedekleme nasıl ve ne sıklıkla yapılıyor?

## Ne kadar sürer, ne kadar tutar?

Süre ve maliyet; sayfa sayısına, içerik durumuna ve özel geliştirme ihtiyacına göre değişir. Hangi kalemin fiyatı nasıl etkilediğini [web tasarım fiyatları](/web-tasarim-fiyatlari) sayfasında, süreye etki eden etkenleri de [web sitesi ne kadar sürede yapılır?](/blog/web-sitesi-ne-kadar-surede-yapilir) yazımızda anlattık.

Ajans seçerken sormanız gereken sorular için [web tasarım ajansı seçimi](/web-tasarim-ajansi) sayfamıza bakabilirsiniz.`,
    faq: [
      {
        q: "Web sitesi yaptırmak için ne kadar içerik hazırlamalıyım?",
        a: "Her hizmet için müşterinin sorduğu soruları yanıtlayan birkaç paragraf, firma tanıtımı, iletişim bilgileri ve mümkünse gerçek fotoğraflar yeterli bir başlangıçtır. İçerik yazımını ajansa da bırakabilirsiniz; bu durumda bilgi toplama görüşmesi yapılır.",
      },
      {
        q: "Hazır tema ile özel tasarım arasındaki fark nedir?",
        a: "Hazır tema daha hızlı ve ekonomiktir ama binlerce sitede aynı görünümle kullanılır ve çoğu zaman gereksiz kod içerir. Özel tasarım markanıza ve içeriğinize göre kurulur, performansı daha kolay kontrol edilir.",
      },
      {
        q: "Site yayına girdikten sonra değişiklik yapabilir miyim?",
        a: "Evet. İçerik değişikliklerini yönetim panelinden kendiniz yapabilirsiniz; yeni sayfa türü veya özellik gibi geliştirmeler ayrıca planlanır.",
      },
    ],
  },
  {
    slug: "web-tasarim-ajansi",
    serviceName: "Web Tasarım Ajansı",
    shortName: "Ajans",
    summary: "Web tasarım ajansı seçerken sorulması gereken sorular ve çalışma modelimiz.",
    sortOrder: 5,
    allowLocationPages: true,
    showInNav: false,
    path: "/web-tasarim-ajansi",
    name: "Web Tasarım Ajansı",
    seoTitle: "Web Tasarım Ajansı Seçerken Sorulması Gereken 10 Soru",
    metaDescription:
      "Web tasarım ajansı seçerken sözleşme, alan adı sahipliği, SEO, destek ve teslim konularında sormanız gereken soruları ve çalışma şeklimizi anlatıyoruz.",
    h1: "Web Tasarım Ajansı Seçimi",
    intro:
      "Doğru web tasarım ajansını seçmek, sitenin görünümünden çok daha fazlasını belirler: alan adınızın kimde duracağını, sitenin Google'da bulunup bulunmayacağını ve bir sorun çıktığında muhatap bulup bulamayacağınızı. Aşağıdaki sorular, teklifleri karşılaştırırken işinizi kolaylaştıracak.",
    primaryKeyword: "web tasarım ajansı",
    secondaryKeywords: ["ajans seçimi", "sözleşme", "portföy", "destek", "seo"],
    body: `## Ajansa sormanız gereken 10 soru

### 1. Alan adı, hosting ve yönetim paneli kimin adına olacak?
Yanıt "sizin" olmalı. Ajans teknik yönetici olarak eklenebilir ama sahiplik ve fatura sizde olmalıdır.

### 2. Daha önce yaptığınız ve hâlâ yayında olan siteleri görebilir miyim?
Portföydeki sitelerin gerçekten yayında olup olmadığını, telefondan nasıl açıldığını kendiniz kontrol edin. Mümkünse ajansın müşterilerinden biriyle konuşun.

### 3. Teklif neleri kapsıyor, neleri kapsamıyor?
Sayfa sayısı, içerik yazımı, görsel temini, revizyon hakkı, eğitim ve yayın sonrası destek ayrı ayrı yazılı olmalı. "Sınırsız revizyon" gibi belirsiz ifadeler çoğu zaman sonradan anlaşmazlığa yol açar.

### 4. SEO dediğinizde tam olarak ne yapıyorsunuz?
"SEO uyumlu" ifadesi tek başına bir şey anlatmaz. Sayfa başlıkları ve açıklamaları, yapılandırılmış veri, site haritası, hız optimizasyonu, yönlendirmeler ve Search Console kurulumu teslimin parçası mı, sorun.

### 5. Siteyi hangi teknolojiyle yapıyorsunuz ve neden?
Seçilen altyapının güncellenebilir, yaygın ve başka bir ekip tarafından da devralınabilir olması önemlidir.

### 6. Site ne kadar hızlı olacak?
Hedef Core Web Vitals değerlerini ve bunların nasıl ölçüleceğini sorun. Test adresinde PageSpeed Insights ile kendiniz de ölçebilirsiniz.

### 7. Güvenlik ve yedekleme nasıl yapılacak?
SSL, güncellemeler, düzenli yedek ve bir saldırı durumunda geri dönüş planı konuşulmalı.

### 8. Yayından sonra kim destek verecek?
Destek süresi, yanıt süresi ve ücretli/ücretsiz kapsam net olmalı.

### 9. Eski sitemin Google trafiği korunacak mı?
Yenileme projelerinde eski URL'lerin listesi çıkarılmalı ve her biri yeni karşılığına 301 ile yönlendirilmeli.

### 10. Ajansla çalışmayı bıraktığımda ne olur?
Kaynak kodu, içerikler, görseller ve tüm erişimlerin size nasıl teslim edileceği sözleşmede yazmalı.

## Bizim çalışma şeklimiz

- Alan adı, hosting, Search Console ve analitik hesapları **sizin adınıza** açılır.
- Her sayfa bir arama niyetine göre planlanır; aynı kelimeyi hedefleyen, birbirinin rakibi sayfalar üretilmez.
- Şehir veya sektör sayfaları yalnızca gerçekten özgün bilgi içerdiğinde yayına alınır.
- Yönetim panelinde her sayfanın SEO durumunu, sıralama ve Search Console verilerini görebilirsiniz.
- Referans, yorum ya da işletme bilgisi uydurmuyoruz; yalnızca doğrulanabilir bilgi yayınlıyoruz.

Süreci merak ediyorsanız [web sitesi yaptırma](/web-sitesi-yaptirma) rehberine, kapsamı konuşmaya hazırsanız [teklif formuna](/teklif-al) geçebilirsiniz.`,
    faq: [
      {
        q: "Yerel bir ajansla mı çalışmalıyım?",
        a: "Yüz yüze görüşme bazı işletmeler için önemlidir ama şart değildir. Önemli olan iletişimin düzenli, kapsamın yazılı ve erişimlerin sizde olmasıdır. Yerel pazarı tanımak ise içerik ve yerel SEO tarafında avantaj sağlar.",
      },
      {
        q: "Freelancer ile ajans arasındaki fark nedir?",
        a: "Freelancer genellikle daha esnek ve ekonomiktir; ajans ise tasarım, yazılım, içerik ve SEO'yu birlikte yürütebilen bir ekip ve süreklilik sunar. Seçim, projenin kapsamına ve destek beklentinize bağlıdır.",
      },
    ],
  },
  {
    slug: "web-tasarim-fiyatlari",
    serviceName: "Web Tasarım Fiyatları",
    shortName: "Fiyatlar",
    summary: "Web tasarım fiyatlarını belirleyen kalemler ve doğru teklif karşılaştırma yöntemi.",
    sortOrder: 6,
    allowLocationPages: false,
    showInNav: true,
    path: "/web-tasarim-fiyatlari",
    name: "Web Tasarım Fiyatları",
    crumb: "Fiyatlar",
    seoTitle: "Web Tasarım Fiyatları: Maliyeti Belirleyen 8 Kalem",
    metaDescription:
      "Web tasarım fiyatları neden bu kadar farklı? Fiyatı belirleyen 8 kalemi ve teklifleri doğru karşılaştırma yöntemini sade bir dille anlatıyoruz.",
    h1: "Web Tasarım Fiyatları Nasıl Belirlenir?",
    intro:
      "Web tasarım fiyatları aynı ihtiyaç için bile ajanstan ajansa büyük farklılık gösterir. Bunun nedeni, \"web sitesi\" dendiğinde herkesin farklı bir kapsamı fiyatlamasıdır. Bu sayfada fiyatı belirleyen kalemleri tek tek açıklıyor ve teklifleri nasıl karşılaştırmanız gerektiğini gösteriyoruz.",
    primaryKeyword: "web tasarım fiyatları",
    secondaryKeywords: ["web sitesi fiyatları", "maliyet", "teklif", "bakım ücreti", "e-ticaret sitesi fiyatları"],
    body: `## Fiyatı belirleyen 8 kalem

### 1. Sayfa ve şablon sayısı
Maliyeti sayfa sayısından çok **farklı sayfa şablonu** sayısı belirler. On hizmet sayfası aynı şablonu kullanıyorsa tasarım bir kez yapılır; ama ana sayfa, hizmet, proje, blog ve iletişim sayfaları ayrı ayrı tasarlanır.

### 2. Tasarım yaklaşımı
Hazır tema uyarlaması, tema üzerinde özelleştirme ve sıfırdan özel tasarım arasında hem süre hem maliyet farkı vardır.

### 3. İçerik yazımı
Metinleri sizin sağlamanız ile ajansın araştırıp yazması arasında ciddi fark vardır. SEO odaklı içerik; anahtar kelime araştırması, rakip incelemesi ve yazım süresi gerektirir.

### 4. Görseller
Mevcut fotoğraflarınız mı kullanılacak, profesyonel çekim mi yapılacak, lisanslı görsel mi alınacak? Her birinin maliyeti farklıdır.

### 5. Özel fonksiyonlar
Rezervasyon, teklif hesaplama, üye girişi, bayi paneli, çok dil, ERP veya CRM entegrasyonu gibi özellikler ayrı geliştirme süresi gerektirir.

### 6. E-ticaret
Ürün sayısı, varyant yapısı, ödeme ve kargo entegrasyonları, pazaryeri bağlantıları e-ticaret projelerinin maliyetini belirler. Ayrıntılar için [e-ticaret web tasarım](/e-ticaret-web-tasarim) sayfamıza bakabilirsiniz.

### 7. Teknik SEO ve performans
Yapılandırılmış veri, yönlendirme planı, hız optimizasyonu ve Search Console kurulumu bazı tekliflerde dahildir, bazılarında hiç yoktur.

### 8. Yayın sonrası giderler
Alan adı ve hosting yenilemesi, SSL, güncelleme, yedekleme ve teknik destek yıllık olarak düşünülmelidir. Teklif karşılaştırırken yalnızca ilk yılın değil, üç yıllık toplam maliyetin hesaplanması daha sağlıklıdır.

## Teklifleri nasıl karşılaştırmalı?

İki teklifi karşılaştırmanın tek doğru yolu kapsamlarını aynı tabloya koymaktır:

| Soru | Teklif A | Teklif B |
| --- | --- | --- |
| Kaç farklı sayfa şablonu var? | | |
| İçerik kim yazıyor? | | |
| Revizyon hakkı kaç tur? | | |
| Teknik SEO dahil mi? | | |
| Yönetim paneli var mı? | | |
| Alan adı ve hosting kimin adına? | | |
| Destek süresi ve kapsamı ne? | | |

Bu tabloyu doldurduğunuzda "ucuz" görünen teklifin çoğu zaman eksik kapsamdan kaynaklandığını görürsünüz.

## Neden sabit fiyat listesi yayınlamıyoruz?

Tek bir "paket fiyatı" yazmak, ihtiyacı farklı iki işletmeyi aynı kalıba sokmak olur. Bunun yerine kısa bir ön görüşmeyle kapsamı belirleyip kalem kalem açıklanmış bir teklif hazırlıyoruz. [Ücretsiz ön analiz ve teklif](/teklif-al) için formu doldurabilirsiniz.

Fiyatı belirleyen etkenleri daha ayrıntılı ele aldığımız yazı: [web sitesi bütçesi nasıl planlanır?](/blog/web-sitesi-butcesi-nasil-planlanir)`,
    faq: [
      {
        q: "Web sitesi için yıllık ne kadar bütçe ayırmalıyım?",
        a: "İlk kurulumun yanında alan adı, hosting, SSL, güncelleme ve destek gibi yıllık giderler vardır. İçerik üretimi ve SEO çalışması yapılacaksa bunlar da düzenli bütçe gerektirir. Kapsamınıza göre net rakamı teklifte kalem kalem görürsünüz.",
      },
      {
        q: "Çok ucuz web sitesi teklifleri neden bu kadar ucuz?",
        a: "Genellikle hazır temanın az değiştirilerek kullanılmasından, içerik ve SEO çalışmasının kapsam dışında bırakılmasından ya da yayın sonrası desteğin olmamasından kaynaklanır. Teklifteki kapsamı yukarıdaki tabloyla karşılaştırın.",
      },
      {
        q: "Ödeme nasıl yapılıyor?",
        a: "Genellikle proje başında, tasarım onayında ve teslimde olmak üzere aşamalara bölünür. Ödeme planı teklifte yazılı olarak belirtilir.",
      },
    ],
  },
  {
    slug: "seo-hizmeti",
    serviceName: "SEO Hizmeti",
    shortName: "SEO",
    summary: "Teknik SEO, içerik stratejisi ve ölçümle Google'da kalıcı görünürlük.",
    sortOrder: 7,
    allowLocationPages: true,
    showInNav: true,
    path: "/seo-hizmeti",
    name: "SEO Hizmeti",
    crumb: "SEO",
    seoTitle: "SEO Hizmeti | Teknik SEO, İçerik ve Ölçüm",
    metaDescription:
      "SEO hizmetimiz teknik denetim, içerik stratejisi, iç link yapısı ve Search Console ölçümünden oluşur. Garantili sıralama vaadi değil, ölçülebilir süreç.",
    h1: "SEO Hizmeti",
    intro:
      "SEO hizmeti, sitenizin Google'da ilgili aramalarda daha görünür olması için teknik altyapıyı, içeriği ve site içi bağlantıları düzenli olarak iyileştirmektir. Kimse belirli bir sıralamayı garanti edemez; bizim sunduğumuz, neyin neden yapıldığını ve sonucunu açıkça gösteren ölçülebilir bir süreçtir.",
    primaryKeyword: "seo hizmeti",
    secondaryKeywords: ["teknik seo", "search console", "anahtar kelime", "iç link", "içerik stratejisi"],
    body: `## SEO çalışması üç ayak üzerinde durur

### Teknik SEO
Google'ın sitenizi sorunsuz tarayıp anlayabilmesi için gereken her şey: doğru durum kodları, canonical etiketleri, site haritası, robots kuralları, yönlendirme zincirlerinin temizlenmesi, yapılandırılmış veri ve sayfa hızı. Teknik sorunlar çözülmeden içerik çalışması beklenen etkiyi göstermez.

### İçerik
Her sayfanın net bir arama niyetine yanıt vermesi gerekir. Anahtar kelime araştırmasıyla hangi soruların sorulduğunu, rakiplerin neyi eksik bıraktığını belirleyip mevcut sayfaları güçlendiriyor ve gerekiyorsa yeni sayfalar planlıyoruz. Aynı kelimeyi hedefleyen birden fazla sayfa varsa (keyword cannibalization) bunları birleştiriyor ya da ayrıştırıyoruz.

### Site içi ve site dışı otorite
Önemli sayfalara site içinden yeterli ve anlamlı link verilmesi, sahipsiz (orphan) sayfaların bağlanması ve anchor metinlerinin doğal çeşitlilikte olması iç otoriteyi belirler. Site dışında ise sektör rehberleri, iş ortakları ve gerçek haber değeri olan içerikler üzerinden doğal bağlantılar hedeflenir. Link satın alma gibi Google yönergelerine aykırı yöntemler kullanmıyoruz.

## Aylık çalışma nasıl ilerler?

1. **Denetim:** Tüm site taranır; hatalar kritik, yüksek, orta ve düşük önem derecesine göre listelenir.
2. **Önceliklendirme:** Her iş etki ve zorluk açısından puanlanır. Az emekle çok etki yaratan işler önce yapılır.
3. **Uygulama:** Başlık ve açıklama iyileştirmeleri, içerik güncellemeleri, iç link düzenlemeleri, teknik düzeltmeler.
4. **Ölçüm:** Search Console'dan tıklama, gösterim, tıklama oranı ve ortalama pozisyon takip edilir.
5. **Raporlama:** Ne yapıldığı, neden yapıldığı ve sonucun ne olduğu sade bir dille paylaşılır.

## Hangi verilere bakıyoruz?

Search Console, Google'ın sitenizi nasıl gördüğünü doğrudan gösteren tek resmî kaynaktır. Hangi sorgularda göründüğünüzü, hangi sayfaların tıklandığını, indekslenmeyen sayfaların nedenini buradan izliyoruz. Pozisyonu 5 ile 15 arasında olan sorgular genellikle en hızlı sonuç alınabilecek fırsatlardır.

## Neyi yapmıyoruz?

- Anahtar kelimeyi doğal olmayan şekilde tekrar eden metinler yazmıyoruz.
- Yüzlerce şehir için aynı metni şehir adını değiştirerek çoğaltmıyoruz.
- Gizli metin, gizli link veya ziyaretçiye ve Google'a farklı içerik gösterme gibi yöntemler kullanmıyoruz.
- Sahte yorum, sahte işletme kaydı ya da sahte referans üretmiyoruz.

Bu yöntemler kısa vadede işe yarıyor gibi görünse de Google'ın spam politikalarına aykırıdır ve sitenin tamamen görünmez olmasına yol açabilir.

Yeni bir site planlıyorsanız SEO'yu baştan tasarıma dahil etmek en verimli yoldur: [SEO uyumlu web tasarım nedir?](/blog/seo-uyumlu-web-tasarim-nedir)`,
    faq: [
      {
        q: "SEO sonuçları ne zaman görülür?",
        a: "Teknik düzeltmelerin etkisi birkaç hafta içinde görülebilir; rekabetli kelimelerde kalıcı yükselme genellikle birkaç ay sürer. Süre sitenin geçmişine, rekabete ve yapılan çalışmanın kapsamına bağlıdır.",
      },
      {
        q: "Birinci sırayı garanti ediyor musunuz?",
        a: "Hayır. Google'ın sıralamasını kimse garanti edemez; bunu vaat eden teklifler şüpheyle karşılanmalıdır. Biz yapılan işi ve ölçülen sonucu şeffaf şekilde raporlarız.",
      },
      {
        q: "SEO bir kez yapılıp bırakılabilir mi?",
        a: "Teknik altyapı bir kez doğru kurulduğunda uzun süre işler, ancak rakipler ve arama sonuçları sürekli değişir. İçerik güncellemesi ve ölçüm düzenli yapılmadığında kazanılan pozisyonlar zamanla kaybedilebilir.",
      },
    ],
  },
  {
    slug: "google-ads-yonetimi",
    serviceName: "Google Ads Yönetimi",
    shortName: "Google Ads",
    summary: "Bütçeyi doğru aramalara harcayan, dönüşümü ölçülen Google Ads kampanyaları.",
    sortOrder: 8,
    allowLocationPages: false,
    showInNav: false,
    path: "/google-ads-yonetimi",
    name: "Google Ads Yönetimi",
    crumb: "Google Ads",
    seoTitle: "Google Ads Yönetimi | Ölçülebilir Reklam Kampanyaları",
    metaDescription:
      "Google Ads kampanyalarında bütçenin boşa gitmemesi için anahtar kelime, negatif kelime, açılış sayfası ve dönüşüm takibini birlikte yönetiyoruz.",
    h1: "Google Ads Yönetimi",
    intro:
      "Google Ads, arama yapan kişiye tam aradığı anda ulaşmanın en hızlı yoludur; ama yanlış kurulan bir kampanya bütçeyi alakasız tıklamalara harcar. Google Ads yönetiminde amacımız, her liranın hangi sonucu getirdiğini görebileceğiniz ölçülebilir bir yapı kurmaktır.",
    primaryKeyword: "google ads yönetimi",
    secondaryKeywords: ["google reklam", "arama ağı", "dönüşüm takibi", "negatif anahtar kelime", "açılış sayfası"],
    body: `## Kampanya kurulmadan önce: dönüşüm takibi

Reklamın işe yarayıp yaramadığını anlamanın tek yolu dönüşümleri ölçmektir. Telefon aramaları, form gönderimleri, WhatsApp tıklamaları ve (e-ticarette) satışlar doğru şekilde takip edilmeden yapılan her optimizasyon tahmine dayanır. Bu yüzden ilk iş olarak Google Ads dönüşüm etiketlerini ve Analytics bağlantısını kuruyoruz.

## Anahtar kelime ve eşleme stratejisi

"Web tasarım" gibi geniş bir kelime; iş arayanları, ders almak isteyenleri ve ücretsiz site arayanları da getirir. Bu nedenle:

- Satın alma niyeti yüksek kelimelerle başlıyoruz ("... teklif", "... fiyatları", "... firması").
- Arama terimleri raporunu düzenli inceleyip alakasız sorguları **negatif kelime** olarak ekliyoruz.
- Bölge hedeflemesini gerçekten hizmet verdiğiniz alanla sınırlıyoruz.

## Açılış sayfası reklamın yarısıdır

Reklamı tıklayan kişiyi ana sayfaya göndermek, ondan aradığını yeniden bulmasını istemek demektir. Her reklam grubunun, reklam metnindeki vaadi karşılayan bir açılış sayfasına gitmesi gerekir. Sayfanın hızlı açılması, telefonda kolay okunması ve tek bir net eylem çağrısı içermesi dönüşüm oranını doğrudan etkiler. Bu yüzden Google Ads yönetimini genellikle [web tasarım](/web-tasarim) çalışmasıyla birlikte ele alıyoruz.

## Bütçe ve teklif stratejisi

Yeni hesaplarda önce yeterli dönüşüm verisi toplanır; akıllı teklif stratejileri (hedef dönüşüm başı maliyet gibi) ancak bu veri oluştuktan sonra verimli çalışır. Günlük bütçe, rekabetin yoğun olduğu saat ve günlere göre planlanır.

## Raporlama

Her ay şunları sade bir tabloyla paylaşıyoruz:

| Gösterge | Ne anlatır |
| --- | --- |
| Harcama | Toplam reklam maliyeti |
| Dönüşüm | Arama, form, satış adedi |
| Dönüşüm başı maliyet | Bir müşteri adayının size maliyeti |
| Arama terimleri | Reklamın gerçekte hangi aramalarda çıktığı |
| Yapılan değişiklikler | Neyi neden değiştirdiğimiz |

## Reklam ve SEO birlikte

Reklam hemen trafik getirir ama bütçe durduğunda trafik de durur. [SEO hizmeti](/seo-hizmeti) ise daha yavaş ama kalıcıdır. Reklamdan gelen arama terimi verisi, hangi kelimeler için organik içerik üretmeye değeceğini de gösterir; iki kanalı birlikte yönetmek bu yüzden verimlidir.`,
    faq: [
      {
        q: "Google Ads için minimum bütçe ne kadar olmalı?",
        a: "Sabit bir minimum yok; ancak bütçe, hedef kelimelerdeki tıklama maliyetleriyle anlamlı veri toplanabilecek kadar olmalıdır. Kelime araştırmasından sonra tahmini tıklama maliyetlerini görüp birlikte karar veriyoruz.",
      },
      {
        q: "Reklam hesabı kimin adına açılıyor?",
        a: "Hesap ve ödeme yöntemi sizin adınıza açılır; biz yönetici erişimiyle çalışırız. Böylece geçmiş veriler ve hesap her zaman sizde kalır.",
      },
    ],
  },
  {
    slug: "ozel-web-yazilim",
    serviceName: "Özel Web Yazılım",
    shortName: "Web Yazılım",
    summary: "Hazır sistemlerin karşılamadığı iş akışları için özel web uygulamaları.",
    sortOrder: 9,
    allowLocationPages: false,
    showInNav: false,
    path: "/ozel-web-yazilim",
    name: "Özel Web Yazılım",
    crumb: "Web Yazılım",
    seoTitle: "Özel Web Yazılım | İş Akışınıza Uygun Web Uygulamaları",
    metaDescription:
      "Teklif hesaplama, bayi paneli, rezervasyon, müşteri portalı gibi hazır sistemlerin karşılamadığı ihtiyaçlar için özel web yazılım geliştiriyoruz.",
    h1: "Özel Web Yazılım",
    intro:
      "Özel web yazılım, işletmenizin kendine özgü iş akışını bir web uygulamasına dönüştürmektir: bayilerin sipariş verdiği bir panel, müşterinin anında fiyat hesapladığı bir form ya da ekibinizin işleri takip ettiği bir sistem. Hazır yazılımlara uymak için süreçlerinizi değiştirmek yerine yazılımı süreçlerinize göre kurarız.",
    primaryKeyword: "özel web yazılım",
    secondaryKeywords: ["web uygulaması", "bayi paneli", "entegrasyon", "yönetim paneli", "api"],
    body: `## Ne zaman özel yazılım gerekir?

Her ihtiyaç için özel yazılım gerekmez; önce hazır bir çözümün işinizi görüp görmediğine bakmak gerekir. Özel yazılım genellikle şu durumlarda mantıklıdır:

- İş akışınız hazır yazılımların varsayımlarına uymuyor ve bu yüzden Excel tabloları ile manuel işler çoğalıyor.
- Birden fazla sistemi (muhasebe, ERP, e-ticaret, kargo) birbirine bağlamanız gerekiyor.
- Müşterilerinize veya bayilerinize kendi verilerini görebilecekleri bir portal sunmak istiyorsunuz.
- Hazır yazılımların kullanıcı başı lisans maliyeti, özel geliştirmeyi uzun vadede daha ekonomik kılıyor.

## Örnek kullanım alanları

### Teklif ve fiyat hesaplama
Ürün ölçüsü, malzeme, adet gibi girdilere göre anında fiyat veren formlar. Satış ekibinin teklif hazırlama süresini kısaltır, müşterinin de ilk temasta fikir sahibi olmasını sağlar.

### Bayi ve müşteri portalı
Bayilerin güncel fiyat listesine göre sipariş verdiği, geçmiş siparişlerini ve cari durumunu görebildiği paneller.

### Randevu ve rezervasyon
Kaynak (oda, masa, uzman) ve zaman çakışmalarını yöneten, hatırlatma mesajı gönderen sistemler.

### İç operasyon araçları
İş takip, stok, saha ekibi yönetimi gibi ekibinizin günlük kullandığı araçlar.

## Geliştirme süreci

1. **Analiz:** Mevcut süreci adım adım çıkarır, darboğazları ve kuralları belgeleriz.
2. **Kapsam ve öncelik:** İlk sürümde mutlaka olması gerekenlerle sonradan eklenebilecekleri ayırırız. Küçük ama çalışan bir ilk sürüm, her şeyi içeren ama gecikmiş bir projeden daha değerlidir.
3. **Prototip:** Ekranları gerçek kullanıcılarla test ederiz.
4. **Geliştirme ve test:** Aşamalı teslimlerle ilerleriz; her aşamada çalışan bir sürüm görürsünüz.
5. **Yayın, eğitim ve destek:** Kullanıcı eğitimi, belgeler ve bakım planı.

## Güvenlik ve sahiplik

Özel yazılımda yetkilendirme, veri güvenliği, yedekleme ve kayıt (log) tutma baştan tasarlanır. Kaynak kodun ve verinin sahipliği, sözleşmede açıkça size ait olarak belirtilir; başka bir ekip de projeyi devralabilecek şekilde belgelenir.

Web yazılımınızın bir parçası da herkese açık bir web sitesi olacaksa [kurumsal web tasarım](/kurumsal-web-tasarim) sayfamıza göz atabilirsiniz.`,
    faq: [
      {
        q: "Özel yazılım hazır yazılımdan daha mı pahalı?",
        a: "Başlangıç maliyeti genellikle daha yüksektir; ancak lisans ücreti ödenmemesi ve süreçlere birebir uyum, uzun vadede toplam maliyeti düşürebilir. Karar vermeden önce iki seçeneğin 3 yıllık maliyetini birlikte hesaplıyoruz.",
      },
      {
        q: "Mevcut sistemlerimizle entegre olabilir mi?",
        a: "Sistemin bir API'si veya veri aktarım yöntemi varsa evet. Muhasebe, ERP, e-ticaret ve kargo sistemleriyle entegrasyonlar sık yapılan işlerdir; önce ilgili sistemin sunduğu imkânları inceleriz.",
      },
    ],
  },
];
