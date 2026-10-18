# Ar-Ge 3: Yaş ve ifade dönüşümü (2026-10-18)

## Yöntem

- Yüzün çevresi (yüz genişliğinin 2,2 katı kare) kırpılır ve ~1024 px'e büyütülür; FLUX.2 klein (yerel) bu kırpımı maskeli olarak yeniden çizer. Böylece büyük fotoğraflarda yüz ayrıntısı kaybolmaz.
- Maske dönüşüme göre dar tutulur: ifade için ağız, yanaklar ve çene; gözler için göz çevresi; yaş için yüz ovali ve boyun.
- Yaş dönüşümünde FLUX teni soldurup griye çekiyordu. Maskeli alanın ortalama rengi kanal kazancıyla (en çok ±%15) asıl görsele yaklaştırılıyor; kırışık ve doku kalıyor.
- Sonuç yalnız maskeli alandan geri konur. Kırpımın kalanı yeniden örneklemeyle yumuşamaz; yüz dışında değişen piksel yok (`tests/e2e/ageface-ui.mjs`).
- 90 px'ten küçük yüzlerde araç kapanır ve uyarır. Grup fotoğrafındaki ~20 px'lik yüzde sonuç uydurmaydı.

## Kimlik ölçümü

Benzerlik ArcFace (InsightFace w600k_r50) ile ölçüldü. Bu model yalnız ölçüm düzeneğinde (`isil-olcum/kimlik/benzerlik.py`) kullanılır, uygulamaya girmez; lisansı ticari olmayan araştırma içindir. Kaba ölçek: 0,6 üstü aynı kişi kesin, 0,4–0,6 büyük olasılıkla aynı, 0,3 altı farklı kişi. Yaşlandırma ArcFace benzerliğini doğal olarak da düşürür.

Test portresi (`src/renderer/public/test/portrait.jpg`), RTX ekran kartında:

| dönüşüm | güç | benzerlik | süre |
|---|---|---|---|
| Hafif gülümse | 0,80 | 0,77 | 37–75 sn (ilk çalıştırmada model yükleme) |
| Geniş gülümse | 0,85 | 0,52 | 37 sn |
| Ciddi | 0,80 | 0,85 | 39 sn |
| Gözleri aç | 0,85 | 0,91 | 35 sn |
| Daha genç | 0,70 | 0,74 | 30 sn |
| Daha yaşlı | 0,60 | 0,54 | 29 sn |
| Çok yaşlı | 0,68 | 0,40 | 29 sn |

İlk denemede yaşlandırma güçleri 0,75 ve 0,80'di. "Daha yaşlı" 60 yaş üstü görünüyordu (benzerlik 0,31), "Çok yaşlı" abartılı kırışık ve lekeyle başka birine dönüşüyordu (0,14). Güç düşürülüp komut yumuşatılınca ve ten eşleştirme eklenince 0,54 ve 0,40'a çıktı. Görsel kıyas: `olcum/yas-ifade.jpg`.

Saç rengi değişmez (yaşlıda gri saç için Saç aracı kullanılabilir).
