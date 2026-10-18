# Ar-Ge 4: 3B yüz yönü ve simetri (2026-10-18)

## Yöntem

- MediaPipe yüz ağı her nokta için derinlik (z) de verir. Kafa duruşu üç açıyla tahmin edilir: sağa-sola için 234→454 kulak noktalarının derinlik farkı, yukarı-aşağı için 10→152 alın-çene derinlik farkı, eğim için göz çizgisi açısı.
- Ağ bu açılarla önden görünüme çevrilir. Dönme merkezi yüz yüzeyinin yüz genişliğinin ~yarısı kadar arkasındadır (baş ortası).
- Simetri önden görünümde yapılır: her noktanın orta düzleme göre ayna eşi (en yakın nokta) bulunur, nokta eşinin aynasıyla ortalanır. 2B yansıtma üç çeyrek yüzlerde duruşu "düzeltmeye" çalışıyordu; önce önden görünüme çevirmek bunu önler.
- Ağ sonra kendi duruşuna ek açılarla (sağa-sola en çok ±14°, yukarı-aşağı ±10°, eğim ±10°) geri döndürülür ve dik izdüşümle düzleme indirilir. Yaklaşık 250 denetim noktasının eski ve yeni konumu MLS katı bükmesine çift olarak verilir. Yüzün 1,5 katı dış halka sabittir; saç ve boyun yumuşakça uyar.
- Yüz yerinde döner: denetim noktalarının ortalama kayması geri alınır.

## Ölçüm (`tests/e2e/pose.mjs`, test portresi)

Burun ucunun yüz ovaline göre yatay konumu, yüz genişliğine oranla: sola 0,144, asıl 0,189, sağa 0,209. Sağa çevirme gizli tarafa doğru olduğu için daha az etki verir (bükme görünmeyen yüzeyi oluşturamaz).

Göz çizgisi açısı: eğim −100'de 4,1°, asılda 10,5°, +100'de 16,4°.

Kimlik benzerliği (ArcFace, yalnız ölçüm düzeneğinde) bütün ayarlarda 0,90–0,97 arasında. En düşük değer tam simetride (0,90).

Simetri: önden görünüme çevrilmiş yüzde sol göz ve kaş yapay olarak kaydırıldı; simetri asimetriyi asıl yüzün de altına indirdi (0,022 asıl, 0,019 bozuk, 0,012 simetrik).

Görsel kıyas: `olcum/yuz-yonu.jpg`.

## Sınırlar

Görünmeyen yüz yarısı bükmeyle oluşturulamaz. Bu yüzden açılar küçük tutuldu. Daha büyük dönüşler için üretken model gerekir (FLUX ile yeni bakış açısı); kimlik riski yüksek olduğu için bu sürümde yok.
