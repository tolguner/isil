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
| S21 YZ efektleri | 2026-10-13 | tamam (yerel FLUX.2 klein) + anime yerel | — | — |
| S22 Kalite artır | 2026-10-13 | tamam (2×/4×, UltraSharp V2 + CodeFormer yüz onarma) | — | CodeFormer için 5 noktalı hizalama + ters dönüşümle geri yapıştırma |
| S23 Tarifler | 2026-10-13 | tamam | topluluk akışı (kapsam dışı) | — |
| S24 Kolaj / Birleştir | 2026-10-13 | tamam | kolaj şablonları (süslü çerçeveler) | — |
| S25 Toplu düzenleme | 2026-10-13 | tamam | — | — |
| S26 Dışa aktarma | 2026-10-13 | tamam | — | — |
| S27 Projeler | 2026-10-13 | tamam | — | — |
| S28 Ayarlar (model yöneticisi, YZ motoru kurulumu) | 2026-10-13 | tamam | — | — |
| Stil danışmanı | 2026-10-13 | tamam (yerel Qwen3-VL 4B, akışlı yanıt) | — | transformers 5.19 4-bit dosyadaki görsel kodlayıcıyı yanlış katmana çeviriyor; yüklemeden sonra bf16 ağırlıklarla düzeltiliyor |
| Kamera | 2026-10-13 | tamam | — | — |
| Paketleme | 2026-10-13 | tamam | kod imzalama sertifikası yok | renderer kütüphaneleri `dependencies`'deyken paket 225 MB'tı → 176 MB |

## Ölçümler (RTX 3050 Laptop, Electron, WebGPU)

`tests/e2e/smoke.mjs` sonucu (11/11 geçti, `replica/smoke-results.json`):

- Arka plan kesme (ISNet 1024): ilk 2,9 sn (model yükleme dahil), sonra 0,36 sn
- Nesne silme (LaMa 512): 14 sn (ilk yükleme dahil)
- 4× kalite artırma (Real-ESRGAN, 256×384 → 1024×1536): 0,8 sn
- Tam çözünürlükte dışa aktarma (1400×2098 JPEG): sorunsuz

## Bilinen sınırlar

- Üretken araçlar NVIDIA ekran kartı ister (CPU'da çalışır ama çok yavaş). 6 GB VRAM'de 4B rahat, 9B blok blok GPU'ya taşınarak çalışıyor.
- YZ motoru ≈3 GB indirme (kurulu hali ≈5 GB), modeller ayrıca 3,5–12 GB.
- Rötuş yüz koordinatları kaynak uzayında; kırpılmış fotoğrafta yüz gizleme çıkartmalarının konumu kayabilir.

## Masaüstünde elle test (2026-10-13 akşam)

Gerçek pencere, gerçek dosya diyaloğu ve fareyle denendi: fotoğraf açma, akıllı seçimle kişi silme, dışa aktarma (Farklı Kaydet), tek tıkla arka plan kaldırma, kesim + Ctrl+Z, kaydırıcı sürükleme, yüz inceltme / göz büyütme, YZ Editör anahtarsız durum, model silme ve yeniden indirme, kolaj (3 foto, yerleşim, 1:1, hücre kaydırma, düzenleyiciye gönderme), kamera.

Bulunup düzeltilen hatalar: dokun-seç GPU'da boş maske, kamera doku boyutu 0, ilk küçük resim eksik, hızlı kartta kesim kendiliğinden başlamıyordu, pencere ve son klasör hatırlanmıyordu, kolajda ekle düğmesi kayıyordu, editörden Ayarlar'a geçişte kayıt yapılmıyordu.

## Yerel üretken YZ'ye geçiş (2026-10-13 gece)

Gemini tamamen kaldırıldı; tüm üretken araçlar yerel modellerle çalışıyor.

- **İlk plan (hazır CUDA motorları) olmadı:** stable-diffusion.cpp / llama.cpp Windows ikilileri imzasız; Windows Akıllı Uygulama Denetimi (açık) çalıştırmalarını engelliyor (`0xC0E90002`). python.org Python'u ve PyPI tekerlekleri (torch, bitsandbytes, tokenizers…) engellenmiyor → motor gömülü Python + PyTorch CUDA olarak yazıldı.
- **DirectML denendi, bırakıldı:** onnxruntime-node DirectML varsayılan olarak Intel iGPU'yu seçiyor (UltraSharp V2 256 px karo: 63 sn); NVIDIA aygıt numarasıyla çalıştırma takıldı ve sürücüyü birkaç dakika kilitledi. Ağır ONNX modelleri motorda onnxruntime-gpu 1.23.2 (CUDA 12) ile çalışıyor; 1.31 CUDA 13 istiyor, torch cu128 ile uyumsuz.
- **diffusers GGUF tuzakları:** GGUF içindeki BF16 tensörler (norm ölçekleri) ham bayt kalıyor → yüklemeden sonra açılıyor; transformer'ın `dtype`'ı uint8 göründüğü için boru hattı girdileri uint8'e çeviriyordu → `dtype` bf16 olarak sabitlendi.
- **Inpaint:** referans görseli de verilince dizi 3 katına çıkıp adım 27 sn'ye çıktı; referanssız 5 sn/adım, kalite aynı.
- **Windows stdin kilidi:** stdin'i ayrı iş parçacığında okurken torch içe aktarması kilitlendi (bekleyen okuma + GetFileType); iptal artık dosya bayrağıyla.

### Ölçümler (RTX 3050 6 GB Laptop, `tests/e2e/ai-local.mjs`, 9/9)

| işlem | süre |
| --- | --- |
| FLUX.2 klein 4B düzenleme (≈672×1008, 4 adım) | ilk 55 sn (yükleme dahil), sonra ≈25 sn; 4 GB VRAM |
| FLUX.2 klein 4B inpaint | ≈25 sn |
| FLUX.2 klein 9B düzenleme | ≈150 sn (yükleme dahil); 5,7 GB VRAM |
| Qwen3-VL 4B yanıt | ≈15 sn (yükleme dahil) |
| BiRefNet tam (1024) | 2,4 sn |
| 4x-UltraSharp V2 | 2,4 sn / 256 px karo |
| CodeFormer | 0,2 sn / yüz |
| Depth Anything V2 Base | 0,04 sn |

## 0.3.0 — 2026-10-16

Kapsam `replica/yol-haritasi.md` (Aşama 6 puanlaması + görsel eleştirmen ajanının önerileri). 11 maddenin hepsi tamam.

- **YuNet:** MediaPipe'ın kısa mesafe dedektörünün kaçırdığı yüzler YuNet kutusundan 2,4× kırpılıp landmark çıkarılıyor; karanlık kırpım aydınlatılıyor. Loş grup 0 → 4 yüz, ≈200 ms (WASM, GPU'yu motorla paylaşmaz).
- **GFPGAN 1.4:** CodeFormer kimliği değiştiriyordu (ajan 1–2 puan). GFPGAN + YCbCr parlaklık aktarımıyla renk koruma; ArcFace kimlik benzerliği hafif bozulmada 0,875, ağırda 0,786.
- **Kişileri koru:** ilk deneme sert maske kenarında hale bırakıyordu; BiRefNet yumuşak matı ile bindirince yüz farkı 0, arka plan farkı 97.
- **Zor çıkan:** kil stili komutu yüzde kırmızı leke üretiyordu (önizleme üretirken fark edildi), komut değişti. Üretken silme (FLUX inpaint) nesneyi geri çiziyordu; 0.3.0'dan çıkarıldı, 0.4 adayı.
- **HEIC:** pillow_heif DLL'i Akıllı Uygulama Denetimi'ne takıldı; tarayıcıda libheif WebAssembly kullanıldı.
- Testler: smoke 11/11, audit 41/41, ui-sweep 36/36, ai-local 11/11, gpu-switch 12/12.
