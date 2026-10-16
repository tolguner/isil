# Ar-Ge 2: Yüz ve vücut bükmesi

Tarih: 2026-10-16. Yöntem kara kutu ölçümü. Uygulamalar BlueStacks'te, aynı ızgaralı portreyle kullanıldı. Kaydırıcı en uçtayken ve sıfırdayken ekran görüntüsü alındı. İki görüntü arasındaki yer değiştirme alanı yoğun optik akışla çıkarıldı (OpenCV DIS). Uygulama dosyaları açılmadı, çözülmedi. Işıl'daki modül literatürden sıfırdan yazıldı.

Ham ekran görüntüleri ve alan haritaları depo dışında duruyor (`Projeler/isil-olcum/`). Bunun sebebi, içlerinde rakip arayüzünün yer alması.

## Düzenek

- Test görseli: 1000×1499 portre ve üstünde 25 px'lik yarı saydam ızgara.
- Görseli aktarma ve dokunma ADB ile yapıldı (`HD-Adb`).
- Ekran görüntüleri: Peachy'de `screencap` kullanıldı. PicsArt'ın düzenleyicisi ekran görüntüsünü engelliyor (Android FLAG_SECURE), bu yüzden orada BlueStacks penceresi Windows tarafından yakalandı.
- Ekran ölçeği, ORB öznitelik eşleme ve benzerlik dönüşümüyle bulundu. Bu sayede ölçümler orijinal piksele çevrildi.
- Işıl'ın aynı ayarlardaki çıktıları `tests/e2e/warp-olcum.mjs` ile üretildi ve aynı akış analizinden geçirildi.

Hypic (com.xt.retouchoversea) BlueStacks'te açılış ekranında kalıyor: ART doğrulama hatası veriyor, 3 deneme yapıldı. Facetune da açılmıyor (Aşama 5'ten bilinen durum). FaceApp yüz değişikliklerini bulutta üretken modelle yapıyor, yani bükme değil, yeniden üretim. Bu yüzden ölçüme alınmadı.

## Ölçümler (kaydırıcı en uçta, orijinal piksel)

| uygulama | araç | en büyük kayma | desen |
|---|---|---|---|
| Peachy | Yüz → Şekil → İnce 100 | 10,4 px | Çene hattı boyunca **U biçimli bant**. Yanaklar içe, çene ucu hafif yukarı gidiyor. Ağız, burun ve gözler yerinde kalıyor. **Poza duyarlı:** fotoğrafta daha geniş görünen yanak daha çok oynuyor. |
| Peachy | Gözler → Boyut 100 | 4,4 px | Göz merkezinden dışa radyal. Merkezde sıfır, orta yarıçapta en yüksek. Alan **göz biçimine uyan elips**, dış köşede daha güçlü. |
| Peachy | Vücut → Otomatik → Baş | 17 px | Burun merkezine doğru düzgün radyal küçültme. Etki bölgesi baş biçiminde (saç ve boyun dahil). Omuzlar hafif yukarı çekiliyor. |
| PicsArt | Rötuş → Yüz → Yüz 50 (genişlik) | 6,5 px | Yüz çizgisi boyunca **dar bir bant** halinde dışa itme, en güçlü yeri elmacık hizası. İç yüz kıpırdamıyor. |
| PicsArt | Rötuş → Gözler → Boyut 50 | 4,7 px | **Tam dairesel** radyal şişirme (göz biçimini dikkate almıyor). |
| Işıl 0.3 (eski) | Yüz → İncelt 100 | **48 px** | Dört çene noktasında çevresi yumuşak daireler. Daireler yüzün ortasına taşıyor, **ağız 4,5 px kayıyor**. Gücü Peachy'nin ≈4,6 katı. |
| Işıl 0.3 (eski) | V çizgisi 100 | 49,7 px | Aynı sorun: yerel daireler. |
| Işıl 0.3 | Göz boyutu 100 | 6,7 px | PicsArt gibi dairesel, gücü benzer. |

Not: Alan görsellerindeki ısı renkleri her görsele göre ayrı ölçeklendi. Güç karşılaştırması tablodaki piksel değerleriyle yapılmalı.

## Teknik soyutlama

Ölçülen davranışlar iki ailede toplanıyor:

1. **Yerel radyal bükme** (Gustafsson 1993, "Interactive image warping"; Photoshop Liquify). Bir merkez, bir yarıçap ve yumuşak sönüm var: noktayı ötele ya da yerel ölçekle. Göz büyütme ve baş boyutu üç uygulamada da bu ailede. Peachy'nin göz alanı ise göze uyan elips. Işıl'ın bütün yüz şekli kaydırıcıları da (`faceOps`) bu ailedeydi.
2. **Kontur kısıtlı bükme.** Yüz çizgisi landmark'ları normal yönünde taşınıyor. Yüzün iç öğeleri ve dışarıdaki bir halka sabit tutuluyor, aradaki alan pürüzsüz bir enterpolasyonla dolduruluyor. Peachy'nin inceltmesi ve PicsArt'ın genişliği bu davranışı gösteriyor: hareket bant halinde ve iç yüz yerinde.

Literatürde 2. aile için kullanılan yöntemler:

- **Moving Least Squares** (Schaefer, McPhail, Warren, SIGGRAPH 2006). Kontrol noktası çiftlerinden afin, benzerlik ya da katı deformasyon üretiyor. Katı türü kesmesiz, yerel olarak eş ölçülü ve pratikte katlanmıyor.
- **Veriyle yönlendirilen yüz güzelleştirme** (Leyvand ve ark., SIGGRAPH 2008). Landmark mesafelerini hedefe taşıyor, sonra landmark'larla kısıtlı bir ağ bükmesi uyguluyor.
- **İçerik duyarlı ağ optimizasyonu** (Shih ve ark., SIGGRAPH 2019, geniş açı portre düzeltme). Yüz konformalliği, düz çizgi ve pürüzsüzlük enerjileriyle ağ çözüyor. Daha pahalı, ama arka plan çizgilerini de koruyor.
- **ARAP** (Igarashi 2005). Üçgen ağda olabildiğince katı deformasyon. MLS'ye göre daha pahalı, ağ kurulumu gerektiriyor.

## Işıl'daki darboğazlar (eski)

1. **İzotrop daireler kontura hizalı değil.** Komşu dairelerin etkileri birbirine ekleniyor ve yüzün ortasına taşıyor. İncelt 100'de ağız 4,5 px, V çizgisinde 1,2 px kayıyordu.
2. **Güç ayarı yüksek.** 100'de 48 px. Peachy'nin en ucu 10 px, PicsArt'ınki 6,5 px. Yüksek değerde yüz biçimi bozuluyordu.
3. **Poz bilgisi yok.** Üç çeyrek yüzde iki taraf eşit itiliyordu. Peachy geniş görünen tarafa daha çok uyguluyor.
4. **Sıralı toplama.** Yer değiştirmeler art arda ekleniyor; katlanmaya karşı bir güvence yok.

## Yeni modül: kontur kısıtlı MLS (`engine/face.ts`)

- `CONTOUR_KEYS`: incelt, genişlik, şakak, elmacık, çene hattı, V çizgisi. Bu kaydırıcılar artık `faceOps` dairelerini kullanmıyor.
- `contourPairs`: Yüz ovalinin 36 noktasının her biri yüz koordinatlarında konumlanır (u yanal, t dikey). Her kaydırıcının t ekseninde yumuşak bir bant profili var, ör. incelt için t ∈ [-0,15, 1,2]. Nokta yanal eksende içe ya da dışa, çene ucunda hafif yukarı taşınır. Çene ucunda yanal itme söner. Poz katsayısı = o tarafın görünen yarım genişliği / ortalama.
- **Sabit çapalar** (sıfır yer değiştirme): göz köşeleri ve kapakları, kaşlar, burun kökü, burun ucu ve kanatları, dudak köşeleri ve orta noktaları. Yüzün 0,95 katı yarıçapında 20 noktalık bir dış halka da sabit.
- `addMlsField`: Katı MLS, ters eşleme olarak hesaplanır: çıktı noktası → kaynak noktası. Ağırlık w = 1/d³ (α = 1,5) seçildi, böylece etki konturda kalıyor. Hesap 192 sütunlu bükme ızgarasında, yalnız etki kutusunda yapılıyor. Mevcut WebGL bükme dokusuna ve canlı liquify alanına eklenir, gölgelendirici değişmedi.

**Sonuç (aynı düzenek):**

| | en büyük kayma | ağız kayması | burun | gözler |
|---|---|---|---|---|
| İncelt 100, eski | 48,1 px | 4,46 px | 0 | 0 |
| İncelt 100, yeni | 11,6 px | 0,46 px | 0,21 | 0,02 |
| V çizgisi 100, eski | 49,7 px | 1,22 px | 0 | 0 |
| V çizgisi 100, yeni | 15,2 px | 0,47 px | 0,13 | 0,01 |

Yeni incelt alanı, Peachy'de ölçülen U biçimli banda benziyor ve poza duyarlı. Gücü Peachy'nin en ucunun biraz üstünde (11,6 px ve 10,4 px).

Bilinen sınır: Eski projelerdeki yüz şekli değerleri yeni modülle daha hafif görünür, çünkü güç ayarı değişti.

## Göz büyütme: elips (16.10)

Eski hali: göz merkezinde 1,15 × göz genişliği yarıçaplı bir daire. İki daire burun kökünde birleşiyor, kaşa da taşıyordu. Yeni hali: göz çizgisine (dış köşe → iç köşe) hizalı bir elips. Uzun ekseni 1,0 × göz genişliği, kısa ekseni 0,66 ×. Merkez dış köşeye %6 kayık, Peachy'nin dış köşe ağırlığına benziyor. `WarpOp` ölçeğine isteğe bağlı `ell` (açı, kısa eksen) eklendi. Kaştaki kayma 0,66 px'ten 0'a indi. Alanın en büyük değeri 6,7 px'ten 5,9 px'e indi.

## Vücut (16.10)

Test görseli: tam boy fotoğraf (1000×1778), arkada düz çizgili anıt ve zemin karoları. Görsel ızgaralı.

| uygulama | araç | desen |
|---|---|---|
| Peachy | Vücut → Otomatik → Bel 100 | Gövdenin içinde, bel hizasında iki küçük leke halinde içe çekme, en çok ≈2,8 px. Arka plan kıpırdamıyor. |
| Peachy | Bacaklar 100 | Her bacak boyunca dikey bir bant halinde yanal değişim, yalnız bacakta. |
| Peachy | Uzunluğu 100 | **Satır tabanlı dikey uzatma.** Kalça–ayak bandı ≈%20–25 uzuyor ve tuval büyüyor. Yatay çizgiler düz kalıyor, bant tüm genişlikte uygulanıyor. |
| Işıl (eski) | İncelt 100 | Gövde merkezinde, gövde boyunun 1,8 katı yarıçaplı yatay ölçek. **Arka plandaki anıt sütunları da büküldü.** Alanın %10'u oynuyordu. |
| Işıl (eski) | Bacak 100 | Diz ve ayak bileğinde iki dairesel öteleme, 48 px. **Zemin çizgileri kavis yapıyordu.** |
| Işıl | Bel / Kalça 100 | Peachy Bel ile aynı aile (iki yerel leke), en çok 7,7 px. Değiştirilmedi. |

Yeni hali (`engine/body.ts` → `applyBodyBands`):
- **İncelt:** Her satırda poz merkez çizgisine doğru yatay sıkıştırma. Satırın merkezi ve gövde yarı genişliği omuz, kalça, diz ve ayak bileğinden doğrusal olarak çıkarılıyor. Etki yarı genişliğin 1,7 katında sönüyor. Omuz üstünde ve ayak altında dikey bir zarf var. Sonuç: etkilenen alan %10,4'ten %3,4'e indi, arka plan sütunları düz kalıyor.
- **Bacak:** Kalça–ayak bileği bandında satır tabanlı dikey uzatma, en uçta band × %20. Yatay çizgiler düz kalıyor. Işıl tuvali büyütmediği için ayak altındaki zemin aşağı kayıyor ve görüntünün dışına taşan kısım kırpılıyor.

## Sıradaki adaylar (iş sırası)

1. ~~**İncelt için kişi silüeti**~~ **yapıldı (16.10):** Her satırda merkezden dışa doğru kişi maskesinin (MediaPipe çok sınıflı bölütleme, 1 − arka plan) kenarı aranıyor. Yarı genişlik poz tahmininin 0,6–1,8 katına kırpılıyor. Kenar bulunamazsa (kol açık, maske kopuk) poz tahminine dönülüyor. Satırlar arası 5'li ortalama uygulanıyor. Bol bluzda inceltme bluzun kenarını izliyor, bacaklarda daralıyor. Etkilenen alan %4,2.
2. **Yapıldı (16.10), canlı sürüm:** Vücut aracında "Arka planı koru" anahtarı var (`BodyEdit.protect`). Vücut şekli alanı (bel, kalça, incelt ve diğer `bodyOps`) ayrı bir ızgarada kuruluyor. Bu ızgara kişi maskesiyle (çıktı konumunda, yumuşak eşik 0,2–0,6) çarpılıp ana alana ekleniyor. Bacak uzatma maskelenmiyor, satır bütünlüğü bozulmasın diye. İncelt 100 ölçümü: kişinin hemen dışındaki şeritte ortalama kayma 1,85 px'ten 0,72 px'e indi (kalan kısım, optik akışın kenardaki yayılması). Bel/kalça zaten gövde içinde, değişiklik yok. **Kalan:** kişi inceldikçe eski silüetin içinde kalan şerit, dışarıdan örneklenen arka planla doluyor (ince bir uzama). Dışa aktarımda bu şeridi LaMa ile doldurmak sonraki iş. İlk tasarım notu: **Vücutta "Arka planı koru" (Tolga, 16.10):** incelt/bel/kalça alanı kişi maskesiyle çarpılır; kişi incelince açılan kenar şeridi LaMa ile arka planla doldurulur. Şekillendir aracındaki anahtarın vücut kaydırıcılarındaki karşılığı (Peachy'de "Korumak", ücretli). 1'deki silüete dayanır.
3. **Bacak uzatmada tuval büyütme** (Peachy gibi), zeminin kırpılmaması için.
4. **Bacak uzatmada arka planı koru:** yalnız kişi bandı uzar, açılan zemin LaMa ile üretilir (yavaş; isteğe bağlı).
5. **Katlanma denetimi:** alanın Jacobian determinantı 0'ın altına inerse güç kırpılsın.

## Kaynaklar

- S. Schaefer, T. McPhail, J. Warren. Image Deformation Using Moving Least Squares. SIGGRAPH 2006.
- T. Leyvand, D. Cohen-Or, G. Dror, D. Lischinski. Data-Driven Enhancement of Facial Attractiveness. SIGGRAPH 2008.
- Y. Shih, W.-S. Lai, C.-K. Liang. Distortion-Free Wide-Angle Portraits on Camera Phones. SIGGRAPH 2019.
- T. Igarashi, T. Moscovich, J. F. Hughes. As-Rigid-As-Possible Shape Manipulation. SIGGRAPH 2005.
- J. Gustafsson. Interactive Image Warping. Yüksek lisans tezi, Helsinki Teknoloji Üniversitesi, 1993.
- T. Kroeger ve ark. Fast Optical Flow using Dense Inverse Search (DIS). ECCV 2016. Ölçüm aracı olarak kullanıldı.
