# Işıl — yeni sohbette devam notu (2026-10-16)

Yeni sohbette ilk mesaj: **"Işıl/DEVAM.md dosyasını oku ve kaldığımız yerden devam et."** Ayrıntı gerekirse aşağıdaki dosyalara bakılır; hepsini baştan okumaya gerek yok.

## Proje

- **Ne:** Işıl; fotoğraf düzenleme, yüz rötuşu, vücut şekillendirme ve filtreleri tek araçta toplayan özgün, ücretsiz Windows masaüstü uygulaması. Electron 44 + React 19 + WebGL2 düzenleme motoru. **Hypic'in kopyası olarak konumlandırılmaz** (Tolga, 16.10); Hypic, FaceApp, Facetune, Peachy ve PicsArt yalnızca referans. Klasör adı 16.10'da hypic-klon → Işıl oldu.
- **Amaç:** kişisel Ar-Ge; portfolyoya konup konmayacağı belli değil. Her şey ücretsiz, tüm YZ yerel (fotoğraf hiçbir yere yüklenmez).
- **Yerel YZ:** tarayıcıda ONNX/MediaPipe/YuNet; ağır işler gömülü Python motorunda (`engine/server.py`, torch CUDA): FLUX.2 klein 4B/9B, Qwen3-VL 4B (stil danışmanı), BiRefNet, UltraSharp V2, GFPGAN 1.4, LaMa, Depth V2.
- **Donanım:** RTX 3050 6 GB laptop. Windows Akıllı Uygulama Denetimi imzasız DLL/ikilileri engelliyor (WASM ve PyPI paketleri sorunsuz).

## Durum

- **Sürüm 0.8.8** (18.10): karın kası (eksikler 7, kısmen: göğüs/kol/köprücük yok). Önceki: 0.8.7 (3B yüz yönü), 0.8.6 (yaş ve ifade), 0.8.5 (3B hareketli fotoğraf), 0.8.4 (şablonlar), 0.8.3 (cila turu), 0.8.2 (danışman önerisini uygulama, canlı güzellik kamerası), 0.8.1 (dolgunluk, saç hacmi), 0.8.0 (cilt dokusu, bölge hazır ayarları, kamera filtreleri), 0.7.0 (portre bulanıklığı, gerdirme, dövme), 0.6.0 (çıkartma yapıcı, saç/kıyafet, üretken silme), 0.5.0 (yoldan geçenler, seçmeli, YZ genişlet), 0.4.1, 0.4.0, 0.3.0 (`%LOCALAPPDATA%\Programs\Isil`).
- **Testler (hepsi geçiyor):** `node tests/e2e/smoke.mjs` 11/11 · `audit.mjs` 41/41 · `ui-sweep.mjs` 36/36 · `ai-local.mjs` 11/11 · `gpu-switch.mjs` 12/12. Önce `npm run build` (audit için `python tests/fixtures/make.py`).
- **0.3.0 plandaki 8 aşama bitti** (`replica/plan-0.3.md`). Doğrulama: `replica/dogrulama-0.3.md` (loş grup 0→4 yüz; yüz onarmada kimlik güç 1'de 0,56→0,88).
- **Rakip incelemesi (kullanarak, BlueStacks):** `replica/rekabet/inceleme-notlari.md`. Özet: rakiplerin YZ araçlarının çoğu bulutta; Peachy otomatik silmesi sessizce başarısız; FaceApp ücretsizde her şey Pro; PicsArt bulut yumuşatma yanak dövmesini siliyor.

## Kaldığımız yer: Ar-Ge 1 bitti — rötuşta işaretleri koruma

- Not ve ölçüm: `replica/arge/01-rotus-isaret-koruma.md` ("Sonuç" bölümü).
- **A:** leke gidericiye kontrast bandı (RETOUCH shader'ı). Çok koyu işaretler otomatik korunuyor.
- **B (2026-10-16):** Cilt panelinde "İşaretleri koru" fırçası. `FaceEdit.protect` → `buildProtectMask` → `uMaskP`; yumuşatma, leke, kırışık ve ten o bölgede sıfır. Dövmeli yüzde dövme farkı 3,50 → 0,33, yanak aynı. Test: `node tests/e2e/protect.mjs` 6/6.
- audit'te Z-01 bir kez MediaPipe segmenter "ROI width and height must be > 0" hatasıyla kaldı, yeniden çalıştırınca 41/41 geçti (kararsız; koruma işiyle ilgisiz).
- **Ar-Ge 2 (16.10): yüz bükmesi.** `replica/arge/02-yuz-bukme.md`. BlueStacks'te Peachy/PicsArt ızgaralı portreyle ölçüldü (Hypic açılmıyor). Işıl'ın kontur kaydırıcıları MLS'ye geçti. Ölçüm düzeneği depo dışında: `Projeler/isil-olcum` (ADB: `HD-Adb -s 127.0.0.1:5555`; PicsArt FLAG_SECURE → pencere yakalama `cap.ps1`; akış `akis.py`). Işıl tarafı `node tests/e2e/warp-olcum.mjs <görsel> <klasör>`.
- Göz elipsi ve vücut bantları da yapıldı (aynı not). Testler artık Temp'i temizliyor (`tests/e2e/_tmp.mjs`).
- Ar-Ge 2 iş listesinin 5 maddesi de bitti (16.10): silüet, vücutta Arka planı koru + YZ doldurma, bacakta tuval büyütme, katlanma denetimi, bacakta katmanlı koruma.
- **Sıradaki:** Tolga 0.4 kapsamını seçecek (aşağıdaki liste); bükme tarafında açık iş yok.

## 0.4 aday listesi (Tolga kapsamı henüz seçmedi)

Küçük işler (rakip incelemesinden) — **dördü de yapıldı (16.10), CHANGELOG'da; test `tests/e2e/palette.mjs` 9/9**:
- Ctrl+K paletinde kaydırıcı düzeyinde arama.
- Değişen kategoride nokta işareti.
- Ana sayfada görev kısayolları (arka planı kaldır, nesne sil, kalite artır).
- Tek dokunuş tariflerinin hangi kaydırıcıları değiştirdiğini göstermek.

Büyük işler:
- ~~Seçmeli ayar~~ **yapıldı (16.10)**: `tools/selective.tsx`, `EditDoc.local`, MAIN gölgelendiricisinde `uLoc*`; test `tests/e2e/selective.mjs`.
- ~~YZ ile tuval genişletme~~ **yapıldı (17.10)**: `tools/expand.tsx`, test `tests/e2e/expand.mjs [görsel] [klasör] [lama|flux]` (flux için dev-models/engine).
- ~~Yoldan geçenleri yerel silme~~ **yapıldı (16.10)**: `tools/passersby.tsx`, test `tests/e2e/passersby.mjs <görsel>`, kişi bulma ölçümü `tests/e2e/people.mjs`.
- ~~Saç/kıyafet akışları~~ **yapıldı (17.10)**: `ai/restyle.ts`, test `tests/e2e/restyle.mjs` (motor gerekir). ~~Üretken silme~~ **yapıldı (17.10)**: `generativeErase` (LaMa + FLUX strength 0,55), `tools/fill.tsx`, kıyas `tests/e2e/gen-erase.mjs`. Aday listesi bitti. **Yeni eksikler listesi (17.10): `replica/rekabet/eksikler-0.6.md`** (15 madde; 1, 3, 8 (0.7.0), 6, 10, 11 (0.8.0), 2, 5 (0.8.1), 13, 15 (0.8.2), 14 (0.8.4), 12 (0.8.5), 9 (0.8.6), 4 (0.8.7), 7 kısmen (0.8.8) yapıldı; kalanlar için Tolga sıra seçecek). ~~Çıkartma yapıcı~~ **yapıldı (17.10)**: `ai/sticker.ts`, `tools/stickermaker.tsx`, test `tests/e2e/stickermaker.mjs`.

Not: 0.4 kapsamı seçilmeden sürüm numarası değişmez.

## Kurallar (Tolga)

- Sürüm (17.10 güncel kural): her kurulan yapıda yalnız patch artır (`npm version 0.8.1 --no-git-tag-version`), CHANGELOG'a yaz; birkaç özellik bir sürümde toplanabilir. Minor artışını Tolga'ya sor. 1.0.0 = tüm eksik ve kusurlar giderilmiş, tasarım ve özellikler tamamlanmış, yayına hazır ürün. Uygulama sürümü `package.json`'dan okur. Kurulum: `npm run dist`, ardından `release/Isil-Setup-<v>.exe /S`.
- Commit'lerde yalnız tolguner görünsün: Co-Authored-By satırı **ekleme**. Commit'ler GitHub'a (tolguner/isil, master) gönderilir: Tolga 16.10'da mevcut ve gelecek tüm commit'ler için izin verdi.
- Puanlama ya da eleme gibi Tolga adına seçim yapan kurallar önce gösterilir, onay alınır.
- Rakip uygulamaların kaynak kodları incelenebilir arge amacı ile kullanılabilir kopyalanamaz fakat bu uygulamalar mobil olduğu için ve biz masaüstü uygulama yaptığımız için örnek veya referans alınabilir. 

## Açık uçlar

- `Projeler/isil-arge/` (depo dışında): önceki denemeden kalan APK'lar ve araçlar. Kullanılmayacak; Tolga silmeye karar verebilir.
- Önerilen ama başlatılmamış oturum kartı: "Işıl 0.4: rakip incelemesinden çıkan küçük UX işleri".
