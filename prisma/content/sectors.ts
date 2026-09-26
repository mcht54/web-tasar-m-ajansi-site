import type { SeedPage } from "./types";

// Sektör sayfaları. "Örnek tasarım" bölümleri gerçek bir müşteri işi değil,
// sektör için önerilen sayfa kurgusudur; bu yüzden "önerdiğimiz yapı" diye anlatılır.

export const sectors: (SeedPage & { slug: string; sectorName: string; sortOrder: number })[] = [
  {
    slug: "restoran",
    sectorName: "Restoran",
    sortOrder: 1,
    path: "/restoran-web-tasarimi",
    name: "Restoran Web Tasarımı",
    crumb: "Restoran",
    seoTitle: "Restoran Web Tasarımı | Menü, Rezervasyon ve Yerel SEO",
    metaDescription:
      "Restoran web sitesinde menü, rezervasyon, konum ve Google Haritalar uyumu nasıl kurgulanır? Masaya dönüşen restoran web tasarımı için öneriler.",
    h1: "Restoran Web Tasarımı",
    intro:
      "Bir restoranın web sitesini ziyaret eden kişi genellikle aç, telefonda ve karar vermek üzeredir. Restoran web tasarımında amaç; menüyü, fiyatları, konumu ve rezervasyon yolunu birkaç saniyede göstermek, ziyaretçiyi masaya getirmektir.",
    primaryKeyword: "restoran web tasarımı",
    secondaryKeywords: ["restoran web sitesi", "online menü", "rezervasyon", "google haritalar", "paket servis"],
    body: `## Restoran ziyaretçisinin aradığı bilgiler

Restoran sitelerinde ziyaretçinin ihtiyacı çok nettir ve sıralaması da neredeyse hep aynıdır: menü ve fiyatlar, konum ve yol tarifi, çalışma saatleri, rezervasyon veya sipariş, atmosferi gösteren fotoğraflar. Bu bilgilerden herhangi birini bulmak üç tıklamadan fazla sürüyorsa ziyaretçi bir sonraki restorana geçer.

## Gerekli özellikler

- **HTML menü:** PDF veya fotoğraf menüler telefonda zor okunur ve Google tarafından iyi anlaşılmaz. Menüyü kategorilere ayrılmış, fiyatları güncellenebilir bir sayfa olarak yayınlamak gerekir.
- **Rezervasyon:** Telefonla, WhatsApp üzerinden veya bir rezervasyon formuyla; hangisi işletmeniz için yönetilebilirse.
- **Paket servis bağlantıları:** Kendi sipariş sisteminiz veya kullandığınız platformların bağlantıları.
- **Konum ve harita:** Adres, harita, otopark bilgisi ve "yol tarifi al" butonu.
- **Özel gün ve grup menüleri:** Doğum günü, iş yemeği gibi grup talepleri için ayrı bir iletişim yolu.

## Önerdiğimiz sayfa yapısı

İlk ekranda restoranı anlatan tek bir güçlü fotoğraf, altında "Menü", "Rezervasyon" ve "Yol Tarifi" butonları. Ardından öne çıkan yemekler, çalışma saatleri ve konum. Menü sayfasında kategoriler arasında hızlı geçiş, alerjen ve vejetaryen işaretleri. Mobilde ekranın altında sabit bir "Ara" ve "Rezervasyon" çubuğu.

## Restoranlar için yerel SEO

Restoran aramalarının büyük bölümü "yakınımdaki", semt adı veya mutfak türüyle yapılır. Bu aramalarda Google İşletme Profili ile web sitesinin birbirini desteklemesi önemlidir: adres, telefon ve çalışma saatlerinin her yerde aynı olması, sitenin işletme profilinde bağlı olması ve menü sayfasının mutfak türünü açıkça anlatması gerekir. Gerçek müşteri yorumlarını teşvik etmek faydalıdır; ancak sahte yorum yazmak ya da yorum satın almak Google politikalarına aykırıdır ve profilin kısıtlanmasına yol açabilir.

## Mobil kullanım ve hız

Restoran sitelerinde trafiğin neredeyse tamamı telefondan gelir. Yüksek çözünürlüklü yemek fotoğrafları siteyi yavaşlatmanın en yaygın nedenidir; görselleri WebP/AVIF biçiminde ve ekran boyutuna göre sunmak, fotoğraf kalitesinden ödün vermeden hızı korur.

## Dönüşüm: masaya giden yol

Restoran sitesinin başarısını ölçmek için "Ara", "Yol Tarifi", "Rezervasyon" ve "Sipariş" tıklamalarını ayrı ayrı takip ediyoruz. Böylece hangi sayfanın, hangi kampanyanın gerçekten müşteri getirdiğini görebilirsiniz.`,
    faq: [
      {
        q: "Menüyü sık değiştiriyoruz, siteyi kendimiz güncelleyebilir miyiz?",
        a: "Evet. Menü öğeleri, fiyatlar ve fotoğraflar yönetim panelinden teknik bilgi gerektirmeden güncellenebilir.",
      },
      {
        q: "Online sipariş için kendi sistemimiz mi olmalı?",
        a: "Sipariş hacminize ve platform komisyonlarına bağlı. Başlangıçta mevcut platformların bağlantısını vermek, hacim arttığında kendi sipariş sisteminizi kurmak yaygın bir yoldur.",
      },
    ],
  },
  {
    slug: "otel",
    sectorName: "Otel",
    sortOrder: 2,
    path: "/otel-web-tasarimi",
    name: "Otel Web Tasarımı",
    crumb: "Otel",
    seoTitle: "Otel Web Tasarımı | Doğrudan Rezervasyon Getiren Siteler",
    metaDescription:
      "Otel web tasarımında oda sayfaları, rezervasyon motoru, fotoğraf galerisi ve çok dilli yapı nasıl kurgulanır? Doğrudan rezervasyonu artıran öneriler.",
    h1: "Otel Web Tasarımı",
    intro:
      "Otel web tasarımının temel hedefi, misafirin online seyahat acentesi yerine sizin sitenizden rezervasyon yapmasını sağlamaktır. Bunun için sitenin güven vermesi, odaları ve tesisi dürüstçe göstermesi ve rezervasyonu birkaç adımda tamamlatması gerekir.",
    primaryKeyword: "otel web tasarımı",
    secondaryKeywords: ["otel web sitesi", "rezervasyon motoru", "oda sayfası", "çok dilli", "doğrudan rezervasyon"],
    body: `## Misafir neye bakarak karar verir?

Konaklama kararı fotoğraflar, konum, fiyat ve iptal koşullarıyla verilir. Misafir çoğu zaman aynı oteli hem acente sitesinde hem otelin kendi sitesinde karşılaştırır. Kendi sitenizde daha net bilgi, esnek iptal ya da doğrudan rezervasyona özel bir avantaj görürse rezervasyonu size yapar.

## Gerekli özellikler

- **Rezervasyon motoru entegrasyonu:** Müsaitlik ve fiyatın anlık görünmesi, kanal yöneticisiyle senkronizasyon.
- **Oda tipi sayfaları:** Her oda için ayrı sayfa, metrekare, yatak tipi, manzara, olanaklar ve gerçek fotoğraflar.
- **Tesis olanakları:** Restoran, havuz, spa, toplantı salonu gibi alanların ayrı ayrı anlatılması.
- **Konum rehberi:** Havalimanına, merkeze ve çevredeki önemli noktalara uzaklıklar.
- **Çok dil:** Yabancı misafir alıyorsanız her dil için ayrı URL ve doğru dil etiketleri.

## Önerdiğimiz sayfa yapısı

Ana sayfada tarih seçimli rezervasyon kutusu ilk ekranda yer alır. Altında oda tipleri, tesis olanakları, konum ve misafir sorularına yanıt veren kısa bir bölüm bulunur. Her oda sayfası kendi rezervasyon butonunu taşır; misafirin oda seçtikten sonra ana sayfaya dönmesi gerekmez.

## Oteller için SEO yaklaşımı

Otel aramaları çoğunlukla "bölge + otel türü" şeklindedir ("... butik otel", "... denize sıfır otel"). Bu aramaları yakalamak için otelin gerçekten sunduğu deneyimi anlatan sayfalar (aile odaları, toplantı organizasyonu, düğün, balayı gibi) oluşturmak etkilidir. Konum sayfalarında çevre rehberi hazırlamak hem misafire fayda sağlar hem de bilgi aramalarından trafik getirir. Yapılandırılmış veride yalnızca gerçek ve güncel bilgiler (adres, telefon, olanaklar) kullanılmalıdır.

## Mobil kullanım

Son dakika rezervasyonlarının büyük kısmı telefondan yapılır. Tarih seçicinin telefonda rahat çalışması, fotoğraf galerisinin kaydırılarak gezilebilmesi ve "Ara" butonunun her zaman görünür olması kritik önemdedir.

## Dönüşüm ölçümü

Rezervasyon motorundaki tamamlanan rezervasyonları analitik aracına aktarmak, hangi kaynaktan gelen misafirin rezervasyon yaptığını gösterir. Böylece reklam ve içerik bütçesini gerçek gelire göre yönlendirebilirsiniz.`,
    faq: [
      {
        q: "Kullandığımız rezervasyon motoru siteye entegre edilebilir mi?",
        a: "Yaygın rezervasyon motorlarının çoğu bağlantı veya gömülü modül sunar. Kullandığınız sistemin entegrasyon seçeneklerini inceleyip en az adımlı rezervasyon akışını kurarız.",
      },
      {
        q: "Acentelerdeki fiyattan farklı fiyat gösterebilir miyiz?",
        a: "Bu, acentelerle yaptığınız sözleşmelere bağlıdır. Fiyat yerine doğrudan rezervasyona özel ücretsiz kahvaltı, geç çıkış gibi avantajlar sunmak yaygın bir yöntemdir.",
      },
    ],
  },
  {
    slug: "hukuk-burosu",
    sectorName: "Hukuk Bürosu",
    sortOrder: 3,
    path: "/hukuk-burosu-web-tasarimi",
    name: "Hukuk Bürosu Web Tasarımı",
    crumb: "Hukuk Bürosu",
    seoTitle: "Hukuk Bürosu Web Tasarımı | Reklam Yasağına Uygun Siteler",
    metaDescription:
      "Avukatlık reklam yasağına uygun, bilgilendirici ve güven veren hukuk bürosu web tasarımı: çalışma alanları, makaleler ve iletişim kurgusu.",
    h1: "Hukuk Bürosu Web Tasarımı",
    intro:
      "Hukuk bürosu web tasarımı, diğer sektörlerden önemli bir noktada ayrılır: avukatlık mesleğinde reklam yasağı bulunur ve site tanıtım değil bilgilendirme amacı taşımalıdır. İyi bir hukuk bürosu sitesi bu sınırlar içinde kalarak büroyu, çalışma alanlarını ve iletişim yolunu açıkça anlatır.",
    primaryKeyword: "hukuk bürosu web tasarımı",
    secondaryKeywords: ["avukat web sitesi", "reklam yasağı", "çalışma alanları", "hukuki makale", "gizlilik"],
    body: `## Meslek kurallarına uygunluk

Türkiye Barolar Birliği'nin meslek kuralları ve reklam yasağı yönetmeliği, avukatların kendilerini nasıl tanıtabileceğini sınırlar. Bu nedenle hukuk bürosu sitelerinde:

- "En iyi", "garantili", "kazanma oranı" gibi karşılaştırmalı ve vaat içeren ifadeler kullanılmaz.
- Müşteri yorumu, başarı hikâyesi ya da dava sonucu tanıtımı yapılmaz.
- İçerik, bilgilendirme amacıyla ve ölçülü bir dille yazılır.

Metinlerin yayına girmeden önce büro avukatlarınca bu kurallar açısından gözden geçirilmesini öneriyoruz.

## Gerekli özellikler

- **Çalışma alanı sayfaları:** Ceza, aile, iş, ticaret, gayrimenkul hukuku gibi her alan için ayrı sayfa.
- **Avukat profilleri:** Baro sicil bilgisi, eğitim ve uzmanlık alanları.
- **Bilgilendirici makaleler:** Sık sorulan hukuki sorulara genel nitelikte, güncel mevzuata dayanan yanıtlar.
- **Gizliliğe özen gösteren iletişim formu:** Formda gereğinden fazla ayrıntı istenmez; KVKK aydınlatma metni eksiksiz yer alır.

## Önerdiğimiz sayfa yapısı

Sade ve ciddi bir görsel dil; ilk ekranda büronun adı, çalışma alanları ve iletişim bilgisi. Her çalışma alanı sayfasında o alanda sık karşılaşılan konular, sürecin genel işleyişi ve ilgili makalelere bağlantılar. İletişim sayfasında adres, harita, telefon ve randevu talebi.

## Hukuk büroları için SEO yaklaşımı

İnsanlar hukuki sorunlarını genellikle soru olarak arar: "kıdem tazminatı nasıl hesaplanır", "boşanma davası ne kadar sürer" gibi. Bu sorulara bilgilendirici, kaynak gösteren ve güncel mevzuata dayanan makaleler; hem kullanıcıya fayda sağlar hem de büroyu ilgili aramalarda görünür kılar. Makalelerde mevzuat değiştiğinde güncelleme tarihi belirtmek güvenilirliği artırır.

## Mobil kullanım

Hukuki destek arayan kişi çoğu zaman stresli ve aceledir. Telefon numarasının her sayfada tıklanabilir olması ve formun kısa tutulması, iletişim kurmayı kolaylaştırır.

## Dönüşüm

Hukuk bürosu sitelerinde ölçülen dönüşümler telefon aramaları ve randevu talepleridir. Hangi çalışma alanı sayfasının talep getirdiğini görmek, içerik çalışmasını doğru alanlara yönlendirmenizi sağlar.`,
    faq: [
      {
        q: "Avukat web sitesinde Google reklamı verilebilir mi?",
        a: "Reklam yasağı kapsamında avukatların ücretli reklam kullanımı sınırlıdır ve baroların bu konudaki kararları değişebilir. Güncel durumu bağlı olduğunuz barodan teyit etmenizi öneririz.",
      },
      {
        q: "Makaleleri kim yazıyor?",
        a: "Hukuki içeriğin doğruluğu için makalelerin büro avukatları tarafından yazılması veya en azından kontrol edilmesi gerekir. Biz yapı, okunabilirlik ve SEO tarafında destek veririz.",
      },
    ],
  },
  {
    slug: "mimarlik",
    sectorName: "Mimarlık",
    sortOrder: 4,
    path: "/mimarlik-web-tasarimi",
    name: "Mimarlık Web Tasarımı",
    crumb: "Mimarlık",
    seoTitle: "Mimarlık Ofisi Web Tasarımı | Proje Odaklı Portföy Siteleri",
    metaDescription:
      "Mimarlık ofisleri için projeleri ön plana çıkaran, hızlı açılan ve Google'da proje türüne göre bulunabilen portföy odaklı web tasarımı.",
    h1: "Mimarlık Web Tasarımı",
    intro:
      "Mimarlık ofisleri için web sitesi bir portföydür: potansiyel müşteri, ofisin daha önce ne yaptığına bakarak karar verir. Mimarlık web tasarımında zorluk, büyük ve etkileyici görselleri siteyi yavaşlatmadan sunmak ve her projeyi arama motorunun da anlayabileceği şekilde anlatmaktır.",
    primaryKeyword: "mimarlık web tasarımı",
    secondaryKeywords: ["mimarlık ofisi web sitesi", "portföy", "proje sayfası", "iç mimarlık", "görsel optimizasyonu"],
    body: `## Portföy sitesi neden yavaş olur?

Mimarlık sitelerinin en yaygın sorunu, yüksek çözünürlüklü render ve fotoğrafların olduğu gibi yüklenmesidir. Tek bir sayfada onlarca megabaytlık görsel, telefonda sayfanın dakikalarca açılmaması demektir. Görselleri ekran boyutuna göre farklı çözünürlüklerde, modern biçimlerde (WebP/AVIF) ve yalnızca görünür olduklarında yüklemek bu sorunu çözer.

## Gerekli özellikler

- **Proje sayfaları:** Her proje için ayrı sayfa; konum, yıl, alan, program, rol ve kısa bir tasarım anlatısı.
- **Filtrelenebilir portföy:** Konut, ticari, iç mimari, kentsel tasarım gibi kategoriler.
- **Ofis ve ekip:** Tasarım yaklaşımı, ekip ve iş birlikleri.
- **Yayınlar ve ödüller:** Varsa, kaynak bağlantılarıyla.
- **İletişim:** Proje tipi, konum ve yaklaşık zaman çizelgesi soran kısa bir başvuru formu.

## Önerdiğimiz sayfa yapısı

Ana sayfada tam genişlikte, seçilmiş birkaç proje görseli; altında proje kategorileri ve ofisin yaklaşımını anlatan kısa bir metin. Proje sayfalarında görsel ağırlıklı ama her görselin açıklayıcı bir alt metni ve projeyi anlatan en az birkaç paragrafı olan bir düzen. Görsellerin yanında yazı olmadan yalnızca galeri sunmak, Google'ın projeyi anlamasını zorlaştırır.

## Mimarlık ofisleri için SEO

Mimarlık hizmeti arayanlar genellikle proje tipi ve konumla arama yapar: "villa projesi", "ofis iç mimarlık", "restoran iç tasarım" gibi. Her proje sayfası bu aramalara doğal bir karşılık olabilir. Görsel aramalar da önemli bir trafik kaynağıdır; dosya adları ve ALT metinleri görselin gerçekte ne gösterdiğini anlatmalıdır ("salon-dogal-ahsap-tavan.webp" gibi).

## Mobil kullanım

Portföy telefonda kaydırılarak gezilir. Galeri geçişlerinin akıcı olması, görsellerin ekran genişliğine uyması ve proje bilgisine görsel açılmadan ulaşılabilmesi önemlidir.

## Dönüşüm

Mimarlık ofislerinde karar süreci uzundur. Proje sayfalarının sonunda "Benzer bir proje mi planlıyorsunuz?" gibi bağlama uygun bir iletişim çağrısı, genel bir iletişim sayfasından daha fazla talep getirir.`,
    faq: [
      {
        q: "Render görsellerini de yayınlayabilir miyiz?",
        a: "Evet, ancak uygulanmış projelerle tasarım aşamasındaki projeleri ayırt edecek şekilde etiketlemek hem dürüstlük hem de müşteri beklentisi açısından doğru olur.",
      },
      {
        q: "Portföyü kendimiz güncelleyebilir miyiz?",
        a: "Evet. Yeni proje eklerken görseller otomatik olarak optimize edilir; siz yalnızca görselleri, açıklamaları ve proje bilgilerini girersiniz.",
      },
    ],
  },
  {
    slug: "insaat",
    sectorName: "İnşaat",
    sortOrder: 5,
    path: "/insaat-firmasi-web-tasarimi",
    name: "İnşaat Firması Web Tasarımı",
    crumb: "İnşaat",
    seoTitle: "İnşaat Firması Web Tasarımı | Proje ve Satış Odaklı Siteler",
    metaDescription:
      "İnşaat firmaları için tamamlanan ve devam eden projeleri, satıştaki daireleri ve kurumsal güveni öne çıkaran web tasarımı önerileri.",
    h1: "İnşaat Firması Web Tasarımı",
    intro:
      "İnşaat firması web tasarımı iki farklı kitleye hitap eder: konut ya da işyeri almak isteyen bireysel alıcılar ve taşeron, tedarikçi ya da iş ortağı arayan kurumsal taraflar. İyi bir inşaat sitesi bu iki kitlenin aradığını ayrı yollardan, net şekilde sunar.",
    primaryKeyword: "inşaat firması web tasarımı",
    secondaryKeywords: ["inşaat web sitesi", "proje sayfası", "satılık daire", "müteahhit", "kat planı"],
    body: `## Alıcı neye bakar?

Konut alıcısı için en önemli sorular firmanın daha önce teslim ettiği projeler, teslim tarihlerine uyulup uyulmadığı, yapı kalitesi ve satıştaki projenin ayrıntılarıdır. Bu yüzden inşaat sitelerinde **tamamlanan projeler** bölümü, en az satıştaki projeler kadar önemlidir.

## Gerekli özellikler

- **Proje sayfaları:** Her proje için konum, daire tipleri, metrekareler, kat planları, teknik şartname ve inşaat ilerleme durumu.
- **Satış durumu:** Hangi dairelerin satıldığı, hangilerinin satışta olduğu (güncel tutulabiliyorsa).
- **İlerleme günlüğü:** Devam eden projelerde tarihli şantiye fotoğrafları; alıcıya güven verir.
- **Kurumsal bilgiler:** Firma geçmişi, belgeler, yapı denetim bilgileri.
- **Satış ofisi iletişimi:** Proje bazlı telefon ve WhatsApp, konum ve ziyaret saatleri.

## Önerdiğimiz sayfa yapısı

Ana sayfada satıştaki projeler ve tamamlanan projeler ayrı bölümlerde yer alır. Proje sayfası; üstte proje görseli ve temel bilgiler, ardından daire tipleri ve kat planları, konum ve çevre olanakları, teknik şartname ve en altta satış ofisine ulaşma seçenekleri şeklinde kurgulanır. Kat planları görsel olarak eklenirken metrekare ve oda bilgileri metin olarak da yazılır.

## İnşaat firmaları için SEO

Konut aramaları genellikle "bölge + konut tipi" şeklindedir ("... satılık 3+1", "... yeni konut projeleri"). Her projenin kendi URL'sinde, bölgeyi ve daire tiplerini açıkça anlatan bir sayfası olması bu aramalarda görünürlük sağlar. Satışı biten projelerin sayfalarını silmek yerine "tamamlanan proje" olarak referans bölümünde tutmak, hem kazanılmış arama görünürlüğünü korur hem de firmanın geçmişini gösterir.

## Mobil kullanım

Alıcılar proje sayfalarını sıklıkla telefonda inceler ve aile üyeleriyle paylaşır. Kat planlarının telefonda yakınlaştırılabilmesi ve sayfanın paylaşıldığında düzgün bir önizleme (görsel + başlık) göstermesi önemlidir.

## Dönüşüm

İnşaat sitelerinde en değerli dönüşüm satış ofisi aramaları ve ziyaret randevularıdır. Proje bazlı iletişim formları, hangi projenin daha çok ilgi gördüğünü de ölçmenizi sağlar.

Kurumsal müşterilere yönelik bir yapınız varsa [kurumsal web tasarım](/kurumsal-web-tasarim) sayfamızdaki önerilere de göz atabilirsiniz.`,
    faq: [
      {
        q: "Satıştaki daireleri kendimiz güncelleyebilir miyiz?",
        a: "Evet. Daire tipleri, satış durumu ve ilerleme fotoğrafları yönetim panelinden güncellenebilir.",
      },
      {
        q: "Projeler için ayrı site mi yapılmalı?",
        a: "Büyük markalı projelerde ayrı site tercih edilebilir; ancak çoğu durumda projeyi firmanın ana sitesinde ayrı bir sayfa olarak yayınlamak hem SEO hem de marka güveni açısından daha verimlidir.",
      },
    ],
  },
  {
    slug: "dis-klinigi",
    sectorName: "Diş Kliniği",
    sortOrder: 6,
    path: "/dis-klinigi-web-tasarimi",
    name: "Diş Kliniği Web Tasarımı",
    crumb: "Diş Kliniği",
    seoTitle: "Diş Kliniği Web Tasarımı | Mevzuata Uygun, Güven Veren Siteler",
    metaDescription:
      "Diş kliniği web tasarımında tedavi sayfaları, hekim profilleri, randevu ve sağlık reklamı mevzuatına uyum nasıl sağlanır? Kliniğiniz için öneriler.",
    h1: "Diş Kliniği Web Tasarımı",
    intro:
      "Diş kliniği web sitesini ziyaret eden hasta genellikle bir şikâyeti ya da planladığı bir tedavi hakkında bilgi arıyordur. Diş kliniği web tasarımında amaç; tedavileri anlaşılır dille anlatmak, hekimleri tanıtmak ve randevu almayı kolaylaştırmaktır — bunu yaparken sağlık alanındaki tanıtım kurallarına uymak gerekir.",
    primaryKeyword: "diş kliniği web tasarımı",
    secondaryKeywords: ["diş hekimi web sitesi", "tedavi sayfaları", "online randevu", "hekim profili", "sağlık mevzuatı"],
    body: `## Sağlık alanında tanıtım kuralları

Sağlık hizmetlerinin tanıtımı Türkiye'de mevzuatla sınırlandırılmıştır. Diş kliniği sitelerinde:

- Tedavi sonucuna dair garanti veya abartılı vaatler kullanılmaz.
- Önce/sonra fotoğrafları ve hasta yorumlarının kullanımı mevzuat açısından risklidir; yayınlamadan önce güncel düzenlemeler ve bağlı olduğunuz meslek odasının görüşü kontrol edilmelidir.
- Hekimlerin unvanları ve uzmanlık alanları doğru ve belgelenebilir şekilde yazılır.

Metinleri yayından önce klinik hekimlerinin kontrol etmesini öneriyoruz.

## Gerekli özellikler

- **Tedavi sayfaları:** İmplant, ortodonti, kanal tedavisi, estetik diş hekimliği gibi her tedavi için ayrı, anlaşılır bir sayfa: ne olduğu, kimlere uygulandığı, süreç ve iyileşme.
- **Hekim profilleri:** Eğitim, uzmanlık ve ilgi alanları.
- **Randevu:** Telefon, WhatsApp veya çevrim içi randevu formu.
- **Klinik bilgileri:** Adres, ulaşım, otopark, çalışma saatleri, anlaşmalı kurumlar.
- **Acil durum bilgisi:** Mesai dışı durumlarda ne yapılacağı.

## Önerdiğimiz sayfa yapısı

İlk ekranda kliniğin adı, konumu ve "Randevu Al" butonu. Altında tedavi kategorileri, hekim ekibi ve klinikten gerçek fotoğraflar. Tedavi sayfalarında hastanın sık sorduğu soruların yanıtları ve sayfa sonunda ilgili hekime veya randevu formuna yönlendirme.

## Diş klinikleri için SEO

Hasta aramaları iki türlüdür: bilgi aramaları ("implant tedavisi nasıl yapılır") ve yerel aramalar ("... diş kliniği"). Tedavi sayfaları bilgi aramalarını, Google İşletme Profili ve iletişim sayfası yerel aramaları karşılar. Sağlık konusunda Google, içeriğin uzman tarafından yazılmış veya kontrol edilmiş olmasına özellikle önem verir; bu yüzden tedavi sayfalarında içeriği kontrol eden hekimin adını belirtmek faydalıdır.

## Mobil kullanım

Diş ağrısı çeken biri kliniği genellikle telefonundan arar. Tıklanabilir telefon numarası, harita ve çalışma saatleri ilk ekranda görünür olmalıdır.

## Dönüşüm

Randevu formları, telefon ve WhatsApp tıklamaları ayrı ayrı ölçülür. Hangi tedavi sayfasının randevu getirdiğini bilmek, içerik ve reklam bütçesini doğru tedavilere yönlendirmenizi sağlar.`,
    faq: [
      {
        q: "Hasta yorumlarını sitede yayınlayabilir miyiz?",
        a: "Sağlık hizmetlerinde hasta yorumlarının tanıtım amaçlı kullanımı mevzuat açısından sınırlandırılmıştır. Yayınlamadan önce güncel düzenlemeleri ve odanızın görüşünü kontrol etmenizi öneririz.",
      },
      {
        q: "Online randevu sistemi kurulabilir mi?",
        a: "Evet. Kullandığınız klinik yazılımıyla entegre bir sistem veya hekim ve saat seçimli basit bir randevu talep formu kurulabilir.",
      },
    ],
  },
  {
    slug: "guzellik-merkezi",
    sectorName: "Güzellik Merkezi",
    sortOrder: 7,
    path: "/guzellik-merkezi-web-tasarimi",
    name: "Güzellik Merkezi Web Tasarımı",
    crumb: "Güzellik Merkezi",
    seoTitle: "Güzellik Merkezi Web Tasarımı | Randevu Odaklı Siteler",
    metaDescription:
      "Güzellik merkezleri için hizmet ve fiyat sayfaları, online randevu, Instagram entegrasyonu ve yerel SEO odaklı web tasarımı önerileri.",
    h1: "Güzellik Merkezi Web Tasarımı",
    intro:
      "Güzellik merkezi web tasarımında müşteri iki şeyi hızla görmek ister: hangi uygulamaların yapıldığı ve nasıl randevu alınacağı. Sosyal medyada keşfedilen merkezin web sitesi, bu ilgiyi randevuya dönüştüren ve merkeze güven kazandıran yerdir.",
    primaryKeyword: "güzellik merkezi web tasarımı",
    secondaryKeywords: ["güzellik salonu web sitesi", "online randevu", "hizmet menüsü", "instagram", "kampanya"],
    body: `## Sosyal medya ile web sitesi arasındaki fark

Birçok güzellik merkezi yalnızca Instagram hesabıyla çalışır. Sosyal medya keşif için güçlüdür; ancak "... lazer epilasyon" gibi Google aramalarında görünmek, fiyat ve hizmet bilgisini düzenli sunmak ve randevu almayı kolaylaştırmak için bir web sitesi gerekir. Site ile sosyal hesapların birbirini beslemesi en verimli yoldur.

## Gerekli özellikler

- **Hizmet menüsü:** Cilt bakımı, epilasyon, kalıcı makyaj, manikür gibi hizmetler; her ana hizmet için süre, uygulama adımları ve dikkat edilmesi gerekenler.
- **Online randevu:** Hizmet, uzman ve saat seçilebilen bir randevu akışı ya da WhatsApp üzerinden hızlı randevu.
- **Uzman tanıtımı:** Uygulamayı yapan kişilerin sertifika ve deneyim bilgileri.
- **Kampanyalar:** Güncel kampanyaların tarihli olarak yayınlanması; süresi geçen kampanyanın siteden kaldırılması.
- **Hijyen ve cihaz bilgisi:** Kullanılan cihazlar ve hijyen uygulamaları hakkında açık bilgi.

## Önerdiğimiz sayfa yapısı

İlk ekranda merkezin atmosferini gösteren gerçek bir fotoğraf ve "Randevu Al" butonu. Ardından hizmet kategorileri, uzman ekibi ve konum. Hizmet sayfalarında uygulama süresi, kaç seans gerektiği, öncesi ve sonrası dikkat edilmesi gerekenler gibi müşterinin gerçekten merak ettiği bilgiler.

## Güzellik merkezleri için SEO

Güzellik hizmetleri büyük ölçüde yerel olarak aranır: "semt + hizmet" şeklinde. Her ana hizmet için ayrı bir sayfa ve Google İşletme Profili'nin güncel tutulması bu aramalarda görünürlük sağlar. Tıbbi nitelikli uygulamalarda (ör. lazer, dolgu) sağlık mevzuatına uygun, abartısız bir dil kullanılmalıdır.

## Mobil kullanım

Müşterilerin büyük çoğunluğu siteye Instagram veya Google Haritalar üzerinden, telefondan gelir. Randevu akışının telefonda birkaç dokunuşla tamamlanabilmesi en önemli tasarım kriteridir.

## Dönüşüm

Randevu talepleri, WhatsApp ve telefon tıklamaları ayrı ölçülür. Kampanya dönemlerinde hangi hizmetin talep gördüğünü görmek, bir sonraki kampanyayı planlamayı kolaylaştırır.`,
    faq: [
      {
        q: "Fiyatları sitede göstermeli miyiz?",
        a: "Fiyat göstermek, fiyat soran mesaj yükünü azaltır ve daha nitelikli talepler getirir. Değişken fiyatlı hizmetlerde başlangıç fiyatı veya fiyatı etkileyen etkenleri yazmak iyi bir orta yoldur.",
      },
      {
        q: "Instagram gönderileri siteye eklenebilir mi?",
        a: "Evet, ancak sitenin hızını düşürmemesi için gönderileri sayfa açıldıktan sonra yüklenecek şekilde veya seçilmiş görseller olarak eklemeyi öneriyoruz.",
      },
    ],
  },
  {
    slug: "emlak",
    sectorName: "Emlak",
    sortOrder: 8,
    path: "/emlak-web-sitesi",
    name: "Emlak Web Sitesi",
    crumb: "Emlak",
    seoTitle: "Emlak Web Sitesi Tasarımı | İlan ve Portföy Yönetimi",
    metaDescription:
      "Emlak ofisleri için ilan yönetimi, gelişmiş arama, portföy sayfaları ve bölge rehberleriyle müşteri getiren emlak web sitesi tasarımı.",
    h1: "Emlak Web Sitesi",
    intro:
      "Emlak web sitesi, ofisinizin portföyünü ilan portallarından bağımsız olarak sergileyebildiğiniz ve müşteriyle doğrudan iletişim kurduğunuz yerdir. İyi bir emlak sitesi, ilanların kolayca aranmasını, güncel tutulmasını ve ofisin bölge uzmanlığının görünmesini sağlar.",
    primaryKeyword: "emlak web sitesi",
    secondaryKeywords: ["emlak ofisi web sitesi", "ilan yönetimi", "portföy", "bölge rehberi", "gayrimenkul"],
    body: `## Portallar varken neden kendi site?

İlan portalları çok trafik getirir ama müşteri orada yüzlerce ofisin ilanını yan yana görür. Kendi siteniz; ofisinizi tanıtan, tüm portföyünüzü bir arada sunan ve müşteriyi doğrudan size ulaştıran kanaldır. Ayrıca "bölge + emlak" aramalarında bölge uzmanlığınızı gösterebileceğiniz tek yerdir.

## Gerekli özellikler

- **İlan yönetimi:** Satılık/kiralık, konut/işyeri/arsa kategorileri; fiyat, metrekare, oda sayısı, kat, yaş gibi alanlar.
- **Gelişmiş arama:** Bölge, fiyat aralığı ve oda sayısına göre filtreleme.
- **İlan sayfası:** Fotoğraf galerisi, konum, özellikler ve ilgili danışmanın iletişim bilgisi.
- **Danışman profilleri:** Her danışmanın portföyü ve iletişim bilgileri.
- **Portal entegrasyonu:** İlanların tek yerden girilip portallara aktarılması (portalın sunduğu imkânlara bağlı).

## Önerdiğimiz sayfa yapısı

İlk ekranda arama kutusu ve öne çıkan ilanlar. Altında hizmet verilen bölgeler, ofis tanıtımı ve danışmanlar. İlan sayfasında fotoğraflar, temel bilgiler tablosu, açıklama, konum ve sabit "Danışmanı Ara / WhatsApp" butonları.

## Emlak siteleri için SEO

Emlak sitelerinde en büyük teknik risk, filtre kombinasyonlarının sonsuz sayıda benzer URL üretmesidir. Yalnızca gerçekten aranan kombinasyonların (ör. "... satılık daire") indekslenebilir sayfa olması, diğerlerinin canonical ile ana listeye bağlanması gerekir. Satılan veya kiralanan ilanların sayfaları silinmek yerine "satıldı" olarak işaretlenip benzer ilanlara yönlendirilmelidir; böylece hem kullanıcı boş sayfaya düşmez hem de kazanılmış bağlantı değeri kaybolmaz.

Bölge rehberleri (ulaşım, okullar, sosyal olanaklar) hem alıcıya gerçek bilgi verir hem de bölge aramalarında uzun vadeli görünürlük sağlar.

## Mobil kullanım

İlanlar çoğunlukla telefondan incelenir ve paylaşılır. Fotoğraf galerisinin kaydırılarak gezilebilmesi ve paylaşım önizlemesinin düzgün çıkması önemlidir.

## Dönüşüm

İlan bazlı arama ve WhatsApp tıklamaları ölçülerek hangi ilanın ve hangi danışmanın talep aldığı izlenir.`,
    faq: [
      {
        q: "İlanları hem siteye hem portallara ayrı ayrı mı gireceğiz?",
        a: "Portalların sunduğu entegrasyon imkânlarına bağlı. Entegrasyon mümkünse ilanı bir kez girip aktarabilirsiniz; değilse site için hızlı ilan giriş ekranı hazırlanır.",
      },
      {
        q: "Satılan ilanlar ne olacak?",
        a: "Silinmez; \"satıldı\" olarak işaretlenir ve benzer ilanlara yönlendirilir. Bu hem ziyaretçi deneyimi hem SEO açısından daha iyidir.",
      },
    ],
  },
  {
    slug: "kurumsal-firma",
    sectorName: "Kurumsal Firma",
    sortOrder: 9,
    path: "/kurumsal-firma-web-sitesi",
    name: "Kurumsal Firma Web Sitesi",
    crumb: "Kurumsal Firma",
    seoTitle: "Kurumsal Firma Web Sitesi | B2B Karar Süreçlerine Uygun Yapı",
    metaDescription:
      "B2B hizmet veren kurumsal firmalar için satın alma ekiplerinin aradığı bilgileri sunan, teklif talebi getiren kurumsal firma web sitesi önerileri.",
    h1: "Kurumsal Firma Web Sitesi",
    intro:
      "Kurumsal firmalara hizmet veren işletmelerde satın alma kararı tek kişi tarafından verilmez; teknik ekip, satın alma birimi ve yönetim siteyi farklı gözlerle inceler. Kurumsal firma web sitesi, bu farklı karar vericilerin her birinin aradığı bilgiye hızla ulaşmasını sağlamalıdır.",
    primaryKeyword: "kurumsal firma web sitesi",
    secondaryKeywords: ["b2b web sitesi", "satın alma", "vaka çalışması", "sertifika", "teklif talebi"],
    body: `## B2B ziyaretçinin soruları

Kurumsal alıcı sitenize genellikle bir tedarikçi listesi hazırlarken gelir. Sorduğu sorular bellidir: Bu firma bizim ihtiyacımızı karşılayabilir mi? Benzer firmalarla çalışmış mı? Kapasitesi ve belgeleri yeterli mi? Kiminle, nasıl iletişime geçerim?

## Gerekli özellikler

- **Çözüm sayfaları:** Hizmetleri firmanın iç diliyle değil, müşterinin karşılaştığı problemle anlatan sayfalar.
- **Vaka çalışmaları:** Müşterinin izniyle; problem, yaklaşım ve ölçülebilir sonuç.
- **Belgeler ve sertifikalar:** ISO, sektör belgeleri ve üyelikler, doğrulanabilir şekilde.
- **İndirilebilir dokümanlar:** Kurumsal tanıtım dosyası, teknik föyler.
- **Teklif talebi:** Kapsamı anlamaya yetecek kadar, ama uzun olmayan bir form.

## Önerdiğimiz sayfa yapısı

İlk ekranda firmanın ne yaptığını tek cümlede anlatan bir başlık ve "Teklif İste" butonu. Ardından çözüm alanları, hizmet verilen sektörler, süreç, vaka çalışmaları ve belgeler. Her çözüm sayfasının sonunda o çözümle ilgili vaka çalışmasına ve teklif formuna bağlantı.

## Kurumsal firmalar için SEO

B2B aramaları hacim olarak düşük ama değer olarak yüksektir. Az sayıda nitelikli ziyaretçi bile önemli bir iş getirebilir. Bu yüzden çok genel kelimeler yerine, satın alma ekiplerinin kullandığı spesifik terimleri hedefleyen çözüm sayfaları ve teknik rehberler daha verimlidir. Teknik içeriklerin gerçekten konuyu bilen ekip üyeleri tarafından yazılması veya kontrol edilmesi güvenilirliği artırır.

## Mobil kullanım

B2B araştırmalar masaüstünde daha yaygın olsa da ilk temas ve telefon araması çoğunlukla mobilden yapılır. İletişim bilgileri ve teklif formu mobilde de kolay erişilebilir olmalıdır.

## Dönüşüm

Teklif talepleri, doküman indirmeleri ve telefon aramaları ayrı ayrı ölçülür. Doküman indirenleri teklif aşamasına taşımak için indirme sonrası iletişim seçeneği sunmak faydalıdır.

Genel ilkeler için [kurumsal web tasarım](/kurumsal-web-tasarim) sayfamıza bakabilirsiniz.`,
    faq: [
      {
        q: "Müşteri logolarını sitede kullanabilir miyiz?",
        a: "Yalnızca müşterinin izniyle. Birçok kurumsal firmanın tedarikçilerinin kendi logosunu kullanmasıyla ilgili kuralları vardır; izin alınmadan kullanılan logo hem hukuki hem itibar riski taşır.",
      },
      {
        q: "İngilizce sürüm gerekli mi?",
        a: "Yurt dışı müşteri veya iş ortağınız varsa evet. Her dil ayrı URL'de ve profesyonel çeviriyle yayınlanmalıdır.",
      },
    ],
  },
  {
    slug: "sanayi",
    sectorName: "Sanayi",
    sortOrder: 10,
    path: "/sanayi-firmasi-web-sitesi",
    name: "Sanayi Firması Web Sitesi",
    crumb: "Sanayi",
    seoTitle: "Sanayi Firması Web Sitesi | Ürün, Kapasite ve İhracat Odaklı",
    metaDescription:
      "Üretici ve sanayi firmaları için ürün kataloğu, teknik özellikler, üretim kapasitesi ve çok dilli yapıyla ihracata hazır web sitesi tasarımı.",
    h1: "Sanayi Firması Web Sitesi",
    intro:
      "Sanayi firması web sitesi, üretici firmanın ürünlerini, üretim kabiliyetini ve kalite standartlarını yurt içi ve yurt dışındaki alıcılara anlatan bir satış aracıdır. Bu sitelerde en önemli içerik, alıcının teknik karar vermesini sağlayan net ve eksiksiz ürün bilgisidir.",
    primaryKeyword: "sanayi firması web sitesi",
    secondaryKeywords: ["üretici web sitesi", "ürün kataloğu", "teknik özellikler", "ihracat", "üretim kapasitesi"],
    body: `## Alıcı hangi bilgiyi arar?

Endüstriyel alıcılar ürün adıyla, teknik standartla veya uygulama alanıyla arama yapar. Siteye geldiğinde ölçüler, malzeme, toleranslar, sertifikalar, minimum sipariş miktarı ve teslim süresi gibi somut bilgileri arar. Bu bilgilere yalnızca PDF katalogla ulaşılabiliyorsa hem alıcı hem arama motoru için site eksik kalır.

## Gerekli özellikler

- **Ürün sayfaları:** Her ürün veya ürün ailesi için teknik özellik tablosu, görseller, uygulama alanları ve ilgili belgeler.
- **Üretim kabiliyeti:** Makine parkı, kapasite, kalite kontrol süreçleri, laboratuvar.
- **Sertifikalar:** Kalite ve ürün belgeleri, geçerlilik tarihleriyle.
- **Çok dil:** İhracat yapılan pazarların dillerinde ayrı URL'ler ve doğru dil etiketleri.
- **Teklif / numune talebi:** Ürün sayfasından doğrudan, ürün bilgisi otomatik eklenmiş form.

## Önerdiğimiz sayfa yapısı

Ana sayfada firmanın ne ürettiğini ve kimlere hizmet verdiğini anlatan net bir başlık; ürün grupları, üretim tesisi ve belgeler. Ürün sayfalarında üstte görsel ve kısa açıklama, ardından teknik özellik tablosu, uygulama alanları, indirilebilir teknik föy ve teklif talebi.

## Sanayi firmaları için SEO

Endüstriyel aramalar genellikle çok spesifiktir: ürün kodu, standart numarası, malzeme ve ölçü birlikte aranır. Teknik özelliklerin metin olarak (görsel veya PDF içinde değil) yayınlanması bu aramalarda görünmenin ön koşuludur. İhracat pazarlarında her dilde yerel terimlerin kullanılması, doğrudan çevirinin kaçırdığı aramaları yakalar.

## Mobil kullanım

Teknik tablolar telefonda yatay kaydırılarak okunabilmeli; teknik föyler ise hafif ve hızlı indirilebilir olmalıdır.

## Dönüşüm

Teklif ve numune talepleri, katalog indirmeleri ve yurt dışından gelen iletişimler ayrı ayrı ölçülür. Hangi ürün sayfasının hangi ülkeden talep aldığını görmek, ihracat pazarlamasını yönlendirmek için değerli bir veridir.

Kurumsal yapı hakkında genel öneriler için [kurumsal firma web sitesi](/kurumsal-firma-web-sitesi) sayfasına bakabilirsiniz.`,
    faq: [
      {
        q: "Yüzlerce ürünümüz var, hepsine ayrı sayfa mı gerekir?",
        a: "Ürünler yalnızca ölçü gibi küçük farklarla ayrışıyorsa ürün ailesi sayfası ve varyant tablosu daha doğrudur. Farklı uygulama alanlarına hitap eden ürünler için ayrı sayfalar anlamlıdır.",
      },
      {
        q: "Mevcut ERP'deki ürün verisi siteye aktarılabilir mi?",
        a: "ERP sisteminin veri aktarım imkânlarına bağlı. Çoğu durumda ürün kodları ve teknik özellikler toplu olarak aktarılabilir; açıklama metinleri ise ayrıca yazılmalıdır.",
      },
    ],
  },
];
