import type { SeedPage } from "./types";

export const homePage: SeedPage = {
  path: "/",
  name: "Ana Sayfa",
  metaDescription:
    "Google'da bulunur, hızlı açılır ve ziyaretçiyi müşteriye çevirir. Kurumsal web tasarım, e-ticaret, SEO ve Google Ads için ücretsiz ön analiz alın.",
  h1: "Markanızı Google'da Bulunur Hâle Getiren Web Siteleri",
  intro:
    "Web tasarımı arama motoru görünürlüğü, hız ve dönüşümle birlikte planlıyoruz. Sitenizin güzel görünmesi yetmez; doğru kişiler tarafından bulunması, birkaç saniyede güven vermesi ve ziyaretçiyi telefon açmaya ya da teklif istemeye yönlendirmesi gerekir.",
  // Ana sayfa marka ve merkez sayfasıdır; ana kelime kümeleri kendi sayfalarına
  // dağıtıldı (cannibalization olmasın diye burada ana kelime yok).
  secondaryKeywords: ["seo uyumlu web sitesi", "kurumsal web tasarım", "e-ticaret sitesi", "web sitesi yaptırma"],
  body: `## Önce strateji, sonra tasarım

Her projeye aynı soruyla başlıyoruz: **Müşterileriniz sizi hangi aramalarla bulmaya çalışıyor?** Bu sorunun yanıtı sayfa yapısını, menüyü, URL'leri ve içerikleri belirler. Tasarım bu iskeletin üzerine kurulur; böylece site hem göze hoş görünür hem de Google tarafından doğru anlaşılır.

## SEO yaklaşımımız

- **Her sayfanın bir görevi var.** Aynı kelime için birbiriyle yarışan sayfalar üretmiyoruz; her sayfa net bir arama niyetine yanıt veriyor.
- **Özgün içerik, kopya değil.** Şehir ve sektör sayfaları yalnızca o şehre ya da sektöre özgü gerçek bilgi içerdiğinde yayına alınıyor.
- **Ölçerek ilerliyoruz.** Search Console verileri, sıralama takibi ve site taraması yönetim panelinizde; hangi işin neden yapıldığını görebilirsiniz.
- **Kestirme yol yok.** Anahtar kelime doldurma, gizli metin, sahte yorum veya sahte referans gibi Google'ı yanıltmaya yönelik yöntemler kullanmıyoruz.

## Hız ve mobil deneyim

Ziyaretçilerin çoğu sitenize telefondan gelir. Tasarıma küçük ekrandan başlıyor, görselleri modern biçimlerde sunuyor ve gereksiz script kullanmıyoruz. Hedefimiz Google'ın sayfa deneyimi ölçütlerinde (Core Web Vitals) iyi sonuç almak.

Daha fazlası için [SEO uyumlu web tasarım nedir?](/blog/seo-uyumlu-web-tasarim-nedir) yazımıza göz atabilirsiniz.`,
  faq: [
    {
      q: "Hangi şehirlere hizmet veriyorsunuz?",
      a: "Projeleri uzaktan yürütebildiğimiz için Türkiye'nin her yerinden işletmelerle çalışabiliyoruz. Görüşmeler çevrim içi yapılır; yerel pazar bilgisi gerektiren konularda işletmenizden bilgi alırız.",
    },
    {
      q: "Ücretsiz ön analizde ne yapıyorsunuz?",
      a: "Mevcut sitenizin (varsa) hız, mobil uyum ve temel SEO durumunu inceliyor, hedeflediğiniz aramalarda rakiplerin durumuna bakıyor ve size uygun kapsamı öneriyoruz. Ön analiz herhangi bir taahhüt gerektirmez.",
    },
    {
      q: "Sitemi kendim yönetebilecek miyim?",
      a: "Evet. İçerik, görsel ve SEO alanlarını düzenleyebileceğiniz bir yönetim paneli teslim ediyoruz.",
    },
  ],
};

export const staticPages: (SeedPage & { type: "STATIC" | "BLOG_INDEX" })[] = [
  {
    type: "BLOG_INDEX",
    path: "/blog",
    name: "Rehber",
    seoTitle: "Web Tasarım ve SEO Rehberi | Web Tasarım Ajansı",
    metaDescription:
      "Web sitesi yaptırma, web tasarım fiyatları, SEO, e-ticaret ve mobil uyum hakkında sade ve uygulanabilir rehber yazıları.",
    h1: "Web Tasarım ve SEO Rehberi",
    intro:
      "Web sitesi yaptırmadan önce bilmeniz gerekenleri, SEO'nun temellerini ve e-ticarete başlarken atılacak adımları sade bir dille anlatan yazılar.",
    body: "",
  },
  {
    type: "STATIC",
    path: "/iletisim",
    name: "İletişim",
    seoTitle: "İletişim | Web Tasarım Ajansı",
    metaDescription:
      "Web tasarım, e-ticaret ve SEO projeleriniz için bize telefon, e-posta veya teklif formu üzerinden ulaşın.",
    h1: "İletişim",
    intro:
      "Projeniz hakkında konuşmak, bir soruyu sormak ya da mevcut sitenizin ücretsiz ön analizini istemek için aşağıdaki kanallardan bize ulaşabilirsiniz.",
    body: "",
  },
  {
    type: "STATIC",
    path: "/teklif-al",
    name: "Teklif Al",
    seoTitle: "Teklif Al | Ücretsiz Ön Analiz",
    metaDescription:
      "Web siteniz için ücretsiz ön analiz ve teklif isteyin. Formu doldurun, ihtiyaçlarınızı konuşmak için size dönelim.",
    h1: "Projenizi Konuşalım",
    intro:
      "Formu doldurun; ihtiyacınızı anlamak için size dönelim. Mevcut bir siteniz varsa adresini mesajınıza eklemeniz, ön analizi hızlandırır.",
    body: `## Formdan sonra ne olur?

1. Talebinizi inceleyip sizinle iletişime geçiyoruz.
2. Kısa bir görüşmede hedeflerinizi, müşteri profilinizi ve varsa mevcut sitenizi konuşuyoruz.
3. Kapsamı ve kalemleri açıkça gösteren yazılı bir teklif hazırlıyoruz.

Ön analiz ve teklif herhangi bir taahhüt gerektirmez.`,
  },
  {
    // E-E-A-T: kim olduğunuzu anlatan sayfa. Gerçek bilgilerle doldurulmadan yayınlanmamalı;
    // [DOĞRULANMALI] işaretleri kalırken hazırlık kontrolü FAIL verir.
    type: "STATIC",
    path: "/hakkimizda",
    name: "Hakkımızda",
    seoTitle: "Hakkımızda | Web Tasarım Ajansı",
    metaDescription: "Web tasarım, SEO ve e-ticaret projelerini kimlerin, nasıl bir yaklaşımla yürüttüğünü; çalışma ilkelerimizi ve ekibimizi tanıyın.",
    h1: "Hakkımızda",
    intro: "Web sitelerini arama motoru görünürlüğü, hız ve dönüşümle birlikte planlayan bir ekibiz. [DOĞRULANMALI: kuruluş yılı, şehir ve kısa kuruluş hikâyesi]",
    status: "DRAFT",
    body: `## Kimiz?

[DOĞRULANMALI: firmanın ticari unvanı, kuruluş yılı, merkezi ve kurucuların kısa tanıtımı — yalnızca gerçek bilgi]

## Nasıl çalışıyoruz?

- **Önce arama niyeti:** Her sayfanın hangi aramaya yanıt verdiğini baştan belirliyoruz.
- **Ölçülebilir süreç:** Search Console, sıralama takibi ve düzenli site taraması ile neyin neden yapıldığını raporluyoruz.
- **Sahiplik sizde:** Alan adı, hosting ve hesaplar firmanız adına açılır.
- **Kestirme yol yok:** Sahte yorum, sahte referans, gizli metin veya kopya şehir sayfası kullanmıyoruz.

## Ekip

[DOĞRULANMALI: ekip üyelerinin adları, rolleri ve uzmanlık alanları — izinleriyle]

## Belgeler ve üyelikler

[DOĞRULANMALI: varsa sertifikalar, sektör üyelikleri; yoksa bu bölümü kaldırın]

## Bize ulaşın

Projenizi konuşmak için [teklif formunu](/teklif-al) doldurabilir veya [iletişim](/iletisim) sayfasındaki kanallardan bize ulaşabilirsiniz.`,
  },
  {
    type: "STATIC",
    path: "/kvkk-aydinlatma-metni",
    name: "KVKK Aydınlatma Metni",
    seoTitle: "KVKK Aydınlatma Metni",
    metaDescription: "Kişisel verilerin işlenmesine ilişkin aydınlatma metni.",
    h1: "Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni",
    intro:
      "Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, iletişim ve teklif formları aracılığıyla paylaştığınız kişisel verilerin nasıl işlendiğini açıklamak amacıyla hazırlanmıştır.",
    robotsIndex: false,
    body: `## Veri sorumlusu

Kişisel verileriniz, veri sorumlusu sıfatıyla **{{isletme_adi}}** tarafından işlenmektedir. Adres: {{adres}}. E-posta: {{eposta}}.

## İşlenen kişisel veriler

Teklif ve iletişim formları aracılığıyla ad-soyad, firma adı, telefon numarası, e-posta adresi, şehir, ilgilenilen hizmet ve mesaj içeriği; form gönderimi sırasında ise güvenlik amacıyla geri döndürülemez şekilde özetlenmiş IP bilgisi işlenmektedir.

## İşleme amaçları

Kişisel verileriniz; talebinize yanıt verilmesi, teklif hazırlanması, sizinle iletişime geçilmesi ve form gönderimlerinin kötüye kullanıma karşı korunması amaçlarıyla işlenmektedir.

## Hukuki sebep

Verileriniz, Kanun'un 5. maddesinde yer alan "bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması" ve "veri sorumlusunun meşru menfaati" hukuki sebeplerine dayanılarak işlenmektedir.

## Aktarım

Kişisel verileriniz, yasal yükümlülükler dışında üçüncü kişilerle paylaşılmaz. Verilerin saklandığı sunucu ve e-posta hizmet sağlayıcıları, hizmetin sunulması için gerekli olduğu ölçüde veri işleyen olarak yer alabilir.

## Saklama süresi

Verileriniz, işleme amacının gerektirdiği süre boyunca ve ilgili mevzuatta öngörülen süreler kadar saklanır; bu sürelerin sonunda silinir, yok edilir veya anonim hâle getirilir.

## Haklarınız

Kanun'un 11. maddesi uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, eksik veya yanlış işlenmişse düzeltilmesini, silinmesini veya yok edilmesini isteme ve Kanun'da sayılan diğer haklara sahipsiniz. Taleplerinizi {{eposta}} adresine iletebilirsiniz.

---

*Bu metin genel bir şablondur; yayına almadan önce işletmenize özgü süreçlere göre bir hukukçu tarafından gözden geçirilmelidir.*`,
  },
];
