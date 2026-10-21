# Işıl kullanım kılavuzu

Işıl, Windows için ücretsiz ve açık kaynak bir fotoğraf düzenleyicidir. Rötuş, makyaj, ışık ve renk, nesne silme, arka plan ve yapay zekâ ile düzenleme araçları içerir. Her şey bilgisayarında çalışır: fotoğrafların hiçbir yere gönderilmez, hesap, kredi ya da filigran yoktur.

## Başlarken

1. Ana sayfada **Fotoğraf aç**'a bas ya da bir fotoğrafı pencereye sürükle. JPEG, PNG, WebP ve iPhone'un HEIC dosyaları açılır.
2. Her fotoğraf bir **proje** olur. Değişiklikler otomatik kaydedilir; ana sayfadaki "Son projeler"den kaldığın yere dönebilirsin. Orijinal dosyana dokunulmaz.
3. Bitince sağ üstteki **Dışa aktar** düğmesiyle (Ctrl+E) JPEG, PNG ya da WebP olarak kaydet. Boyut ve kalite Ayarlar → Dışa aktarma'dadır.

## Ekran

- **Sekmeler** araç gruplarıdır. Bir sekmeye girip bir aracı seçince sağda ayarları açılır.
- **Uygula** aracın sonucunu kalıcı yapar, **İptal** (Esc) geri döner. Uygulanan her adım Ctrl+Z ile geri alınabilir.
- Önceki hali görmek için **\\** tuşunu basılı tut.
- Herhangi bir aracı ya da ayarı adıyla bulmak için **Ctrl+K**. Tüm kısayollar için **?** tuşu.

## Sekmeler

| Sekme | Ne yapar |
|---|---|
| YZ Editör | Yazarak düzenle ("arka planı sahil yap"), hazır stiller, saç ve kıyafet değiştirme. Yerel YZ motorunu ister. |
| Tarifler | Hazır görünümler, kendi kaydettiğin görünümler, gönderi ve hikâye şablonları. |
| Rötuş | Tek dokunuş güzellik, yüz şekli, cilt (yumuşatma, leke, göz altı, doku), makyaj (ruj, allık, far, kalem, kirpik, göz rengi, kaş, çil, ben), saç rengi, vücut, karın kası, yaş ve ifade, ışıklandırma. |
| Filtreler | Renk filtreleri ve sanatsal efektler. |
| Ayarla | Otomatik, pozlama, kontrast, gölge, renk, HSL, eğriler, seçmeli ayar, gece ve karşı ışık, kalite artırma. |
| Kırp | Oran, döndürme, perspektif, yapay zekâ ile genişletme. |
| Temizle | Sihirli silgi, klonla, yoldan geçenleri sil, metin sil, YZ ile değiştir, mozaik. |
| Efektler | Portre bulanıklığı, hava efektleri, 3B hareketli fotoğraf. |
| Kesim ve Arka plan | Arka planı kaldır, düz renk, gradyan, bulanık, görsel ya da şeffaf arka plan, gökyüzü değiştirme. |
| Şekillendir | Serbest bükme ve gerdirme. |
| Metin, Çıkartma, Şekiller, Fırça | Yazı, çıkartma, şekil ve çizim katmanları. |

Ana sayfada ayrıca **kolaj**, **toplu düzenleme** (birçok fotoğrafa aynı ışık ve renk), **stil danışmanı** ve **canlı kamera** vardır.

## Yapay zekâ

- Yüz, vücut ve saç bulma Işıl'la birlikte gelir. Arka plan kesme, nesne silme, kalite artırma gibi araçlar ilk kullanımda küçük bir model indirir (Ayarlar → Yerel yapay zekâ modelleri).
- **Üretken araçlar** (YZ Editör, YZ efektleri, YZ ile değiştir, stil danışmanı) isteğe bağlı **yerel YZ motorunu** kullanır. Ayarlar → Yerel üretken yapay zekâ'dan kurulur; yaklaşık 15 GB indirir ve en iyi NVIDIA ekran kartında çalışır. Motoru başka bir diske taşıyabilir ya da kaldırabilirsin.
- **Kişisel kullanım modelleri:** bazı modeller daha iyi sonuç verir ama lisansları ticari kullanıma kapalıdır. Varsayılan olarak kapalıdırlar; Ayarlar'dan açarsan yalnız kişisel amaçla kullanmayı kabul edersin.
- **Kötüye kullanım koruması:** Işıl çıplak ya da cinsel içerikli görüntü üretmez ve kişilerin kıyafetlerini çıkarmaz; bu tür istekler engellenir. Başkalarının fotoğraflarını izinsiz düzenleyip paylaşma.

## Sık sorulanlar

**Projelerim nerede?** `%APPDATA%\Işıl\projects` klasöründe. Orijinal fotoğrafın ve uyguladığın her adım orada durur.

**Dışa aktardığım fotoğrafta konum bilgisi var mı?** Hayır. Dışa aktarmada konum dahil meta veriler silinir.

**Uygulama yavaş.** Ekran kartı sürücünü güncelle. Dizüstünde Işıl'ın harici ekran kartıyla çalıştığından emin ol (Windows Ayarlar → Ekran → Grafik).

**Bir hata oldu.** Ayarlar → Hakkında → **Hata günlüğünü aç** ile günlük dosyasını bul ve sorunu bildirirken ekle. Günlükte fotoğraf ya da kişisel bilgi yoktur. Sorunları [GitHub'da](https://github.com/tolguner/isil/issues) bildirebilirsin.

**Kaldırınca ne silinir?** Uygulama silinir; kaldırıcı yapay zekâ motorunu ve modelleri de silmek isteyip istemediğini sorar. Projelerin ve ayarların korunur.
