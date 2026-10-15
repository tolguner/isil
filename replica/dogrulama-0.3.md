# Aşama 8: 0.2.0 ↔ 0.3.0 doğrulaması (2026-10-16)

Kalite seti (`dev-models/eval/set`, 28 Wikimedia fotoğrafı) 0.3.0 koduyla yeniden çalıştırıldı: `ONLY=faces,cutout,restore node tests/e2e/eval.mjs`. Karşılaştırma: `python tests/fixtures/compare_versions.py dev-models/eval/out-0.2.0 dev-models/eval/out 0.2.0 0.3.0`.

Yalnız 0.3.0'da değişen YZ araçları ölçüldü (yüz algılama, yüz onarma, kesim). FLUX, LaMa, kalite artırma ve derinlik değişmedi; Aşama 2 sonuçları geçerli.

## Testler (0.3.0 kodu)

| paket | sonuç |
| --- | --- |
| smoke | 11/11 |
| audit (kenar durumları) | 41/41 |
| ui-sweep (araç taraması) | 36/36 |
| ai-local (yerel YZ) | 11/11 |
| gpu-switch (ekran belleği) | 12/12 |

## Yüz algılama

0.2.0 değerleri `kalite-olcumu.md`'den (Aşama 2, yalnız MediaPipe). `out-0.2.0/faces.json` YuNet eklendikten sonra alınmış, bu yüzden taban olarak kullanılmadı.

| fotoğraf | beklenen | 0.2.0 | 0.3.0 |
| --- | --- | --- | --- |
| grup-karanlik (loş, 4 kişi) | 4 | 0 | **4** |
| tum-vucut | 1 | 0 | 2 (1 fazla) |
| grup-iki-cocuk | 2 | 2 | 2 |
| yakın plan portreler | 15 | 15 | 15 |
| plaj-kalabalik, gece-pazar (kalabalık, beklenen 0) | 0 | 0 | 1'er |

- Bulunan yüz: 17/21 → **21/21**. Süre ortancası ≈230 ms.
- Fazladan bulunanlar: tüm vücut fotoğrafında arka plandaki bir şekil; kalabalık fotoğraflarda gerçek ama çok küçük yüzler (beklenen 0 "portre değil" anlamında). Rötuşta yanlış yüz seçilirse kullanıcı başka yüze dokunarak geçebiliyor.

## Yüz onarma (ArcFace kimlik benzerliği, 1 = aynı kişi; 12 yüz)

| güç | 0.2.0 (CodeFormer) | 0.3.0 (GFPGAN + renk koruma) | 0.2.0 en kötü | 0.3.0 en kötü |
| --- | --- | --- | --- | --- |
| bozuk, onarımsız | 0,921 | 0,921 | | |
| 0,5 | 0,787 | **0,918** | 0,690 | 0,803 |
| 0,8 | 0,639 | **0,894** | 0,464 | 0,770 |
| 1 | 0,557 | **0,875** | 0,340 | 0,745 |

- 0.2.0'da onarım kişiyi değiştiriyordu (güç 1'de ortalama 0,56, en kötü 0,34). 0.3.0'da kimlik bozuk girdiye çok yakın kalıyor; varsayılan güç 0,7.
- Süre ≈1,4 sn (3 yüz dahil).

## Kesim

Modeller değişmedi, yalnız seçim mantığı (motor varsa BiRefNet). Süre ortancası ISNet 344 ms, BiRefNet 1,5 sn; hata 0.

## Sonuç

0.3.0'ın iki ana YZ hedefi ölçümle tuttu: loş grupta yüzler bulunuyor, yüz onarma kimliği koruyor. Görsel eleştirmen ajanı yeniden çalıştırılmadı: GFPGAN + renk koruma kararı zaten ajanın bu çıktılara verdiği puanlarla alınmıştı (`kalite-olcumu.md`).
