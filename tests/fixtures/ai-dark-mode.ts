// Test fikstürü: otopilotun rakip + seed fırsatından açtığı rehber için yapay zekâ çıktısı.
// Rakam, müşteri/referans/sonuç iddiası ve yer adı içermez; iç linkler yayındaki sayfalara.
export const darkModeAiPage = {
  seoTitle: "Web Tasarımda Karanlık Mod Nasıl Uygulanır? Rehber",
  metaDescription: "Web tasarımda karanlık mod nasıl uygulanır? Renk kontrastı, sistem tercihine uyum, görseller ve erişilebilirlik kontrolünü adım adım anlattık.",
  h1: "Web Tasarımda Karanlık Mod Nasıl Uygulanır?",
  intro: "Karanlık mod, arayüzün koyu zemin ve açık yazı kullanan bir görünümüdür. Doğru uygulandığında gece kullanımında gözü yormaz ve kullanıcının cihaz tercihine saygı gösterir. Bu yazıda karanlık modu bir web sitesine eklerken dikkat edilmesi gereken tasarım ve teknik kararları sırasıyla ele alıyoruz.",
  body: `## Karanlık mod neden bir tasarım kararıdır?

Karanlık mod yalnızca renkleri tersine çevirmek değildir. Koyu zeminde gölgeler kaybolur, ince çizgiler zor seçilir ve parlak vurgu renkleri gereğinden fazla dikkat çeker. Bu yüzden koyu görünüm, açık görünümle aynı özenle ayrı bir tema olarak planlanmalıdır. Tasarım sisteminde her renk bir görevle tanımlanırsa iki tema arasında geçiş kolaylaşır ve hiçbir bileşen unutulmaz.

## Renkleri görevleriyle tanımlayın

### Zemin, yüzey ve yazı katmanları

Sayfa zemini, kartların yüzeyi ve metin için ayrı renk değişkenleri tanımlamak işin temelidir. Koyu temada tam siyah yerine hafif ısıtılmış koyu bir ton göz yorgunluğunu azaltır. Kart yüzeyleri zeminden biraz daha açık tutulduğunda katmanlar gölgeye ihtiyaç duymadan ayrışır.

### Vurgu rengini yumuşatın

Açık temada iyi görünen canlı bir vurgu rengi koyu zeminde parlayabilir. Vurgu tonunu biraz açarak ya da doygunluğunu azaltarak düğme ve bağlantıların okunaklı kalmasını sağlayabilirsiniz. Hata, uyarı ve onay renkleri için de aynı kontrol yapılmalıdır.

## Kullanıcının tercihine uyun

Modern tarayıcılar, işletim sistemindeki koyu tema tercihini sitelere bildirir. Stil dosyasında bu tercihi dinleyen bir kural yazmak, ziyaretçinin ayrıca bir düğmeye basmasına gerek kalmadan doğru temayı gösterir. Sitede elle tema değiştirme seçeneği sunuluyorsa seçim tarayıcıda saklanmalı ve sayfa yüklenirken yanıp sönme olmadan uygulanmalıdır. Bunun için tema bilgisinin sayfa çizilmeden önce belgeye işlenmesi gerekir.

## Görseller ve logolar

Şeffaf zeminli logolar koyu temada kaybolabilir. Logonun açık zemin için hazırlanmış bir sürümü varsa koyu tema için ayrı bir sürüm eklemek en temiz çözümdür. Fotoğraflarda ise parlaklığı hafifçe düşürmek ekranın geri kalanıyla uyum sağlar. Grafik ve şemalarda eksen çizgileri ile etiketlerin renkleri de temaya göre değişmelidir; aksi hâlde veriler okunmaz hâle gelir.

## Erişilebilirliği ölçün

Koyu temada yazı ile zemin arasındaki kontrast yeterli olmalıdır. Kontrastı tahminle değil, bir kontrast denetim aracıyla ölçmek gerekir. Odak halkası, form alanlarının kenarlıkları ve devre dışı düğmeler koyu zeminde en sık gözden kaçan öğelerdir. Klavyeyle gezinerek her etkileşimli öğenin görünür bir odak durumu olduğunu kontrol edin.

## Performans ve arama motoru görünürlüğü

Tema değişikliği için ağır betikler yüklemek gerekmez; renk değişkenleri ve küçük bir stil kuralı çoğu zaman yeterlidir. Hafif kalan sayfalar hızlı açılır ve bu da hem ziyaretçi deneyimini hem de arama motorlarının sayfayı değerlendirmesini olumlu etkiler. Teknik temelin nasıl kurulduğunu [SEO hizmeti](/seo-hizmeti) sayfamızda anlattık.

## Uygulamadan önce kontrol listesi

Karanlık modu yayına almadan önce tüm sayfa türlerini iki temada da gözden geçirin: ana sayfa, hizmet sayfaları, blog yazıları, formlar ve hata sayfaları. Her bileşenin renk değişkenlerini kullandığından, sabit yazılmış renk kalmadığından ve görsellerin iki zeminde de anlaşılır olduğundan emin olun. Yeni bir site planlıyorsanız tema yapısını en baştan kurmak sonradan eklemekten çok daha kolaydır; bunun için [web tasarım](/web-tasarim) sürecimizi ve [kurumsal web tasarım](/kurumsal-web-tasarim) yaklaşımımızı inceleyebilirsiniz.`,
  faq: [
    { q: "Karanlık mod her site için gerekli mi?", a: "Zorunlu değildir; ancak ziyaretçilerin önemli bir kısmı cihazında koyu temayı kullanıyorsa sitenin bu tercihe uyması okuma rahatlığını artırır." },
    { q: "Karanlık mod arama motoru sıralamasını etkiler mi?", a: "Tema tek başına bir sıralama etkeni değildir. Önemli olan sayfanın hızlı, okunaklı ve erişilebilir kalmasıdır." },
  ],
  verifyNotes: [],
};
