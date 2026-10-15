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

### BUG-006: Araçlar arasında gidip gelince modeller yüklenemiyor, motor yavaşlıyor

- Önem: S2 (özellik bozuk; yeniden başlatmadan düzelmiyor)
- Bulunduğu yer: Aşama 2 ölçümü — tarayıcı modeli (ISNet) ve motor modeli (BiRefNet) arka arkaya
- Adımlar: 1) Kesim → Otomatik. 2) Kesim → Detaylı (motor). 3) Birkaç fotoğrafta tekrarla. 4) Kalite artır.
- Gerçekleşen: 3. turdan sonra her tarayıcı modeli "model yüklenemedi" (`failed to allocate a buffer of size 176149806`); motordaki BiRefNet 2,4 sn yerine 30 sn; bir ölçümde ekran belleği 5954/6144 MiB doldu.
- Neden: (a) motorun CUDA arenası çalıştırmadan sonra belleği geri vermiyordu; (b) BiRefNet lite'ın başarısız WASM denemeleri tarayıcının WASM belleğini parçalıyordu; (c) ilk düzeltme denemesinde her geçişte oturumları boşaltıp yeniden yüklemek durumu kötüleştirdi.
- Durum: **düzeltildi** — motor her ONNX çalıştırmasından sonra arenayı küçültüyor; tarayıcı modeli öncesi motor yalnız sohbet modelini bırakıyor; tarayıcı oturumları yalnız FLUX/sohbet öncesi bırakılıyor. `tests/e2e/gpu-switch.mjs`: 3 tur ISNet → BiRefNet → FLUX → ISNet, 12/12, ekran belleği ≤ 2 GB, BiRefNet ısınınca 1,5 sn.

### BUG-007: Motor yokken "Detaylı" kesim sessizce standart kesim yapıyor

- Önem: S3 (yanıltıcı)
- Gerçekleşen: yedek model BiRefNet lite bu sınıf GPU'larda WebGPU'da çalışmıyor (16 depolama tamponu sınırı), WASM'da `std::bad_alloc`; kod sessizce ISNet'e düşüyordu. Kullanıcı "detaylı" seçip standart sonuç alıyordu.
- Durum: **düzeltildi** — BiRefNet lite kaldırıldı; motor yoksa kullanıcıya "detaylı kesim YZ motoruyla çalışır, şimdilik standart kesim yapıldı" deniyor.

### BUG-008: Küçük ve loş yüzler algılanmıyor (grup ve tüm vücut fotoğrafları)

- Önem: S2 (grup fotoğrafında rötuş, makyaj, yüz şekli hiç çalışmıyor)
- Kanıt: deneme setinde loş ışıklı 4–5 kişilik grup fotoğrafında 0 yüz, tüm vücut fotoğrafında 0 yüz; yakın planlı 15 yüzün 15'i bulundu.
- Neden: MediaPipe Face Landmarker'ın içindeki BlazeFace kısa mesafe dedektörü; küçük yüzleri kaçırıyor.
- Öneri (0.3.0): önce YuNet (MIT, ≈300 KB, 10 px'e kadar yüz) ile yüzleri bul, sonra her yüzün büyütülmüş kırpımında landmark çıkar ve koordinatları geri taşı.
- Durum: **düzeltildi (0.3.0)** — YuNet (OpenCV Zoo, MIT) tüm görüntüde + büyük görsellerde döşemelerle kutu buluyor; MediaPipe'ın kaçırdıkları 2,4× kırpımda (gerekirse aydınlatılarak) landmark'a gidiyor. Loş grup 0 → 4 yüz, ≈200 ms.

## Hata olmayan ama karar isteyen bulgular

| no | bulgu | neden önemli | öneri |
| --- | --- | --- | --- |
| K-1 | **HEIC açılmıyor.** Dosya diyaloğu .heic göstermiyor; sürükle-bırakta "açılamadı" diyor. Chromium HEIC çözemiyor. | iPhone'un varsayılan biçimi; iPhone kullanan biri ilk fotoğrafında takılır. | libheif'in WebAssembly sürümüyle tarayıcı içinde çözmek (SAC'ye takılmaz; LGPL). |
| K-2 | **"Tek dokunuş" rötuş ön ayarları ve YZ efekt kartlarının çoğu önizlemesiz** (yalnız ikon). | Kullanıcı sonucu görmeden seçiyor; rakipler yüz önizlemesi gösteriyor. | Açılan fotoğraftan küçük önizlemeler üretmek (rötuşta hızlı; YZ efektte hazır örnek görsel). |
| K-3 | Hareketli GIF yalnız ilk karesiyle açılıyor, uyarı yok. | Küçük; beklenti belirsiz. | "Yalnız ilk kare düzenlenir" bilgisi. |
