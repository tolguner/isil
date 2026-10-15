# Aşama 5: BlueStacks'te uygulamalı inceleme (2026-10-16)

Kara kutu: yalnız ekranda görünen arayüz ve girdi-çıktı. Ücretli plan alınmadı, deneme başlatılmadı. Deneme fotoğrafları `dev-models/eval/bluestacks/` (Ortam Yöneticisi → Windows'tan Aktar). Ekran görüntüleri `replica/screens/rakip/<uygulama>/` (git dışı). 👑 = ücretli.

Ortam: BlueStacks 5 (Android 9, Pie64), PC'de AdGuard açık. Bazı "kaynak indir" hataları AdGuard ya da BlueStacks ağından olabilir; ayrıca not edildi.

## Peachy (Android, TR arayüz)

### Kabuk
- Açılışta tam ekran "Peachy Pro" abonelik ekranı (kendiliğinden kapanıp ana menüye düşüyor). Ana menü: Galeri, YZ Düzeltme, kamera, Ayarlar.
- Galeri seçicide en üstte 4 "Örnek" model fotoğrafı, sekmeler: Fotoğraf / Portre (yüzlü fotoğraflar süzgeci).
- Editör üstü: geri, **arama**, 👑, indir (dışa aktar), menü. Fotoğrafın altında sol: geri al / ileri al; sağ: önce/sonra.
- Araç şeridi (Portre sekmesi): YZ Rötuş, Rötuş, Yüz, Makyaj, Vücut, İnce Ayar, Dolgunluk, Cilt, Saç, Fırça, Yeniden Işıklandır. Sekmeler: Portre, Araçlar, Ayarla, Filtreler, Efektler, Çıkartmalar.
- Ekranın altında kalıcı "Peachy Pro" şeridi; editör alanının ~%8'i.
- Yeni araç ipucu balonu ("Daha dolgun bir yüz için tek dokunuş", Go).
- Araçtan X ile çıkınca değişiklik sorusuz atılıyor. Editörden geri çıkınca da "kaydedilmedi" sorusu yok.

### Arama (Işıl'daki Ctrl+K'nın karşılığı)
- Boşken tam araç dizini: Öne çıkanlar (3D Şekillendir, Oran, Burun, Koyu Halkalar, Renk), Portre (11 araç), Araçlar (Kaldır, Geliştir, Genişlet, Bulanık, Çıkarma, Kırpmak, Ayarla, Filtreler, Efektler, Çıkartmalar).
- Yer tutucu örnek sorgu: "Beli incelt".
- **Kaydırıcı düzeyinde arıyor:** "bel" → "Bel-Manuel", "Bel-Otomatik"; "kald" → "Kaldır", "Kaldırın", "Kalça Kaldırma". Işıl yalnız araç ve eylem adlarını arıyor.

### Yüz
- Kategoriler: Benim (kendi ön ayarın, 👑), Hazır ayarlar, Şekil, 3D Şekillendir, Oran, Kaşlar, Gözler, Burun, Ağız.
- Şekil: İnce, Genişlik, Tapınak, Elmacık kemikleri 👑, Çene, V-şekli 👑, Çene, Alın. Kaydırıcı çift yönlü (orta 0).
- Hazır ayarlar (Klasik, Doğal, İnce, Genç, Keskin) hepsi 👑; kartlarda **genel model yüzü**, kullanıcının yüzü değil (Işıl 0.3.0 seçili yüzü gösteriyor). Ücretli ön ayar seçilince önizleme uygulanıyor, üstte "Reklamsız, Sınırsız: Tüm özelliklerin kilidini açın" balonu; dene-sonra-öde.
- Değiştirilen kategorilerin altında küçük nokta: hangi bölümde ayar yaptığın görünüyor. Işıl'da yok.
- **Izgara testi (İnce = en yüksek):** bükülme çene ve boyun çevresinde yerel, yumuşak geçişli; saçın dışındaki arka plan ızgarası düz kalıyor. Boyun hizasında çizgiler belirgin kıvrılıyor.

### Vücut
- Alt menü: Manuel, Otomatik, Kas, Görünüm, Dövme.
- Otomatik: "Bu özelliği kullanmak için kaynak dosyalarını indirin, lütfen ağınızı kontrol edin." → model cihazda çalışıyor ama ilk kullanımda ayrıca iniyor (Işıl'ın model indirme yaklaşımıyla aynı). İndirme bu ortamda başarısız.

### YZ Rötuş
- Dokununca tam ekran analiz: yüz çerçevesi animasyonu + "Her şey mükemmel hale geliyor… %", ≈14 sn.
- Sonra: Otomatik (ON) + Akne, Pürüzsüz, Kırışıklıklar 👑, Çene Çift 👑, Koyu Halkalar 👑, Ayrıntılar, Aydınlatmak, Beyazlat. Otomatik açıkken 4 kaydırıcı birden ayarlanmış (noktalı); her biri sonradan değiştirilebilir. Işıl'daki tek dokunuş tariflerinin "ayrıştırılabilir" hali.

### Kaldır (nesne silme)
- Üç mod: Temel, Gelişmiş, Otomatik (YZ).
- **Otomatik → bulut:** "Bu özelliği kullanmak için Peachy'nin fotoğrafınızı yüklemesine izin verilsin mi? Fotoğrafınız, işlem tamamlandıktan sonra sunucumuzdan silinecek." İzin verilmedi; test fotoğraflarının yüklenip yüklenmeyeceği Tolga'nın kararı. İçinde: Yoldan geçenler, Nesneler, Seçimi Kaldır.
- **Temel → cihazda:** Fırça + Silgi, fırça boyu kaydırıcısı; parmağı kaldırınca <1 sn'de siliyor. Yalnız fırçalanan pikseller siliniyor, nesneye genişlemiyor: plaj fotoğrafında yürüyen kişinin gövdesi gitti, bacakları kaldı. Işıl'da dokun-seç + maske genişletme + LaMa bu durumda daha temiz.

### Yeniden Işıklandır
- Araç düğmesi bu ortamda açılmadı (aramadan seçince yalnız araç şeridini kaydırdı). Büyük olasılıkla otomatik vücut gibi indirilecek kaynak istiyor.

## Facetune
- BlueStacks'te açılmıyor: siyah ekran, 2–3 sn sonra ana ekrana dönüyor (3 deneme). Android 9 / öykünücü uyumsuzluğu olabilir. İnceleme yapılamadı; Aşama 3'teki herkese açık kaynaklar geçerli.

## PicsArt
- Açılışta "Senin İçin / Keşfet" sosyal akışı; düzenleme için ortadaki + düğmesi. Yatay (tablet) düzen: sol dikey gezinme.
- **Önce görev, sonra fotoğraf:** "Oluştur" ekranında Metin ekle, Arka Plan Kaldır, Kaldır, Kolaj, Rötuş, Efektler, Serbest Stil, AI Geliştir kısayolları; görev seçince fotoğraf seçici açılıyor. Işıl'da önce fotoğraf açılıyor.
- Fotoğraf seçicide üstte AI Resim, Arka Plan, Kamera, FreeToEdit (ücretsiz stok) sekmeleri.
- Editör şeridi: Araçlar, Efektler, Rötuş, **AP Kaldır 👑**, Çıkartma, Kes, Metin, Foto Ekle, **Kaldır 👑**, Replay, Fit, Fırçalar, Sınır, Şekil, Maske, Çiz, AI Dene… + sağ altta yüzen "AI" düğmesi. Üstte geri al/ileri al, indir, paylaş.
- Arka plan kaldırma Oluştur kısayolundan denenince önizleme şeridi kesilmiş konuyu gösterdi ama sonuç uygulanmadan editöre düştü; editörde araç 👑. "AI Arka Plan" çevrimdışı gri.
- Araçlar: Kırp, Serbest Kırpma, Şekil Kırpma, Dağılma, Klonla, AI Değiştir, Esnet, Hareket, **Seç** (Dikdörtgen, Oval, Fırça, Sil, Lasso), Eğriler, Ayarla, Geliştir, Tilt Shift, Perspektif, Boyutlandır, Çevir/Döndür, AI Geliştirme, AI Genişlet (çevrimdışı tepki yok).
- Rötuş: Otomatik, Yüz, HD Portre, Yumuşat, Göz Altı, Saç Modelleri, Hafif Blur, Try On, Makyaj, Leke, Ten Rengi, Kırışıklık, Saç Rengi, Detaylar, Göz Rengi…
  - **Otomatik rötuş:** "Otomatik araç çevrimdışı kullanılamaz." Varsayılan yoğunluk 70.
  - **Yumuşat:** Otomatik / Manuel / Sil; "Otomatik mod çevrimdışı kullanılamaz" → cilt maskesi bile bulutta; elle fırça cihazda.

## FaceApp
- Ana ekran galeriden **yalnız yüzlü fotoğrafları** listeliyor (çevrimdışı da çalışıyor → yüz algılama cihazda).
- Fotoğraf açılınca editör hiç açılmıyor: "Çevrimdışısın. Lütfen internete bağlan." Bütün düzenleme bulutta (Aşama 3 bulgusunu doğruluyor).

## Çevrimdışı test özeti

BlueStacks bu oturumda internete çıkamadı (PicsArt ve FaceApp "bağlantı yok" dedi). Bu, plandaki uçak modu testinin yerini tuttu: çevrimdışı çalışan araç cihazda çalışıyor demektir.

| uygulama | çevrimdışı çalışan | çevrimdışı çalışmayan |
| --- | --- | --- |
| Peachy | yüz şekli (canlı kaydırıcı), YZ Rötuş otomatik analizi (≈14 sn), temel silme (<1 sn) | otomatik vücut ve yeniden ışıklandırma (model indirmesi gerekiyor), otomatik silme (fotoğraf yükleniyor) |
| PicsArt | seçim, elle yumuşatma, arka plan önizlemesi | otomatik rötuş, otomatik cilt maskesi, AI Arka Plan, AI Genişlet; arka plan kaldırma ve nesne silme ayrıca 👑 |
| FaceApp | galeride yüzlü fotoğraf süzme | düzenlemenin tamamı |
| Facetune | (açılmadı) | |
| **Işıl** | **hepsi** (modeller bir kez indikten sonra) | — |

## Işıl için çıkarımlar

1. **Gizlilik farkı ölçülü:** rakiplerin YZ özelliklerinin çoğu fotoğrafı sunucuya yüklüyor (Peachy bunu izin penceresiyle soruyor, PicsArt ve FaceApp sormuyor). Işıl'da yükleme yok. Bu, tanıtımda kanıtla söylenebilir.
2. **Araç araması kaydırıcı düzeyine inmeli** (Peachy: "bel" → "Bel-Manuel / Bel-Otomatik"). Boş aramada gruplu araç dizini göstermek de keşfi kolaylaştırıyor. → 0.4 adayı (küçük iş).
3. **Değişen kategoride nokta işareti** (Peachy): hangi alt bölümde ayar yaptığını gösteriyor. → 0.4 adayı (küçük iş).
4. **Otomatik + ayrıştırılabilir rötuş** (Peachy YZ Rötuş): tek dokunuş birkaç kaydırıcıyı ayarlıyor, her biri sonra değiştirilebiliyor. Işıl'ın tariflerini bu şekle getirmek. → 0.4 adayı.
5. **Silmede nesneye genişleme** Işıl'da zaten var (dokun-seç + maske genişletme); Peachy'nin temel silmesinde yok. Yoldan geçenleri otomatik bulma rakipte bulutta; Işıl'da yerel yapılabilir (kişi maskesi + LaMa) → 0.4 adayıyla aynı.
6. **Önce görev giriş ekranı** (PicsArt "Oluştur"): ana sayfaya "Arka planı kaldır / Nesne sil / Kalite artır" kısayolları. → 0.4 adayı (küçük iş).
7. **Seçmeli ayar** (PicsArt "Seç": dikdörtgen/oval/fırça/lasso) 0.4 listesindeki "seçmeli ayar"ı doğruluyor.
8. Ücretli ön ayarlar dene-sonra-öde: önizleme var, kaydetme kilitli. Işıl'da kilit yok; bu not yalnız rakip davranışı için.

## Çevrimiçi tur (Tolga interneti açtı ve test fotoğraflarının yüklenmesine izin verdi)

### Peachy
- Çevrimiçiyken editörün altındaki Pro şeridi yerini **banner reklama** bırakıyor; uygulama açılışında tam ekran yükleme reklamı (ör. başka bir YZ uygulaması), bekleme ekranlarında video reklam. Bir reklam ekranı takıldı, uygulama Android ayarlarından durmaya zorlanarak kurtarıldı.
- **Yeniden Işıklandır:** kaynak indikten sonra açıldı (ilk dokunuşta değil, sonradan). Ön ayarlar: Yok, Özel, Flaş 👑, Arka ışık, Saç ışığı. "Özel" ≈10 sn'de yüze yumuşak ön ışık ekledi (hafif, doğal). "Arka ışık": "Peachy Pro" ya da **"Bir Kez Dene" (ödüllü reklam)**.
- **Otomatik silme → Yoldan geçenler:** yükleme + algılama ≈12 sn ("Yükleniyor…" sırasında video reklam). Sudaki ≈11 kişiyi sarı çizgiyle işaretledi, arkadaki kalabalığı seçmedi (doğru karar). Kaldırmak için "Peachy Pro" ya da "Bir Kez Ücretsiz". Ücretsiz hak kullanıldı: "Yoldan geçenler kaldırılıyor…" ≈15 sn, sonra "Sonucu düzenle" ipucu çıktı ama **görüntüde değişiklik yoktu**; onaylandıktan sonra da kişiler yerinde. Sessiz başarısızlık (öykünücü kaynaklı olabilir, ama kullanıcıya hata gösterilmedi).

### FaceApp
- Çevrimiçiyken editör açılıyor, yüze otomatik yakınlaştırıyor. Kategoriler: Etkileyici, Saç stilleri, Makyaj, Eğlence, Boyutlar, Cilt, Gülümseme, Duygular, Yüz Hatları, Saç renkleri, Yaş, Cinsiyet, Gözlükler.
- Gülümseme (Klasik, Kapalı, Tebessüm, Yumuşak, Geniş, Üzgün) ve Saç renkleri (12+) seçeneklerinin **hepsi 👑**; ücretli seçenek dokununca önizleme yerine doğrudan "FaceApp PRO" duvarı. Ücretsiz kullanıcı neredeyse hiçbir şey deneyemiyor. Peachy'nin "önce dene" yaklaşımının tersi.

### PicsArt
- **Otomatik cilt yumuşatma (bulut):** yoğunluk 0'dan 77'ye çekilince ≈10 sn'de sonuç. Doku yumuşadı, gözler ve kaşlar korundu; ama **yanaktaki geleneksel yüz dövmesi belirgin şekilde soldu**: cilt maskesi kimliği belirleyen işareti "leke" saydı. Işıl'da yumuşatmanın dövme/ben/iz gibi işaretleri koruması bir kalite ölçütü olarak eklenmeli (0.4 kalite testi adayı).
- **Aynı fotoğraf Işıl'da** (`replica/screens/rakip/isil/yanak-karsilastirma.jpg`: orijinal | yumuşatma 80 | yumuşatma 80 + leke 60):
  - Yalnız yumuşatma 80: dövme ve burun hızması korunuyor, doku hafif yumuşuyor. PicsArt'ın otomatik modundan daha iyi.
  - Yumuşatma 80 + leke giderme 60: **dövme neredeyse tamamen siliniyor, hızma da soluyor.** Işıl'ın leke gidericisi de aynı hatayı yapıyor. → 0.4 adayı: leke giderme yalnız küçük, düzensiz lekelere uygulansın (büyüklük/şekil süzgeci) ve "işaretleri koru" (dövme, ben, piercing) seçeneği; kalite setine dövme/ben içeren yüzler eklensin.

## Çevrimiçi turun Işıl için anlamı

- Rakiplerin ücretsiz katmanı reklamla dolu ve kırılgan (takılan reklam ekranı, sessiz başarısız silme). Işıl'da reklam yok, her şey yerel; "çalışmazsa hata söyler" ilkesi korunmalı.
- "Yoldan geçenleri bul" fikri doğru: Peachy ön plandaki kişileri seçip arka plan kalabalığını bırakıyor. Işıl'da yerel karşılığı: kişi maskesi (BiRefNet/YOLO) + büyüklük/konum süzgeci + kullanıcı onayı + LaMa. 0.4 adayının tasarımı bu davranışa göre yapılabilir.
- Yeniden ışıklandırmada "Özel" ön ışık doğal ve hafif; Işıl'ın ışıklandırma aracıyla yan yana denenecek.

## Kalanlar

- Çevrimiçi tur yapıldı (yukarıda). Rakip çıktıları uygulama içinden dışa aktarılmadı (reklam/ücretli kapı), karşılaştırma ekran görüntüleriyle.
- Renk çizelgesiyle filtre eğrisi çıkarma (filtreler çevrimdışı da çalışmalı; zaman kısıtıyla sonraki tura kaldı).
