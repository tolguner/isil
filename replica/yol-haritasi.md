# Yol haritası — 0.3.0 (Aşama 6)

Durum: **kesinleşti (15.10)** — Tolga ajanın önerilerine katıldı ve kararları bana bıraktı; puanlama kuralı uygulandı. Kaynaklar: `hatalar.md`, `rekabet/*.md`, `rekabet/yorumlar.md`, Aşama 2 ölçümleri.

## Puanlama kuralı (uygulandı)

Her aday için dört değer:

| ölçüt | nasıl puanlanır |
| --- | --- |
| **Kullanıcı değeri (D)** 1–5 | 5 = çekirdek akışı bozan hata ya da yorumlarda sık geçen istek; 3 = birkaç rakipte olan, kullanıcıların övdüğü özellik; 1 = nadir/niş |
| **Kanıt (K)** 0–3 | rakiplerde var (+1), yorumlarda isteniyor/şikâyet (+1), bizim ölçüm/testte sorun görüldü (+1) |
| **Zahmet (Z)** 1–3 | 1 = bir oturumdan az; 2 = bir oturum; 3 = birkaç oturum |
| **Yapılabilirlik** | yerel / 6 GB VRAM ile çalışır mı, lisans uygun mu; uygun değilse aday elenir |

**Öncelik = (2 × D + K) ÷ Z.** Hatalar (S1/S2) puandan bağımsız en üste alınır. Eşitlikte "Işıl'ın farkını büyüten" (ücretsiz, yerel, gizlilik) önce gelir.

## Adaylar

| # | aday | tür | D | K | Z | öncelik | not |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Küçük/loş yüzleri bulma (YuNet + kırpımda landmark) | hata S2 | 5 | 3 | 2 | **hata** | grup fotoğrafında rötuş hiç çalışmıyor; Peachy kullanıcısı da aynı şikâyette |
| 2 | Yüz onarma modelini değiştir (kimlik kaybı) | kalite | 4 | 2 | 1 | 10 | CodeFormer kimliği 0,9'dan 0,5'e düşürüyor; aday sonuçları Aşama 2'de |
| 3 | HEIC açma | karar verildi | 4 | 2 | 1 | 10 | 0.3.0'a alındı |
| 4 | Ön ayar önizlemeleri (tek dokunuş, YZ efekt) | karar verildi | 3 | 2 | 2 | 4 | 0.3.0'a alındı |
| 5 | GIF bilgi notu | karar verildi | 1 | 1 | 1 | 3 | 0.3.0'a alındı |
| 6 | Ayarları kopyala / yapıştır (Ctrl+Shift+C/V) | özellik | 4 | 2 | 1 | 10 | Peachy abonesinin isteği; toplu iş zaten var |
| 7 | Araç arama / komut paleti (Ctrl+K) | özellik | 3 | 2 | 1 | 8 | Peachy 2.12, Canva; masaüstü alışkanlığı |
| 8 | Üretken silme (büyük alanlar: LaMa + FLUX) | kalite | 4 | 3 | 1 | 11 | LaMa büyük grupta hayalet bırakıyor; ölçüm sürüyor |
| 9 | Yoldan geçenleri otomatik bul + sil | özellik | 4 | 2 | 2 | 5 | Peachy 2.15, Facetune Vanish; kişi bölütleme + LaMa/FLUX |
| 10 | Seçmeli (bölgesel) ayar | özellik | 3 | 2 | 2 | 4 | Peachy 2.13, Hypic'te övülüyor |
| 11 | YZ Genişlet tuvali | özellik | 3 | 2 | 2 | 4 | PicsArt, Hypic (kayıtlı eksik S20) |
| 12 | Saç modeli deneme (saç maskesi + FLUX) | özellik | 3 | 2 | 2 | 4 | Facetune/FaceApp/Peachy; maske kimliği korur |
| 13 | Kıyafet değiştirme (giysi maskesi + FLUX) | özellik | 3 | 2 | 2 | 4 | Facetune'un 2026 yatırımı |
| 14 | Yaş / ifade hazır akışları | özellik | 2 | 1 | 1 | 5 | FaceApp; bugün YZ Editör komutlarıyla mümkün |
| 15 | Danışman önerisini tek tıkla uygula | özellik | 3 | 1 | 2 | 3,5 | PicsArt Aura benzeri; Işıl'a özgü fark olabilir |
| 16 | Çıkartma yapıcı (kesimden çıkartma) | özellik | 2 | 1 | 1 | 5 | PicsArt |
| 17 | Boy uzatma aracı | özellik | 2 | 1 | 1 | 5 | Peachy |
| 18 | LUT içe aktarma / kamera taklidi filtreleri | özellik | 2 | 1 | 2 | 2,5 | Prequel |
| 19 | 3B hareketli fotoğraf (derinlikten paralaks, GIF/MP4) | özellik | 2 | 1 | 3 | 1,7 | Prequel D3D |
| 20 | Yüz açısı değiştirme | özellik | 2 | 1 | 3 | 1,7 | Hypic'te övülüyor; zor |
| 21 | Kas / dövme ekleme | özellik | 1 | 1 | 2 | 1,5 | Peachy |
| 22 | FLUX: bellek sınırına göre çözünürlük | kalite | 3 | 1 | 1 | 7 | büyük görselde 27 → 90 sn |
| 23 | Koyu tende kimlik kaybı (FLUX "stüdyo" komutu) | kalite | 3 | 2 | 2 | 4 | 4B'de 0,53; 9B sonucu bekleniyor |

*Değerler Aşama 2 ve ajan puanlarıyla kesinleşti; kararlar aşağıda.*

## Kararlar (2026-10-15)

| konu | karar | gerekçe |
| --- | --- | --- |
| Yüz onarma | **GFPGAN 1.4** varsayılan; CodeFormer kaldırılır. Siyah-beyaz/sepya girdide renk girdiden korunur; yüz yumuşak maskeyle ve renk eşlenerek yapıştırılır; "onarım gücü" kaydırıcısı (varsayılan %70) | ajan: hafif bozulmada en tutarlı (hiç 1 almadı); Apache-2.0; şu anki CodeFormer her iki düzeyde son |
| Kalite artırma | UltraSharp V2 (motor) kalır; Real-ESRGAN yalnız motor yokken yedek | ajan 3,5 vs 1,8 |
| Kesim | Motor varsa **BiRefNet varsayılan** (Otomatik dahil); ISNet yalnız yedek; maske çok küçük/parçalıysa "belirgin konu bulunamadı" uyarısı | ajan 3,5 vs 2,25 |
| Derinlik | Base kalır | ajan 4,0 vs 3,9 |
| YZ Editör | 4B varsayılan kalır; **"Kişiyi koru"** seçeneği (arka plan değişikliklerinde yalnız kişi dışını yeniden çizer); siyah-beyaz girdi siyah-beyaz kalır; bellek sınırına göre çözünürlük | ajan: stüdyo komutunda yüz değişiyor, SB renkleniyor; büyük görselde 27 → 90 sn |
| Stil danışmanı | tekrar cezası, kısa yanıt sınırı, Işıl'ın gerçek araç adları sistem talimatında | ajan: uzun yanıtta tekrar ve menü uydurma |
| Nesne silme | LaMa kalır; maske kenarlardan ve aşağıya doğru biraz genişletilir (yansıma/gölge) | ajan: yansıma kalıyor |
| Üretken silme | 0.3.0'a girmez; 0.4 adayı | ajan 1–3 |
| Yüz algılama | YuNet ile ön algılama (BUG-008) | grup ve tüm vücutta 0 yüz |

## 0.3.0 kapsamı (sırayla)

1. YuNet ile küçük/loş yüz algılama (BUG-008)
2. Yüz onarma: GFPGAN + renk koruma + yumuşak yapıştırma + güç
3. Kesim: BiRefNet varsayılan + konu uyarısı
4. YZ Editör: kişiyi koru, siyah-beyaz koruma, bellek sınırına göre çözünürlük
5. Stil danışmanı düzeltmeleri
6. Silme maskesi genişletme
7. HEIC açma (K-1)
8. Ön ayar önizlemeleri (K-2)
9. GIF bilgi notu (K-3)
10. Ayarları kopyala / yapıştır
11. Araç arama (Ctrl+K)

Sonra: 0.4 adayları — seçmeli ayar, YZ Genişlet tuvali, yoldan geçenleri otomatik silme, saç/kıyafet hazır akışları, üretken silme, çıkartma yapıcı. Aşama 5 (BlueStacks incelemesi) Tolga uygulamaları kurduğunda yapılacak.
