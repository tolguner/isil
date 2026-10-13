# Yapım günlüğü — Işıl

| ekran | tarih | durum | eksik | beklenenden zor olan |
| --- | --- | --- | --- | --- |
| S01 Ana sayfa | 2026-10-13 | tamam | — | — |
| S02 Fotoğraf seçici | 2026-10-13 | tamam (sistem diyaloğu) | uygulama içi albüm ızgarası yok; masaüstünde sistem diyaloğu daha doğal | — |
| S03 Editör kabuğu | 2026-10-13 | tamam | — | gizli pencerede `requestAnimationFrame` durması (test ortamı) |
| S04 Ayarla / HSL / Eğriler / Akıllı | 2026-10-13 | tamam | seçmeli (nokta) ayar | — |
| S05 Hızlı hava | 2026-10-13 | tamam | — | — |
| S06 Filtreler / Efektler | 2026-10-13 | tamam | — | filtre gücü ilk sürümde zayıftı (sıcaklık katsayısı yükseltildi) |
| S07 Kırp | 2026-10-13 | tamam | — | ince döndürmede doldurma yakınlaştırması |
| S08–S12 Rötuş (yüz, cilt, makyaj, ton, saç, toparla, fırça, ışık, vücut, yüz gizle) | 2026-10-13 | tamam | eyeliner/kirpik, YZ cilt ön ayarlarının bir kısmı | cilt maskesi: landmark çokgeni × MediaPipe yüz derisi bölütlemesi |
| S13 Kesim | 2026-10-13 | tamam | — | BiRefNet Intel iGPU'da WebGPU sınırına (16 depolama tamponu) takıldı, WASM'da bellek bitti → ISNet varsayılan yapıldı, BiRefNet "Detaylı" seçeneği oldu |
| S14 Arka plan | 2026-10-13 | tamam | — | — |
| S15 Temizle (silgi, akıllı seçim, klon, mozaik, YZ ile değiştir) | 2026-10-13 | tamam | hazır kategori seçimi (insanlar, metin…) | LaMa büyük nesnelerde iz bırakabiliyor |
| S16–S19 Metin, Çıkartma, Çizim, Şekiller | 2026-10-13 | tamam | metin fırçası | — |
| S20 YZ genişlet | 2026-10-13 | kısmi | özel genişletme tuvali yok; YZ Editör komutuyla yapılıyor | — |
| S21 YZ efektleri | 2026-10-13 | tamam (Gemini) + anime yerel | — | — |
| S22 Kalite artır | 2026-10-13 | tamam (2×/4×) | yüz onarma (GFPGAN 340 MB) | — |
| S23 Tarifler | 2026-10-13 | tamam | topluluk akışı (kapsam dışı) | — |
| S24 Kolaj / Birleştir | 2026-10-13 | tamam | kolaj şablonları (süslü çerçeveler) | — |
| S25 Toplu düzenleme | 2026-10-13 | tamam | — | — |
| S26 Dışa aktarma | 2026-10-13 | tamam | — | — |
| S27 Projeler | 2026-10-13 | tamam | — | — |
| S28 Ayarlar (model yöneticisi, Gemini anahtarı) | 2026-10-13 | tamam | — | — |
| Stil danışmanı | 2026-10-13 | tamam (Gemini) | yerel LLM yedeği | — |
| Kamera | 2026-10-13 | tamam | — | — |
| Paketleme | 2026-10-13 | tamam | kod imzalama sertifikası yok | renderer kütüphaneleri `dependencies`'deyken paket 225 MB'tı → 176 MB |

## Ölçümler (RTX 3050 Laptop, Electron, WebGPU)

`tests/e2e/smoke.mjs` sonucu (11/11 geçti, `replica/smoke-results.json`):

- Arka plan kesme (ISNet 1024): ilk 2,9 sn (model yükleme dahil), sonra 0,36 sn
- Nesne silme (LaMa 512): 14 sn (ilk yükleme dahil)
- 4× kalite artırma (Real-ESRGAN, 256×384 → 1024×1536): 0,8 sn
- Tam çözünürlükte dışa aktarma (1400×2098 JPEG): sorunsuz

## Bilinen sınırlar

- Üretken araçlar (YZ Editör, YZ efektleri, YZ ile değiştir, stil danışmanı) Gemini anahtarı ister; ücretsiz kota durumu Google tarafına bağlı.
- Gemini akışı canlı anahtarla test edilmedi (anahtar yok); hata ve kota mesajları kodda ele alındı.
- Rötuş yüz koordinatları kaynak uzayında; kırpılmış fotoğrafta yüz gizleme çıkartmalarının konumu kayabilir.

## Masaüstünde elle test (2026-10-13 akşam)

Gerçek pencere, gerçek dosya diyaloğu ve fareyle denendi: fotoğraf açma, akıllı seçimle kişi silme, dışa aktarma (Farklı Kaydet), tek tıkla arka plan kaldırma, kesim + Ctrl+Z, kaydırıcı sürükleme, yüz inceltme / göz büyütme, YZ Editör anahtarsız durum, model silme ve yeniden indirme, kolaj (3 foto, yerleşim, 1:1, hücre kaydırma, düzenleyiciye gönderme), kamera.

Bulunup düzeltilen hatalar: dokun-seç GPU'da boş maske, kamera doku boyutu 0, ilk küçük resim eksik, hızlı kartta kesim kendiliğinden başlamıyordu, pencere ve son klasör hatırlanmıyordu, kolajda ekle düğmesi kayıyordu, editörden Ayarlar'a geçişte kayıt yapılmıyordu.
