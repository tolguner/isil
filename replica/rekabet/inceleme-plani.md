# Aşama 5 planı — BlueStacks'te uygulamalı inceleme (kara kutu)

Kural: yalnız Tolga'nın kendi hesabı, ücretsiz kısım; ücretli kilit aşılmaz; kod/APK açılmaz, ağ trafiği dinlenmez. Ekran görüntüleri `replica/screens/rakip/` (git dışı).

## Tolga'nın yapacakları
1. BlueStacks'e **Facetune, Peachy, PicsArt, FaceApp** kurmak (Prequel isteğe bağlı; Canva ve CapCut fotoğraf için gerek yok).
2. Gerekirse kendi hesabıyla giriş. Deneme aboneliği **başlatılmayacak**.
3. Deneme setinden 5 fotoğrafı BlueStacks galerisine aktarmak (dosyaları hazırlarım: `dev-models/eval/bluestacks/`).

## Her uygulamada ölçülecekler

| test | nasıl | neden |
| --- | --- | --- |
| Uçak modu | ağ kapalıyken her aracı dene | hangi araç cihazda, hangisi bulutta |
| Süre | dokunuştan sonuca kronometre | Işıl'ın yerel YZ süreleriyle kıyas |
| Ücretsiz sınır | hangi araç kaydedilebiliyor, hangisi ödeme istiyor | kullanıcı şikâyetlerini doğrulama |
| Dışa aktarma | çıktı çözünürlüğü, filigran | "dışa aktarmada kalite düşüyor" şikâyeti |

## Aynı-fotoğraf testi (5 fotoğraf × uygulamanın ücretsiz araçları)

| fotoğraf | denenecek |
| --- | --- |
| portre-gunbatimi | otomatik güzelleştirme, cilt pürüzsüzleştirme, arka plan silme |
| grup-karanlik | yüz algılama (kaç yüz buluyor?), otomatik rötuş |
| koyu-ten-orgu | arka plan silme (örgüler), makyaj/ten tonu |
| plaj-kalabalik | nesne/kişi silme (küçük kişi ve büyük grup), "yoldan geçenleri otomatik bul" (Peachy) |
| bina-cizgiler | yüz/vücut inceltmede arka plan bükülüyor mu (Peachy, Facetune) |

Ek iki deneme görseli üretilir:
- **ızgara-portre:** portrenin üstüne ince kare ızgara; vücut/yüz şekillendirme aracının bükme alanını görünür yapar.
- **renk çizelgesi:** 24 renkli test kartı; filtrelerin renk eğrisini ölçmeye yarar.

## Akış incelemesi (en güçlü 2–3 akış)

| uygulama | akış |
| --- | --- |
| Facetune | Looks → bölge bölge ince ayar; Clothes; Vanish (nesne silme) |
| Peachy | otomatik vücut şekli; boy uzatma; Relight serbest ışık; yoldan geçenleri otomatik sil |
| PicsArt | YZ Genişlet; çıkartma yapıcı; nesne silici (MI-GAN) |
| FaceApp | saç modeli/rengi; yaş; önce/sonra her adımda |

Her akış için: ekranlar, kontroller, tıklama sayısı, varsayılan değerler, geri al davranışı, sonuç kalitesi (Işıl ile yan yana).
