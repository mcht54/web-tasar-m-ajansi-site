import type { SeedPage } from "./types";

// Rehber yazıları. Her biri bilgi niyetli bir soruya yanıt verir ve ilgili
// hizmet sayfasına bağlanır; hizmet sayfalarıyla aynı ana kelimeyi hedeflemez.

// Yayın tarihi elle verilmez: kayıt oluşturulduğu an yayın tarihidir (geriye tarih atılmaz).
export const blogPosts: (SeedPage & { slug: string })[] = [
  {
    slug: "web-tasarim-nedir",
    category: "Temel Bilgiler",
    path: "/blog/web-tasarim-nedir",
    name: "Web Tasarım Nedir?",
    seoTitle: "Web Tasarım Nedir? Kapsamı, Aşamaları ve Temel Kavramlar",
    metaDescription:
      "Web tasarım nedir, web geliştirmeden farkı ne, hangi aşamalardan oluşur? Arayüz, kullanıcı deneyimi ve duyarlı tasarım kavramlarıyla sade bir rehber.",
    h1: "Web Tasarım Nedir?",
    excerpt: "Web tasarımın kapsamı, aşamaları ve bilinmesi gereken temel kavramlar.",
    intro:
      "Web tasarım nedir sorusunun kısa yanıtı: bir web sitesinin yapısını, görünümünü ve ziyaretçinin siteyi nasıl kullanacağını planlama işidir. Ancak iyi bir web tasarımı yalnızca renk ve yazı tipi seçiminden ibaret değildir; bilginin nasıl düzenleneceği, sayfaların nasıl birbirine bağlanacağı ve ziyaretçinin hangi adımı atacağı da tasarımın parçasıdır.",
    primaryKeyword: "web tasarım nedir",
    secondaryKeywords: ["kullanıcı deneyimi", "arayüz tasarımı", "duyarlı tasarım", "erişilebilirlik", "bilgi mimarisi"],
    body: `## Web tasarım ile web geliştirme arasındaki fark

Günlük dilde sıkça karıştırılsa da iki farklı iş söz konusudur. **Web tasarım**, sitenin neye benzeyeceğini ve nasıl kullanılacağını belirler: sayfa düzeni, renkler, tipografi, butonların yeri, formların akışı. **Web geliştirme** ise bu tasarımı çalışan bir siteye dönüştürür: HTML, CSS ve JavaScript ile arayüzün kodlanması, içerik yönetim sistemi, veritabanı ve sunucu tarafındaki işler.

Küçük projelerde iki işi aynı kişi yapabilir; büyük projelerde ayrı uzmanlıklar olarak yürür. Her durumda tasarımcı ve geliştiricinin birlikte düşünmesi gerekir; kodlanması zor ya da siteyi yavaşlatan bir tasarım, kâğıt üzerinde ne kadar güzel olursa olsun kullanıcıya iyi bir deneyim sunmaz.

## Web tasarımın temel bileşenleri

### Bilgi mimarisi
Sitedeki bilginin nasıl gruplanacağı, menünün nasıl kurulacağı ve sayfaların hangi hiyerarşide duracağıdır. Ziyaretçinin aradığını bulamadığı bir site, görsel olarak ne kadar etkileyici olursa olsun başarısızdır.

### Arayüz tasarımı (UI)
Renkler, yazı tipleri, boşluklar, butonlar, ikonlar ve görsellerin oluşturduğu görünümdür. İyi bir arayüz marka kimliğini yansıtırken okunabilirliği bozmaz.

### Kullanıcı deneyimi (UX)
Ziyaretçinin siteyi kullanırken yaşadığı deneyimin tamamıdır: sayfanın ne kadar hızlı açıldığı, formun kaç adım sürdüğü, bir hata olduğunda ne olduğu. Kullanıcı deneyimi tasarımı, gerçek kullanıcı davranışlarını gözlemleyerek ve test ederek şekillenir.

### Duyarlı (responsive) tasarım
Aynı sitenin telefon, tablet ve bilgisayarda ekran boyutuna uyum sağlayarak düzgün görünmesidir. Bugün sitelerin çoğunda trafiğin büyük kısmı telefondan geldiği için tasarıma genellikle küçük ekrandan başlanır. Konunun ayrıntıları için [mobil uyumlu web sitesi neden önemlidir?](/blog/mobil-uyumlu-web-sitesi-neden-onemlidir) yazımıza bakabilirsiniz.

### Erişilebilirlik
Görme, işitme veya motor becerileri farklı olan kullanıcıların da siteyi kullanabilmesidir. Yeterli renk kontrastı, klavyeyle gezilebilen menüler, görsellerde açıklayıcı alternatif metinler ve anlamlı başlık yapısı erişilebilirliğin temelidir. Erişilebilir bir site genellikle arama motorları için de daha anlaşılırdır.

## Bir web tasarım projesi hangi aşamalardan geçer?

1. **Keşif:** İşletmenin hedefleri, müşteri profili ve rakipler incelenir.
2. **İçerik ve yapı planı:** Hangi sayfaların olacağı ve her sayfanın neyi anlatacağı belirlenir.
3. **Tel çerçeve (wireframe):** Renk ve görsel olmadan, yalnızca düzeni gösteren taslaklar hazırlanır.
4. **Görsel tasarım:** Onaylanan düzen, marka kimliğine uygun arayüze dönüştürülür.
5. **Geliştirme:** Tasarım kodlanır, içerik yönetim sistemi kurulur.
6. **Test ve yayın:** Farklı cihaz ve tarayıcılarda test edilir, site yayına alınır.
7. **Ölçüm ve iyileştirme:** Ziyaretçi verileri incelenerek site sürekli geliştirilir.

## İyi bir web tasarımını nasıl anlarsınız?

Bir sitenin iyi tasarlanıp tasarlanmadığını anlamak için tasarımcı olmanız gerekmez. Şu sorular yeterli bir fikir verir:

- Telefonda açtığınızda site birkaç saniye içinde kullanılabilir hâle geliyor mu?
- Sitenin ne sunduğunu ilk ekranda anlayabiliyor musunuz?
- Aradığınız bilgiye üç tıklamadan az sürede ulaşabiliyor musunuz?
- İletişim kurmak veya satın almak için ne yapmanız gerektiği açık mı?
- Yazılar rahat okunuyor mu, içerik okurken yerinden kayıyor mu?

Google'ın sayfa deneyimini nasıl ölçtüğünü merak ediyorsanız [Core Web Vitals açıklamasına](https://web.dev/articles/vitals) göz atabilirsiniz.

## Web tasarım ve SEO ilişkisi

Tasarım kararları arama motoru görünürlüğünü doğrudan etkiler. Önemli içeriğin görsel içine gömülmesi, her sayfada aynı başlığın kullanılması ya da sayfanın aşırı ağır olması Google'ın siteyi anlamasını ve sıralamasını zorlaştırır. Bu yüzden SEO'yu tasarım bittikten sonra eklenen bir katman olarak değil, baştan tasarımın parçası olarak düşünmek gerekir: [SEO uyumlu web tasarım nedir?](/blog/seo-uyumlu-web-tasarim-nedir)

Bir web sitesine ihtiyacınız olduğunu düşünüyorsanız sürecin nasıl işlediğini [web tasarım](/web-tasarim) sayfamızda anlattık.`,
    faq: [
      {
        q: "Web tasarım öğrenmek için kod bilmek gerekir mi?",
        a: "Arayüz tasarımı için kod bilmek şart değildir; ancak HTML ve CSS'in temel mantığını bilmek, uygulanabilir ve hızlı tasarımlar yapmayı kolaylaştırır.",
      },
      {
        q: "Hazır site kurma araçları web tasarımın yerini tutar mı?",
        a: "Basit bir tanıtım sayfası için yeterli olabilir. Arama motoru görünürlüğü, özel iş akışları veya markaya özgü bir deneyim gerektiğinde çoğu zaman sınırlı kalırlar.",
      },
    ],
  },
  {
    slug: "web-sitesi-yaptirirken-nelere-dikkat-edilmeli",
    category: "Rehber",
    path: "/blog/web-sitesi-yaptirirken-nelere-dikkat-edilmeli",
    name: "Web Sitesi Yaptırırken Nelere Dikkat Edilmeli?",
    seoTitle: "Web Sitesi Yaptırırken Dikkat Edilmesi Gereken 12 Nokta",
    metaDescription:
      "Web sitesi yaptırırken sözleşme, alan adı sahipliği, içerik, hız, SEO, güvenlik ve destek konularında dikkat etmeniz gereken 12 noktayı madde madde anlattık.",
    h1: "Web Sitesi Yaptırırken Dikkat Edilmesi Gerekenler",
    excerpt: "Sözleşmeden alan adı sahipliğine, hızdan güvenliğe 12 kritik nokta.",
    intro:
      "Web sitesi yaptırırken dikkat edilmesi gereken konuların çoğu tasarımla değil; sahiplik, kapsam ve bakım gibi sonradan fark edilen konularla ilgilidir. Bu yazıda, proje başlamadan önce netleştirmeniz gereken 12 noktayı; neden önemli olduklarıyla birlikte sıraladık.",
    primaryKeyword: "web sitesi yaptırırken dikkat edilmesi gereken",
    secondaryKeywords: ["alan adı sahipliği", "sözleşme", "hosting", "yedekleme", "kvkk"],
    body: `## Sahiplik ve sözleşme

### 1. Alan adı sizin adınıza kayıtlı olmalı
Alan adı, işletmenizin internetteki adresidir. Ajansın veya bir çalışanın kişisel hesabına kayıtlı alan adı, ilişki bittiğinde ciddi sorun çıkarır. Kayıt bilgilerinin ve yönetim paneli erişiminin firmanızda olduğundan emin olun.

### 2. Kapsam yazılı olmalı
Hangi sayfaların yapılacağı, içeriği kimin hazırlayacağı, kaç revizyon turu olduğu, hangi özelliklerin dahil olduğu teklifte yazılı olmalı. Sözlü mutabakatlar proje ilerledikçe farklı hatırlanır.

### 3. Kaynak kod ve içerik teslimi netleşmeli
Proje bittiğinde sitenin tüm dosyalarının, veritabanının ve görsellerin size nasıl teslim edileceği sözleşmede yer almalı.

## İçerik ve yapı

### 4. İçeriği geciktirmeyin
Web projelerindeki gecikmelerin en yaygın nedeni içeriklerin geç gelmesidir. İçeriği kendiniz yazacaksanız proje başında bir takvim belirleyin; ajans yazacaksa bilgi toplama görüşmesini erkenden yapın.

### 5. Her hizmete ayrı sayfa
Tüm hizmetleri tek sayfada toplamak kolay görünür ama her hizmetin Google'da ayrı ayrı bulunma şansını ortadan kaldırır. Her ana hizmet, kendi sorularına yanıt veren bir sayfayı hak eder.

### 6. Gerçek fotoğraflar
Stok fotoğraflar hızlı çözüm gibi görünse de ziyaretçi onları tanır ve güven kaybı yaşanır. Ekibinizin, işyerinizin ve işlerinizin gerçek fotoğrafları çok daha ikna edicidir.

## Teknik konular

### 7. Hız baştan hedef olmalı
Sitenin telefonda ne kadar hızlı açılacağı tasarım aşamasında belirlenir. Teslimden önce test adresini [PageSpeed Insights](https://pagespeed.web.dev/) ile kendiniz ölçebilirsiniz.

### 8. Temel SEO ayarları teslimin parçası olmalı
Her sayfanın kendine özgü başlığı ve açıklaması, düzgün başlık yapısı, site haritası, yapılandırılmış veri ve Search Console kurulumu teslim listesinde yer almalı. Google'ın [başlangıç rehberi](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) bu temel konuların iyi bir özetidir.

### 9. Eski site varsa yönlendirme planı yapılmalı
Mevcut bir siteyi yeniliyorsanız, eski sayfa adreslerinin yeni karşılıklarına 301 yönlendirmeyle bağlanması gerekir. Bu adım atlanırsa eski sayfaların kazandığı arama trafiği kaybolur.

### 10. Güvenlik ve yedekleme planı olmalı
SSL sertifikası, yazılım güncellemeleri ve düzenli yedekleme olmadan yayına alınan bir site er ya da geç sorun yaşar. Yedeklerin nerede tutulduğunu ve geri yüklemenin ne kadar sürdüğünü sorun.

## Yasal ve süreklilik konuları

### 11. KVKK uyumu
Formlardan kişisel veri topluyorsanız aydınlatma metni, açık rıza gereken durumlar ve çerez bilgilendirmesi hazır olmalıdır. Ayrıntılar için [KVKK'nın resmî sitesine](https://www.kvkk.gov.tr/) başvurabilirsiniz; metinlerinizi bir hukukçuya kontrol ettirmeniz önerilir.

### 12. Yayından sonra kim sorumlu?
Site yayına girdikten sonra bir form çalışmadığında veya bir güncelleme sorun çıkardığında kime ulaşacağınızı, ne kadar sürede yanıt alacağınızı ve bunun ücretli olup olmadığını bilmelisiniz.

## Kısa kontrol listesi

- [ ] Alan adı ve hosting firmanın adına
- [ ] Kapsam, revizyon ve teslim süresi yazılı
- [ ] İçerik takvimi belli
- [ ] Hız ve SEO hedefleri tanımlı
- [ ] Yönlendirme planı (yenilemelerde)
- [ ] Yedekleme ve güncelleme sorumlusu belli
- [ ] KVKK metinleri hazır
- [ ] Destek koşulları yazılı

Sürecin adım adım nasıl ilerlediğini [web sitesi yaptırma](/web-sitesi-yaptirma) sayfamızda, ajansa sormanız gereken soruları ise [web tasarım ajansı seçimi](/web-tasarim-ajansi) sayfasında bulabilirsiniz.`,
    faq: [
      {
        q: "Alan adım başkasının üzerine kayıtlıysa ne yapmalıyım?",
        a: "Kayıtlı kişi veya firmadan alan adının size devredilmesini isteyin; devir işlemi kayıt firmasının paneli üzerinden yapılır. Devir tamamlanana kadar alan adının süresinin dolmamasına dikkat edin.",
      },
      {
        q: "Ajans değiştirirsem sitem ne olur?",
        a: "Kaynak kod, veritabanı ve tüm erişimler sizdeyse site yeni ekibe sorunsuz devredilebilir. Bu yüzden sahiplik ve teslim koşullarını baştan yazılı hâle getirmek önemlidir.",
      },
    ],
  },
  {
    slug: "web-sitesi-butcesi-nasil-planlanir",
    category: "Bütçe",
    path: "/blog/web-sitesi-butcesi-nasil-planlanir",
    name: "Web Sitesi Bütçesi Nasıl Planlanır?",
    seoTitle: "Web Sitesi Bütçesi Nasıl Planlanır? 3 Yıllık Maliyet Hesabı",
    metaDescription:
      "Web sitesi maliyetini yalnızca kurulum ücretiyle değil, üç yıllık toplam maliyetle hesaplayın. Tek seferlik ve yıllık kalemleri ayıran pratik yöntem.",
    h1: "Web Sitesi Bütçesi Nasıl Planlanır?",
    excerpt: "Kurulum ücretinin ötesine bakın: üç yıllık toplam maliyet yöntemi.",
    intro:
      "Web sitesi maliyeti konuşulurken genellikle yalnızca ilk kurulum ücretine bakılır. Oysa bir sitenin gerçek maliyeti; kurulum, yıllık sabit giderler ve sitenin iş getirmesi için gereken sürekli çalışmaların toplamıdır. Bu yazıda web sitesi bütçesini üç yıllık bir perspektifle planlamanın pratik bir yolunu anlatıyoruz.",
    primaryKeyword: "web sitesi bütçesi",
    secondaryKeywords: ["web sitesi maliyeti", "toplam sahip olma maliyeti", "hosting ücreti", "bakım maliyeti", "teklif karşılaştırma"],
    body: `## Neden üç yıllık bakmalı?

Bir web sitesi genellikle üç ila beş yıl kullanılır. İlk yıl ucuz görünen bir teklif; yüksek yıllık bakım ücreti, her küçük değişiklik için ayrı fatura veya birkaç ay içinde yenilenmesi gereken bir altyapı nedeniyle üç yılın sonunda en pahalı seçenek olabilir. Farklı teklifleri adil karşılaştırmanın yolu, hepsini aynı süre için hesaplamaktır.

## Maliyet kalemlerini üç gruba ayırın

### 1. Tek seferlik giderler
- Tasarım ve geliştirme
- İçerik yazımı ve fotoğraf çekimi
- Eski siteden içerik taşıma ve yönlendirme planı
- Eğitim

### 2. Yıllık sabit giderler
- Alan adı yenilemesi
- Hosting veya sunucu
- SSL sertifikası (çoğu hostingde ücretsiz sunulur)
- Kullanılan ücretli eklenti veya servislerin lisansları
- Güvenlik güncellemeleri ve yedekleme

### 3. Büyüme giderleri (isteğe bağlı ama çoğu zaman gerekli)
- Yeni içerik ve blog yazıları
- SEO çalışması
- Reklam bütçesi ve reklam yönetimi
- Yeni özellik geliştirmeleri

## Basit bir hesap tablosu

Aşağıdaki tabloyu her teklif için ayrı ayrı doldurun. Rakamları teklif veren firmadan yazılı olarak isteyin; boş kalan satırlar, teklifte olmayan ama sonradan karşınıza çıkacak kalemleri gösterir.

| Kalem | 1. yıl | 2. yıl | 3. yıl |
| --- | --- | --- | --- |
| Kurulum (tek seferlik) | | – | – |
| Alan adı | | | |
| Hosting | | | |
| Lisanslar | | | |
| Bakım ve güncelleme | | | |
| İçerik / SEO | | | |
| **Toplam** | | | |

## Gizli maliyetlere dikkat

**Revizyon ücretleri:** Teklifte kaç revizyon turu olduğu yazmıyorsa, tasarım aşamasındaki her değişiklik ek ücrete dönüşebilir.

**İçerik güncelleme bağımlılığı:** Yönetim paneli olmayan ya da kullanımı çok zor olan sitelerde, basit bir metin değişikliği için bile ajansa ödeme yapmanız gerekebilir.

**Taşınamayan altyapı:** Kiralık platformlarda aylık ücret durduğunda site de kapanır. Bu bir sorun olmak zorunda değildir ama hesaba katılmalıdır.

**Yavaş site:** Doğrudan fatura olarak görünmez ama kaçırılan ziyaretçi ve reklam bütçesinin verimsiz harcanması olarak geri döner.

## Bütçe az olduğunda neyi önceliklendirmeli?

Bütçeniz sınırlıysa her şeyi yarım yapmak yerine az sayıda sayfayı iyi yapmak daha verimlidir:

1. Hızlı ve mobil uyumlu bir altyapı
2. En çok gelir getiren hizmetleriniz için özenle yazılmış sayfalar
3. Eksiksiz iletişim bilgileri ve çalışan bir teklif formu
4. Search Console ve temel ölçüm kurulumu

Blog, çok dil veya özel fonksiyonlar gibi eklemeler, site iş getirmeye başladıktan sonra aşamalı olarak yapılabilir.

## Teklif karşılaştırma

Fiyatı belirleyen kalemleri ve teklifleri karşılaştırmak için kullanabileceğiniz tabloyu [web tasarım fiyatları](/web-tasarim-fiyatlari) sayfamızda ayrıntılı olarak ele aldık. Ücretsiz bir ön analizle kapsamı birlikte netleştirmek isterseniz [teklif formunu](/teklif-al) doldurabilirsiniz.`,
    faq: [
      {
        q: "Web sitesi bütçesi yıllık cironun ne kadarı olmalı?",
        a: "Genel geçer bir oran yok. Sitenin getireceği iş hacmine göre düşünmek daha sağlıklıdır: bir sitenin yılda kaç müşteri getirmesi gerektiğini ve bir müşterinin size ortalama ne kazandırdığını hesaplayarak makul bütçeyi belirleyebilirsiniz.",
      },
      {
        q: "Aylık ödemeli site mi, tek seferlik ödeme mi?",
        a: "Aylık modeller başlangıç yükünü azaltır ama uzun vadede toplam maliyet yüksek olabilir. Üç yıllık toplamı karşılaştırarak karar vermek en doğru yöntemdir.",
      },
    ],
  },
  {
    slug: "kurumsal-web-sitesi-neden-onemlidir",
    category: "Rehber",
    path: "/blog/kurumsal-web-sitesi-neden-onemlidir",
    name: "Kurumsal Web Sitesi Neden Önemlidir?",
    seoTitle: "Kurumsal Web Sitesi Neden Önemlidir? 7 Somut Neden",
    metaDescription:
      "Sosyal medya ve pazaryerleri varken kurumsal web sitesine neden ihtiyaç var? Güven, bulunabilirlik, kontrol ve ölçüm açısından 7 somut neden.",
    h1: "Kurumsal Web Sitesi Neden Önemlidir?",
    excerpt: "Sosyal medya varken neden hâlâ kurumsal bir siteye ihtiyacınız var?",
    intro:
      "Kurumsal web sitesi neden önemlidir sorusu, özellikle sosyal medyada aktif olan işletmeler tarafından sıkça soruluyor. Sosyal medya hesapları ve pazaryerleri görünürlük sağlar; ancak kuralları başkası koyar ve bilgiyi kalıcı, düzenli ve aranabilir şekilde sunmak için tasarlanmamıştır. Kurumsal site ise tamamen sizin kontrolünüzdeki dijital merkezdir.",
    primaryKeyword: "kurumsal web sitesi neden önemlidir",
    secondaryKeywords: ["kurumsal kimlik", "güvenilirlik", "google görünürlüğü", "sosyal medya", "dijital varlık"],
    body: `## 1. Güvenin ilk kontrol noktası

Bir firmayla ilk kez çalışacak olan kişi veya kurum, çoğu zaman önce firmanın web sitesine bakar. Güncel iletişim bilgileri, gerçek adres, net hizmet tanımları ve profesyonel bir görünüm; firmanın gerçekten faaliyette olduğunu ve işini ciddiye aldığını gösterir. Web sitesi olmayan ya da yıllardır güncellenmemiş bir site, ziyaretçide "bu firma hâlâ çalışıyor mu?" sorusunu uyandırır.

## 2. Google'da bulunabilirlik

İnsanlar bir ihtiyaçları olduğunda sosyal medyada değil, çoğunlukla Google'da arama yapar. Sosyal medya gönderileri bu aramalarda nadiren görünür. Hizmetlerinizi anlatan, doğru kurgulanmış sayfalar ise ihtiyacı olan kişiyi tam aradığı anda size getirir. Google'ın sayfaları nasıl anladığı hakkında resmî kaynak: [Google Arama Merkezi başlangıç rehberi](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## 3. Kontrol sizde

Sosyal medya platformlarının algoritmaları, sayfa kuralları ve hatta hesap erişimi sizin kontrolünüzde değildir. Bir hesabın kısıtlanması, yıllarca biriktirilen görünürlüğü bir anda ortadan kaldırabilir. Kurumsal sitenizde ise içerik, tasarım ve müşteri verisi sizindir.

## 4. Bilgiyi düzenli ve kalıcı sunmak

Sosyal medya akış mantığıyla çalışır: bugün paylaşılan içerik birkaç gün içinde görünmez olur. Hizmet detayları, fiyatlandırma yaklaşımı, sık sorulan sorular ve referanslar ise her zaman erişilebilir olmalıdır. Kurumsal site, bu bilgileri düzenli bir yapıda ve kalıcı olarak sunar.

## 5. Kurumsal alıcılar için zorunluluk

Kurumsal firmalar tedarikçi seçerken web sitesini bir ön eleme aracı olarak kullanır. Belgeler, kapasite bilgileri, referanslar ve yetkili iletişim bilgisi sitede bulunmazsa, firmanız teklif listesine bile girmeyebilir. B2B odaklı yapı için [kurumsal firma web sitesi](/kurumsal-firma-web-sitesi) sayfamıza bakabilirsiniz.

## 6. Ölçülebilirlik

Kurumsal sitede hangi sayfaların ziyaret edildiğini, ziyaretçilerin hangi aramalarla geldiğini ve kaç kişinin sizinle iletişime geçtiğini ölçebilirsiniz. Bu veriler pazarlama bütçesini tahmine değil, gerçeğe dayanarak yönlendirmenizi sağlar. Search Console ve analitik araçları bu ölçümün temelidir.

## 7. Diğer tüm kanalların merkezi

Sosyal medya gönderileri, reklamlar, e-posta bültenleri, kartvizitler ve hatta araç giydirmeleri; hepsi insanları bir yere yönlendirmelidir. Kurumsal site, bu kanalların ortak varış noktası olarak işler ve her birinin ne kadar etkili olduğunu görmenizi sağlar.

## Kurumsal sitede olmazsa olmazlar

- Her ana hizmet için ayrı ve açıklayıcı sayfa
- Gerçek ve güncel iletişim bilgileri, harita
- Firma tanıtımı ve varsa belgeler
- İzinli, gerçek referanslar
- Mobil uyumlu ve hızlı altyapı
- KVKK aydınlatma metni

## Sonuç

Kurumsal web sitesi, sosyal medyanın alternatifi değil tamamlayıcısıdır. Sosyal medya ilgi uyandırır; site ise o ilgiyi güvene ve iletişime dönüştürür. Kurumsal site kurgusunun ayrıntılarını [kurumsal web tasarım](/kurumsal-web-tasarim) sayfamızda anlattık.`,
    faq: [
      {
        q: "Küçük bir işletmenin de kurumsal siteye ihtiyacı var mı?",
        a: "Evet. Küçük işletmeler için birkaç sayfalık, hızlı ve bilgileri eksiksiz bir site bile Google'da bulunabilirlik ve güven açısından büyük fark yaratır.",
      },
      {
        q: "Google İşletme Profili yeterli değil mi?",
        a: "İşletme Profili yerel aramalarda çok değerlidir ama sınırlı bilgi sunar. Web sitesi hizmetlerinizi ayrıntılı anlatır ve İşletme Profili'nin de daha güvenilir görünmesine katkı sağlar; ikisi birlikte kullanılmalıdır.",
      },
    ],
  },
  {
    slug: "mobil-uyumlu-web-sitesi-neden-onemlidir",
    category: "Teknik",
    path: "/blog/mobil-uyumlu-web-sitesi-neden-onemlidir",
    name: "Mobil Uyumlu Web Sitesi Neden Önemlidir?",
    seoTitle: "Mobil Uyumlu Web Sitesi Neden Önemlidir?",
    metaDescription:
      "Google siteleri mobil sürümüne göre değerlendiriyor. Mobil uyumun sıralama, hız ve dönüşüme etkisini ve pratik kontrol listesini okuyun.",
    h1: "Mobil Uyumlu Web Sitesi Neden Önemlidir?",
    excerpt: "Mobil öncelikli indeksleme, dokunmatik kullanım ve hız üzerine pratik rehber.",
    intro:
      "Mobil uyumlu web sitesi, telefon ve tablet gibi küçük ekranlarda içeriği okunabilir, butonları kolay tıklanabilir ve sayfaları hızlı yüklenebilir şekilde sunan sitedir. Google'ın siteleri öncelikle mobil sürümüne göre değerlendirmesiyle birlikte mobil uyum, bir tercih olmaktan çıkıp arama görünürlüğünün temel şartı hâline geldi.",
    primaryKeyword: "mobil uyumlu web sitesi",
    secondaryKeywords: ["mobil öncelikli indeksleme", "responsive tasarım", "dokunmatik hedef", "sayfa hızı", "viewport"],
    body: `## Mobil öncelikli indeksleme ne demek?

Google, bir siteyi taramak ve sıralamak için öncelikle sitenin mobil sürümünü kullanır. Yani masaüstünde bulunan ama mobilde gizlenen bir içerik, Google açısından büyük ölçüde yok sayılır. Ayrıntılar Google'ın [mobil öncelikli indeksleme belgesinde](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing) anlatılıyor.

Bu durum, "mobilde sadeleştirelim" düşüncesiyle yapılan tasarımların istemeden SEO kaybına yol açabileceği anlamına gelir. Mobil sürüm, masaüstündeki önemli içeriğin tamamını — gerekirse farklı bir düzenle — sunmalıdır.

## Mobil uyum yalnızca ekrana sığmak değildir

Bir sitenin telefonda "görünmesi" ile telefonda "rahat kullanılması" farklı şeylerdir. Gerçek mobil uyum şu unsurlardan oluşur:

### Okunabilir yazı
Metin yakınlaştırma gerektirmeden okunabilmeli; satır uzunluğu ve satır aralığı küçük ekrana göre ayarlanmalıdır.

### Dokunmaya uygun hedefler
Butonlar ve bağlantılar parmakla rahatça tıklanabilecek büyüklükte ve birbirinden yeterince uzak olmalıdır. Birbirine çok yakın bağlantılar yanlış tıklamalara ve hayal kırıklığına yol açar.

### Kolay doldurulan formlar
Telefon alanında sayısal klavye, e-posta alanında e-posta klavyesi açılmalı; otomatik doldurma desteklenmeli, gereksiz alan sorulmamalıdır.

### Taşmayan içerik
Tablolar, görseller ve uzun kelimeler ekranı yatayda taşırmamalı; geniş tablolar kendi içinde kaydırılabilmelidir.

### Rahatsız etmeyen açılır pencereler
İçeriği tamamen kapatan açılır pencereler mobilde özellikle rahatsız edicidir ve kullanıcı deneyimini bozar.

## Hız: mobilin en kritik ölçütü

Mobil kullanıcılar çoğu zaman değişken kalitede bağlantı üzerindedir. Masaüstünde kabul edilebilir görünen bir sayfa, telefonda yavaş bir bağlantıyla çok daha geç açılır. Google'ın sayfa deneyimi ölçütleri olan [Core Web Vitals](https://web.dev/articles/vitals) — yükleme (LCP), etkileşim (INP) ve görsel kararlılık (CLS) — mobil deneyimin nesnel bir ölçüsünü sunar.

Mobil hızı artırmanın temel yolları:

- Görselleri doğru boyutta ve WebP/AVIF gibi modern biçimlerde sunmak
- Ekranın dışında kalan görselleri gecikmeli yüklemek
- Gereksiz JavaScript ve üçüncü taraf script'leri kaldırmak
- Yazı tiplerini sayfayı bekletmeyecek şekilde yüklemek

## Dönüşüm üzerindeki etkisi

Mobil ziyaretçi genellikle hızlı bir eylem yapmak ister: aramak, yol tarifi almak, mesaj göndermek. Telefon numarasının tıklanabilir olması, WhatsApp butonunun görünür olması ve formun birkaç alandan oluşması, mobil ziyaretçiyi müşteriye dönüştürmenin en etkili yollarıdır.

## Sitenizin mobil uyumunu kontrol etmek için

1. Sitenizi kendi telefonunuzda, mobil veriyle açın ve ilk ekranın ne kadar sürede kullanılabilir olduğunu gözlemleyin.
2. Menüyü, formları ve iletişim butonlarını tek elle kullanmayı deneyin.
3. [PageSpeed Insights](https://pagespeed.web.dev/) ile mobil performans puanına ve Core Web Vitals değerlerine bakın.
4. Search Console'daki sayfa deneyimi raporlarını inceleyin.

## Sonuç

Mobil uyum, tasarımın sonunda yapılan bir uyarlama değil, başlangıç noktasıdır. Tasarıma küçük ekrandan başlamak, hem Google hem de kullanıcılar için daha iyi sonuç verir. Bu yaklaşımı [web tasarım](/web-tasarim) sürecimizin merkezine koyuyoruz.`,
    faq: [
      {
        q: "Ayrı bir mobil site (m.alanadi.com) kullanmak doğru mu?",
        a: "Artık önerilmiyor. Tek bir URL üzerinden ekran boyutuna uyum sağlayan duyarlı tasarım hem bakım hem SEO açısından çok daha sağlıklıdır.",
      },
      {
        q: "Mobil uygulamam varsa mobil uyumlu siteye gerek var mı?",
        a: "Evet. İnsanların büyük kısmı sizi ilk kez Google aramasıyla, tarayıcıda bulur. Uygulama genellikle mevcut müşteriler içindir; yeni müşteri kazanımında mobil site belirleyicidir.",
      },
    ],
  },
  {
    slug: "seo-uyumlu-web-tasarim-nedir",
    category: "SEO",
    path: "/blog/seo-uyumlu-web-tasarim-nedir",
    name: "SEO Uyumlu Web Tasarım Nedir?",
    seoTitle: "SEO Uyumlu Web Tasarım Nedir? Tasarımda SEO Kontrol Listesi",
    metaDescription:
      "SEO uyumlu web tasarım; taranabilir yapı, başlık hiyerarşisi, hız, yapılandırılmış veri ve iç linklerden oluşur. Tasarım aşaması kontrol listesi.",
    h1: "SEO Uyumlu Web Tasarım Nedir?",
    excerpt: "SEO'yu sonradan eklenen bir katman değil, tasarımın parçası yapmak.",
    intro:
      "SEO uyumlu web tasarım, bir sitenin baştan arama motorlarının kolayca tarayıp anlayabileceği ve kullanıcıların aradığını hızla bulabileceği şekilde kurgulanmasıdır. \"SEO uyumlu\" ifadesi çoğu teklifte geçer ama nadiren açıklanır; bu yazıda somut olarak neyi kapsadığını anlatıyoruz.",
    primaryKeyword: "seo uyumlu web tasarım",
    secondaryKeywords: ["taranabilirlik", "başlık hiyerarşisi", "yapılandırılmış veri", "canonical", "iç link yapısı"],
    body: `## SEO sonradan eklenemez mi?

Bazı SEO çalışmaları — başlık ve açıklama güncellemesi gibi — site yayındayken de yapılabilir. Ancak URL yapısı, sayfa hiyerarşisi, içeriğin nasıl yükleneceği ve sitenin ne kadar hızlı olacağı gibi temel kararlar tasarım ve geliştirme aşamasında verilir. Bu kararları sonradan değiştirmek çoğu zaman sitenin önemli bir kısmını yeniden yapmak anlamına gelir.

## SEO uyumlu tasarımın bileşenleri

### Taranabilir ve anlaşılır HTML
Önemli içeriğin sayfanın ilk HTML'inde bulunması gerekir. İçeriği yalnızca tarayıcıda JavaScript çalıştıktan sonra oluşturan yapılar, arama motorlarının sayfayı anlamasını geciktirebilir. Metinlerin görsel içine gömülmemesi de aynı nedenle önemlidir.

### Mantıklı URL yapısı
URL'ler kısa, okunabilir, küçük harfli ve kelimeleri tireyle ayrılmış olmalıdır: \`/kurumsal-web-tasarim\` gibi. URL hiyerarşisi sitenin yapısını yansıtmalı; bir sayfa yayına girdikten sonra adresi değişmemelidir, değişirse 301 yönlendirme kurulmalıdır.

### Başlık hiyerarşisi
Her sayfada sayfanın konusunu anlatan tek bir H1 başlık bulunmalı; alt bölümler H2, onların alt başlıkları H3 olarak sıralanmalıdır. Başlıklar görsel boyut için değil, içeriğin yapısını göstermek için kullanılmalıdır.

### Her sayfaya özgü başlık ve açıklama
Title etiketi arama sonuçlarındaki başlıktır; her sayfada farklı ve sayfanın içeriğini doğru anlatan bir başlık olmalıdır. Meta açıklama sıralamayı doğrudan etkilemez ama arama sonucunda tıklanma olasılığını etkiler.

### Canonical ve indeks kontrolü
Aynı içeriğe birden fazla adresten ulaşılabiliyorsa (parametreli URL'ler, filtreler), hangi adresin asıl olduğu canonical etiketiyle belirtilmelidir. Arama sonuçlarında görünmesi gerekmeyen sayfalar (teşekkür sayfaları, iç arama sonuçları) noindex ile işaretlenmelidir.

### Yapılandırılmış veri
Schema.org işaretlemesi, sayfadaki bilginin ne anlama geldiğini (işletme, hizmet, makale, breadcrumb) arama motorlarına açıkça söyler. Yapılandırılmış veri yalnızca sayfada gerçekten görünen bilgiyi yansıtmalıdır; Google'ın [yapılandırılmış veri yönergeleri](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) bu konuda nettir.

### İç link yapısı
Önemli sayfalara sitenin başka sayfalarından yeterli ve anlamlı bağlantı verilmesi gerekir. Hiçbir sayfadan bağlantı almayan (orphan) sayfalar hem kullanıcılar hem arama motorları tarafından zor bulunur. Bağlantı metinleri de "tıklayın" yerine hedef sayfanın konusunu anlatmalıdır.

### Hız ve Core Web Vitals
Sayfa deneyimi sıralama sinyallerinden biridir ve daha da önemlisi ziyaretçinin sitede kalıp kalmayacağını belirler. Hafif sayfa yapısı, optimize görseller ve gereksiz script'lerden kaçınmak tasarım aşamasında planlanmalıdır.

### Site haritası ve robots.txt
XML site haritası yalnızca indekslenmesi istenen sayfaları içermeli, robots.txt ise önemli sayfaların taranmasını yanlışlıkla engellememelidir.

## SEO uyumlu tasarım neyi kapsamaz?

SEO uyumlu bir tasarım, sitenin kendiliğinden üst sıralara çıkacağı anlamına gelmez. Rekabetli aramalarda görünür olmak için düzenli içerik üretimi, iç link çalışması ve ölçüm gerekir. Tasarım, bu çalışmaların verimli olmasını sağlayan zemindir.

Ayrıca anahtar kelimelerin metne doğal olmayan şekilde doldurulması, gizli metinler veya yüzlerce şehir için aynı sayfanın çoğaltılması gibi yöntemler "SEO uyumlu" değil, Google'ın [spam politikalarına](https://developers.google.com/search/docs/essentials/spam-policies) aykırıdır.

## Tasarım aşaması kontrol listesi

- [ ] URL yapısı ve sayfa hiyerarşisi belirlendi
- [ ] Her sayfanın hedeflediği arama niyeti tanımlandı
- [ ] Her sayfada tek H1 ve mantıklı başlık yapısı var
- [ ] Önemli içerik ilk HTML'de
- [ ] Canonical, robots ve site haritası kuralları tanımlandı
- [ ] Yapılandırılmış veri sayfa türlerine göre planlandı
- [ ] İç link yapısı ve menü kurgusu hazır
- [ ] Hız hedefleri belirlendi ve ölçüldü

Sürekli SEO çalışmasının nasıl yürüdüğünü [SEO hizmeti](/seo-hizmeti) sayfamızda anlattık.`,
    faq: [
      {
        q: "WordPress siteler SEO uyumlu mudur?",
        a: "WordPress SEO uyumlu bir site kurmaya elverişlidir; ancak kullanılan tema, eklentiler ve yapılandırma sonucu belirler. Ağır temalar ve çok sayıda eklenti hız ve kod kalitesini olumsuz etkileyebilir.",
      },
      {
        q: "Tek sayfalık (one page) siteler SEO için uygun mu?",
        a: "Tek bir konuya odaklanan küçük projeler için olabilir; ancak birden fazla hizmet sunan işletmelerde her hizmetin ayrı sayfada anlatılması arama görünürlüğü açısından çok daha etkilidir.",
      },
    ],
  },
  {
    slug: "e-ticaret-sitesi-nasil-kurulur",
    category: "E-Ticaret",
    path: "/blog/e-ticaret-sitesi-nasil-kurulur",
    name: "E-Ticaret Sitesi Nasıl Kurulur?",
    seoTitle: "E-Ticaret Sitesi Nasıl Kurulur? Adım Adım Başlangıç Rehberi",
    metaDescription:
      "E-ticaret sitesi kurmak için yasal hazırlık, ETBİS kaydı, altyapı, ödeme ve kargo entegrasyonu ile yayın sonrası adımları sırasıyla anlattık.",
    h1: "E-Ticaret Sitesi Nasıl Kurulur?",
    excerpt: "Yasal hazırlıktan ilk siparişe kadar adım adım e-ticaret kurulumu.",
    intro:
      "E-ticaret sitesi nasıl kurulur sorusunun yanıtı, yalnızca teknik bir kurulumdan ibaret değildir. Satışa başlamadan önce yasal yükümlülükler, ödeme ve kargo anlaşmaları, ürün içerikleri ve iade süreci gibi birçok konunun hazır olması gerekir. Bu rehberde süreci, en sık atlanan adımları da kapsayacak şekilde sırasıyla anlatıyoruz.",
    primaryKeyword: "e-ticaret sitesi nasıl kurulur",
    secondaryKeywords: ["etbis", "sanal pos", "kargo entegrasyonu", "mesafeli satış sözleşmesi", "ürün açıklaması"],
    body: `## 1. Yasal ve mali hazırlık

Düzenli satış yapacaksanız bir işletme (şahıs şirketi veya şirket) ve vergi kaydı gerekir. Türkiye'de e-ticaret yapan işletmelerin Ticaret Bakanlığı'nın Elektronik Ticaret Bilgi Sistemi'ne ([ETBİS](https://etbis.ticaret.gov.tr/)) kayıt olması gerekir. Hangi işletme türünün uygun olduğunu ve fatura süreçlerini (e-arşiv fatura gibi) mali müşavirinizle netleştirin.

Sitede bulunması gereken metinler:

- Mesafeli satış sözleşmesi ve ön bilgilendirme formu
- İade, cayma hakkı ve teslimat koşulları
- KVKK aydınlatma metni ve gerekiyorsa açık rıza metinleri
- Çerez politikası

Bu metinlerin işletmenize özel olarak bir hukukçu tarafından hazırlanması önerilir.

## 2. Ne satacağınızı ve kime satacağınızı netleştirin

Ürün yelpazesi, hedef müşteri ve fiyat konumlandırması; altyapıdan tasarıma kadar tüm kararları etkiler. Az sayıda ürünle başlayıp talebi ölçmek, büyük bir katalogla başlamaktan genellikle daha güvenlidir.

## 3. Altyapıyı seçin

Başlıca seçenekler kiralık e-ticaret platformları, açık kaynak sistemler (WooCommerce gibi) ve özel yazılımdır. Karar verirken şu soruları sorun:

- Kaç ürün ve varyant yöneteceğim?
- Muhasebe, ERP veya pazaryeri entegrasyonu gerekiyor mu?
- Teknik bakımı kim yapacak?
- Aylık ücretler üç yılda ne kadar tutuyor?
- Platformdan ayrılmak istersem verilerimi taşıyabilir miyim?

Seçeneklerin karşılaştırmasını [e-ticaret web tasarım](/e-ticaret-web-tasarim) sayfamızda tablo hâlinde bulabilirsiniz.

## 4. Ödeme altyapısını kurun

Kart ile ödeme almak için bir bankadan sanal POS veya bir ödeme kuruluşu hizmeti gerekir. Karşılaştırırken yalnızca komisyon oranına değil; paranın hesabınıza geçme süresine, taksit seçeneklerine, 3D Secure desteğine ve başvuru şartlarına da bakın. Havale/EFT ve kapıda ödeme gibi alternatifler de müşteri tercihine göre sunulabilir.

## 5. Kargo ve teslimat sürecini planlayın

Kargo firmalarıyla anlaşma, desi hesaplaması, ücretsiz kargo eşiği ve kargo takip numarasının müşteriye otomatik iletilmesi planlanmalıdır. Kargo entegrasyonu, sipariş başına harcanan manuel süreyi ciddi ölçüde azaltır.

## 6. Ürün içeriklerini hazırlayın

Ürün sayfaları satışın gerçekleştiği yerdir. Her ürün için:

- Farklı açılardan, aynı ışık ve arka planda çekilmiş fotoğraflar
- Üretici metninin kopyası olmayan, sizin yazdığınız açıklama
- Ölçü, malzeme, bakım talimatı gibi teknik bilgiler
- Net stok ve teslim süresi bilgisi

Üretici açıklamalarını olduğu gibi kullanmak, aynı ürünü satan tüm sitelerle aynı içeriği yayınlamak anlamına gelir; bu durumda arama motorunun sizin sayfanızı öne çıkarması için bir neden kalmaz.

## 7. Güven unsurlarını ekleyin

Gerçek iletişim bilgileri, açık iade koşulları, güvenli ödeme bilgisi ve gerçek müşteri yorumları yeni bir e-ticaret sitesinin en büyük eksiği olan güveni oluşturur. Yorumlar gerçek siparişlerden gelmelidir; sahte yorum hem yasal hem itibar açısından ciddi risk taşır.

## 8. Test edin

Yayından önce en az birkaç gerçek sipariş verin: ödeme, fatura, stok düşümü, bilgilendirme e-postaları, kargo bildirimi ve iade sürecini baştan sona deneyin.

## 9. Yayın sonrası: ölçüm ve trafik

Search Console ve analitik kurulumu yapılmalı, e-ticaret dönüşümleri takip edilmelidir. İlk trafik genellikle reklam ve sosyal medyadan gelir; organik trafik ise kategori ve ürün sayfalarının zamanla güçlenmesiyle artar. Google'ın genel önerileri için [SEO başlangıç rehberine](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) göz atabilirsiniz.

## Sık yapılan hatalar

- Yasal metinleri başka bir siteden kopyalamak
- Kargo ve iade maliyetlerini fiyatlamaya dahil etmemek
- Mobilde ödeme adımlarını test etmemek
- Stokta olmayan ürün sayfalarını silip 404'e düşürmek

Satışa başlamadan önce kapsamı konuşmak isterseniz [teklif formunu](/teklif-al) kullanabilirsiniz.`,
    faq: [
      {
        q: "E-ticaret sitesi kurmak ne kadar sürer?",
        a: "Kiralık bir platformda basit bir mağaza birkaç hafta içinde açılabilir; özel tasarım ve entegrasyonlar içeren projeler birkaç ay sürebilir. En çok zaman alan kısım genellikle ürün içeriklerinin hazırlanmasıdır.",
      },
      {
        q: "Stoksuz satış (dropshipping) için de aynı adımlar gerekli mi?",
        a: "Evet. Yasal yükümlülükler, iade süreci ve müşteriye karşı sorumluluk satıcı olarak sizdedir; tedarikçiyle bu süreçleri yazılı olarak netleştirmeniz gerekir.",
      },
    ],
  },
  {
    slug: "wordpress-mi-ozel-yazilim-mi",
    category: "Teknik",
    path: "/blog/wordpress-mi-ozel-yazilim-mi",
    name: "WordPress mi, Özel Yazılım mı?",
    seoTitle: "WordPress mi, Özel Yazılım mı? Tarafsız Karşılaştırma",
    metaDescription:
      "WordPress ile özel yazılım arasında karar verirken maliyet, esneklik, güvenlik, performans ve bakım açısından sormanız gereken sorular.",
    h1: "WordPress mi, Özel Yazılım mı?",
    excerpt: "İki yaklaşımın güçlü ve zayıf yanları, hangi durumda hangisinin mantıklı olduğu.",
    intro:
      "WordPress mi özel yazılım mı sorusunun herkes için geçerli tek bir doğru yanıtı yoktur. WordPress, dünyada en yaygın kullanılan içerik yönetim sistemidir ve birçok proje için mükemmel bir seçimdir; özel yazılım ise belirli ihtiyaçlarda daha doğru bir yoldur. Bu yazıda karar vermenizi kolaylaştıracak ölçütleri tarafsız şekilde karşılaştırıyoruz.",
    primaryKeyword: "wordpress mi özel yazılım mı",
    secondaryKeywords: ["wordpress", "içerik yönetim sistemi", "eklenti", "güvenlik güncellemesi", "headless"],
    body: `## WordPress'in güçlü yanları

[WordPress](https://wordpress.org/) açık kaynaklıdır, lisans ücreti yoktur ve çok geniş bir tema ve eklenti ekosistemine sahiptir. Bu da şu avantajları getirir:

- **Hızlı başlangıç:** Standart bir kurumsal site veya blog kısa sürede kurulabilir.
- **Yaygınlık:** Onu bilen geliştirici bulmak kolaydır; ajans değiştirmek görece kolaydır.
- **Kullanıcı dostu panel:** İçerik editörleri kısa bir eğitimle sayfaları güncelleyebilir.
- **Eklentiyle genişleme:** Form, SEO, çok dil, e-ticaret gibi birçok ihtiyaç hazır eklentilerle karşılanabilir.

## WordPress'in dikkat gerektiren yanları

- **Eklenti bağımlılığı:** Her ihtiyaç için eklenti eklemek, zamanla siteyi yavaşlatır ve güvenlik riskini artırır. Terk edilmiş bir eklenti, sitenin güvenlik açığına dönüşebilir.
- **Düzenli güncelleme zorunluluğu:** Çekirdek, tema ve eklentilerin güncel tutulması gerekir; güncellemeler zaman zaman birbirleriyle uyumsuzluk çıkarabilir.
- **Ağır temalar:** Her şeyi yapabilen çok amaçlı temalar genellikle kullanılmayan onlarca özelliğin kodunu da yükler.
- **Karmaşık iş akışları:** Standart dışı iş kuralları (özel fiyatlandırma, bayi yapısı, karmaşık rezervasyon) eklentilerle zorlandığında bakımı zor bir yapı ortaya çıkar.

## Özel yazılımın güçlü yanları

- **Tam uyum:** Yazılım iş akışınıza göre tasarlanır; siz yazılıma uymak zorunda kalmazsınız.
- **Performans kontrolü:** Yalnızca ihtiyaç duyulan kod bulunur; hız ve Core Web Vitals hedefleri daha kolay tutturulur.
- **Daha küçük saldırı yüzeyi:** Yaygın eklentileri hedef alan otomatik saldırılardan etkilenme olasılığı daha düşüktür (bu, güvenliğin ihmal edilebileceği anlamına gelmez).
- **Entegrasyon esnekliği:** ERP, CRM, muhasebe gibi sistemlerle doğrudan entegrasyon.

## Özel yazılımın dikkat gerektiren yanları

- **Başlangıç maliyeti ve süresi:** Genellikle daha yüksektir.
- **Geliştirici bağımlılığı:** Kod iyi belgelenmemişse başka bir ekibin devralması zorlaşır. Yaygın teknolojilerin kullanılması ve belgeleme bu riski azaltır.
- **Standart özellikler için de geliştirme:** WordPress'te hazır gelen bazı özelliklerin sıfırdan yapılması gerekebilir.

## Karşılaştırma tablosu

| Ölçüt | WordPress | Özel yazılım |
| --- | --- | --- |
| Başlangıç süresi | Kısa | Orta–uzun |
| Başlangıç maliyeti | Düşük–orta | Orta–yüksek |
| Standart kurumsal site | Çok uygun | Uygun ama gerekmeyebilir |
| Karmaşık iş akışı | Zorlanabilir | Çok uygun |
| Bakım yükü | Düzenli güncelleme | Planlı bakım |
| Performans kontrolü | Tema/eklentiye bağlı | Yüksek |
| Ekip değiştirme kolaylığı | Yüksek | Belgelemeye bağlı |

## Hangi durumda hangisi?

**WordPress mantıklı olabilir:** Standart bir kurumsal site, blog ağırlıklı bir yayın, bütçenin ve zamanın sınırlı olduğu projeler, içerik ekibinin WordPress'e alışkın olduğu durumlar.

**Özel yazılım mantıklı olabilir:** Belirgin bir iş akışı (bayi paneli, fiyat hesaplama, rezervasyon), çok sayıda sistemle entegrasyon, yüksek trafik ve performans hedefleri, uzun vadede lisans ve eklenti maliyetinden kaçınma isteği.

**Ara yol:** İçerik yönetimi için hazır bir sistem kullanıp ziyaretçiye gösterilen siteyi hafif ve hızlı bir yapıyla sunmak (headless yaklaşımı) da giderek yaygınlaşan bir seçenektir.

## Karar vermeden önce sorulacak sorular

1. Sitenin yapacağı işlerin kaçı standart, kaçı bize özgü?
2. Üç yıl sonra site ne yapıyor olmalı?
3. İçeriği kim, ne sıklıkla güncelleyecek?
4. Güncelleme ve güvenlik bakımını kim üstlenecek?
5. Başka bir ekibe devretmek gerekirse ne olur?

Özel iş akışlarınız varsa [özel web yazılım](/ozel-web-yazilim) sayfamıza, standart bir kurumsal site planlıyorsanız [kurumsal web tasarım](/kurumsal-web-tasarim) sayfamıza göz atabilirsiniz.`,
    faq: [
      {
        q: "WordPress güvenli mi?",
        a: "Güncel tutulan, güvenilir tema ve az sayıda iyi bakımı yapılan eklentiyle kurulan bir WordPress sitesi güvenli şekilde işletilebilir. Sorunların büyük kısmı güncellenmeyen eklentilerden kaynaklanır.",
      },
      {
        q: "WordPress'ten özel yazılıma geçerken SEO kaybı olur mu?",
        a: "URL'ler korunur veya doğru şekilde 301 ile yönlendirilir ve içerik taşınırsa ciddi bir kayıp yaşanmaz. Geçişten önce mevcut URL'lerin ve trafiğin dökümünü almak şarttır.",
      },
    ],
  },
  {
    slug: "web-sitesi-ne-kadar-surede-yapilir",
    category: "Rehber",
    path: "/blog/web-sitesi-ne-kadar-surede-yapilir",
    name: "Web Sitesi Ne Kadar Sürede Yapılır?",
    seoTitle: "Web Sitesi Ne Kadar Sürede Yapılır? Süreyi Belirleyen Etkenler",
    metaDescription:
      "Web sitesi yapım süresi neye göre değişir? Proje türlerine göre tipik aşamalar, gecikmelerin gerçek nedenleri ve süreci hızlandırmak için yapabilecekleriniz.",
    h1: "Web Sitesi Ne Kadar Sürede Yapılır?",
    excerpt: "Süreyi belirleyen etkenler ve projeyi hızlandırmak için pratik öneriler.",
    intro:
      "Web sitesi ne kadar sürede yapılır sorusunun yanıtı; sitenin türüne, sayfa sayısına, içeriğin hazır olup olmamasına ve karar süreçlerinin hızına göre değişir. Tecrübeler gösteriyor ki gecikmelerin çoğu teknik işlerden değil, içerik ve onay süreçlerinden kaynaklanıyor. Bu yazıda süreyi belirleyen etkenleri ve süreci nasıl hızlandırabileceğinizi anlatıyoruz.",
    primaryKeyword: "web sitesi ne kadar sürede yapılır",
    secondaryKeywords: ["proje süresi", "teslim süresi", "içerik hazırlığı", "tasarım onayı", "yayın"],
    body: `## Süreyi belirleyen etkenler

### Sitenin türü ve kapsamı
Birkaç sayfalık bir tanıtım sitesi ile yüzlerce ürünlü bir e-ticaret sitesi ya da özel iş akışları içeren bir web uygulaması arasında süre açısından büyük fark vardır. Sayfa sayısından çok, farklı sayfa şablonu ve özel fonksiyon sayısı süreyi belirler.

### İçeriğin durumu
Metinler, fotoğraflar, ürün bilgileri ve belgeler hazırsa proje çok daha hızlı ilerler. İçerik proje sırasında hazırlanacaksa, bu genellikle en uzun süren aşamadır.

### Karar ve onay süreçleri
Tasarım onayında birden fazla kişinin görüşü alınıyorsa ve geri bildirimler dağınık geliyorsa, her revizyon turu süreyi uzatır. Tek bir karar verici ve toplu geri bildirim, süreyi belirgin şekilde kısaltır.

### Entegrasyonlar
Ödeme sistemi, kargo, ERP, CRM gibi üçüncü taraf entegrasyonlarında, karşı tarafın başvuru ve onay süreçleri de takvime eklenir. Örneğin sanal POS başvurularının sonuçlanması başlı başına zaman alabilir.

### Eski siteden geçiş
Mevcut bir site yenileniyorsa içerik taşıma, URL eşleştirme ve yönlendirme planı ek süre gerektirir; ancak bu adım atlanırsa arama trafiği kaybedilebilir.

## Proje aşamaları ve tipik sıralama

1. **Keşif ve kapsam:** İhtiyaçların netleşmesi ve yazılı teklif.
2. **Site haritası ve içerik planı:** Sayfaların ve içeriklerin belirlenmesi.
3. **Tasarım:** Ana sayfa ve örnek iç sayfa tasarımı, revizyonlar, onay.
4. **Geliştirme:** Tasarımın kodlanması, yönetim panelinin kurulması, entegrasyonlar.
5. **İçerik girişi:** Metin ve görsellerin yerleştirilmesi, SEO alanlarının doldurulması.
6. **Test:** Farklı cihaz ve tarayıcılarda kontrol, form ve entegrasyon testleri.
7. **Yayın:** Alan adı yönlendirmesi, SSL, yönlendirmeler, Search Console'a site haritası gönderimi.

Aşamaların bir kısmı paralel yürüyebilir; örneğin tasarım sürerken içerik hazırlanabilir.

## Gecikmelerin gerçek nedenleri

- İçeriklerin planlanandan geç gelmesi
- Tasarım onayında çok sayıda ve birbiriyle çelişen geri bildirim
- Proje ortasında kapsamın genişlemesi ("şunu da ekleyelim")
- Alan adı veya hosting erişim bilgilerinin bulunamaması
- Üçüncü taraf başvurularının (ödeme, kargo) geç yapılması

## Süreci hızlandırmak için yapabilecekleriniz

- Proje başında içerik sorumlusunu ve takvimini belirleyin.
- Tek bir karar verici atayın ve geri bildirimleri tek seferde, yazılı olarak iletin.
- Alan adı ve hosting erişimlerini baştan hazırlayın.
- Ödeme ve kargo başvurularını tasarım aşamasında başlatın.
- İlk yayın için "olmazsa olmaz" kapsamı belirleyin; ek özellikleri ikinci aşamaya bırakın.

## Yayın bitiş değil, başlangıçtır

Site yayına girdikten sonra Google'ın sayfaları taraması ve indekslemesi zaman alır; aramalarda görünürlük ise haftalar ve aylar içinde oluşur. Yayını takip eden haftalarda Search Console verilerini izlemek ve ilk iyileştirmeleri yapmak, projenin önemli bir parçasıdır. Google'ın taramayı nasıl yaptığını anlamak için [SEO başlangıç rehberine](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) göz atabilirsiniz.

Projenizin kapsamına göre gerçekçi bir takvim için [web sitesi yaptırma](/web-sitesi-yaptirma) sürecimizi inceleyebilir veya [teklif formu](/teklif-al) üzerinden bizimle iletişime geçebilirsiniz.`,
    faq: [
      {
        q: "Acil bir site gerekiyorsa ne yapılabilir?",
        a: "Kapsamı daraltmak en etkili yoldur: en önemli hizmetleri anlatan birkaç sayfalık, hızlı bir ilk sürüm yayına alınır; diğer sayfalar ve özellikler sonraki aşamalarda eklenir.",
      },
      {
        q: "Site yayına girdikten sonra Google'da ne zaman görünür?",
        a: "Search Console'a site haritası gönderildikten sonra sayfaların taranması genellikle günler içinde başlar; ancak rekabetli aramalarda görünür olmak haftalar veya aylar sürebilir.",
      },
    ],
  },
];
