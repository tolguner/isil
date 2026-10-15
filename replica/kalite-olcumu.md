# YZ kalite ölçümü (Aşama 2)

Tarih: 2026-10-14 · Donanım: RTX 3050 6 GB Laptop · Deneme seti: 28 fotoğraf (27'si Wikimedia Commons, lisanslı; liste `dev-models/eval/set/set.json`) · Betik: `tests/e2e/eval.mjs`, sayfa: `tests/fixtures/eval_page.py` → `dev-models/eval/out/index.html` (git dışı)

Kimlik benzerliği: ArcFace (ONNX Model Zoo, Apache-2.0) ile iki yüzün gömme vektörlerinin kosinüs benzerliği. Doğrulama: aynı kişinin aynalı hali 0,91, farklı kişi 0,11. Yalnız ölçümde kullanılır, uygulamaya girmez.

## Özet

| araç | şu anki model | sonuç | öneri |
| --- | --- | --- | --- |
| Yüz algılama | MediaPipe Face Landmarker | yakın plan 15/15; **loş grup 0/4, tüm vücut 0/1** | YuNet ile ön algılama (BUG-008) |
| Arka plan kesme | ISNet / BiRefNet (motor) | BiRefNet saç, örgü, loş grupta açıkça daha iyi; 1,4 sn (ısınmış) | Motor kuruluysa **BiRefNet varsayılan** olsun |
| Kalite artırma 4× | UltraSharp V2 (motor) / Real-ESRGAN | UltraSharp 12'nin 11'inde önde (27,5 dB vs 25,5), ayrıntı geri geliyor; ESRGAN "boyanmış" görünüyor | UltraSharp kalsın |
| **Yüz onarma** | **CodeFormer (sabit ayar)** | **kimliği bozuyor:** bozulmuş yüz 0,94 → onarılmış 0,55 (koyu tende 0,34) | **GPEN-BFR 512** ya da RestoreFormer++ (aşağıda) |
| Derinlik | Depth V2 Small / Base | ikisi de iyi; Base kenarlarda biraz keskin, 0,3 sn | Base kalsın, fark küçük |
| Nesne silme | LaMa | küçük nesne ve yazıda kusursuz; büyük grupta bulanık hayalet | LaMa kalsın + büyük alanlar için "üretken silme" geliştir |
| YZ Editör | FLUX.2 klein 4B / 9B | arka plan değiştirme kimlik 0,94 (4B) / 0,90 (9B); "stüdyo" komutu 0,76 / 0,81; süre 27 sn / 205 sn | 4B varsayılan; 9B yalnız ışık/kompozisyon değişikliklerinde anlamlı |
| Stil danışmanı | Qwen3-VL 4B | saç rengi, gözlük, yemek doğru tanındı; bazı öneriler anlamsız ("koyu gri fondöten"), Türkçe kusurlu, 30–60 sn | sistem talimatı + kısa yanıt + Işıl araç listesi |

## Ayrıntılar

### Yüz onarma adayları (12 yüz × 2 bozulma; ilk 7 yüzün ortalaması)

| model | kimlik, hafif bozulma | kimlik, ağır bozulma | lisans |
| --- | --- | --- | --- |
| bozulmuş girdi (referans) | 0,943 | 0,835 | — |
| CodeFormer (şu anki, sabit) | **0,551** | 0,576 | S-Lab (ticari değil) |
| CodeFormer, sadakat 0,5 | 0,750 | 0,716 | S-Lab |
| CodeFormer, sadakat 0,9 | 0,867 | 0,789 | S-Lab |
| GFPGAN 1.4 | 0,866 | 0,774 | Apache-2.0 (+ NVIDIA StyleGAN2 parçaları) |
| **GPEN-BFR 512** | **0,918** | **0,816** | Alibaba, akademik/ticari değil |
| RestoreFormer++ | 0,896 | 0,805 (en kötü durum en iyi: 0,61) | kesinleşmedi (Apache-2.0 olabilir) |

Not: hiçbir onarıcı bozulmuş girdinin kimliğini aşamıyor — onarım netlik için kimlikten biraz verir. Görsel netlik Tolga'nın puanıyla değerlendirilecek.

### FLUX.2 klein — kimlik ve süre

| komut | 4B ortalama (en düşük) | 9B ortalama (en düşük) |
| --- | --- | --- |
| Arka planı karlı dağ yap | 0,941 (0,885) | 0,902 (0,866) |
| Stüdyo portresi yap | 0,759 (**0,527** koyu ten) | 0,814 (0,682 koyu ten) |
| Süre (medyan) | 27 sn | 205 sn |

En düşük kimlik değerleri iki modelde de koyu tenli fotoğrafta → kullanıcı yorumlarındaki "farklı ten renklerinde aynı iyi çalışmıyor" şikâyeti bizde de geçerli. Ayrıca 6 GB'ta büyük görsellerde (1024×880) bellek taşınca 4B 27 → 90 sn.

### Üretken silme denemesi
LaMa ile doldurup FLUX'la rötuş: büyük grubu siliyor ama dikiş izi bırakıyor; tabakta düz gri leke. **Henüz hazır değil**; düşük güç ve çevreyi tarif eden komutla yeniden denenecek.

## Ölçüm sırasında bulunan ve düzeltilen hatalar
- **BUG-006** (S2): tarayıcı ↔ motor geçişlerinde modeller yüklenemiyordu, motor 10 kat yavaşlıyordu — düzeltildi, `gpu-switch.mjs` 12/12.
- **BUG-007** (S3): motor yokken "Detaylı" kesim sessizce standart kesimdi — düzeltildi.
- LaMa motor kuruluysa artık GPU'da: 15–37 sn → **0,4 sn**.
- FLUX/sohbet öncesi motor ONNX belleğini bırakıyor (6 GB'ta taşmayı azaltır).

## Görsel eleştirmen ajanının puanları (2026-10-15)

Ajan: `.claude/agents/gorsel-elestirmen.md` — her sonucu asılla aynı bölgeden 2–5 kat yakınlaştırıp yan yana inceleyerek 1–5 puanlar; kimlik değişimi en ağır kusur. 6 bölüm paralel, 326 puan, her biri gerekçeli (`dev-models/eval/out/ajan/*.json`).

| araç | ajanın ortalaması | ajanın vardığı sonuç |
| --- | --- | --- |
| Kesim | BiRefNet 3,5 · ISNet 2,25 | BiRefNet varsayılan olsun; ISNet koyu ten/örgü/arka ışık/grupta çöküyor; BiRefNet'in zayıfı "neyin konu olduğu" (eller, tabak) → fırçayla ekle/çıkar + "konu bulunamadı" uyarısı |
| Kalite artırma | UltraSharp 3,5 · ESRGAN 1,8 | ESRGAN kişiyi değiştiriyor (yaşlıyı gençleştiriyor, koyu tende göz bozuluyor) → kaldırılsın; UltraSharp yazı uyduruyor → yazılı görselde uyarı |
| Derinlik | Base 4,0 · Small 3,9 | ikisi de iyi; Base ince ayrıntıda önde |
| Yüz onarma, hafif | GFPGAN 3,17 · RestoreFormer++ 3,17 · CodeFormer w0,9 3,08 · GPEN 3,00 · CodeFormer w0,5 2,33 · **şu anki CodeFormer 1,92** | şu anki model en kötü; karışım oranı çözmüyor, sadakat ayarı çözüyor |
| Yüz onarma, ağır | GPEN 3,08 · RestoreFormer++ 3,00 · CodeFormer w0,5 2,83 · GFPGAN 2,75 · CodeFormer w0,9 2,67 · **şu anki CodeFormer 2,25** | ağırda hiçbiri güvenilir değil; koyu tenli kadında hiçbiri 2'yi geçmedi (dövme/piercing kayboluyor) |
| YZ Editör | 4B 39 · 9B 37 (toplam) | arka plan değişiminde 4B, stüdyo komutunda 9B önde; stüdyo komutu iki modelde de yüzü değiştiriyor → yüzü maskeyle koru; siyah-beyaz girdi renkleniyor |
| Stil danışmanı | — | kısa sorularda doğru; uzun yanıtta tekrar ve kesilme, olmayan menü uydurma → tekrar cezası, token sınırı, gerçek araç adları |
| Silme | LaMa en iyi 4 (yazı), kalabalıkta 2–3; FLUX silmiyor; LaMa+FLUX 1–3 | kişi silmede maskeyi yansıma/gölgeyi kapsayacak şekilde genişlet; üretken silmede kenar yumuşatma + renk eşleme |

**Ajanın her bölümde ayrıca bulduğu ortak sorunlar:** siyah-beyaz/sepya girdiye renk sızması (FLUX, CodeFormer, RestoreFormer++); yaşlı yüzleri gençleştirme; koyu tende ve ayırt edici izlerde (dövme, piercing, ben, tek katlı göz kapağı) kayıp. Bunlar 0.3.0 adaylarına "çeşitlilik ve sadakat" başlığıyla eklenmeli.

## Tolga'dan beklenen
`dev-models/eval/out/index.html` sayfasında puanlama. Tümü gerekmez; öncelik: **Yüz onarma adayları**, **YZ Editör 4B/9B**, **Üretken silme**.
