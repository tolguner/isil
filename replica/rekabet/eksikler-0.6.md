# Rakip taraması: Işıl 0.6.0'da eksik kalanlar (2026-10-17)

Yöntem: BlueStacks'te kullanarak inceleme. Peachy'nin araç dizini ve alt menüleri baştan tarandı. PicsArt düzenleyicisine girildi ama her adımda tam ekran reklam çıktığı için araç şeridi tam taranamadı; PicsArt satırları mağaza açıklamasından ve önceki nottan (`picsart.md`) geliyor. Hypic ve Facetune BlueStacks'te hâlâ siyah ekranda kalıyor. FaceApp tamamen bulutta çalıştığı için yeniden açılmadı. Önceki matris: `matris.csv`.

## 0.4–0.6 arasında kapanan eksikler

Bunlar artık Işıl'da var: yoldan geçenleri silme, seçmeli ayar, YZ ile tuval genişletme, çıkartma yapıcı, araç ve kaydırıcı araması, saç modeli ve kıyafet değiştirme (yüz korunarak), üretken silme, vücutta arka planı koruma.

## Hâlâ eksik olanlar

| # | özellik | kimde var | Işıl'da durum | yerelde yapılabilirlik |
|---|---|---|---|---|
| 1 | **Portre bulanıklığı:** özne ya da arka plan seçmeli bulanıklık (Gauss, hareket, dönme, radyal), "mat" kenar | Peachy (Bulanık; özne/arka plan seçimi) | Bokeh yalnız tüm görüntüye uygulanan bir efekt; konu maskesi ve derinlik haritası olduğu halde kullanılmıyor | Kolay: BiRefNet maskesi + derinlik haritası (Depth Anything), gölgelendiricide |
| 2 | **Yüz dolgunluğu:** alın, kaş kemiği, göz çukuru, gözyaşı oluğu, göz altı kesesi (aegyo-sal), elmacık, yanak, burun tabanı | Peachy (Dolgunluk, 9 bölge) | Yok. "Toparla"da yalnız "dolgun ışık" var | Orta: landmark bölgelerinde yerel şişirme (MLS) ve ışık/gölge |
| 3 | **Yüz gerdirme (lifting):** kontur, alın, gözler, orta yüz, ağız | Peachy (Gerdirme) | Kısmen: Toparla (göz altı, elmacık, V çizgisi) | Kolay: mevcut bükme ve kontur MLS ile |
| 4 | **3B yüz yönü:** eğim, döndürme, bakış açısı, simetri | Peachy (3D Şekillendir) | Yok | Zor: 3B yüz ağı (MediaPipe 468 noktası) ile ağ bükmesi; simetri kolay |
| 5 | **Saç hacmi** | Peachy (Saç → Hacim) | Yok (saç modeli ve rengi var) | Orta: saç maskesinde dışa bükme ya da FLUX ile maskeli |
| 6 | **Cilt dokusu (gözenek ekleme ve koruma)** | Peachy (Cilt → Doku), Facetune Skin | Kısmen: "Ayrıntı" kaydırıcısı | Kolay: frekans ayırma ve doku sentezi |
| 7 | **Vücut görünümü:** karın kası, köprücük kemiği, yelek hattı, göğüs hattı (üretken) | Peachy (Görünüm, Kas; çoğu ücretli) | Yok | Orta: FLUX maskeli (yalnız açık ciltte) |
| 8 | **Dövme ekleme** | Peachy (Vücut → Dövme) | Yok | Kolay: çıkartmayı cilde bükerek ve çarparak (multiply) karıştırma |
| 9 | **Yaş ve ifade dönüşümü** | FaceApp (bulut), Hypic | Kısmen: YZ Editör'e komut yazarak | Orta: FLUX maskeli, yüz kimliği ölçülerek |
| 10 | **Yüze özel hazır ayar kartları** (kaş, göz, burun, ağız için ayrı ayrı) | Peachy (İnce Ayar) | Kısmen: tek dokunuş tüm yüze uygulanıyor | Kolay: mevcut kaydırıcı gruplarından |
| 11 | **Kamera taklidi filtreler** (ör. GR III, eski dijital) | Prequel | Kısmen: dijikam ve film efektleri | Kolay: LUT ve gren profilleri |
| 12 | **3B hareketli fotoğraf (paralaks)** | Prequel, CapCut | Yok (derinlik haritası var) | Orta: derinlik + WebGL ağı, video dışa aktarma |
| 13 | **Canlı güzellik kamerası** | Peachy, Hypic | Kısmen: kamera ve canlı filtre var, canlı rötuş yok | Orta: gölgelendirici zaten gerçek zamanlı |
| 14 | **Şablonlar** (gönderi, hikâye, afiş) | PicsArt, Canva | Kısmen: tarifler | Orta: içerik üretimi gerekiyor |
| 15 | **Sohbetle düzenleme** (danışman önerisini tek tıkla uygulama) | PicsArt Aura | Kısmen: stil danışmanı öneriyor ama uygulamıyor | Orta: danışman çıktısını araç komutlarına bağlama |

Kapsam dışı bırakılanlar: video düzenleme, topluluk ve akış, yüz değiştirme (başkasının yüzünü koyma: kötüye kullanım riski).

## Rakiplerde gözlenen davranışlar (yineleme)

- Peachy'de araç seçince sık sık tam ekran reklam çıkıyor. Kas ve Görünüm araçları ücretli ve ilk kullanımda kaynak indiriyor.
- PicsArt'ta fotoğraf açılırken 30 saniyelik bir video reklam ve ardından Google Play'e yönlendirme var. Düzenleyiciye ancak ondan sonra girilebiliyor.
- Hypic ve Facetune öykünücüde açılmıyor; ölçümler Peachy ve PicsArt'la yapıldı.
