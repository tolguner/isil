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

## Tolga'dan beklenen
`dev-models/eval/out/index.html` sayfasında puanlama. Tümü gerekmez; öncelik: **Yüz onarma adayları**, **YZ Editör 4B/9B**, **Üretken silme**.
