# Ar-Ge 5: Vücut görünümü (kas, köprücük kemiği) (2026-10-18)

## Test görselleri

Görseller yalnız ölçüm düzeneğinde (`Projeler/isil-olcum/vucut/`) tutulur, depoya konmaz:

- Ortalama yapılı, tişörtsüz bir koşucu: "Shirtless Runner in Casual Shorts", Wikimedia Commons, CC BY-SA 2.0.
- Kaslı bir model: "Shirtless man with abs – Nawid collection 14", Wikimedia Commons, kamu malı.

## Denenen yöntemler

1. **Yalnız FLUX (maskeli yeniden çizim):** bölge poz noktalarından çizildi ve açık cilt maskesiyle kesildi.
   - Karında belirgin kas çıktı, ama karnın önündeki el ve kol da "cilt" sayıldığı için göbek çevresinde yapay bir kıvrım oluştu.
   - Göğüs, kol ve köprücükte değişim neredeyse yoktu; göğüs kılları baskın kaldı.
2. **Yalnız ışık-gölge (kontür):** anatomik kabartma haritası çizildi (orta çizgi, ara çizgiler, bloklar, yan hatlar). Çarp ve perde karışımıyla uygulandı.
   - Anlık çalışıyor; kıl, doku ve ten korunuyor.
   - Karında hafif ama inandırıcı bir etki var.
   - Göğüste kıllı bölgede gri leke ve yanlış yerde çapraz gölge oluştu; bu yöntem göğüste kullanılamaz.
3. **Işık-gölge + FLUX (başlangıç görüntüsü, güç 0,5):** ışık-gölge sonucu FLUX'a başlangıç görüntüsü olarak verildi.
   - Karında en doğal sonucu verdi: yapı korunuyor, geçişler gerçekçi.
   - Kıllar kısmen inceliyor.
   - Kaslı modelde mevcut kaslar abartılmadı.
   - Bütün bölgeler birlikte işlenince göbek yanında yine kıvrım çıktı.

## Karar

Arayüze yalnız **Karın kası** kondu: anlık ışık-gölge önizlemesi ve Uygula'da isteğe bağlı YZ gerçekçileştirmesi. Öndeki kol ve el maskeden çıkarılıyor. Karında açık cilt %25'in altındaysa araç kapanıyor.

Göğüs kası, kol kası ve köprücük kemiği kalite yetersiz olduğu için yok. Tekrar denemek için gereken:

- göğüs kılını ayrı bölütleyip yalnız çıplak ciltte gölgelemek;
- ya da FLUX'u bölge başına ayrı ve daha yüksek güçte çalıştırıp kimlik ölçümü gibi bir doğruluk ölçütü (örneğin poz noktası kayması) eklemek.

Bölge dışında değişen piksel yok (`tests/e2e/physique-ui.mjs`). Süre: ışık-gölge ~0,3 sn; YZ ile ~30 sn (ilk çalıştırmada model yüklemeyle ~100 sn).
