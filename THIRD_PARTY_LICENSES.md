# Üçüncü taraf bileşenler ve model lisansları

Işıl'ın kendi kodu MIT lisanslıdır. Uygulamanın kullandığı modeller ve kütüphaneler kendi lisanslarıyla gelir. Modeller uygulamayla birlikte dağıtılmaz; ilk kullanımda kullanıcının bilgisayarına, özgün yayımlandıkları yerden indirilir.

## Varsayılan modeller (ticari kullanıma açık)

| Bileşen | Kullanım | Lisans |
|---|---|---|
| MediaPipe Face Landmarker, Pose, Selfie Multiclass, Interactive Segmenter, EfficientDet-Lite2 | yüz, vücut, saç, dokun-seç, kişi bulma | Apache-2.0 |
| YuNet | yüz bulma | MIT |
| ISNet (imgly) | arka plan kesme | MIT |
| BiRefNet | detaylı kesim | MIT |
| LaMa | nesne silme | Apache-2.0 |
| Real-ESRGAN | kalite artırma | BSD-3-Clause |
| GFPGAN 1.4 | yüz onarma | Apache-2.0 |
| Depth Anything V2 Small | derinlik | Apache-2.0 |
| PP-OCRv4 algılayıcı | metin silme | Apache-2.0 |
| skyseg (U²-Net) | gökyüzü değiştirme | MIT |
| FLUX.2 klein 4B | üretken düzenleme | Apache-2.0 |
| Qwen3 4B, Qwen3-VL 4B | metin kodlayıcı, stil danışmanı | Apache-2.0 |

## Kişisel kullanım modelleri (isteğe bağlı)

Aşağıdakiler varsayılan olarak kapalıdır. Ayarlar → Yerel yapay zekâ modelleri → "Kişisel kullanım modelleri" açılıp uyarı kabul edilirse kullanılabilir. Lisansları ticari kullanımı yasaklar.

| Bileşen | Kullanım | Lisans |
|---|---|---|
| 4x-UltraSharp V2 | kalite artırma | CC BY-NC-SA 4.0 |
| Depth Anything V2 Base | derinlik | CC BY-NC 4.0 |
| AnimeGANv2 (face paint) | yerel anime stili | yalnız kişisel kullanım |
| FLUX.2 klein 9B | üretken düzenleme (en iyi kalite) | FLUX Non-Commercial License |

## Kütüphaneler

Electron (MIT), React (MIT), zustand (MIT), ONNX Runtime (MIT), libheif (LGPL-3.0, WebAssembly olarak ayrı dosyada), PyTorch (BSD-3-Clause), diffusers ve transformers (Apache-2.0), Lucide simgeleri (ISC), Inter ve diğer yazı tipleri (SIL Open Font License).
