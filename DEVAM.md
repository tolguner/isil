# Işıl — yeni sohbette devam notu (2026-10-16)

Yeni sohbette ilk mesaj: **"hypic-klon/DEVAM.md dosyasını oku ve kaldığımız yerden devam et."** Ayrıntı gerekirse aşağıdaki dosyalara bakılır; hepsini baştan okumaya gerek yok.

## Proje

- **Ne:** Işıl, Hypic'in (ByteDance mobil fotoğraf editörü) Windows masaüstü için temiz-oda yeniden yapımı. Electron 44 + React 19 + WebGL2 düzenleme motoru.
- **Amaç:** kişisel Ar-Ge; portfolyoya konup konmayacağı belli değil. Her şey ücretsiz, tüm YZ yerel (fotoğraf hiçbir yere yüklenmez).
- **Yerel YZ:** tarayıcıda ONNX/MediaPipe/YuNet; ağır işler gömülü Python motorunda (`engine/server.py`, torch CUDA): FLUX.2 klein 4B/9B, Qwen3-VL 4B (stil danışmanı), BiRefNet, UltraSharp V2, GFPGAN 1.4, LaMa, Depth V2.
- **Donanım:** RTX 3050 6 GB laptop. Windows Akıllı Uygulama Denetimi imzasız DLL/ikilileri engelliyor (WASM ve PyPI paketleri sorunsuz).

## Durum

- **Sürüm 0.3.0** yayımlandı ve kurulu (`%LOCALAPPDATA%\Programs\Isil`). Son commit `c6b039a`.
- **Testler (hepsi geçiyor):** `node tests/e2e/smoke.mjs` 11/11 · `audit.mjs` 41/41 · `ui-sweep.mjs` 36/36 · `ai-local.mjs` 11/11 · `gpu-switch.mjs` 12/12. Önce `npm run build` (audit için `python tests/fixtures/make.py`).
- **0.3.0 plandaki 8 aşama bitti** (`replica/plan-0.3.md`). Doğrulama: `replica/dogrulama-0.3.md` (loş grup 0→4 yüz; yüz onarmada kimlik güç 1'de 0,56→0,88).
- **Rakip incelemesi (kullanarak, BlueStacks):** `replica/rekabet/inceleme-notlari.md`. Özet: rakiplerin YZ araçlarının çoğu bulutta; Peachy otomatik silmesi sessizce başarısız; FaceApp ücretsizde her şey Pro; PicsArt bulut yumuşatma yanak dövmesini siliyor.

## Kaldığımız yer: Ar-Ge 1 — rötuşta işaretleri koruma

- Not: `replica/arge/01-rotus-isaret-koruma.md` (literatür: AutoRetouch WACV21, BeautyGRPO, LoG blob leke tespiti).
- **Yapıldı (A):** leke gidericiye kontrast bandı (`src/renderer/src/engine/shaders.ts`, RETOUCH shader'ı, "leke" bloğu). Dövme, ben, hızma artık korunuyor; cilt yine yumuşuyor.
- **Kalan sınır:** yüksek yumuşatmada (80+) kalın dövmenin kenarları biraz soluyor. Tek geçişli shader bunu tam ayıramıyor.
- **Sıradaki iş (B): "İşaretleri koru" fırçası.** Yüz başına koruma maskesi. Kullanıcı dövmeyi/beni boyar; leke, yumuşatma ve ten birleştirme o maskede sıfırlanır.
  - Veri modeli: `src/shared/schema.ts` → `FaceEdit`.
  - Maskeler: `engine/face.ts` → `buildMasks`.
  - Shader: `engine/shaders.ts` → RETOUCH.
  - Arayüz: `tools/retouch.tsx`.
  - Test için dövme/ben/çil içeren yüzleri deneme setine ekle. Ölçüt: işaret bölgesinde fark düşük, cildin geri kalanında yumuşama yüksek.

## 0.4 aday listesi (Tolga kapsamı henüz seçmedi)

Küçük işler (rakip incelemesinden):
- Ctrl+K paletinde kaydırıcı düzeyinde arama.
- Değişen kategoride nokta işareti.
- Ana sayfada görev kısayolları (arka planı kaldır, nesne sil, kalite artır).
- Tek dokunuş tariflerinin hangi kaydırıcıları değiştirdiğini göstermek.

Büyük işler:
- Seçmeli ayar.
- YZ ile tuval genişletme.
- Yoldan geçenleri yerel silme (kişi maskesi + boyut süzgeci + onay + LaMa).
- Saç/kıyafet akışları, üretken silme, çıkartma yapıcı.

Not: 0.4 kapsamı seçilmeden sürüm numarası değişmez.

## Kurallar (Tolga)

- Her büyük güncellemede sürümü artır (`npm version x.y.z --no-git-tag-version`) ve CHANGELOG'a yaz. Uygulama sürümü `package.json`'dan okur. Kurulum: `npm run dist`, ardından `release/Isil-Setup-<v>.exe /S`.
- Commit'lerde yalnız tolguner görünsün: Co-Authored-By satırı **ekleme**. GitHub'a gönderme.
- Puanlama ya da eleme gibi Tolga adına seçim yapan kurallar önce gösterilir, onay alınır.
- **Rakip uygulamaların kaynak kodu açılmaz/çözülmez**, iç işleyişleri çıkarılıp Işıl'a taşınmaz. Ar-Ge kaynakları:
  - kullanarak ölçme (aynı fotoğraf, ızgara, renk çizelgesi),
  - yayımlanmış makale ve patentler,
  - açık kaynak modeller.

## Açık uçlar

- `Projeler/isil-arge/` (depo dışında): önceki denemeden kalan APK'lar ve araçlar. Kullanılmayacak; Tolga silmeye karar verebilir.
- BlueStacks'te ADB açık kaldı (Ayarlar → İleri). Kapatılabilir.
- Önerilen ama başlatılmamış oturum kartı: "Işıl 0.4: rakip incelemesinden çıkan küçük UX işleri".
