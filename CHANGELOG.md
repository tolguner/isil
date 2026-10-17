# Sürüm geçmişi

Her yayımlanan yapıda sürümün yalnız son hanesi artırılır (0.8.0 → 0.8.1); ara sürüm (0.9) büyük aşamalarda, 1.0.0 ise yayına hazır tam üründe. Uygulama Ayarlar → Hakkında'da sürümü gösterir.

## 0.8.1 — 2026-10-17

- Rötuş → Toparla → **Dolgunluk**: alın, kaş kemiği, göz çukuru, gözyaşı oluğu, göz altı kesesi, elmacık, yanak, burun tabanı (bölgesel hafif şişirme; en uçta birkaç piksel, doğal dolgu etkisi)
- Rötuş → Saç → **Saç hacmi**: artı değer saçı dışa kabartır, eksi yatırır; yüz ovalinin içi ve saçın iç kenarı yerinde kalır (yüz derisi saça çekilmez). Araç adı "Saç rengi" → "Saç"

## 0.8.0 — 2026-10-17

Rakip taramasının sonraki üç maddesi.

- Filtreler → **Kamera**: 8 yeni görünüm (sokak kompaktı, tek kullanımlık, eski CCD dijital, pozitif film, portre negatifi, gece sineması, eski telefon, oyuncak kamera). Cihaz aileleri örnek alındı, değerler bizim
- Rötuş → Yüz: her sekmede **bölgeye özel hazır ayarlar** (yüz: oval, kalp, yumuşak, belirgin; göz: iri, badem, yuvarlak, kalkık; burun, kaş ve dudak için dörder kart). Kart o sekmenin kaydırıcılarını birlikte ayarlar, ikinci basış sıfırlar
- Rötuş → Cilt → **Cilt dokusu**: pürüzsüzleştirmenin sildiği gözenek dokusu iki ölçekli yumuşak gürültüyle geri verilir (yanak yüksek frekans enerjisi 153 → 189, orijinal 335); korunan işaretlere uygulanmaz. Oto ve Pürüzsüz düğmeleri dokuyu da kullanır

## 0.7.0 — 2026-10-17

Rakip taramasının (replica/rekabet/eksikler-0.6.md) ilk üç maddesi.

- Çıkartma → **Dövme**: 6 hazır çizgi dövme ya da kendi çizimin; açık zemin saydamlaşır, 4 mürekkep rengi; cilde "çarp" karıştırma ve hafif yumuşatmayla konur, cildin dokusu içinden görünür
- Rötuş → Toparla → **Gerdirme**: kontur, alın, gözler, orta yüz, ağız köşeleri (sarkan bölgeleri yukarı toplayan yerel bükmeler); Oto tuşu gerdirmeyi de kullanır, Ctrl+K'da aranabilir
- Efektler → **Portre bulanıklığı**: konu yapay zekâyla ayrılır (BiRefNet/ISNet), arka plan ya da özne bulanıklaştırılır; Lens (derinlik haritasıyla kademeli), Gauss, Hareket, Dönme, Yakınlaşma. Alfa ağırlıklı bulanıklıkla özne kenarında hale kalmaz

## 0.6.0 — 2026-10-17

Çıkartma yapıcı, yüzü değiştirmeyen saç/kıyafet değiştirme ve üretken silme. Hepsi bilgisayarda çalışır.

- **Üretken silme**: Sihirli silgi, Akıllı seçim ve Yoldan geçenler'de "Hızlı (LaMa) / Üretken (FLUX)" seçimi. Üretken yol önce LaMa ile doldurup sonucu FLUX.2 klein ile düşük güçte (0,55) yeniden işler: büyük alanlarda zemin ve duvar dokusu gerçekçi, yeni içerik uydurulmaz. Tam güçte FLUX'un silinen kişiyi "hayalet" olarak geri çizdiği ölçüldü ve bu yüzden kullanılmadı (`tests/e2e/gen-erase.mjs`). Yerel YZ motoruna `strength` aktarılıyor
- YZ efekt → **Saç** ve **Gardırop**: artık yalnız saç ya da kıyafet bölgesi (kişi bölütleme maskesi) FLUX ile yeniden çiziliyor; yüz ve arka plan piksel piksel korunuyor (yüz farkı 0–0,1). Kendi tarifini yazma alanı; yeni ön ayarlar: kısa küt, siyah saç, deri ceket, örgü kazak. Saç ve gardırop kartlarının örnek görselleri aynı maskeli yolla yeniden üretildi
- Çıkartma → **Benim**: çıkartma yapıcı. Bu fotoğraftan ya da bir dosyadan konu yapay zekâyla kesilir (BiRefNet/ISNet), kenar çizgisi (yok/ince/kalın, 5 renk) ve gölge eklenir; fotoğrafa eklenir, kişisel kitaplıkta saklanır (yerel), PNG olarak kaydedilebilir

## 0.5.0 — 2026-10-17

Üç büyük yerel YZ özelliği: yoldan geçenleri silme, seçmeli ayar ve YZ ile tuval genişletme. Hepsi bilgisayarda çalışır, fotoğraf dışarı çıkmaz.

- Kırp → **YZ genişlet**: fotoğrafı her yöne (%15, %30) ya da bir orana (1:1, 4:5, 9:16, 16:9, 3:2) büyütür, yeni alanı yerelde doldurur: yerel YZ motoru kuruluysa FLUX.2 klein, değilse LaMa. Dikiş kalmasın diye renk eşitleme ve kenarda yumuşak geçiş; asıl pikseller değişmez. Karşılaştırma orijinali yeni tuvaldeki yerinde gösterir
- Tek araçlı olmayan otomatik sekmelerde (Kırp) araç ızgarası görünür
- Ayarla → **Seçmeli**: fotoğrafa en çok 8 nokta koyup yalnız o bölgenin parlaklık, kontrast, doygunluk ve sıcaklığını değiştirme. Etki konuma yakınlık × noktadaki renge benzerlik; yarıçap ve renk duyarlılığı ayarlanabilir, noktalar sürüklenir. Gölgelendiricide, canlı
- Temizle → **Yoldan geçenler**: fotoğraftaki kişiler bilgisayarda bulunur (EfficientDet-Lite2, 3×3 karo tarama, kişi başına maske), ana kişi korunur, diğerleri silinmek üzere seçilir; tuvalde tıklayarak değiştirilir; "Gölge ve yansımayı da sil"; seçilenler karo karo LaMa ile silinir. Ön seçim kuralı: en uzun kişinin boyunun %60'ı ve üstü ana kişi sayılır
- Ayarlar → Hakkında: "Ücretsiz ve açık kaynak (MIT)"
- Ayarlar: aynı adı taşıyan iki "Kalite" ayarı ayrıldı: "Dosya kalitesi" (JPG/WebP sıkıştırması) ve "Üretken YZ modeli" (FLUX.2 klein 4B / 9B). Dosya kalitesinde sayı kutusu yerine üç seçenek: Küçük (80), Dengeli (92), En iyi (100). Dışa aktarma menüsünde "Dosya kalitesi", üst çubukta "Kalite artır" adları

## 0.4.1 — 2026-10-16

- "Orijinali göster" (göz düğmesi ve `\` tuşu): sihirli silgi, YZ düzenleme, kalite artırma gibi kalıcı işlemlerden sonra işlenmiş fotoğrafı gösteriyordu; artık her zaman ilk kaynak fotoğrafı gösteriyor. Uçtan uca test: `tests/e2e/compare.mjs`

## 0.4.0 — 2026-10-16

Ar-Ge 1 (rötuşta işaretleri koruma), Ar-Ge 2 (yüz ve vücut bükmesi, rakip ölçümleriyle) ve rakip incelemesinden çıkan arayüz işleri (`replica/arge/`). Işıl artık özgün, açık kaynak (MIT) bir masaüstü düzenleyici olarak konumlanıyor.

- Ctrl+K: kaydırıcı düzeyinde arama ("bel", "cene hatti", "golgeler"); Enter aracı açar, alt sekmeyi seçer, kaydırıcıyı vurgular
- Değişen kategoride nokta: yüz şekli sekmeleri, makyaj, filtre/efekt kategorileri, eğri kanalları
- Tarifler: seçilen tarifin değiştirdikleri (ayarlar, filtre, efekt, oran, metin) listeleniyor; satıra dokununca ilgili kaydırıcıya gidiliyor
- Ana sayfa: görev kısayolları (Kalite artır, Yüz rötuşu, Vücut şekillendir)
- Rötuş → Cilt: "İşaretleri koru" fırçası. Dövme, ben, çil ya da hızmanın üzerine boyanır; leke giderme, pürüzsüzleştirme, kırışık ve ten tonu o bölgeye uygulanmaz. Boya/Sil, fırça boyutu, "Korumayı temizle". Dövmeli yüzde (yumuşat 80 + leke 60) dövme bölgesindeki değişim 3,5 → 0,33, yanakta yumuşama aynı (`tests/e2e/protect.mjs`)
- Yüz şekli: incelt, genişlik, şakak, elmacık, çene hattı ve V çizgisi artık kontur kısıtlı MLS bükmesiyle çalışıyor. Yalnız yüz çizgisi oynuyor, ağız/burun/gözler yerinde kalıyor (incelt 100'de ağız kayması 4,5 → 0,5 px). Güç rakiplerin aralığına çekildi (en büyük kayma 48 → 12 px). Üç çeyrek yüzlerde geniş görünen taraf daha çok oynuyor. Eski projelerde bu kaydırıcılar daha hafif görünür (`replica/arge/02-yuz-bukme.md`)
- Vücut: "Arka planı koru" anahtarı; incelt, bel ve kalça yalnız kişiye uygulanır, arkadaki duvar/sütun oynamaz. Bacak kısaltma (eksi değer) yeniden çalışıyor. "Boşluğu YZ ile doldur ve uygula": incelen kişinin kenarında açılan şerit yerel LaMa ile doldurulur; bacak uzatmada kişi ayrı katmanda uzatılıp LaMa ile tamamlanan arka planın üstüne konur (zemin bükülmez)
- Bükme güvenliği: aşırı ayar birleşimlerinde görüntünün kendi üstüne katlanması engelleniyor; korumalı inceltmede silüet kenarındaki ikilenme giderildi
- Göz büyütme: daire yerine göz çizgisine hizalı elips; iki göz burun kökünde birleşmiyor, kaş oynamıyor
- Vücut: "İncelt" kişi silüetini izliyor (bol giysi dahil) ve yalnız gövdeye uygulanıyor (arka plan sütunları/duvarlar bükülmüyor); "Bacak" satır tabanlı bant uzatma: zemin çizgileri düz kalıyor, tuval uzadığı için ayak altındaki zemin kırpılmıyor
- Kararlılık: proje hızlı değişirken kapanmış önizlemenin MediaPipe bölütleyicisine gitmesi engellendi (konsoldaki "ROI width and height must be > 0" hatası)
- Leke giderici kontrast bandı: çok koyu kalıcı işaretler otomatik olarak korunuyor

## 0.3.0 — 2026-10-16

Rakip araştırması, kullanıcı yorumları ve görsel eleştirmen ajanının puanlarına göre seçilen 11 madde (`replica/yol-haritasi.md`).

- Yüz algılama: YuNet ön algılaması; grup ve tüm vücut fotoğraflarında küçük/loş yüzler bulunuyor (loş grupta 0 → 4 yüz)
- Yüz onarma: CodeFormer yerine GFPGAN 1.4; renk koruma (siyah-beyaz/sepya fotoğrafa renk sızmıyor), yumuşak yapıştırma, "Onarım gücü" kaydırıcısı
- Kesim: motor kuruluysa otomatik olarak BiRefNet; belirgin konu yoksa uyarı; "Detaylı" düğmesi kaldırıldı
- YZ Editör: "Kişileri koru" (yalnız arka plan değişir, yüz piksel piksel aynı), siyah-beyaz fotoğraf siyah-beyaz kalır, çözünürlük ekran belleğine göre
- Stil danışmanı: kısa yanıt, tekrar yok, yalnız Işıl'daki gerçek araçlar
- Silgi: "Gölge ve yansımayı da sil" seçeneği
- HEIC/HEIF (iPhone) fotoğrafları açılıyor (libheif WebAssembly)
- Önizlemeler: tek dokunuş rötuş kartları seçili yüzü, YZ efekt kartları örnek görseli gösteriyor
- Hareketli GIF açılınca "yalnız ilk kare düzenlenir" notu
- Ayarları kopyala / yapıştır (Ctrl+Shift+C / Ctrl+Shift+V)
- Araç arama paleti (Ctrl+K)
- Düzeltmeler: klasöre dışa aktarmada üzerine yazma, uzun metin taşması, toplu düzenlemede kalite ayarı, araç geçişlerinde ekran belleği tükenmesi (BUG-001…008)

## 0.2.0 — 2026-10-13

- Gemini kaldırıldı; tüm üretken YZ yerel ve ücretsiz: YZ Editör / YZ efektleri / YZ ile değiştir (FLUX.2 klein 4B ve 9B), stil danışmanı (Qwen3-VL 4B, akışlı yanıt)
- YZ motoru: gömülü Python + PyTorch CUDA; Ayarlar'dan tek tıkla kurulum
- Güçlü modeller motorda GPU ile: BiRefNet tam (detaylı kesim), 4x-UltraSharp V2 (kalite artırma), Depth Anything V2 Base; yeni: CodeFormer yüz onarma
- Hakkında ekranı sürümü package.json'dan okur

## 0.1.0 — 2026-10-13

- İlk sürüm: editör, ayarlar, filtreler/efektler, rötuş, temizle, kesim/arka plan, katmanlar, kolaj, toplu düzenleme, kamera, projeler; ONNX/MediaPipe ile yerel YZ, isteğe bağlı Gemini
