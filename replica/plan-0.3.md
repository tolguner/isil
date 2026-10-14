# Plan: doğrulama, kalite ölçümü ve rekabet analizi → Işıl 0.3.0

Hazırlandı: 2026-10-14 · Durum: **Aşama 1 bitti (14.10), Tolga'nın kararı bekleniyor** · Şu anki sürüm: 0.2.0

## Neden

Işıl'ın özellikleri **çalışıyor**, ama üç şeyi bilmiyoruz:

1. **Doğru çalışıyor mu?** Otomatik testler (11/11, 9/9) bir aracın hata vermeden sonuç ürettiğini gösteriyor; sonucun *iyi* olduğunu değil. Yapay zekâ çıktılarına çoğunlukla tek bir portre fotoğrafında bakıldı.
2. **Modeller yeterince iyi mi?** FLUX.2 klein, Qwen3-VL, BiRefNet, UltraSharp V2, CodeFormer, LaMa hiç sistemli ölçülmedi; rakiplerin bulut modelleriyle kıyas yok.
3. **Kullanıcıya uygun mu?** Özellik listesi Hypic'ten geldi; diğer rakiplere, kullanıcı yorumlarına ve masaüstü alışkanlıklarına bakılmadı.

## Hedef

0.3.0 sürümünde: bilinen hataları kapatmak, zayıf modelleri ölçerek değiştirmek ve rakip araştırmasından çıkan, Tolga'nın seçtiği özellikleri eklemek. Her kararın arkasında ölçüm ya da kaynak olacak.

## Kurallar (tüm aşamalarda)

- **Temiz oda.** Rakip uygulamaların kodu açılmaz, APK çözülmez, ağ trafiği kaydedilmez, ücretli kilit aşılmaz. Kaynak: mağaza sayfaları, yardım merkezleri, sürüm notları, tanıtım videoları, kullanıcı yorumları ve Tolga'nın kendi hesabıyla normal kullanım.
- **Hiçbir varlık alınmaz.** Rakiplerin adları, logoları, ikonları, ön ayar adları, metinleri ve görselleri Işıl'a girmez. Ekran görüntüleri yalnızca referans: `replica/screens/rakip/` (git dışı).
- **Alıntılar kısa ve kaynaklı.** Yorumlardan yalnızca kısa, bağlantılı alıntılar; geri kalanı özet.
- **Kararlar Tolga'nın.** Puanlama/önceliklendirme kuralları önce gösterilir, onaylanınca uygulanır. Her aşamanın sonunda bir onay noktası var.
- **Gizlilik.** Test fotoğrafları bilgisayardan çıkmaz; kişisel fotoğraf kullanılırsa yalnızca Tolga'nın izniyle ve `dev-models/` gibi git dışı bir klasörde.

## Aşamalar

Her aşama bir oturumda (ya da birkaçında) biter, sonunda Tolga'ya kısa bir özet ve karar soruları gelir.

### Aşama 1 — Mevcut durumun dürüst denetimi

Amaç: Bugünkü Işıl'da neyin gerçekten doğru çalıştığını bilmek.

- [x] `recon.md`'deki akışlardan bir test planı çıkar: her akış için mutlu yol + kenar durumları (çok büyük foto, şeffaf PNG, yan yatmış EXIF, yüz yok, 6 yüz, çok küçük foto, uzun proje adı, geri al/ileri al zinciri).
- [x] Otomatik olarak sınanabilenleri Playwright testine ekle (audit 35, ui-sweep 36); kalanları uygulamada elle tıklayarak dene.
- [x] Her aracın **çıktısını gözle** kontrol et (yalnızca "hata vermedi" değil).
- [x] Bulunan hataları önem derecesi, adımlar ve kanıtla `replica/hatalar.md`'ye yaz; kritik/yüksek olanları hemen düzelt. (5 hata, hepsi düzeltildi; 3 karar maddesi)

Çıktı: `replica/test-plani.md`, `replica/hatalar.md`, genişlemiş e2e testleri.
Onay noktası: düzeltilen ve ertelenen hatalar listesi.

### Aşama 2 — Yapay zekâ kalite ölçümü

Amaç: "Modeller yeterince iyi mi?" sorusuna fotoğraflarla ve sayılarla cevap.

- [ ] **Deneme seti (25–30 foto)**, zor durumlar ağırlıklı: tek portre, grup, profil, gözlük, sakal, koyu/açık ten, çocuk, yaşlı, düşük ışık, arka ışık, gürültülü telefon fotoğrafı, saç teli/kıvırcık saç, evcil hayvan, ürün, manzara, metinli görsel, eski/bulanık fotoğraf. Kaynak: serbest lisanslı görseller (lisansı not edilerek) ve isteğe bağlı Tolga'nın kendi fotoğrafları.
- [ ] **Her araç için ölçüm:** arka plan kesme (ISNet / BiRefNet lite / BiRefNet), nesne silme (LaMa / FLUX inpaint), YZ Editör (4B / 9B), YZ efektleri, kalite artırma (Real-ESRGAN / UltraSharp V2), yüz onarma (CodeFormer, farklı karışım oranları), derinlik, stil danışmanı (yanıt doğruluğu).
- [ ] **Ölçütler:** süre (ilk/sonraki), VRAM, başarısızlık oranı; yüz araçlarında kimlik benzerliği (yüz gömme vektörü benzerliği); kesimde kenar kalitesi; ve en önemlisi Tolga'nın 1–5 puanı.
- [ ] Sonuçları yan yana gösteren, Tolga'nın puan verebildiği **karşılaştırma sayfası** (yerel HTML).
- [ ] Zayıf çıkanlar için **alternatif aday modeller** araştır (ör. silme için daha yeni inpaint modelleri, yüz onarmada kimliği daha iyi koruyan seçenekler); lisans ve 6 GB VRAM uyumuyla birlikte.

Çıktı: `replica/kalite-olcumu.md`, karşılaştırma sayfası, aday model listesi.
Onay noktası: hangi model kalır, hangisi değişir, hangi ayar (karışım oranı, adım sayısı) seçilir.

### Aşama 3 — Rakip araştırması (herkese açık kaynaklar)

Amaç: Her rakibin ne sunduğunu, neyi ücretli kilitlediğini ve öne çıkan özelliğini bilmek.

| Uygulama | Neden bakıyoruz | Odak |
| --- | --- | --- |
| Facetune | doğrudan rakip: yüz/vücut rötuşu | rötuş araçları, önce/sonra, ince ayar akışı |
| FaceApp | doğrudan rakip: yüz dönüşümü | yaş/ifade/saç/stil dönüşümleri, kimlik koruma |
| Peachy | doğrudan rakip: vücut düzenleme | vücut şekillendirme, boy/bel/bacak, arka plan bükülmesi önleme |
| PicsArt | doğrudan rakip: hepsi bir arada | YZ araçları, şablonlar, çıkartma, toplu iş |
| Prequel | kısmen: estetik filtre/efekt | trend efektler, filtre paketleri, animasyonlu efekt |
| Canva | uzak: tasarım aracı (masaüstü sürümü var) | şablon, metin, marka seti, masaüstü UX |
| CapCut | uzak: video odaklı (masaüstü sürümü var) | fotoğraf şablonları, efekt, masaüstü UX |

Masaüstü alışkanlıkları için ek referans (hafif bakış): Lightroom, Luminar Neo, Photoshop Express — kısayollar, sürükle-bırak, toplu iş, önce/sonra karşılaştırma, büyük ekran yerleşimi.

- [ ] Her uygulama için: konum/vaat, platformlar, ücretli plan ve fiyat, ücretsiz ↔ ücretli sınırı, özellik listesi, YZ özellikleri, öne çıkan 3 özellik, son 6 aydaki sürüm notları.
- [ ] Tek bir **özellik matrisi**: satırlar özellikler, sütunlar uygulamalar + Işıl.

Çıktı: `replica/rekabet/<uygulama>.md` (7 dosya), `replica/rekabet/matris.csv`.

### Aşama 4 — Kullanıcı yorumları

Amaç: Kullanıcıların gerçekte neyi sevdiğini, neden kızdığını ve ne istediğini bilmek.

- [ ] App Store, Google Play, Reddit (ve varsa uygulamanın öneri panosu) yorumları; her uygulama için yeterli örnek.
- [ ] Temalara ayır: sevilen, nefret edilen (ör. abonelik baskısı, filigran, gizlilik, bulut zorunluluğu, yavaşlık), istenen ama olmayan.
- [ ] Her tema: sıklık, örnek kısa alıntı + bağlantı, Işıl için anlamı (zaten var / eksik / avantajımız).

Çıktı: `replica/rekabet/yorumlar.md`.
Onay noktası (Aşama 3 + 4 birlikte): bulguların özeti; Tolga hangi alanlara derin bakılacağını seçer.

### Aşama 5 — Uygulamalı inceleme (BlueStacks)

Amaç: Seçilen özelliklerin gerçek kullanım akışını görmek.

- [ ] **Tolga:** seçilen uygulamaları BlueStacks'e kurar, gerekiyorsa kendi hesabıyla giriş yapar. Ücretli plan alınmaz; ücretli özellikler yalnızca dışarıdan görülen kadarıyla incelenir.
- [ ] Her uygulamanın en güçlü 2–3 akışı adım adım: ekranlar, kontroller, durumlar, tıklama sayısı, sürelerin hissi.
- [ ] Hypic incelemesindeki gibi notlar ve referans ekran görüntüleri (git dışı).

Çıktı: `replica/rekabet/inceleme-notlari.md`.

### Rakipleri tersine mühendislikle inceleme (Aşama 3–5'e yayılır)

Tolga'nın isteği (14.10): uygulamalar yüzeysel değil, gerçekten çözümlenecek. Yöntem **kara kutu**: içeri bakmadan, girdi-çıktı ve herkese açık bilgiyle.

- [ ] **Aynı-fotoğraf testi:** deneme setinden seçilen fotoğraflar rakiplerin ücretsiz araçlarından ve Işıl'dan geçirilir; çıktı farkları (kesim kenarı, cilt dokusu, bükülme alanı, renk eğrisi) piksel düzeyinde karşılaştırılır. Bükülme araçlarında kare ızgara fotoğrafla deformasyon alanı, filtrelerde renk tablosu (gri tonlama/renk çizelgesi) fotoğrafıyla filtre eğrisi çıkarılır.
- [ ] **Cihazda mı bulutta mı:** uçak modunda hangi araçların çalıştığı, işlem süreleri, çözünürlük sınırları.
- [ ] **Herkese açık teknik kaynaklar:** şirketlerin araştırma makaleleri (ör. Lightricks, PicsArt AI Research), patentler, mühendislik blogları, iş ilanlarındaki teknoloji yığını, konferans konuşmaları.
- [ ] **Bağımsız APK raporları:** Exodus Privacy gibi kuruluşların yayımladığı izin/SDK/izleyici raporları; mağaza sayfasındaki izinler ve veri güvenliği beyanları.
- [ ] **Yapılmayacaklar:** APK/kod çözme, uygulama içinden model dosyası çıkarma, ağ trafiğini dinleme, ücretli kilidi aşma (kullanım şartları yasaklıyor; Işıl'ı hukuken riskli yapar).

Çıktı: her uygulama dosyasına "nasıl çalışıyor" bölümü + `replica/rekabet/ayni-foto-testi.md`.

### Aşama 6 — Fark analizi ve önceliklendirme

Amaç: Neyin ekleneceğine ve sırasına karar vermek.

- [ ] Fark listesi: rakiplerde olan + kullanıcıların istediği + Işıl'da olmayan ya da zayıf olan.
- [ ] Her madde için: kullanıcı değeri, kaç rakipte var, yorumlarda ne sıklıkla geçiyor, geliştirme zahmeti, yerel YZ ile yapılabilirlik (6 GB VRAM), lisans riski.
- [ ] **Puanlama kuralı önce Tolga'ya gösterilir**, onaylanınca liste sıralanır.
- [ ] Şimdi / Sonra / Belki diye üç gruplu yol haritası; Tolga 0.3.0 kapsamını seçer.

Çıktı: `replica/yol-haritasi.md`, `features.csv`'ye yeni satırlar.
Onay noktası: 0.3.0 kapsamı.

### Aşama 7 — Geliştirme (0.3.0)

- [ ] Kapsamdaki maddeler önem sırasıyla; her biri: kod → otomatik test → uygulamada elle kontrol → gerekiyorsa kalite setinde ölçüm.
- [ ] Aşama 2'de seçilen model değişiklikleri.
- [ ] Sürüm 0.3.0, `CHANGELOG.md`, yükleyici, bilgisayara kurulum.

### Aşama 8 — Son doğrulama

- [ ] Aşama 1 test planı ve Aşama 2 kalite seti yeniden çalıştırılır; 0.2.0 ile 0.3.0 yan yana.
- [ ] `features.csv`, `build-log.md`, README güncellenir.

## Tolga'dan beklenenler

| Ne zaman | Ne |
| --- | --- |
| Aşama 1 sonu | düzeltilecek / ertelenecek hatalara onay |
| Aşama 2 | deneme setine kendi fotoğrafı eklemek isterse izin + fotoğraflar; karşılaştırma sayfasında 1–5 puanlama |
| Aşama 3–4 sonu | derin bakılacak alanları seçmek |
| Aşama 5 | uygulamaları BlueStacks'e kurmak, hesapla giriş |
| Aşama 6 | puanlama kuralına ve 0.3.0 kapsamına onay |

## Sıra ve tahmini büyüklük

1 → 2 → (3 + 4) → 5 → 6 → 7 → 8. Aşama 1 ve 2 rakiplerden bağımsız; ilk onlar yapılır çünkü sonraki kararlar onlara dayanır. Aşama 3–4 araştırma ağırlıklı, 5 Tolga'nın katılımını ister, 7 en büyük iş (kapsama göre birkaç oturum).
