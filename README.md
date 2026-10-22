# Işıl

Fotoğraf düzenleme, yüz rötuşu, vücut şekillendirme ve filtreleme işlerinin hepsini tek bir araçta toplayan, tamamen ücretsiz ve özgün bir Windows masaüstü uygulaması. Kod, tasarım, algoritmalar ve ön ayarlar sıfırdan yazıldı.

Her şey ücretsiz ve yerel: yapay zekâ araçları bilgisayarında, internetsiz çalışır; hiçbir fotoğraf dışarı gönderilmez, API anahtarı gerekmez.

## İndirme

Windows yükleyicisi [GitHub Releases](https://github.com/tolguner/isil/releases) sayfasındadır. Yükleyiciler GitHub Actions ile bu depodan derlenir. Kod imzalama için SignPath Foundation'a başvuruldu: ücretsiz kod imzalama [SignPath.io](https://signpath.io), sertifika [SignPath Foundation](https://signpath.org) tarafından sağlanacak (onaylanana kadar yükleyiciler imzasızdır). Ayrıntılar: [kod imzalama politikası](docs/CODE_SIGNING.md).

## Özellikler

- **Ayarla:** pozlama, kontrast, vurgular/gölgeler, sıcaklık, HSL, ton eğrileri, netlik, pus giderme, gren, vinyet, akıllı otomatik ayar
- **Filtreler ve efektler:** 46 filtre (kamera taklidi dahil), 31 efekt, portre bulanıklığı, tek dokunuş tarifleri
- **Rötuş:** çoklu yüz algılama (MediaPipe + YuNet, grup fotoğrafları dahil), ~50 yüz şekli kaydırıcısı, cilt pürüzsüzleştirme, leke/göz altı, diş beyazlatma, makyaj, ten tonu, saç rengi, ışıklandırma, vücut şekillendirme, rötuş fırçası, yüz gizleme
- **Temizle:** sihirli silgi (LaMa), yoldan geçenleri bulup silme, dokun-seç, klonlama, mozaik, YZ ile değiştir (FLUX.2 klein inpaint)
- **Kesim ve arka plan:** yapay zekâyla arka plan kaldırma (ISNet / BiRefNet), maske fırçası, renk/degrade/bulanık/görsel zemin, tuval oranı
- **Katmanlar:** metin (17 açık lisanslı yazı tipi), çıkartma, şekil, çizim
- **Üretken YZ (yerel):** YZ Editör ve YZ efektleri (FLUX.2 klein 4B / 9B), stil danışmanı (Qwen3-VL 4B), yüz onarma (GFPGAN 1.4)
- **Diğer:** kırpma/döndürme/perspektif, YZ ile tuval genişletme, seçmeli ayar, liquify, 4× kalite artırma (4x-UltraSharp V2 / Real-ESRGAN), kolaj ve birleştirme, toplu düzenleme, kamera, projeler ve otomatik kayıt, HEIC açma, ayarları kopyala/yapıştır, araç arama (Ctrl+K), Türkçe/İngilizce

## Geliştirme

```bash
npm install          # MediaPipe WASM ve yerleşik modeller postinstall ile hazırlanır
npm run dev          # Electron + HMR
npm run web          # yalnızca arayüz, tarayıcıda (http://localhost:5198)
npm run typecheck
npm run build && node tests/e2e/smoke.mjs   # uçtan uca duman testi
npm run dist         # Windows yükleyicisi -> release/
```

Büyük ONNX modelleri uygulamada **Ayarlar → Yerel yapay zekâ modelleri** bölümünden ilk kullanımda indirilir (`%APPDATA%/Işıl/models`). Testler için `dev-models/` klasörüne koyulabilirler.

### Yerel YZ motoru

Üretken araçlar ve güçlü ONNX modelleri **YZ motoru** ile çalışır: gömülü Python 3.12 + PyTorch (CUDA 12.8) + diffusers/transformers + onnxruntime-gpu. **Ayarlar → Yerel üretken yapay zekâ** bölümünden kurulur (`%APPDATA%/Işıl/engine`, ≈3 GB indirme, kurulu hali ≈5 GB). Modeller ayrı parçalar halinde iner:

| parça | içerik | boyut |
| --- | --- | --- |
| FLUX.2 klein 4B (hızlı) | transformer GGUF Q5_K_M + Qwen3-4B metin kodlayıcı (4-bit) + VAE | ≈6 GB |
| FLUX.2 klein 9B (en iyi) | transformer GGUF Q4_K_M + Qwen3-8B metin kodlayıcı (4-bit) | ≈12 GB |
| Qwen3-VL 4B | stil danışmanı (4-bit) | ≈3,5 GB |

Motor `engine/server.py` olarak main süreçten başlatılır ve stdin/stdout üzerinden JSON konuşur. Hazır llama.cpp / stable-diffusion.cpp ikilileri imzasız olduğu için Windows Akıllı Uygulama Denetimi onları engelliyor; python.org ve PyPI paketleri sorunsuz çalışıyor, bu yüzden Python seçildi.

Geliştirirken var olan bir Python ortamı kullanılabilir:

```bash
node tests/e2e/ai-local.mjs                           # dev-models/engine (python + models) ile; ya da ISIL_PYTHON=<python.exe>
node tests/e2e/engine-install.mjs                     # boş klasöre gerçek motor kurulumu (~3 GB)
```

## Mimari

- `src/main` — pencere, dosya sistemi, proje kaydı, model indirme, YZ motoru yönetimi (`engine.ts`)
- `engine/server.py` — yerel YZ sunucusu (FLUX.2 klein, Qwen3-VL, CUDA ONNX)
- `src/renderer/src/engine` — WebGL2 düzenleme motoru (shader zinciri, yüz/vücut bükme, katmanlar, dışa aktarma)
- `src/renderer/src/ai` — MediaPipe, ONNX Runtime Web (WebGPU, WASM yedeği) ve motor istemcisi (`generative.ts`)
- `src/renderer/src/tools` — editör sekmeleri ve araç panelleri
- `replica/` — recon, mimari, tasarım token'ları, özellik matrisi, yapım günlüğü

## Lisanslar

Işıl'ın kaynak kodu [MIT lisansı](LICENSE) ile açıktır. Modeller, kütüphaneler ve yazı tipleri kendi lisanslarıyla gelir:

Bu lisanslar uygulamada **Ayarlar → Hakkında** bölümünde listelenir: MediaPipe (Apache-2.0), EfficientDet-Lite2 (Apache-2.0), YuNet (MIT), ONNX Runtime (MIT), libheif (LGPL-3.0, WebAssembly), PyTorch (BSD-3), diffusers / transformers (Apache-2.0), FLUX.2 klein 4B (Apache-2.0), Qwen3 / Qwen3-VL (Apache-2.0), ISNet (MIT), BiRefNet (MIT), LaMa (Apache-2.0), Real-ESRGAN (BSD-3), gökyüzü bölütleme skyseg / U²-Net (MIT), PP-OCRv4 yazı algılama (Apache-2.0), GFPGAN 1.4 (Apache-2.0), Depth Anything V2 Small (Apache-2.0), Lucide (ISC), yazı tipleri (OFL).

Bazı modeller yalnızca **ticari olmayan / kişisel kullanım** içindir: FLUX.2 klein 9B (FLUX Non-Commercial), 4x-UltraSharp V2 (CC BY-NC-SA 4.0), Depth Anything V2 Base (CC BY-NC 4.0), AnimeGANv2. Bunlar varsayılan olarak kapalıdır; Ayarlar'daki "Kişisel kullanım modelleri" anahtarı ve uyarı onayıyla açılır. Tam liste: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Belgeler

- [Kullanım kılavuzu](docs/KILAVUZ.md)
- [Gizlilik notu ve kabul edilebilir kullanım](docs/GIZLILIK.md)
- [Kod imzalama politikası](docs/CODE_SIGNING.md)
- [Sürüm geçmişi](CHANGELOG.md)
