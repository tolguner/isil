# Architecture: Işıl (çalışma adı) — Hypic'in özelliklerinin masaüstü yeniden yapımı

Masaüstü, tek kullanıcı, çevrimdışı öncelikli. Sunucu, hesap, ödeme, e-posta yok.
Bu yüzden şablondaki web katmanları (auth, payments, email, hosting) yerine masaüstü karşılıkları yazıldı.

## Stack

| katman | seçim | neden |
| --- | --- | --- |
| kabuk | Electron 44 | Tolga'nın seçimi; Chromium içinde WebGL2 + WebGPU hazır |
| derleme | electron-vite + Vite + TypeScript | main/preload/renderer tek yapılandırma, HMR |
| arayüz | React 19 + Zustand | düzenleme yığını tek store'da; geri al/yinele = yığın anlık görüntüleri |
| stil | düz CSS + tasarım token'ları (CSS değişkenleri) | Tailwind'e gerek yok; replica-design token'ları doğrudan değişken olur |
| görüntü motoru | Kendi WebGL2 shader zinciri | tahribatsız, gerçek zamanlı kaydırıcı; tam çözünürlükte dışa aktarma aynı zincirle |
| algı modelleri | @mediapipe/tasks-vision (yüz 478 nokta, poz, saç/cilt bölütleme) | tarayıcı/WASM+GPU, yerel dosyadan yüklenir, native modül yok |
| ağır yerel modeller | onnxruntime-web (WebGPU, WASM yedeği) | native derleme yok (electron-rebuild derdi yok); RTX 3050'de WebGPU |
| üretken (yerel) | Python yan süreç: FastAPI + diffusers (SD 1.5 inpaint/img2img) | faz 3; isteğe bağlı kurulum, CUDA |
| üretken (bulut) | @google/genai, main süreçte | anahtar renderer'a hiç inmez; isteğe bağlı |
| saklama | Dosya sistemi: `%APPDATA%/Isil/projects/<id>/` (project.json + varlıklar) | tek kullanıcı; SQLite native modülüne gerek yok, yedeklemesi kolay |
| sırlar | Electron `safeStorage` (Windows DPAPI) | Gemini anahtarı şifreli |
| paketleme | electron-builder (NSIS) | Windows yükleyici |
| testler | Vitest (motor/store) + Playwright Electron (e2e) | replica-test bunları kullanır |

## Şema

Veritabanı yok; şema = JSON belgeleri + TypeScript tipleri (`src/shared/schema.ts`).
Erişim kuralı: tek kullanıcı; main süreç yalnızca `userData` altına yazar, renderer dosya sistemine doğrudan erişemez (contextIsolation, IPC).

```ts
// projects/<id>/project.json
Project {
  id: string            // uuid
  name: string
  createdAt: string     // ISO, UTC
  updatedAt: string
  source: { fileName: string; width: number; height: number; hash: string } // kopyası: source.<ext>
  thumbnail: 'thumb.jpg'
  doc: EditDoc
  version: 1
}

EditDoc {
  base: string | null           // en son "piksel işlemi" sonucu (raster/<n>.png); null = kaynak
  rasterOps: RasterOp[]         // sırayla uygulanan yıkıcı işlemler (silme, liquify, AI) — geri alınabilir, dosyaları saklanır
  crop: { x,y,w,h (0..1), rotation, flipH, flipV, perspH, perspV }
  adjust: Record<AdjustKey, number>          // pozlama, kontrast … ; 0 = nötr
  hsl: Record<HueBand, {h,s,l}>
  curves: { rgb: Pt[]; r: Pt[]; g: Pt[]; b: Pt[] }
  filter: { id: string; amount: number } | null
  effects: { id: string; amount: number; params?: object }[]
  retouch: { faces: FaceEdit[] }            // yüz başına kaydırıcılar, landmark'lar önbellekte
  body: BodyEdit | null
  background: { ratio: string | null; fill: Fill | null }
  layers: Layer[]                           // metin, çıkartma, şekil, çizim — her zaman en üstte, vektörel kalır
}

RasterOp { id, type: 'liquify'|'erase'|'cutout'|'inpaint'|'upscale'|'style'|'gen', file: string, params: object, at: string }
Layer    { id, type: 'text'|'sticker'|'shape'|'drawing'|'image', x,y,scale,rotation,opacity, z, props }
Preset   { id, kind: 'filter'|'effect'|'makeup'|'recipe', name, category, params }   // uygulamayla gelir (resources/presets/*.json)
Settings { language:'tr'|'en', theme, exportDefaults{format,quality,maxSide}, aiProvider:'local'|'gemini', geminiKey(enc), modelsDir }
```

Kural: piksel işlemleri (rasterOps) her zaman ayar/filtre zincirinden ÖNCE, katmanlar (metin/çıkartma) SONRA uygulanır.
Böylece Hypic'teki "efekt uygulandıktan sonra metin düzenlenemez" kısıtı klonda yok.

## API (IPC)

| kanal | ne yapar | çağıran | girdi | çıktı | akış |
| --- | --- | --- | --- | --- | --- |
| `file:open` | sistem diyaloğu, görseli oku | renderer | — | {path, bytes, name} | F01-F06 |
| `file:readPath` | sürükle-bırak dosyasını oku | renderer | path | bytes | F01 |
| `project:list` | projeler (yeni → eski) | renderer | — | ProjectMeta[] | F08 |
| `project:create` | kaynağı kopyala, project.json yaz | renderer | {name, bytes} | Project | F01 |
| `project:load` | proje + kaynak + raster dosyaları | renderer | id | Project + blobs | F08 |
| `project:save` | belge + küçük resim (otomatik kayıt, 1 sn debounce) | renderer | {id, doc, thumb} | ok | hepsi |
| `project:putAsset` | raster op PNG'sini yaz | renderer | {id, name, bytes} | path | F03, F04 |
| `project:delete` | proje klasörünü çöpe at (shell.trashItem) | renderer | ids[] | ok | S27 |
| `export:save` | kaydet diyaloğu + yaz | renderer | {bytes, ext, suggestedName} | path | F01 |
| `shell:reveal` | klasörde göster | renderer | path | — | S26 |
| `settings:get/set` | tercihler | renderer | — | Settings | S28 |
| `secret:setGemini/hasGemini` | anahtarı şifreli sakla | renderer | key | bool | S28 |
| `gemini:edit` | görsel + prompt (+referanslar) → görsel | renderer | {image, prompt, refs[]} | image bytes | F12 |
| `gemini:chat` | stilist sohbeti (metin+görsel) | renderer | {messages, image?} | text stream | Stilist |
| `models:status/download` | yerel model dosyaları (HF'den, sha256 kontrolü) | renderer | id | ilerleme olayları | S28 |
| `sidecar:start/run` | Python üretken yan süreç (faz 3) | renderer | {task, image, mask, prompt} | image | F12 |

Model dosyaları renderer'a `isil-model://<id>` özel protokolüyle sunulur (dosya yolu açılmaz).
Webhook/arka plan işi yok. Tek "iş": model indirmeleri (sürdürülebilir, iptal edilebilir).

## The parts that bite

- **Büyük görseller:** 48 MP telefon fotoğrafı = 192 MB RGBA. Önizleme ≤ 2048 px'de, dışa aktarma tam çözünürlükte karo karo (tile) render. WebGL `MAX_TEXTURE_SIZE` (genelde 16384) kontrolü.
- **Renk/EXIF:** EXIF yönlendirmesi (`createImageBitmap` `imageOrientation: 'from-image'`), sRGB varsayımı; HEIC faz 2.
- **Geri al/yinele:** belge değişmez nesne; her onaylanan araç = 1 adım; kaydırıcı sürüklemesi tek adım (pointerup'ta işlenir). Raster op dosyaları silinmez, belge eski base'e döner.
- **Yüz şekillendirme kalitesi:** landmark üçgen ağıyla warp, kenarda arka plan bükülmesi → "arka planı koru" = kişi maskesiyle sınırlama.
- **Model yükleme süresi:** ilk kullanımda indirme (yüzlerce MB), WebGPU yoksa WASM'a düş + kullanıcıya bildir. Oturumlar araç kapanınca bellekten atılır (6 GB VRAM).
- **WebGPU ile WebGL aynı anda:** VRAM paylaşımı; ONNX çıkarımı sırasında önizleme sabitlenir.
- **Gizlilik:** Gemini çağrısı öncesi tek seferlik onay diyaloğu; anahtar yalnızca main süreçte.
- **Silme:** proje silme = Geri Dönüşüm Kutusu (kalıcı silme yok).
- **Lisanslar:** model lisansları Ayarlar → Lisanslar'da; ticari olmayanlar (RMBG-1.4, CodeFormer) kullanılmıyor.

## Build order

1. **Dikey dilim (M1):** S01 ana sayfa → S03 editör → S04 Ayarla (6 kaydırıcı) → S26 dışa aktar. IPC: file:open, export:save. Proje kaydı yok. Motorun çalıştığını kanıtlar.
2. **Çekirdek editör (M2, must):** tüm Ayarla, HSL, eğriler, filtreler (kendi LUT'larımız), efektler (shader), kırp/döndür/perspektif, geri al/yinele, karşılaştır, projeler + otomatik kayıt, ayarlar, TR/EN.
3. **Rötuş (M3, must):** MediaPipe yüz → yüz/göz/burun/kaş/dudak/oran kaydırıcıları (çoklu yüz, tek taraf), cilt (pürüzsüz, leke, göz altı, beyazlat, diş, ton), makyaj, liquify, fırça rötuşları, vücut.
4. **Kesme ve temizleme (M4, must):** arka plan sil (BiRefNet/ MediaPipe), arka plan değiştir, sihirli silgi (LaMa), dokun-seç (MobileSAM), klonla, mozaik.
5. **Katmanlar (M5, must/should):** metin (OFL fontlar), çıkartma, şekil, çizim/doodle.
6. **Should:** kalite artır (Real-ESRGAN), relight (Depth Anything), kolaj/birleştir, toplu düzenleme, tarifler (şablonlar), yüz gizleme, saç rengi.
7. **Üretken (M7):** Gemini (AI Editör, YZ efektleri, değiştir, ifade, stilist) + Python yan süreç (SD inpaint/img2img).
8. **Fixes** from replica-entrepreneur.
