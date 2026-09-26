// Test fikstürü: yapay zekânın döndürebileceği, kurallara uyan bir rehber yazısı.
// Rakam, müşteri/referans/yorum iddiası ve yer adı içermez; iç linkler yayındaki sayfalara.
export const goodAiPage = {
  seoTitle: "Web Sitesi Bakımı Nedir? Düzenli Bakımın Kapsamı",
  metaDescription: "Web sitesi bakımı nedir, hangi işleri kapsar ve neden düzenli yapılmalıdır? Güncelleme, yedekleme, güvenlik ve içerik kontrolünü sade bir dille anlattık.",
  h1: "Web Sitesi Bakımı Nedir?",
  intro: "Web sitesi bakımı, yayındaki bir sitenin güvenli, hızlı ve güncel kalması için yapılan düzenli teknik ve içerik işlerinin bütünüdür. Bakım yapılmayan bir site zamanla yavaşlar, güvenlik açıkları birikir ve arama motorlarında eski bilgi göstermeye başlar.",
  body: `## Bakım neden bir kerelik iş değildir?

Bir web sitesi yayına alındığı gün tamamlanmış sayılmaz. Tarayıcılar, sunucu yazılımları ve kullanılan eklentiler sürekli değişir. Dün sorunsuz çalışan bir form, bir kütüphane güncellendiğinde sessizce bozulabilir. Bu yüzden bakımı bir proje değil, sitenin yaşamı boyunca süren bir alışkanlık olarak düşünmek gerekir. Düzenli kontrol, küçük sorunların büyümeden fark edilmesini sağlar.

## Web sitesi bakımı hangi işleri kapsar?

### Yazılım ve eklenti güncellemeleri

İçerik yönetim sistemi, tema ve eklentiler üreticileri tarafından düzenli olarak yenilenir. Bu yenilemelerin önemli bir kısmı güvenlik düzeltmesidir. Güncellemeler önce bir deneme ortamında denenmeli, ardından canlı siteye alınmalıdır; böylece beklenmedik bir uyumsuzluk ziyaretçilere yansımaz.

### Yedekleme ve geri dönüş planı

Yedek, yalnızca alındığında değil, geri yüklenebildiğinde işe yarar. Veritabanı ve dosyaların ayrı ayrı yedeklenmesi, yedeklerin sitenin bulunduğu sunucudan farklı bir yerde saklanması ve geri yükleme adımlarının ara sıra denenmesi iyi bir uygulamadır.

### Güvenlik kontrolleri

Yönetici hesaplarında güçlü parolalar, gereksiz kullanıcıların kaldırılması, kullanılmayan eklentilerin silinmesi ve sunucu kayıtlarının incelenmesi temel güvenlik işleridir. Şüpheli bir değişiklik fark edildiğinde yedekten dönmek, sorunu kaynağında bulmaktan çoğu zaman daha hızlıdır.

### Hız ve teknik sağlık

Zamanla büyüyen görseller, biriken eklentiler ve eskiyen kodlar sayfaları yavaşlatır. Görsellerin uygun biçimde sıkıştırılması, kullanılmayan kodun temizlenmesi ve önbellek ayarlarının gözden geçirilmesi sayfa hızını korur. Kırık iç bağlantılar ve bulunamayan sayfalar da bu kontrolün parçasıdır.

### İçeriğin güncel tutulması

İletişim bilgileri, hizmet açıklamaları ve sık sorulan sorular işletme değiştikçe eskir. Eski bilgi hem ziyaretçiyi yanıltır hem de güveni azaltır. Bakım takvimine içerik gözden geçirmesini eklemek, sitenin gerçekte sunulan hizmeti anlatmaya devam etmesini sağlar.

## Bakım arama motoru görünürlüğünü nasıl etkiler?

Arama motorları hızlı açılan, hatasız çalışan ve güncel bilgi sunan sayfaları kullanıcıya göstermeyi tercih eder. Kırık bağlantılar, yavaş sayfalar ve eski içerik bu tercihi olumsuz etkiler. Teknik denetim, iç bağlantı yapısı ve içerik iyileştirmesi birlikte ele alındığında görünürlük daha sağlam bir zemine oturur. Bu konuların ayrıntısını [SEO hizmeti](/seo-hizmeti) sayfamızda anlattık.

## Bakımı kim yapmalı?

Basit içerik güncellemelerini işletme ekibi yönetim panelinden kendisi yapabilir. Yazılım güncellemeleri, yedeklerin denetimi ve güvenlik incelemesi ise teknik bilgi gerektirir. Görev dağılımını baştan yazılı hale getirmek, hiçbir işin arada kalmamasını sağlar. Yeni bir site planlıyorsanız bakım sorumluluğunu da o aşamada konuşmak gerekir; bunun için [web tasarım](/web-tasarim) sürecini ve [kurumsal web tasarım](/kurumsal-web-tasarim) yaklaşımını inceleyebilirsiniz.

## Bakım planı hazırlarken nelere dikkat edilmeli?

İyi bir plan, hangi işin ne sıklıkla ve kim tarafından yapılacağını açıkça gösterir. Güncellemeler, yedek kontrolü, güvenlik incelemesi, hız ölçümü ve içerik gözden geçirmesi ayrı başlıklar olarak yazılmalıdır. Her kontrolden sonra kısa bir not tutmak, bir sorun çıktığında neyin ne zaman değiştiğini bulmayı kolaylaştırır.`,
  faq: [
    { q: "Web sitesi bakımı yapılmazsa ne olur?", a: "Güvenlik açıkları birikir, sayfalar yavaşlar ve içerik eskir. Bu durum hem ziyaretçi deneyimini hem de arama motorlarındaki görünürlüğü olumsuz etkiler." },
    { q: "Bakım ile yeniden tasarım aynı şey mi?", a: "Hayır. Bakım mevcut sitenin sağlıklı çalışmasını korur; yeniden tasarım ise sitenin yapısını ve görünümünü baştan ele alır." },
  ],
  verifyNotes: [],
};
