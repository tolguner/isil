# Işıl

Windows için masaüstü fotoğraf düzenleyici. Hypic'in özellik setinin temiz-oda yeniden yapımı: kod, tasarım, adlar ve ön ayarlar sıfırdan yazıldı; Hypic'in hiçbir varlığı kullanılmadı.

Her şey ücretsiz. Yapay zekâ araçlarının çoğu bilgisayarında, internetsiz çalışır. Üretken araçlar için isteğe bağlı olarak kendi Google Gemini API anahtarını ekleyebilirsin.

## Özellikler

- **Ayarla:** pozlama, kontrast, vurgular/gölgeler, sıcaklık, HSL, ton eğrileri, netlik, pus giderme, gren, vinyet, akıllı otomatik ayar
- **Filtreler ve efektler:** 37 filtre, 31 efekt, tek dokunuş tarifleri
- **Rötuş:** çoklu yüz algılama, ~50 yüz şekli kaydırıcısı, cilt pürüzsüzleştirme, leke/göz altı, diş beyazlatma, makyaj, ten tonu, saç rengi, ışıklandırma, vücut şekillendirme, rötuş fırçası, yüz gizleme
- **Temizle:** sihirli silgi (LaMa), dokun-seç, klonlama, mozaik, YZ ile değiştir
- **Kesim ve arka plan:** yapay zekâyla arka plan kaldırma (ISNet / BiRefNet), maske fırçası, renk/degrade/bulanık/görsel zemin, tuval oranı
- **Katmanlar:** metin (17 açık lisanslı yazı tipi), çıkartma, şekil, çizim
- **Diğer:** kırpma/döndürme/perspektif, liquify, 4× kalite artırma (Real-ESRGAN), kolaj ve birleştirme, toplu düzenleme, kamera, projeler ve otomatik kayıt, Türkçe/İngilizce

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

## Mimari

- `src/main` — pencere, dosya sistemi, proje kaydı, model indirme, Gemini (anahtar yalnızca burada)
- `src/renderer/src/engine` — WebGL2 düzenleme motoru (shader zinciri, yüz/vücut bükme, katmanlar, dışa aktarma)
- `src/renderer/src/ai` — MediaPipe ve ONNX Runtime Web (WebGPU, WASM yedeği)
- `src/renderer/src/tools` — editör sekmeleri ve araç panelleri
- `replica/` — recon, mimari, tasarım token'ları, özellik matrisi, yapım günlüğü

## Lisanslar

Model ve kütüphane lisansları uygulamada **Ayarlar → Hakkında** bölümünde listelenir: MediaPipe (Apache-2.0), ONNX Runtime (MIT), ISNet (MIT), BiRefNet (MIT), LaMa (Apache-2.0), Real-ESRGAN (BSD-3), Depth Anything V2 Small (Apache-2.0), AnimeGANv2 (kişisel kullanım), Lucide (ISC), yazı tipleri (OFL).
