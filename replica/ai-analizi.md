# Yapay zeka gerektiren özellikler — analiz (2026-10-13)

> **Güncelleme (2026-10-13):** Gemini tamamen bırakıldı. Üretken araçlar yerel FLUX.2 klein 4B/9B (görsel düzenleme, inpaint) ve Qwen3-VL 4B (stilist) ile; ağır algı modelleri (BiRefNet, 4x-UltraSharp V2, CodeFormer, Depth Anything V2 Base) aynı motorda CUDA ile çalışıyor. Aşağıdaki analiz ilk planı (Gemini + SD 1.5) anlatır; ayrıntılar `build-log.md` içinde.

Kaynak: BlueStacks'te canlı inceleme (`inceleme-notlari.md`). Klonda **hiçbir özellik ücretli/kilitli değil**; Hypic'teki 👑 araçların hepsi açık.

## Önce kritik bulgu: Gemini ücretsiz değil

- Gemini'nin görsel düzenleme modeli `gemini-nano-banana-2.1` (prompt + görsel → düzenlenmiş görsel; çoklu referans görsel destekli).
  Teknik olarak Hypic'in bulut AI araçlarının neredeyse hepsini karşılıyor.
- **Ama** görsel üreten Gemini modellerinin API'de ücretsiz kotası belirsiz: 2025 Aralık'ta ücretsiz kotalar ciddi kısıldı;
  güncel kaynaklar "ücretsiz yok" ile "günde birkaç yüz" arasında çelişiyor. Ücretli fiyat görsel başına ≈ $0,04 (Flash Image) – $0,13 (Pro).
  AI Studio'da kendi anahtarınla bir deneme yapınca kesinleşir.
- Gemini'nin **metin/görsel anlama** modelleri (Flash) hâlâ ücretsiz kotalı → Stilist sohbeti için uygun.

**Sonuç:** "Hiçbir şey ücretli olmasın" hedefi için Gemini birincil motor olamaz; yedek/isteğe bağlı olur.
Öneri: **yerel önce** (RTX 3050 6 GB'da çalışan modeller), Gemini anahtarı girilirse üretken araçlarda "yüksek kalite" seçeneği olarak açılsın.

## Dört katman

| Katman | Ne | Maliyet | Nerede |
| --- | --- | --- | --- |
| K0 Klasik | Shader/görüntü işleme; AI yok | 0 | WebGL (renderer) |
| K1 Yerel algı modeli | Yüz/vücut noktaları, bölütleme, derinlik | 0, çevrimdışı | ONNX Runtime (onnxruntime-node, CUDA/DirectML) |
| K2 Yerel üretken | Silme, upscale, stil, inpaint | 0, çevrimdışı; ağır | ONNX / Python yan süreç (SD) |
| K3 Bulut üretken | Prompt ile serbest düzenleme | Gemini anahtarı; ücret olabilir | Gemini API (isteğe bağlı) |

## Araç araç eşleme

### Rötuş
| Hypic aracı | Gereken | Katman | Klondaki yol |
| --- | --- | --- | --- |
| Yüz (Oran/Yüz/Göz/Burun/Kaş/Dudak ~60 kaydırıcı, tek taraf, çoklu yüz) | Yüz landmark (478 nokta) | K1 | MediaPipe Face Landmarker (ONNX) + mesh tabanlı warp shader. AI yalnızca nokta bulmak için; şekillendirme klasik |
| Yeniden şekillendir / liquify (it, döndür, daralt, genişlet, geri yükle) | — | K0 | Yer değiştirme haritası + shader |
| "Arka planı koru" | Kişi bölütleme | K1 | Selfie/kişi segmentasyon maskesiyle warp'ı sınırlama |
| Makyaj (ruj, allık, eyeliner, far, kaş, highlighter, kontür, pupil light, aegyo sal, ben) | Landmark + dudak/göz maskeleri | K1 | Landmark'tan bölge maskesi + blend modlu boyama. Ön ayarlar = parametre setleri |
| Cilt (pürüzsüzleştir, gözenek, onarma, kırışıklık, göz altı, ayrıntı, beyazlat, doku, diş beyazlat, ten uyumu) | Cilt maskesi + yüz bölgeleri | K1 + K0 | Cilt bölütleme (face parsing BiSeNet ONNX) + frekans ayırma / bilateral / renk eğrisi |
| Rötuş fırçaları (gizleme/kapatıcı, onarma, soluklaştır) | — | K0 | Fırça maskesi + yerel yumuşatma/klon. Onarma için küçük alan LaMa (K2) |
| Yüz Kaldırma (göz altı torbası, yanak, kaş, kenarlar) | Landmark | K1 + K0 | Bölgesel warp + gölge azaltma |
| Dolgun yüz (yanak, alın, çene, gülme çizgisi…) | Landmark | K1 + K0 | Bölgesel bloat warp + gölge/ışık |
| Yüz şekillendirme (kontür) | Landmark | K1 + K0 | Bölge maskelerine ışık/gölge boyama |
| Kırışıklık (oto/elle, bölgeler) | Kırışıklık tespiti | K1 + K2 | Bölge maskesi + frekans ayırma; güçlü mod LaMa |
| Cilt tonu (5 ton) | Cilt maskesi | K1 + K0 | Maske içinde renk eşleme |
| Yeniden ışıklandırma (ön ayarlar + sürüklenebilir ışık) | Derinlik + normal | K1 + K0 | Depth Anything V2 Small (ONNX) → normal harita → shader'da yönlü ışık. Gerçek "relight" yerine ikna edici yaklaşık |
| Yüz gizleme (bulanık, sansür, emoji/çıkartma) | Yüz kutusu | K1 + K0 | Yüz kutusuna bulanıklık/çıkartma |
| Manuel vücut (uzat/incelt) | — | K0 | Bölge seçimli ölçekleme |
| Otomatik vücut (ön ayar, oran, bölge: bel, bacak, omuz…) | Vücut poz noktaları + kişi maskesi | K1 + K0 | MediaPipe Pose (ONNX) + bölgesel warp |
| Saç rengi | Saç maskesi | K1 + K0 | Face parsing saç sınıfı + renk/desen karışımı. Yerel, ücretsiz |
| Saç doku/stil (hacim, dalgalı, kâkül, uzun saç) | Üretken | K2/K3 | Yerel SD inpaint (saç maskesi + prompt) ya da Gemini. **Zor, kalite riski** |
| İfade (gülümseme, kahkaha, üzgün…) | Üretken | K2/K3 | Yerel: LivePortrait (ONNX, ifade aktarımı, 6 GB'a sığar). Alternatif Gemini |
| İfadeyi düzeltme (kapalı göz aç, göz onarma, referans fotoğraf) | Üretken + referans | K2/K3 | Yerel: göz bölgesi SD inpaint / LivePortrait; Gemini çoklu referansla en iyisi |
| YZ portre (Klasik, Genç, Stüdyo… stilleri) | img2img | K2/K3 | Yerel SD img2img + yüz koruma (IP-Adapter FaceID) — 6 GB'da yavaş; Gemini daha iyi |
| Yapay zeka cilt (çilli, nemli ışıltı, mat, bronz…) | img2img hafif | K1 + K0 / K3 | Çoğu klasik yapılabilir: cilt maskesi + doku/renk/parlama katmanı. Gemini opsiyonel |

### Editör sekmeleri
| Hypic aracı | Gereken | Katman | Klondaki yol |
| --- | --- | --- | --- |
| Filtreler, Efektler (blur, light, vibe, retro, DV, chromatic, material…) | — | K0 | LUT (.cube) + shader zinciri. Kendi ön ayarlarımız |
| Efektlerde "odak/defokus" türleri | Derinlik/kişi maskesi | K1 | Depth Anything ile alan derinliği bulanıklığı |
| Ayarla (pozlama…tyndall, HSL, eğriler, gren, vinyet, soluk film) | — | K0 | Shader. Tyndall/ortam ışığı = shader efekti |
| Akıllı ayarlama "Otomatik / Rengi artır / Geliştir" | — | K0 | Histogram tabanlı otomatik ton |
| Pusu kaldır, gürültü azalt | — | K0 (+K1) | Dark channel dehaze; gürültü için NAFNet/SCUNet ONNX (isteğe bağlı) |
| Kaliteyi artır HD / AI güzelleştirme | Süper çözünürlük + yüz onarma | K2 | Real-ESRGAN x4 + GFPGAN/CodeFormer (ONNX). Yerel, ücretsiz |
| Flaş / AI aydınlatma | Derinlik | K1 + K0 | Relight ile aynı altyapı |
| Temizle → Sil / Sihirli sil | Inpaint | K2 | LaMa (ONNX, ~200 MB, GPU'da <1 sn) |
| Temizle → Akıllı seçim (nesneye dokun) | Her şeyi bölütle | K1 | SAM 2 / MobileSAM (ONNX): tıkla → maske → LaMa |
| Akıllı seçim kategorileri (arka plandaki insanlar, metin, yansıma, direk, leke) | Tespit + bölütleme | K1 | İnsanlar: kişi bölütleme + ana konu hariç; metin: PaddleOCR det (ONNX); leke: cilt üstü küçük blob; direk/yansıma: zor → SAM + kullanıcı dokunuşu |
| Klonla, Mozaik | — | K0 | Klasik |
| Yapay zeka ile değiştir (fırça + prompt) | Prompt'lu inpaint | K2/K3 | Yerel SD 1.5 inpaint (fp16, 6 GB'a sığar, ~10–20 sn) ya da Gemini |
| Yapay Zeka Editör (serbest prompt + referans görsel) | Serbest img edit | K3 (K2 zayıf) | Gemini en doğal eşleşme. Yerel karşılığı (InstructPix2Pix) belirgin şekilde zayıf |
| YZ efektleri (anime, peluş, CGI, cyberpunk, comics, wardrobe…) | img2img stil | K2/K3 | Hafif stiller yerel: AnimeGANv3 / küçük stil modelleri. Ağır stiller (peluş, 3D, kıyafet) Gemini |
| Kesim → Otomatik seç | Konu bölütleme | K1 | BiRefNet-lite / RMBG (ONNX) |
| Kesim → Hızlı seç | Tıkla-bölütle | K1 | MobileSAM |
| Arka plan (oran + dolgu), Metin, Çıkartma, Şekil, Fırça | — | K0 | Klasik (fontlar: Google Fonts OFL, çıkartmalar kendimiz) |
| Şablonlar (editör içi tarifler) | Çoğu klasik; "AI efekti" olanlar üretken | K0 / K3 | Tarif = kayıtlı düzenleme yığını (JSON). AI'lı tarifler AI motorunu çağırır |

### Diğer ekranlar
| Hypic | Gereken | Katman | Klondaki yol |
| --- | --- | --- | --- |
| Yapay Zekâ Stilist (sohbet + fotoğraf) | Çok modlu LLM | K3 (metin modeli) | Gemini Flash (metin+görsel anlama, ücretsiz kotalı). Yerel yedek: Ollama + küçük VLM (Qwen2.5-VL 3B / Gemma 3 4B) |
| Dijital Kamera | Canlı filtre | K0 | Web kamerası + aynı shader zinciri |
| Toplu düzenle | — | K0 | Düzenleme yığınını kopyala/yapıştır |
| Kolaj / Birleştir | — | K0 | Klasik |
| Şablon topluluğu (keşfet, kullanım sayısı, oluşturucu) | — | — | Ağ yok → yerel şablon galerisi |

## Özet sayılar

- AI gerektiren ~40 araç/alt aracın **~30'u yerelde ücretsiz** yapılabilir (K1 + K0 veya K2).
- Gerçekten **üretken** olup yerelde zorlananlar (~10): Yapay Zeka Editör, YZ efektleri (ağır stiller), YZ portre, saç doku/stil, ifade değiştir,
  kapalı göz aç, yapay zeka ile değiştir, AI genişletme, şablonlardaki AI efektleri.

## Üretken araçlar için önerilen yol

1. **Varsayılan: yerel** — Python yan süreç (diffusers) + SD 1.5 inpaint/img2img (fp16, ~4 GB VRAM), LivePortrait (ifade), AnimeGANv3 (stil).
   Ücretsiz, çevrimdışı; kalite Gemini'den düşük, süre 10–30 sn.
2. **İsteğe bağlı: Gemini anahtarı** — Ayarlar'da anahtar girilirse bu araçlarda "Gemini ile (yüksek kalite)" seçeneği açılır.
   Ücretsiz kota varsa ücretsiz çalışır, yoksa kullanıcı kendi hesabından öder. Uygulama asla zorunlu kılmaz.
3. Gizlilik: Hypic'teki gibi, bulut araçları ilk kullanımda "fotoğraf Google'a gönderilecek" onayı ister. Yerel araçlarda istemez.

## Yerel model listesi (taslak, toplam ≈ 3–5 GB, ilk açılışta isteğe bağlı indirme)

| model | iş | boyut (yaklaşık) | lisans notu |
| --- | --- | --- | --- |
| MediaPipe Face Landmarker | yüz noktaları | 4 MB | Apache-2.0 |
| MediaPipe Pose | vücut noktaları | 10 MB | Apache-2.0 |
| BiSeNet face parsing | cilt/saç/dudak maskesi | 50 MB | MIT |
| BiRefNet-lite | konu kesme | 180 MB | MIT |
| MobileSAM / SAM 2 tiny | dokun-seç | 40–150 MB | Apache-2.0 |
| LaMa | nesne silme | 200 MB | Apache-2.0 |
| Depth Anything V2 Small | derinlik (relight, odak) | 100 MB | Apache-2.0 (Small) |
| Real-ESRGAN x4 | upscale | 65 MB | BSD-3 |
| GFPGAN | yüz onarma | 350 MB | Apache-2.0 (CodeFormer ticari değil) |
| AnimeGANv3 | anime stili | 10 MB | araştırma lisansı, kişisel kullanım |
| LivePortrait | ifade değişimi | 500 MB | MIT (InsightFace bileşeni ticari değil) |
| SD 1.5 inpaint (fp16) | prompt'lu doldurma, img2img | 2 GB | CreativeML OpenRAIL-M |
