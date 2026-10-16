# Işıl — yeni sohbette devam notu (2026-10-16)

Yeni sohbette ilk mesaj: **"Işıl/DEVAM.md dosyasını oku ve kaldığımız yerden devam et."** Ayrıntı gerekirse aşağıdaki dosyalara bakılır; hepsini baştan okumaya gerek yok.

## Proje

- **Ne:** Işıl; fotoğraf düzenleme, yüz rötuşu, vücut şekillendirme ve filtreleri tek araçta toplayan özgün, ücretsiz Windows masaüstü uygulaması. Electron 44 + React 19 + WebGL2 düzenleme motoru. **Hypic'in kopyası olarak konumlandırılmaz** (Tolga, 16.10); Hypic, FaceApp, Facetune, Peachy ve PicsArt yalnızca referans. Klasör adı 16.10'da hypic-klon → Işıl oldu.
- **Amaç:** kişisel Ar-Ge; portfolyoya konup konmayacağı belli değil. Her şey ücretsiz, tüm YZ yerel (fotoğraf hiçbir yere yüklenmez).
- **Yerel YZ:** tarayıcıda ONNX/MediaPipe/YuNet; ağır işler gömülü Python motorunda (`engine/server.py`, torch CUDA): FLUX.2 klein 4B/9B, Qwen3-VL 4B (stil danışmanı), BiRefNet, UltraSharp V2, GFPGAN 1.4, LaMa, Depth V2.
- **Donanım:** RTX 3050 6 GB laptop. Windows Akıllı Uygulama Denetimi imzasız DLL/ikilileri engelliyor (WASM ve PyPI paketleri sorunsuz).

## Durum

- **Sürüm 0.3.0** yayımlandı ve kurulu (`%LOCALAPPDATA%\Programs\Isil`). Son commit `c6b039a`.
- **Testler (hepsi geçiyor):** `node tests/e2e/smoke.mjs` 11/11 · `audit.mjs` 41/41 · `ui-sweep.mjs` 36/36 · `ai-local.mjs` 11/11 · `gpu-switch.mjs` 12/12. Önce `npm run build` (audit için `python tests/fixtures/make.py`).
- **0.3.0 plandaki 8 aşama bitti** (`replica/plan-0.3.md`). Doğrulama: `replica/dogrulama-0.3.md` (loş grup 0→4 yüz; yüz onarmada kimlik güç 1'de 0,56→0,88).
- **Rakip incelemesi (kullanarak, BlueStacks):** `replica/rekabet/inceleme-notlari.md`. Özet: rakiplerin YZ araçlarının çoğu bulutta; Peachy otomatik silmesi sessizce başarısız; FaceApp ücretsizde her şey Pro; PicsArt bulut yumuşatma yanak dövmesini siliyor.

## Kaldığımız yer: Ar-Ge 1 bitti — rötuşta işaretleri koruma

- Not ve ölçüm: `replica/arge/01-rotus-isaret-koruma.md` ("Sonuç" bölümü).
- **A:** leke gidericiye kontrast bandı (RETOUCH shader'ı). Çok koyu işaretler otomatik korunuyor.
- **B (2026-10-16):** Cilt panelinde "İşaretleri koru" fırçası. `FaceEdit.protect` → `buildProtectMask` → `uMaskP`; yumuşatma, leke, kırışık ve ten o bölgede sıfır. Dövmeli yüzde dövme farkı 3,50 → 0,33, yanak aynı. Test: `node tests/e2e/protect.mjs` 6/6.
- Sürüm hâlâ 0.3.0; değişiklik CHANGELOG'da "Yayımlanmamış (0.4 adayı)" altında. Kurulu uygulamaya henüz gelmedi.
- audit'te Z-01 bir kez MediaPipe segmenter "ROI width and height must be > 0" hatasıyla kaldı, yeniden çalıştırınca 41/41 geçti (kararsız; koruma işiyle ilgisiz).
- **Ar-Ge 2 (16.10): yüz bükmesi.** `replica/arge/02-yuz-bukme.md`. BlueStacks'te Peachy/PicsArt ızgaralı portreyle ölçüldü (Hypic açılmıyor). Işıl'ın kontur kaydırıcıları MLS'ye geçti. Ölçüm düzeneği depo dışında: `Projeler/isil-olcum` (ADB: `HD-Adb -s 127.0.0.1:5555`; PicsArt FLAG_SECURE → pencere yakalama `cap.ps1`; akış `akis.py`). Işıl tarafı `node tests/e2e/warp-olcum.mjs <görsel> <klasör>`.
- Göz elipsi ve vücut bantları da yapıldı (aynı not). Testler artık Temp'i temizliyor (`tests/e2e/_tmp.mjs`).
- Ar-Ge 2 iş listesinin 5 maddesi de bitti (16.10): silüet, vücutta Arka planı koru + YZ doldurma, bacakta tuval büyütme, katlanma denetimi, bacakta katmanlı koruma.
- **Sıradaki:** Tolga 0.4 kapsamını seçecek (aşağıdaki liste); bükme tarafında açık iş yok.

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
- Commit'lerde yalnız tolguner görünsün: Co-Authored-By satırı **ekleme**. Commit'ler GitHub'a (tolguner/isil, master) gönderilir: Tolga 16.10'da mevcut ve gelecek tüm commit'ler için izin verdi.
- Puanlama ya da eleme gibi Tolga adına seçim yapan kurallar önce gösterilir, onay alınır.
- Rakip uygulamaların kaynak kodları incelenebilir arge amacı ile kullanılabilir kopyalanamaz fakat bu uygulamalar mobil olduğu için ve biz masaüstü uygulama yaptığımız için örnek veya referans alınabilir. 

## Açık uçlar

- `Projeler/isil-arge/` (depo dışında): önceki denemeden kalan APK'lar ve araçlar. Kullanılmayacak; Tolga silmeye karar verebilir.
- Önerilen ama başlatılmamış oturum kartı: "Işıl 0.4: rakip incelemesinden çıkan küçük UX işleri".
