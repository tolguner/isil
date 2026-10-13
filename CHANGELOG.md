# Sürüm geçmişi

Her büyük güncellemede sürüm numarası artırılır (`npm version <x.y.z> --no-git-tag-version`), uygulama Ayarlar → Hakkında'da sürümü gösterir.

## 0.2.0 — 2026-10-13

- Gemini kaldırıldı; tüm üretken YZ yerel ve ücretsiz: YZ Editör / YZ efektleri / YZ ile değiştir (FLUX.2 klein 4B ve 9B), stil danışmanı (Qwen3-VL 4B, akışlı yanıt)
- YZ motoru: gömülü Python + PyTorch CUDA; Ayarlar'dan tek tıkla kurulum
- Güçlü modeller motorda GPU ile: BiRefNet tam (detaylı kesim), 4x-UltraSharp V2 (kalite artırma), Depth Anything V2 Base; yeni: CodeFormer yüz onarma
- Hakkında ekranı sürümü package.json'dan okur

## 0.1.0 — 2026-10-13

- İlk sürüm: editör, ayarlar, filtreler/efektler, rötuş, temizle, kesim/arka plan, katmanlar, kolaj, toplu düzenleme, kamera, projeler; ONNX/MediaPipe ile yerel YZ, isteğe bağlı Gemini
