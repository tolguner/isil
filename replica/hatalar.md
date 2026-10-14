# Hatalar — Aşama 1 denetimi (2026-10-14)

Yalnızca yeniden üretilen hatalar. Önem: S1 veri kaybı/çekirdek akış kilitli · S2 özellik bozuk, çaresi yok · S3 çaresi var ya da görünür biçimde yanlış · S4 görünüş/metin.

### BUG-001: Klasöre dışa aktarmada aynı adlı dosyanın üstüne sessizce yazılıyor

- Önem: S2 (veri kaybı)
- Akış / durum: F10 / F10-E1 — ekran S25 Toplu düzenleme
- Adımlar: 1) Toplu düzenlemede farklı klasörlerden aynı adlı iki foto seç (ör. iki `IMG_0001.jpg`) ya da aynı klasöre ikinci kez dışa aktar. 2) Hedef klasörü seç, çalıştır.
- Beklenen: ikisi de kaydedilir.
- Gerçekleşen: ikinci dosya birincinin üstüne yazılıyor; önceki dışa aktarımlar da sessizce eziliyor.
- Kanıt: `audit.mjs` F10-E1 — klasörde 1 dosya.
- Neden: `export:save` hedef klasör verilince var olan dosyayı kontrol etmiyordu.
- Durum: **düzeltildi** — "ad (2).jpg", "ad (3).jpg" eki; test geçiyor.

### BUG-002: Uzun metin dar fotoğrafta kenarlardan taşıyor

- Önem: S3 (görünür biçimde yanlış; elle küçültülerek çözülebiliyor)
- Akış / durum: F07 / F07-E1 — ekran S16 Metin
- Adımlar: 1) Dikey bir portre aç. 2) Metin ekle, "Merhaba Işıl çğüşİı 😀" yaz.
- Beklenen: metin tuvale sığar.
- Gerçekleşen: yazı boyu yüksekliğe göre (%7) hesaplandığı için iki yandan kesiliyordu.
- Kanıt: `replica/audit/F07-text.jpg` (düzeltme öncesi temas sayfası).
- Durum: **düzeltildi** — yazarken genişlik tuvalin %92'sini aşarsa katman orantılı küçülür (yalnız küçültür).

### BUG-003: Açılamayan dosya mesajı desteklenen biçimleri eksik sayıyor

- Önem: S4
- Gerçekleşen: mesaj "JPG, PNG, WebP" diyordu; AVIF, BMP, GIF de açılıyor.
- Durum: **düzeltildi**.

### BUG-004: Toplu düzenleme ayarlardaki kalite değerini yok sayıyor

- Önem: S4
- Gerçekleşen: JPEG kalitesi her zaman 0,92; Ayarlar → Kalite etkisizdi.
- Durum: **düzeltildi** — ayarlardaki değer kullanılıyor.

### BUG-005: Fotoğraf değişince oturum eski boyutları bir an tutuyor

- Önem: S4 (görünür etkisi bulunamadı; test düzeneğinde ortaya çıktı)
- Gerçekleşen: `session.reset()` önceki fotoğrafın W/H ve son çıktı bilgisini sıfırlamıyordu.
- Durum: **düzeltildi**.

## Hata olmayan ama karar isteyen bulgular

| no | bulgu | neden önemli | öneri |
| --- | --- | --- | --- |
| K-1 | **HEIC açılmıyor.** Dosya diyaloğu .heic göstermiyor; sürükle-bırakta "açılamadı" diyor. Chromium HEIC çözemiyor. | iPhone'un varsayılan biçimi; iPhone kullanan biri ilk fotoğrafında takılır. | libheif'in WebAssembly sürümüyle tarayıcı içinde çözmek (SAC'ye takılmaz; LGPL). |
| K-2 | **"Tek dokunuş" rötuş ön ayarları ve YZ efekt kartlarının çoğu önizlemesiz** (yalnız ikon). | Kullanıcı sonucu görmeden seçiyor; rakipler yüz önizlemesi gösteriyor. | Açılan fotoğraftan küçük önizlemeler üretmek (rötuşta hızlı; YZ efektte hazır örnek görsel). |
| K-3 | Hareketli GIF yalnız ilk karesiyle açılıyor, uyarı yok. | Küçük; beklenti belirsiz. | "Yalnız ilk kare düzenlenir" bilgisi. |
