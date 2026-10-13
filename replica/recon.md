# Recon haritası: Hypic (iOS/Android) → masaüstü klonu (Windows, Electron)

Kapsam: Fotoğraf düzenleme çekirdeği. Faz 1: aç → ayarla/filtre/kırp → rötuş → arka plan sil → dışa aktar.
Sonraki fazlar: şablonlar, kolaj, toplu düzenleme, yerel üretken AI.
Kimin için: Tolga'nın kişisel kullanımı + portfolyo (tolguner.me, GitHub). Hesap, ödeme, Pro kilidi yok.
AI: Yerel önce (ONNX Runtime + üretken araçlar için Python/SD yan süreci; RTX 3050 6 GB + 16 GB RAM, CPU yedeği).
    Gemini anahtarı isteğe bağlı "yüksek kalite" seçeneği. Ayrıntı: `ai-analizi.md`.
Ücret: Hypic'teki tüm Pro (👑) araçlar klonda ücretsiz ve açık; paywall yok.
Canlı inceleme: `inceleme-notlari.md` (BlueStacks, 2026-10-13) — aşağıdaki ekran tablosunu günceller/geçersiz kılar.
Tarih: 2026-10-13

## Kaynaklar

| # | kaynak | URL | notlar |
| --- | --- | --- | --- |
| 1 | App Store listesi | https://apps.apple.com/us/app/-/id1644042837 | Açıklama, HypicPro fiyatları, 7.x–9.6 sürüm notları |
| 2 | Ekran envanteri (3. taraf) | https://screensdesign.com/apps/hypic-photo-editor-ai-art/ | En ayrıntılı ekran/araç listesi; ekranların çoğu sitenin paywall'ı arkasında, açıklamalardan okundu |
| 3 | Apptopia profili | https://apptopia.com/ios/app/1644042837/about | Şablon kategorileri (TikTok, Instagram, selfie, çift, yemek, duvar kağıdı) |
| 4 | Fiyat izleyici | https://www.apppricinglab.com/app/apple/1644042837 | Aylık $10.99, yıllık $69.99; 4.7 puan |
| 5 | 3. taraf özet | https://zoftwarehub.com/products/hypic/overview | Rötuş: cilt, leke, diş beyazlatma, göz parlatma, makyaj |
| 6 | APKMirror | https://apkmirror.com/apk/bytedance-pte-ltd/hypic-photo-editor-ai-art | Yalnızca sürüm geçmişi için; APK indirilmedi/açılmadı |

Resmi yardım merkezi bulunamadı. Uygulama içi menü adları (özellikle rötuş alt araçları) kesin değil;
Tolga kendi telefonunda Hypic'i açıp ekran görüntüsü alırsa `replica/screens/` doldurulur ve tablo kesinleşir.

## Çekirdek döngü

Bir portreyi aç, tek dokunuşla rötuşla + estetik filtre uygula, birkaç kaydırıcıyla ince ayar yap, sosyal medyaya hazır dışa aktar.

## Ekranlar

Mobil ekranlar masaüstüne uyarlandı: alt sekme çubuğu → sol kenar çubuğu, alt araç kaydırması → sağ panel.
Atlananlar: onboarding anketi, doğum tarihi, izin istemleri, Apple ile giriş, paywall (kişisel kullanım).

| ID | ekran | nasıl ulaşılır | amaç | ana bileşenler | görülen durumlar |
| --- | --- | --- | --- | --- | --- |
| S01 | Ana sayfa | uygulama açılışı | Fotoğraf aç, hızlı araçlar, son projeler | büyük "Fotoğraf aç" kartı, sürükle-bırak alanı, araç kartları (Arka plan sil, Sihirli silgi, AI Genişlet, Toplu, Kolaj), son projeler ızgarası | boş (proje yok), dolu, sürükleme üstünde |
| S02 | Fotoğraf seçici | S01 → Aç / Kolaj / Toplu | Dosya ya da klasörden çoklu seçim | sistem dosya diyaloğu + uygulama içi klasör ızgarası, seçim şeridi, "Düzenle"/"Kolaj" | boş klasör, tekli, çoklu seçim, desteklenmeyen dosya hatası |
| S03 | Editör kabuğu | S01/S02 → fotoğraf | Tüm araçların çalıştığı tuval | üst çubuk (geri, geri al/yinele, karşılaştır, Dışa aktar), tuval (yakınlaştır/kaydır), sol araç rafı, sağ ayar paneli, alt geçmiş | yükleniyor, dolu, AI işleniyor, hata (model yok) |
| S04 | Ayarlar (Adjust) | S03 → Ayarla | Işık/renk/detay kaydırıcıları | kaydırıcı grubu (parlaklık, kontrast, pozlama, vurgular, gölgeler, sıcaklık, ton, doygunluk, canlılık, netlik, keskinlik, gren, vinyet, solma, HSL), sıfırla | varsayılan, değişmiş (nokta işareti) |
| S05 | Hızlı ayar | S03 → Hızlı ayar | Tek tıkla ruh hali (Flash Glow, Mavi saat, Altın gün batımı, Sinematik, AI Flash) | ön ayar kartları + yoğunluk kaydırıcı | seçili/seçili değil |
| S06 | Filtreler / Efektler | S03 → Filtre | Estetik ön ayarlar (retro film, clean girl, soft glow, digicam G7X2) | kategori sekmeleri, filtre küçük resim şeridi, yoğunluk kaydırıcısı | yükleniyor küçük resimler, seçili |
| S07 | Kırp / Döndür / Perspektif | S03 → Kırp | Kırpma ve geometri | oran listesi (Serbest, 1:1, 4:5, 9:16, 16:9, 3:4…), döndürme kadranı, 90° döndür, çevir, yatay/dikey perspektif kaydırıcıları | serbest, oran kilitli |
| S08 | Rötuş (otomatik) | S03 → Rötuş | Yüz algılamayla tek dokunuş güzelleştirme | yüz seçici (çok yüz), kaydırıcılar: pürüzsüzleştirme, leke, kırışık, göz altı, diş beyazlatma, göz parlatma, cilt tonu | yüz bulundu, yüz bulunamadı, çoklu yüz |
| S09 | Yüz şekli (Face) | S08 → Yüz | Landmark tabanlı yüz şekillendirme | alt sekmeler (Yüz, Gözler, Burun, Dudaklar, Kaşlar), çift yönlü kaydırıcılar (incelik, çene, göz boyutu, burun genişliği…) | yüz yok uyarısı |
| S10 | Elle şekillendir (Reshape) | S03 → Şekillendir | Liquify: it, büyüt, küçült, döndür, geri yükle | mod sekmeleri, fırça boyutu + yoğunluk kaydırıcısı, fırça imleci | çizim sırasında, geri yükleme |
| S11 | Kapatıcı / Leke fırçası | S08 → Kapatıcı | Fırçayla leke kapatma | fırça boyutu, otomatik/elle | fırça aktif |
| S12 | Makyaj | S08 → Makyaj | Ruj, allık, göz farı, kaş ön ayarları | kategori + renk paleti + yoğunluk | yüz yok |
| S13 | Kesme (Cutout) / Arka plan sil | S03 veya S01 kısayolu | Konuyu ayırma | AI seçim, elle seçim fırçası, silgi, boyut/sertlik/opaklık kaydırıcıları, damalı arka plan | işleniyor, maske hazır, düzeltme modu |
| S14 | Arka plan | S13 sonrası | Yeni arka plan: düz renk, bulanık, degrade, görsel | renk paleti, bulanıklık kaydırıcısı, görsel içe aktar, tuval oranı | — |
| S15 | Sihirli silgi (Cleanup) | S03 → Temizle | İstenmeyen nesneyi boyayıp silme (inpaint) | fırça, fırça boyutu, "Sil" düğmesi, karşılaştır | boyanıyor, işleniyor, sonuç |
| S16 | Metin | S03 → Metin | Yazı ekleme | giriş alanı, yazı tipi kategorileri, stil ön ayarları, renk, boyut, opaklık, kontur/gölge, hizalama | düzenleme, seçili katman |
| S17 | Çıkartmalar | S03 → Çıkartma | Çıkartma ekleme | kategori gezinmesi, ızgara, "Görsel içe aktar" | — |
| S18 | Çizim / Doodle | S03 → Çiz | Serbest çizim | fırça boyutu, renk, desen fırçaları, silgi | — |
| S19 | Şekiller | S03 → Şekil | Geometrik şekil ekleme | şekil ızgarası, dolgu/kontur rengi | — |
| S20 | AI Genişlet | S03 → Genişlet | Tuvali genişletip kenarları doldur | önizleme, ölçek kaydırıcısı, oran seçimi, isteğe bağlı istem, "Genişlet" | işleniyor (uzun), sonuç, yetersiz VRAM |
| S21 | AI Stil / Avatar | S01 veya S03 → AI Stil | Fotoğrafı anime/karikatür/sanat stiline çevir | stil kartları, yoğunluk, yeniden üret | işleniyor, sonuç |
| S22 | Kalite artır (Enhance) | S03 → Netleştir | Upscale + yüz restorasyonu | 2×/4× seçimi, yüz iyileştirme anahtarı, önce/sonra | işleniyor, büyük görsel uyarısı |
| S23 | Şablonlar | S01 → Şablonlar | Hazır tasarıma fotoğraf yerleştirme | kategori filtresi, masonry ızgara, önizleme, "Kullan" | boş kategori |
| S24 | Kolaj | S02 → Kolaj | Çoklu fotoğraf yerleşimi | yerleşim ızgarası, oran, kenar boşluğu/köşe yuvarlama, Birleştir (dikey/yatay) | 2–9 fotoğraf |
| S25 | Toplu düzenleme | S02 → Toplu | Aynı düzenlemeyi çok fotoğrafa uygula | küçük resim şeridi, "ayarları kopyala/yapıştır", hepsini dışa aktar | ilerleme, kısmi hata |
| S26 | Dışa aktarma | S03 → Dışa aktar | Kaydet | biçim (JPG/PNG/WebP), kalite, boyut, klasör, "Kaydedildi" bildirimi, "Düzenlemeye devam" | kaydediliyor, başarılı, hata (yazma izni) |
| S27 | Projeler / Profil | sol çubuk → Projeler | Kayıtlı düzenlenebilir projeler | proje ızgarası, seçim modu, sil onayı | boş, dolu, seçim modu |
| S28 | Ayarlar | sol çubuk → Ayarlar | Tercihler | dil (TR/EN), tema, varsayılan dışa aktarma, GPU/CPU seçimi, AI modelleri (indir/sil/boyut), depolama kullanımı, lisanslar | model eksik, indiriliyor |
| S29 | Diyaloglar | çeşitli | Onaylar | Çıkış (kaydedilmemiş değişiklik), Sil onayı, "Metin efektten sonra düzenlenemez" uyarısı | — |

Kamera ekranı (orijinalde var) atlanıyor: masaüstünde web kamerası düşük değerli. "could" olarak matriste.

## Akışlar

```
F01 Portreyi hızlıca güzelleştir (çekirdek döngü)
    S01 -> S03 -> S08 (otomatik rötuş) -> S06 (filtre) -> S26 dışa aktar
    happy path tıklama: 6 (Aç, dosya seç, Rötuş, Otomatik, filtre seç, Dışa aktar+Kaydet)
    edge: yüz bulunamadı, çoklu yüz, çok büyük görsel (>40 MP), HEIC dosyası

F02 Işık ve renk ayarı
    S03 -> S04 -> (karşılaştır basılı tut) -> S26
    edge: geri al/yinele zinciri, sıfırla, 16-bit PNG

F03 Arka planı sil ve değiştir
    S01 (Arka plan sil kısayolu) -> S13 -> (fırçayla düzelt) -> S14 -> S26 (PNG şeffaf)
    happy path tıklama: 4
    edge: saç kenarları, birden çok konu, model ilk kez yükleniyor

F04 Nesneyi sil
    S03 -> S15 -> boya -> Sil -> S26
    edge: büyük alan, kenarda nesne, tekrar sil

F05 Yüzü elle şekillendir
    S03 -> S09 veya S10 -> S26
    edge: arka plan bükülmesi (çizgiler), fırça geri yükleme

F06 Kırp ve döndür
    S03 -> S07 -> S26

F07 Metin + çıkartma ekle
    S03 -> S16 -> S17 -> S26
    edge: katman sırası, metin seçip yeniden düzenleme, piksel efektinden sonra metin kilidi

F08 Projeyi kaydedip sonra devam et
    S03 (otomatik kayıt) -> S27 -> S03

F09 Kolaj yap
    S01 -> S02 (çoklu) -> S24 -> S26

F10 Toplu düzenleme
    S01 -> S02 (çoklu) -> S25 -> S26 (klasöre hepsi)
    edge: bir dosya bozuk, farklı oranlar

F11 Şablon kullan
    S23 -> önizleme -> fotoğraf seç -> S03 -> S26

F12 AI Genişlet / AI Stil / Kalite artır
    S03 -> S20 | S21 | S22 -> S26
    edge: VRAM yetersiz → CPU'ya düş, uzun süre (iptal düğmesi), model indirilmemiş
```

## Bileşenler

| bileşen | varyantlar | durumlar | kullanıldığı yer |
| --- | --- | --- | --- |
| Button | primary (lime vurgu), secondary, ghost, danger, icon | default, hover, focus, disabled, loading | hepsi |
| Slider | tek yönlü (0–100), çift yönlü (−100…+100, ortada sıfır) | default, sürükleniyor, değişmiş, devre dışı | S04, S05, S06, S08–S15, S20 |
| ToolRail | ikon+etiket dikey liste | seçili, hover, Yeni rozeti | S03 |
| ToolPanel | başlıklı panel + iptal/onay | açık, kapalı | S04–S22 |
| PresetCard | filtre küçük resmi, hızlı ayar, stil kartı | seçili, yükleniyor | S05, S06, S12, S21 |
| CategoryTabs | yatay sekmeler | seçili | S06, S09, S12, S16, S17, S23 |
| Canvas | tek görsel, karşılaştır (basılı tut / bölünmüş), fırça imleci, kırpma çerçevesi, katman tutamaçları | yakınlaştır, kaydır, fırça, işleniyor kaplaması | S03 |
| BrushControls | boyut, sertlik, opaklık, mod (boya/sil/geri yükle) | — | S10, S11, S13, S15, S18 |
| ColorPicker | palet, özel renk, damlalık | — | S14, S16, S18, S19 |
| AspectRatioList | ikonlu oran listesi | seçili | S07, S14, S20, S24 |
| Thumbnail grid | sabit ızgara, masonry | seçili, çoklu seçim, boş | S01, S02, S23, S27 |
| ProgressOverlay | belirsiz, yüzdeli, iptal edilebilir | — | S13, S15, S20–S22, S25 |
| Toast | başarı, hata, bilgi | — | S26, S27 |
| Modal/Dialog | onay, uyarı | — | S29 |
| History list | geri al adımları | aktif adım | S03 |

## Çıkarılan veri modeli

Yerel uygulama, sunucu yok. Projeler disk üzerinde: `%APPDATA%/<uygulama>/projects/<id>/`.

```
Project     id, name, created_at, updated_at, source_path, source_hash, width, height,
            thumbnail_path, document (json: EditStack)
            evidence: S27 kayıtlı projeler ızgarası, "Saved project" bildirimi
            confidence: high (varlık), guess (alanlar)

EditStack   adjust {brightness, contrast, ..., hsl[8]}, filter {id, intensity}, quick_adjust {id, intensity},
            crop {rect, ratio, rotation, flip, perspective{h,v}},
            retouch {faces: [{face_index, smooth, blemish, ..., shape{...}}]},
            raster_ops [ {type: liquify|inpaint|concealer|cutout_mask|expand|ai_style|enhance, asset_path, params} ],
            layers [Layer], background {type, value}
            evidence: S04–S22 araç parametreleri, "metin efektten sonra düzenlenemez" uyarısı
              (orijinalde piksel işlemleri metni rasterize ediyor → katmanlar piksel işlemlerinden sonra)
            confidence: medium

Layer       id, type (text|sticker|shape|drawing|image), z, transform {x,y,scale,rotation},
            props (json: metin, font, renk, ...), locked
            evidence: S16–S19
            confidence: high

Preset      id, kind (filter|quick_adjust|makeup|ai_style), category, name, thumbnail, params (json / LUT dosyası)
            evidence: S05, S06, S12, S21
            confidence: high

Template    id, category, name, canvas_size, slots[{rect, mask}], decorations [Layer]
            evidence: S23, Apptopia kategorileri
            confidence: medium

CollageLayout id, cells[{rect}], aspect
            evidence: S24
            confidence: high

AiModel     id, task (bg_remove|inpaint|face_landmarks|upscale|face_restore|style|outpaint),
            file, size_mb, provider (cuda|dml|cpu), downloaded
            evidence: klona özgü (yerel AI kararı); orijinalde bulut
            confidence: n/a (tasarım kararı)

Settings    language, theme, export_defaults {format, quality}, gpu_provider, models_dir
```

İlişkiler: Project 1-1 EditStack, EditStack 1-n Layer, EditStack n-1 Preset (filtre), Template 1-n slot, AiModel n-n araç.

## Özellik matrisi

Bkz. `features.csv`. Must: 40, should: 23, could: 13 (bunların 2'si klonda `skip`: AI Hair, çoklu-selfie avatar), skip: 8.

## Kapsam dışı (kopyalanamaz / kopyalanmamalı)

- Hypic adı, logosu, lime-yeşil marka kimliği, yazı tipleri, filtre adları ve hazır LUT'lar: kendi adımız ve kendi ön ayarlarımız.
- Şablon ve çıkartma kütüphanesi (lisanslı/kendi içerikleri): kendi küçük setimizi üreteceğiz (CC0 kaynaklar + kendi tasarımlarımız).
- Keşfet/trend akışı, yaratıcı profilleri, TikTok paylaşım ortaklığı: ağın kendisi.
- Hesap, abonelik, HypicPro paywall: kişisel kullanım, gerek yok.
- ByteDance'in bulut AI modelleri: yerine açık lisanslı yerel modeller (lisansları ticari kullanıma göre ayrıca kontrol edilecek).
- Onboarding anketi, doğum tarihi, izleme izni.

## Yerel AI eşlemesi (taslak, replica-architect kesinleştirecek)

| araç | aday model | not |
| --- | --- | --- |
| Arka plan sil | RMBG-1.4 / BiRefNet-lite / U²-Net (ONNX) | RMBG-1.4 lisansı ticari değil; kişisel kullanıma uygun |
| Sihirli silgi | LaMa (ONNX) | ~200 MB, GPU'da <1 sn |
| Yüz algılama + landmark | MediaPipe Face Landmarker (478 nokta) | şekillendirme ve rötuş maskeleri için |
| Cilt pürüzsüzleştirme | klasik: frekans ayırma + bilateral, cilt maskesi | model gerekmez |
| Kalite artır | Real-ESRGAN x4 + GFPGAN/CodeFormer | CodeFormer lisansı ticari değil |
| AI Stil / anime | AnimeGANv3 (ONNX) | hafif |
| AI Genişlet | LaMa outpaint (hızlı, zayıf) → SD 1.5 inpaint (DirectML/CUDA, 6 GB VRAM sınırda) | en zor parça |

## Boyut

Ekranlar 29, akışlar 12, varlıklar 8.
Zor parçalar: (1) GPU tabanlı, tahribatsız düzenleme yığını (WebGL shader zinciri + geri al/yinele + büyük görseller),
(2) landmark tabanlı yüz şekillendirme/liquify'ın doğal görünmesi, (3) yerel AI modellerinin Electron içinde
CUDA/DirectML ile paketlenmesi ve 6 GB VRAM'e sığdırılması (özellikle AI Genişlet).
Boyut: tamamı **L** (bir çeyrek). Faz 1 (çekirdek editör) **M** (birkaç hafta).
