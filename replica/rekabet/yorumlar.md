# Kullanıcı yorumları (Aşama 4)

Tarih: 2026-10-14 · Kaynak: Apple App Store (ABD) herkese açık yorum akışı (`itunes.apple.com/us/rss/customerreviews`), uygulama başına "en yeni" ve "en faydalı" sıralamalarından ilk ~200 yorum (2017–2026). Ham veri git dışında (`dev-models/rekabet/reviews/`), tema analizi `tests/fixtures/reviews.py`.

> **Örneklem uyarısı:** "en yeni" ve "en faydalı" sıralamaları şikâyetleri öne çıkarır; buradaki ortalamalar mağazadaki genel puandan (4,6–4,9) çok daha düşük. Sayılar **göreli** önem için kullanılmalı, memnuniyet oranı olarak değil. Temalar anahtar kelimeyle bulundu; bir yorum birden çok temaya girebilir.

## Sayılar

| uygulama | yorum | ortalama | 1★ | abonelik/ücret (olumsuz) | kaldırılan özellik / "eskisi iyiydi" (olumsuz) | çökme/hata | yavaşlık | doğal olmayan sonuç | gizlilik |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Facetune | 199 | 2,29 | 99 | 138 (109) | 41 (31) | 11 | 21 | 16 (12) | 13 (11) |
| Prequel | 200 | 2,39 | 97 | 141 (110) | 39 (31) | 25 | 23 | 12 (10) | 9 (7) |
| FaceApp | 200 | 3,04 | 72 | 108 (65) | 28 (15) | 28 | 12 | 16 (8) | 16 (8) |
| CapCut | 200 | 3,25 | 48 | 80 (36) | 28 (9) | 37 | 37 | 11 | 13 |
| PicsArt | 200 | 3,73 | 31 | 92 (37) | 35 (15) | 34 | 31 | 9 | 13 |
| Canva | 200 | 3,96 | 24 | 73 (24) | 21 (10) | 44 | 25 | 7 | 9 |
| Peachy | 192 | 4,49 | 12 | 59 (5) | 7 (1) | 4 | 3 | 12 (0) | 5 |
| *Hypic (çıkış noktamız)* | 186 | 2,49 | 87 | 120 (84) | 37 (27) | 16 | 20 | 5 (2) | 3 |

## Temalar

### 1. Abonelik ve ücret — açık ara birinci şikâyet
- **"Ücretsiz" ama hiçbir şey kaydedilemiyor.** Facetune ve PicsArt kullanıcıları araçları deneyip düzenlemeyi bitirdikten sonra kaydetme anında ödeme ekranıyla karşılaşmayı anlatıyor; PicsArt'ta biri saatlerce çalıştığı işi kaydedemediğini yazıyor.
- **Deneme süresi tuzağı.** Facetune, Prequel, Peachy ve FaceApp için "ücretsiz deneme" sırasında ya da iptale rağmen ücret çekildiği, iptal seçeneğinin bulunamadığı şikâyetleri tekrar ediyor.
- **Haftalık fiyat tepkisi.** Prequel kullanıcısı haftalık 5 $'ı bir dizi platformunun aylık ücretiyle kıyaslıyor; tek seferlik satın alma istiyor.
- **Eskiden ücretsizdi.** PicsArt ve Prequel'de daha önce ücretsiz olan filtre ve araçların ücretli katmana taşındığı söyleniyor; PicsArt'ın eski "paket başına küçük ödeme" modeli özleniyor.
- Peachy istisna: abonelikten söz eden 59 yorumun yalnız 5'i olumsuz — ömür boyu seçeneği (49,99 $) ve geniş ücretsiz kısım işe yarıyor gibi.

### 2. Kaldırılan özellikler ve güven
- FaceApp'te en sevilen özelliğin (yüz değiştirme) habersiz kaldırıldığı, ödeyen kullanıcıların neyin kaldırıldığını bile bilemediği anlatılıyor.
- Facetune'da uygulamadan çıkıp dönünce düzenlemelerin kaybolduğu yazılmış.
- Ortak duygu: "eskiden severek kullandığım uygulama açgözlüleşti".

### 3. Doğal olmayan sonuçlar
- Facetune saç modeli özelliği "gerçekçi değil" bulunuyor.
- FaceApp için filtrelerin farklı ten renklerinde aynı iyi çalışmadığı şikâyeti var.
- Peachy'de güncellemelerden sonra eklenen katmanların "yapıştırılmış gibi" durduğu söyleniyor.

### 4. Algılama ve kısıtlar (Peachy aboneleri)
- Güneş gözlüklü ya da uzaktaki kişilerin algılanmaması.
- "Araçları yalnız algılanan yüzlerle sınırlamayın" — yüz dışında da düzenlemek istiyorlar.
- Daha fazla uzaklaştırıp kaydırabilme; kontrollerin görüntünün üstünü kapatmaması.
- **Ayarları kopyala-yapıştır**: aynı ayarı birçok fotoğrafa elle tekrar uygulamaktan şikâyet.
- Renk seçici ve fırça hassasiyeti.

### 4b. Hypic'e özel
- Daha önce ücretsiz olan araçların aboneliğe taşınması, güncellemeyle düğmelerin kaldırılıp her şeyin YZ'ye yönlendirilmesi, zorunlu filigran.
- Ödeyen kullanıcıların YZ Editör'e erişememesi, VIP özelliklerin ay içinde kaybolup gelmesi (bulut tarafı sorunlar).
- **Dışa aktarma kalitesi:** metnin önizlemede keskin, kaydedince bulanık olması.
- Yeni "YZ İyileştir"in ayrıntıyı silip doğal olmayan sonuç vermesi.
- Övülenler: ücretsiz otomatik + elle araç birlikteliği, warp, iyileştirme fırçası, **seçmeli düzenleme**, YZ keskinleştirme, ışıklandırma, **yüz açısı değiştirme**.

### 5. Performans
- PicsArt ve CapCut: gecikme, donma, reklamların düzenlemeyi bölmesi.
- Canva: giriş/hesap sorunları, çökme.

### 6. Gizlilik
- FaceApp: fotoğrafların sunuculara yüklenmesi ve kullanım hakkı veren gizlilik maddesi.
- Facetune: destek için e-posta zorunluluğu, hesap bağlama.

## Işıl için anlamı

| tema | Işıl'daki durum | yapılacak |
| --- | --- | --- |
| Abonelik/kaydetme kilidi | **Avantaj:** her şey ücretsiz, kayıt kilidi yok | Portfolyo/landing metninde öne çıkar; uygulamada kilit yok mesajı gerekmez |
| Deneme tuzağı | Avantaj: hesap, ödeme yok | — |
| Kaldırılan özellik / güven | Avantaj: yerel, sürümlü (CHANGELOG) | Bir özelliği kaldırırsak CHANGELOG'da açıkça yaz |
| Düzenleme kaybı | Otomatik kayıt + proje listesi var (F08 testli) | Çökme sonrası kurtarma testi eklenebilir |
| Doğal olmayan sonuç | FLUX 4B/9B kimlik ölçümü sürüyor (Aşama 2); saç/ten çeşitliliği ölçülmeli | Deneme setindeki koyu ten / çocuk / yaşlı sonuçlarına özellikle bak |
| Uzak/gözlüklü kişi algılanmıyor | **Aynı sorun bizde var (BUG-008)** | YuNet ile önce yüz bulma (0.3.0) |
| Yüzle sınırlı araçlar | Işıl'da rötuş fırçası ve vücut araçları yüzden bağımsız | — |
| Dışa aktarmada kalite düşmesi (Hypic) | Işıl tam çözünürlükte yeniden çizer (X-07: 48 MP) | Metin katmanı keskinlik testi eklenebilir |
| Seçmeli düzenleme, yüz açısı (Hypic'te övülen) | Yok | 0.3.0 adayı (Aşama 6) |
| Ayarları kopyala-yapıştır | Toplu düzenleme var; editörde kopyala/yapıştır yok | **Editöre "ayarları kopyala / yapıştır" (Ctrl+Shift+C/V)** |
| Uzaklaştır/kaydır, kontroller görüntüyü kapatmasın | Masaüstünde panel yanda; yakınlaştırma var | Fare tekerleği + boşlukla kaydırma testi |
| Gizlilik | **Avantaj:** izleyici yok, fotoğraf çıkmaz | Ayarlar → Hakkında'da açıkça yaz |
| Performans | YZ motoru ilk açılışta yavaş (FLUX ilk 55 sn) | İlk yüklemede ilerleme metni (var); arka planda ısıtma seçeneği |
