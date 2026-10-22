# Sürüm geçmişi

Her yayımlanan yapıda sürümün yalnız son hanesi artırılır (0.8.0 → 0.8.1); ara sürüm (0.9) büyük aşamalarda, 1.0.0 ise yayına hazır tam üründe. Uygulama Ayarlar → Hakkında'da sürümü gösterir.

## 0.9.1 — 2026-10-22

1.0'a kadar "olmalı" listesinden ilk bölüm:

- **YZ ile düzenlendi işareti:** üretken yapay zekâ (FLUX) kullanılan fotoğraflara dışa aktarmada makinece okunabilir IPTC "DigitalSourceType" kaydı yazılıyor (AB Yapay Zekâ Yasası madde 50). Her dosyada oluşturan araç olarak Işıl yazıyor.
- **Çekim bilgileri korunuyor:** dışa aktarmada çekim tarihi, kamera ve objektif bilgisi kalıyor; konum (GPS), üreticiye özel notlar ve eski küçük resim her zaman siliniyor. Ayarlar → Dışa aktarma → "Çekim bilgilerini koru" ile kapatılabilir.
- **"Işıl ile aç":** JPEG, PNG, WebP ve HEIC dosyalarında Gezgin'in "Birlikte aç" menüsünde Işıl çıkıyor. Uygulama tek pencerede çalışıyor; ikinci açılış dosyayı açık pencereye gönderiyor.
- **Ekran kartı uyarısı:** üretken motor kurulmadan önce kart denetleniyor. NVIDIA değilse ya da bellek 6 GB'tan azsa açık bir uyarı çıkıyor; Ayarlar'da da görünüyor.
- **Güvenlik:** Electron 44.9.3'e güncellendi. Dışa aktarma kanalı yalnız bilinen biçimleri ve kullanıcının seçtiği klasörleri kabul ediyor, dosya adındaki yollar temizleniyor. Pencere uygulama dışına yönlendirilemiyor.
- **Testler:** 31 birim testi (komut engeli, yaş kapısı yanıtı, meta veri) CI'da çalışıyor. Yeni uçtan uca testler: meta veri, "ile aç" ve ağ denetimi; tipik bir düzenleme oturumunda dışarıya hiç istek gitmediği doğrulandı.

## 0.9.0 — 2026-10-22

Özellikler donduruldu; 1.0'a kadar sertleştirme ve cila. 1.0 öncesi şart işlerin (P0) hepsi 0.8.14–0.8.16 sürümlerinde tamamlandı:

- 20 farklı fotoğrafla kalite turu ve bulunan hataların düzeltilmesi (0.8.14)
- Veri kaybına karşı kayıt, hata ekranı ve hata günlüğü, lisans temizliği, doğrulanan ve kaldığı yerden devam eden indirmeler, motor yönetimi, ilk açılış turu ve kullanım kılavuzu (0.8.15)
- Üç katmanlı kötüye kullanım koruması: komut engeli, çıktıda çıplaklık denetimi, yaş kapısı (0.8.16)
- Kod imzalama için SignPath Foundation'a başvuruldu; onay gelince yükleyiciler imzalanacak.

Bu sürümde kod değişikliği yok.

## 0.8.16 — 2026-10-22

Kötüye kullanım korumasının üç katmanı tamamlandı:

- **Komut engeli:** çıplaklık, soyma ve cinsel içerik isteyen komutlar motora hiç gitmiyor (0.8.15'te geldi).
- **Çıktıda çıplaklık denetimi:** her üretken sonuç gösterilmeden önce yerel bir modelle (AdamCodd ViT, Apache-2.0, 88 MB) puanlanıyor; çıplak ya da cinsel içerik olasılığı %70'i aşarsa sonuç atılıyor. Model motorla birlikte iniyor; indirilemezse üretken sonuç gösterilmiyor. 20 sıradan fotoğrafta yanlış alarm yok (en yüksek puan %6).
- **Yaş kapısı:** fotoğrafta 18 yaşından küçük görünen biri varsa vücut, karın kası ve kıyafet değiştirme araçları kapanıyor. Karar yerel görsel dil modeline (Qwen3-VL) soruluyor; "evet" ya da "emin değilim" derse araç kapanıyor. Üretken kıyafet ve vücut araçları bu denetim olmadan çalışmıyor; motor kurulu değilse yalnız bükme tabanlı vücut aracı açık kalıyor. 20 yetişkin fotoğrafında yanlış alarm yok.
- Gizlilik notu ([docs/GIZLILIK.md](docs/GIZLILIK.md)) ve kod imzalama politikası ([docs/CODE_SIGNING.md](docs/CODE_SIGNING.md)) eklendi.

## 0.8.15 — 2026-10-22

1.0 öncesi "ürün olma" işleri (araştırma raporundaki P0 listesi), birinci bölüm:

- **Veri kaybı:** araç açıkken yapılan değişiklikler de otomatik kaydediliyor; uygulama kapanır ya da çökerse kaybolmuyor. İptal edilen araç diskte de geri alınıyor. Otomatik kayıt kapalıysa ya da bir aracın sonucu henüz uygulanmadıysa kapanışta sorulur.
- **Hata yakalama:** bir ekran ya da panel çökerse beyaz ekran yerine "yeniden dene" ve "ana sayfa" seçenekli bir hata kartı çıkar. Ekran kartı WebGL2 desteklemiyorsa açıklayıcı bir ileti gösterilir. Ekran kartı bağlamı kaybolursa motor kendini yeniden kurar; dışa aktarma yarıda kesilirse siyah dosya kaydedilmez.
- **Hata günlüğü:** `%APPDATA%\Işıl\logs\isil.log`. Ayarlar → Hakkında → Hata günlüğünü aç. İçinde fotoğraf ya da kişisel bilgi yok.
- **Lisans temizliği:** ticari kullanıma kapalı modeller (4x-UltraSharp V2, Depth Anything V2 Base, AnimeGANv2, FLUX.2 klein 9B) artık varsayılan değil; Ayarlar'daki "Kişisel kullanım modelleri" anahtarı ve uyarı onayıyla açılıyor. Varsayılanlar Real-ESRGAN, Depth V2 Small ve klein 4B. Depoya THIRD_PARTY_LICENSES.md eklendi.
- **Kötüye kullanım koruması (1. katman):** çıplaklık, soyma ve cinsel içerik isteyen komutlar üretken motora hiç gitmiyor (Türkçe ve İngilizce, harf oyunlarına dayanıklı).
- **Dayanıklı indirmeler:** tüm model dosyaları sabit sürüme (commit) bağlandı ve sha256 ile doğrulanıyor; bağlantı koparsa kaldığı yerden devam ediyor, ağ hatasında yeniden deniyor, başlamadan disk alanına bakıyor. Python paketleri kilit dosyasıyla tam sürümlerinden kuruluyor; get-pip ve Python da sabit ve doğrulanmış.
- **Motor yönetimi:** Ayarlar'da motorun konumu ve boyutu görünüyor; başka bir diske taşınabiliyor ya da kaldırılabiliyor. Kaldırıcı, yapay zekâ motorunu ve modelleri de silmek isteyip istemediğini soruyor (projeler korunur).
- **İlk açılış turu** (4 adım), **klavye kısayolları** penceresi (? tuşu) ve [kullanım kılavuzu](docs/KILAVUZ.md).

## 0.8.14 — 2026-10-21

Kalite turu: araçlar tek portre yerine 20 farklı fotoğrafla denendi (farklı ten renkleri ve yaşlar, gözlük, sakal, başörtüsü, siyah-beyaz, profil, grup, gece, gökyüzü, tabela, tam boy). Bulunan hatalar:

- **Gökyüzü:** model çıktısı gerilerek kullanılıyordu; gökyüzü olmayan fotoğrafta en açık düz duvar gökyüzü sanılıyordu (bej duvar, kitaplık köşesi). Artık olasılık olduğu gibi kullanılıyor. Kişinin kareyi doldurduğu düz, renksiz fonlarda (stüdyo fonu) panel "bu bir fon olabilir" uyarısı gösteriyor.
- **Metin silme:** yüz, gözlük, ağız, başörtüsü, saç ve bulutlar yazı sanılıyordu. Yüzlerin içi dışarıda bırakılıyor; iri ve kareye yakın bölgeler yazı sayılmıyor (dikey tabela yazısı korunuyor).
- **Yüz bulma:** uzun sakallı, piposu olan siyah-beyaz portrede yüz bulunamıyordu. Yedek tarama artık birkaç kırpım boyutu deniyor.
- **Dışa aktarma:** önizleme henüz çizilmemişken ya da önceki fotoğrafın yüz maskeleri kalmışken dışa aktarılan dosyada rötuş ve makyaj eksik ya da yanlış yerde olabiliyordu; maskeler dışa aktarmada yeniden kuruluyor.
- **Siyah-beyaz fotoğraf:** makyaj ve rötuş gri karede renk katıyordu (pembe dudak, mavi göz). Renksiz fotoğraflarda sonuç gri kalıyor.

## 0.8.13 — 2026-10-18

- **Gökyüzü değiştirme** (Arka plan → Gökyüzü):
  - Gökyüzü yapay zekâyla ayrılır: skyseg (U²-Net, MIT), görüntü kılavuzlu süzgeçle kenara oturtulur. Kararsız kenarlar gökyüzü rengiyle tamamlanır, kişi bölütlemesiyle kişi korunur.
  - Altı hazır gökyüzü var (açık mavi, bulutlu, gün batımı, alacakaranlık, fırtına, yıldızlı gece); hepsi yerel FLUX ile üretildi. Kendi görselini de seçebilirsin.
  - Gökyüzü ufka oturtulur. Parlaklık, ufuk konumu ve ön planın yeni ışığa renk uyumu ayarlanabilir.
- **Metin silme** (Temizle → Metin sil): fotoğraftaki yazılar PP-OCRv4 algılayıcıyla (Apache-2.0, 4,7 MB) bulunur ve kutu olarak gösterilir. Tıklayarak seçim değiştirilir. Seçilenler LaMa ya da üretken doldurmayla silinir. Başkasına ait filigranları silmek için kullanılmaması uyarısı var.

## 0.8.12 — 2026-10-18

- **Kayıtlı görünümler** (Tarifler → Benim): şu anki ışık, renk, eğri, filtre ve efektleri ad vererek kaydet; başka fotoğraflara tek dokunuşla uygula. Rötuş ve katmanlar kaydedilmez. Önizlemeler o anki fotoğrafla gösterilir, görünümler silinebilir.
- **Sanatsal efektler** (Efektler → Sanat): suluboya, guaş, neon, karakalem, çizgi roman. Hepsi anlık gölgelendirici.
- Bir panel seçicisinde boş liste her çizimde yeniden oluşup arayüzü kilitleyebiliyordu (önceden yakalanmış hata türü); sabit boş liste kullanıldı

## 0.8.11 — 2026-10-18

- **Öneri kartı** (Rötuş → Tek dokunuş): gözler kapalı görünüyorsa "Gözleri aç", ifade ciddiyse "Hafif gülümset" önerilir. Bir dokunuşla Yaş ve ifade aracında çalıştırılır; kart kapatılabilir.
- **Selfie düzeltme** (Rötuş → Yüz → Yön): yakın çekimde büyük görünen burun ve yüz ortası, kamera uzağa alınmış gibi küçültülür. Yüz noktalarının derinliğiyle hesaplanır.
- **Karşı ışık ve yeni Gece modu** (Ayarla → Akıllı): yüz karanlıksa genel ayarın üstüne yüze yerel aydınlatma eklenir. Yeniden uygulanınca eski nokta silinir.
- **Gerçek cilt dokusu:** cilt dokusu ayarı yordamsal gürültü yerine gerçek bir gözenek dokusu döşemesi kullanıyor. Doku, yerel FLUX ile üretilmiş bir cilt makro görselinden dikişsiz döşemeye çevrildi; iki ölçek ve yönde örneklenir, tekrar deseni görünmez.

## 0.8.10 — 2026-10-18

- **Çil ve ben** (Rötuş → Makyaj → Çil ve ben):
  - çil (burun sırtı ve yanaklarda, her çizimde aynı yerde);
  - ben (yanak, dudak üstü, çene, göz altı);
  - gamze.
- **Ruj stilleri:** saten, mat, parlak, cam, ombre.
- **Kaş stilleri:** dolgu, pudra (uçtan kuyruğa koyulaşan yumuşak dolgu), mikro (ince kıl çizgileri).
- Hazır makyaj görünümleri artık stil alanını doldurmuyor (stil seçimi korunuyor)

## 0.8.9 — 2026-10-18

- **Göz makyajı** (Rötuş → Makyaj, yeni sekmeler):
  - **Kalem:** doğal, ince ve kanatlı; beş renk.
  - **Kirpik:** doğal ve hacimli.
  - **Çift kapak:** kapak kıvrımına yumuşak gölge.
  - **Göz rengi:** yedi renk; irisin parlaklığı ve yansımaları korunur, gözbebeği değişmez.
  - **Işıltı:** gözbebeğine yansıma; nokta, çift, pencere ve halka biçimleri.
  - Hepsi yüz noktalarından yordamsal çizilir; dışa aktarmada tam çözünürlükte (en çok 4096 px) yeniden çizildiği için kirpik ve kalem ince kalır.
- Dışa aktarma, önizleme henüz çizilmeden başlatılırsa yüz maskelerini kendisi kurar (önceden rötuş atlanabiliyordu)

## 0.8.8 — 2026-10-18

- **Karın kası** (Rötuş sekmesi): karın kasını ışık ve gölgeyle belirginleştirir; kıl, ten ve doku korunur, önizleme anlıktır. Uygula'da isteğe bağlı olarak yerel YZ ile gerçekçileştirilir. Yalnız açık ciltte çalışır; karnın önündeki kol ve el etkilenmez, kıyafetin üstüne kas çizilmez. Göğüs, kol ve köprücük denendi ama sonuç yeterince gerçekçi olmadığı için eklenmedi (`replica/arge/05-vucut-gorunumu.md`)

## 0.8.7 — 2026-10-18

- **3B yüz yönü** (Rötuş → Yüz → Yön): Sağa-sola çevir, Yukarı-aşağı, Baş eğimi ve Simetri. Yüzün 3B noktaları önden görünüme çevrilip istenen açıyla geri döndürülür ve bükmeyle uygulanır; simetri önden görünümde ayna eşleriyle yapılır, böylece üç çeyrek pozlarda da doğru çalışır. Açılar küçük tutuldu (en çok ±14°); kimlik benzerliği bütün ayarlarda 0,90'ın üstünde ölçüldü (`replica/arge/04-yuz-yonu.md`)

## 0.8.6 — 2026-10-18

- **Yaş ve ifade** (Rötuş sekmesi, eski "İfade" yönlendirmesinin yerine): seçili yüzde Hafif gülümse, Geniş gülümse, Ciddi, Gözleri aç, Daha genç, Daha yaşlı, Çok yaşlı. Yerel FLUX.2 klein ile çalışır; yüzün çevresi kırpılıp büyütüldüğü için büyük fotoğraflarda da ayrıntı kalır, yüzün dışı birebir aynı kalır. Yaşlandırmada ten rengi korunur, boyun da yüzle birlikte değişir. Etki kaydırıcısı değişimi artırır ya da azaltır. Çok küçük yüzlerde araç uyarır. Kimlik benzerliği ölçülerek ayarlandı (`replica/arge/03-yas-ifade.md`)

## 0.8.5 — 2026-10-17

- **3B hareket** (Efektler sekmesi): fotoğrafa derinlik verip hafif bir kamera hareketiyle canlandırır; dört hareket (Daire, Yana, Yaklaş, Yukarı), hareket miktarı, odak (sabit kalan derinlik) ve 3/4/6 saniyelik döngü. Derinlik bilgisayarında Depth Anything ile hesaplanır; gölgelendirici derinlik boyunca ışın yürüterek örnekler, ön plan kenarı genişletildiği için yüz kenarında yırtılma olmaz. Düzenlenmiş hali (ayarlar, katmanlar, şablon dahil) kısa döngü video olarak kaydedilir: MP4 (H.264), desteklenmezse WebM. Fotoğrafın kendisi değişmez

## 0.8.4 — 2026-10-17

- **Şablonlar**: gönderi, hikâye ve afiş için 12 hazır yerleşim (Anlık, Galeri, Sade çerçeve, Dergi kapağı; Bulanık zemin, Pastel, Gece, Tam ekran; Etkinlik, Film afişi, Davetiye, İndirim). Şablon tuval oranını, zemini, fotoğrafın kutusunu ve metinleri birlikte kurar; fotoğraf kutuya göre ortadan kırpılır. Metinler sıradan metin katmanıdır, tuvalde dokunup değiştirilebilir; başka şablona geçince yalnız şablonun katmanları değişir, kendi eklediklerin kalır. Önizlemeler kendi fotoğrafınla gösterilir. Tarifler sekmesinde ve ana sayfada
- **Bulanık zemin** artık fotoğrafın büyütülmüş bulanık hali; önceden fotoğraf kenarındaki satırlar uzatılıyordu (dikey tuvallerde şeritlenme)
- Tarifler aracının simgesi değişti (Şablonlar ile karışmasın)

## 0.8.3 — 2026-10-17

Cila turu: yeni özellik yok, mevcut ekranlar tutarlı hale getirildi.

- **Araç alt çubuğu her yerde aynı**: Sihirli silgi, Klonla, Mozaik, YZ ile değiştir, Yoldan geçenler, YZ Editör, YZ efektleri, Kesim, Kalite artır, Portre bulanıklığı, Rötuş fırçası, Işıklandır ve Şekillendir'in İptal/Uygula düğmeleri panelin ortasından alttaki sabit çubuğa taşındı. Kalite artır'daki "Kapat" düğmesi diğerleri gibi "İptal" oldu
- **Devre dışı düğmeler okunur**: kullanılamayan ana düğme soluk turuncu yerine nötr gri görünür
- **Kayan sekme satırları**: kenardaki kesik yazı yerine yumuşak solma; fare tekerleği satırı yatay kaydırır, seçili sekme görünür tutulur
- **"Değişti" noktası yalnız fotoğrafı değiştiren ayarlarda**: fırça boyutu, yoğunluk, kenar boşluğu gibi araç ayarlarında artık çıkmıyor
- **Bekleme penceresi**: 3 saniyeyi geçen işlerde geçen süre gösterilir; LaMa ile çok parçalı silme ve doldurmada ilerleme çubuğu var
- **Anlaşılır hata iletileri**: bellek yetmemesi, ekran kartı bağlantısının kopması, ağ, dolu disk ve izin hataları sade bir cümleyle anlatılır; hata iletileri ekranda daha uzun kalır
- YZ Editör'deki uzun hazır komutlar alt satıra iner (panel yana taşmıyordu)
- Yüz gizle önizlemeleri büyütüldü (bulanık disk, piksel kareler, sansür bandı)
- "İfade (YZ)" aracının adı "İfade" oldu (YZ rozeti zaten var)
- Ana sayfaya "Yoldan geçenler" kısayolu eklendi; ızgara 12 karta tamamlandı
- Toplu düzenle ve Kolaj'daki "Fotoğraf seç" düğmesinin simgesi hizalandı; Kolaj'da fotoğraf yokken boş "Yerleşim" başlığının altına açıklama eklendi

## 0.8.2 — 2026-10-17

- **Stil danışmanı → önerileri uygula**: yanıtta geçen Işıl araçları (Cilt, Makyaj, Saç, Portre bulanıklığı, Seçmeli…) düğmeye dönüşür; konuşmadaki fotoğraf düzenleyicide o araçla açılır. Danışmanın araç listesi yeni araçlarla güncellendi
- **Kamera → canlı güzellik**: pürüzsüz, aydınlat, yüzü incelt ve göz kaydırıcıları canlı görüntüde uygulanır (yüz noktaları saniyede ~6 kez güncellenir, rötuş ve bükme WebGL'de); çekilen fotoğrafa da işlenir. Test sahte kamera akışıyla yapılır, gerçek kamera kullanılmaz

## 0.8.1 — 2026-10-17

- Rötuş → Toparla → **Dolgunluk**: alın, kaş kemiği, göz çukuru, gözyaşı oluğu, göz altı kesesi, elmacık, yanak, burun tabanı (bölgesel hafif şişirme; en uçta birkaç piksel, doğal dolgu etkisi)
- Rötuş → Saç → **Saç hacmi**: artı değer saçı dışa kabartır, eksi yatırır; yüz ovalinin içi ve saçın iç kenarı yerinde kalır (yüz derisi saça çekilmez). Araç adı "Saç rengi" → "Saç"

## 0.8.0 — 2026-10-17

Rakip taramasının sonraki üç maddesi.

- Filtreler → **Kamera**: 8 yeni görünüm (sokak kompaktı, tek kullanımlık, eski CCD dijital, pozitif film, portre negatifi, gece sineması, eski telefon, oyuncak kamera). Cihaz aileleri örnek alındı, değerler bizim
- Rötuş → Yüz: her sekmede **bölgeye özel hazır ayarlar** (yüz: oval, kalp, yumuşak, belirgin; göz: iri, badem, yuvarlak, kalkık; burun, kaş ve dudak için dörder kart). Kart o sekmenin kaydırıcılarını birlikte ayarlar, ikinci basış sıfırlar
- Rötuş → Cilt → **Cilt dokusu**: pürüzsüzleştirmenin sildiği gözenek dokusu iki ölçekli yumuşak gürültüyle geri verilir (yanak yüksek frekans enerjisi 153 → 189, orijinal 335); korunan işaretlere uygulanmaz. Oto ve Pürüzsüz düğmeleri dokuyu da kullanır

## 0.7.0 — 2026-10-17

Rakip taramasının (replica/rekabet/eksikler-0.6.md) ilk üç maddesi.

- Çıkartma → **Dövme**: 6 hazır çizgi dövme ya da kendi çizimin; açık zemin saydamlaşır, 4 mürekkep rengi; cilde "çarp" karıştırma ve hafif yumuşatmayla konur, cildin dokusu içinden görünür
- Rötuş → Toparla → **Gerdirme**: kontur, alın, gözler, orta yüz, ağız köşeleri (sarkan bölgeleri yukarı toplayan yerel bükmeler); Oto tuşu gerdirmeyi de kullanır, Ctrl+K'da aranabilir
- Efektler → **Portre bulanıklığı**: konu yapay zekâyla ayrılır (BiRefNet/ISNet), arka plan ya da özne bulanıklaştırılır; Lens (derinlik haritasıyla kademeli), Gauss, Hareket, Dönme, Yakınlaşma. Alfa ağırlıklı bulanıklıkla özne kenarında hale kalmaz

## 0.6.0 — 2026-10-17

Çıkartma yapıcı, yüzü değiştirmeyen saç/kıyafet değiştirme ve üretken silme. Hepsi bilgisayarda çalışır.

- **Üretken silme**: Sihirli silgi, Akıllı seçim ve Yoldan geçenler'de "Hızlı (LaMa) / Üretken (FLUX)" seçimi. Üretken yol önce LaMa ile doldurup sonucu FLUX.2 klein ile düşük güçte (0,55) yeniden işler: büyük alanlarda zemin ve duvar dokusu gerçekçi, yeni içerik uydurulmaz. Tam güçte FLUX'un silinen kişiyi "hayalet" olarak geri çizdiği ölçüldü ve bu yüzden kullanılmadı (`tests/e2e/gen-erase.mjs`). Yerel YZ motoruna `strength` aktarılıyor
- YZ efekt → **Saç** ve **Gardırop**: artık yalnız saç ya da kıyafet bölgesi (kişi bölütleme maskesi) FLUX ile yeniden çiziliyor; yüz ve arka plan piksel piksel korunuyor (yüz farkı 0–0,1). Kendi tarifini yazma alanı; yeni ön ayarlar: kısa küt, siyah saç, deri ceket, örgü kazak. Saç ve gardırop kartlarının örnek görselleri aynı maskeli yolla yeniden üretildi
- Çıkartma → **Benim**: çıkartma yapıcı. Bu fotoğraftan ya da bir dosyadan konu yapay zekâyla kesilir (BiRefNet/ISNet), kenar çizgisi (yok/ince/kalın, 5 renk) ve gölge eklenir; fotoğrafa eklenir, kişisel kitaplıkta saklanır (yerel), PNG olarak kaydedilebilir

## 0.5.0 — 2026-10-17

Üç büyük yerel YZ özelliği: yoldan geçenleri silme, seçmeli ayar ve YZ ile tuval genişletme. Hepsi bilgisayarda çalışır, fotoğraf dışarı çıkmaz.

- Kırp → **YZ genişlet**: fotoğrafı her yöne (%15, %30) ya da bir orana (1:1, 4:5, 9:16, 16:9, 3:2) büyütür, yeni alanı yerelde doldurur: yerel YZ motoru kuruluysa FLUX.2 klein, değilse LaMa. Dikiş kalmasın diye renk eşitleme ve kenarda yumuşak geçiş; asıl pikseller değişmez. Karşılaştırma orijinali yeni tuvaldeki yerinde gösterir
- Tek araçlı olmayan otomatik sekmelerde (Kırp) araç ızgarası görünür
- Ayarla → **Seçmeli**: fotoğrafa en çok 8 nokta koyup yalnız o bölgenin parlaklık, kontrast, doygunluk ve sıcaklığını değiştirme. Etki konuma yakınlık × noktadaki renge benzerlik; yarıçap ve renk duyarlılığı ayarlanabilir, noktalar sürüklenir. Gölgelendiricide, canlı
- Temizle → **Yoldan geçenler**: fotoğraftaki kişiler bilgisayarda bulunur (EfficientDet-Lite2, 3×3 karo tarama, kişi başına maske), ana kişi korunur, diğerleri silinmek üzere seçilir; tuvalde tıklayarak değiştirilir; "Gölge ve yansımayı da sil"; seçilenler karo karo LaMa ile silinir. Ön seçim kuralı: en uzun kişinin boyunun %60'ı ve üstü ana kişi sayılır
- Ayarlar → Hakkında: "Ücretsiz ve açık kaynak (MIT)"
- Ayarlar: aynı adı taşıyan iki "Kalite" ayarı ayrıldı: "Dosya kalitesi" (JPG/WebP sıkıştırması) ve "Üretken YZ modeli" (FLUX.2 klein 4B / 9B). Dosya kalitesinde sayı kutusu yerine üç seçenek: Küçük (80), Dengeli (92), En iyi (100). Dışa aktarma menüsünde "Dosya kalitesi", üst çubukta "Kalite artır" adları

## 0.4.1 — 2026-10-16

- "Orijinali göster" (göz düğmesi ve `\` tuşu): sihirli silgi, YZ düzenleme, kalite artırma gibi kalıcı işlemlerden sonra işlenmiş fotoğrafı gösteriyordu; artık her zaman ilk kaynak fotoğrafı gösteriyor. Uçtan uca test: `tests/e2e/compare.mjs`

## 0.4.0 — 2026-10-16

Ar-Ge 1 (rötuşta işaretleri koruma), Ar-Ge 2 (yüz ve vücut bükmesi, rakip ölçümleriyle) ve rakip incelemesinden çıkan arayüz işleri (`replica/arge/`). Işıl artık özgün, açık kaynak (MIT) bir masaüstü düzenleyici olarak konumlanıyor.

- Ctrl+K: kaydırıcı düzeyinde arama ("bel", "cene hatti", "golgeler"); Enter aracı açar, alt sekmeyi seçer, kaydırıcıyı vurgular
- Değişen kategoride nokta: yüz şekli sekmeleri, makyaj, filtre/efekt kategorileri, eğri kanalları
- Tarifler: seçilen tarifin değiştirdikleri (ayarlar, filtre, efekt, oran, metin) listeleniyor; satıra dokununca ilgili kaydırıcıya gidiliyor
- Ana sayfa: görev kısayolları (Kalite artır, Yüz rötuşu, Vücut şekillendir)
- Rötuş → Cilt: "İşaretleri koru" fırçası. Dövme, ben, çil ya da hızmanın üzerine boyanır; leke giderme, pürüzsüzleştirme, kırışık ve ten tonu o bölgeye uygulanmaz. Boya/Sil, fırça boyutu, "Korumayı temizle". Dövmeli yüzde (yumuşat 80 + leke 60) dövme bölgesindeki değişim 3,5 → 0,33, yanakta yumuşama aynı (`tests/e2e/protect.mjs`)
- Yüz şekli: incelt, genişlik, şakak, elmacık, çene hattı ve V çizgisi artık kontur kısıtlı MLS bükmesiyle çalışıyor. Yalnız yüz çizgisi oynuyor, ağız/burun/gözler yerinde kalıyor (incelt 100'de ağız kayması 4,5 → 0,5 px). Güç rakiplerin aralığına çekildi (en büyük kayma 48 → 12 px). Üç çeyrek yüzlerde geniş görünen taraf daha çok oynuyor. Eski projelerde bu kaydırıcılar daha hafif görünür (`replica/arge/02-yuz-bukme.md`)
- Vücut: "Arka planı koru" anahtarı; incelt, bel ve kalça yalnız kişiye uygulanır, arkadaki duvar/sütun oynamaz. Bacak kısaltma (eksi değer) yeniden çalışıyor. "Boşluğu YZ ile doldur ve uygula": incelen kişinin kenarında açılan şerit yerel LaMa ile doldurulur; bacak uzatmada kişi ayrı katmanda uzatılıp LaMa ile tamamlanan arka planın üstüne konur (zemin bükülmez)
- Bükme güvenliği: aşırı ayar birleşimlerinde görüntünün kendi üstüne katlanması engelleniyor; korumalı inceltmede silüet kenarındaki ikilenme giderildi
- Göz büyütme: daire yerine göz çizgisine hizalı elips; iki göz burun kökünde birleşmiyor, kaş oynamıyor
- Vücut: "İncelt" kişi silüetini izliyor (bol giysi dahil) ve yalnız gövdeye uygulanıyor (arka plan sütunları/duvarlar bükülmüyor); "Bacak" satır tabanlı bant uzatma: zemin çizgileri düz kalıyor, tuval uzadığı için ayak altındaki zemin kırpılmıyor
- Kararlılık: proje hızlı değişirken kapanmış önizlemenin MediaPipe bölütleyicisine gitmesi engellendi (konsoldaki "ROI width and height must be > 0" hatası)
- Leke giderici kontrast bandı: çok koyu kalıcı işaretler otomatik olarak korunuyor

## 0.3.0 — 2026-10-16

Rakip araştırması, kullanıcı yorumları ve görsel eleştirmen ajanının puanlarına göre seçilen 11 madde (`replica/yol-haritasi.md`).

- Yüz algılama: YuNet ön algılaması; grup ve tüm vücut fotoğraflarında küçük/loş yüzler bulunuyor (loş grupta 0 → 4 yüz)
- Yüz onarma: CodeFormer yerine GFPGAN 1.4; renk koruma (siyah-beyaz/sepya fotoğrafa renk sızmıyor), yumuşak yapıştırma, "Onarım gücü" kaydırıcısı
- Kesim: motor kuruluysa otomatik olarak BiRefNet; belirgin konu yoksa uyarı; "Detaylı" düğmesi kaldırıldı
- YZ Editör: "Kişileri koru" (yalnız arka plan değişir, yüz piksel piksel aynı), siyah-beyaz fotoğraf siyah-beyaz kalır, çözünürlük ekran belleğine göre
- Stil danışmanı: kısa yanıt, tekrar yok, yalnız Işıl'daki gerçek araçlar
- Silgi: "Gölge ve yansımayı da sil" seçeneği
- HEIC/HEIF (iPhone) fotoğrafları açılıyor (libheif WebAssembly)
- Önizlemeler: tek dokunuş rötuş kartları seçili yüzü, YZ efekt kartları örnek görseli gösteriyor
- Hareketli GIF açılınca "yalnız ilk kare düzenlenir" notu
- Ayarları kopyala / yapıştır (Ctrl+Shift+C / Ctrl+Shift+V)
- Araç arama paleti (Ctrl+K)
- Düzeltmeler: klasöre dışa aktarmada üzerine yazma, uzun metin taşması, toplu düzenlemede kalite ayarı, araç geçişlerinde ekran belleği tükenmesi (BUG-001…008)

## 0.2.0 — 2026-10-13

- Gemini kaldırıldı; tüm üretken YZ yerel ve ücretsiz: YZ Editör / YZ efektleri / YZ ile değiştir (FLUX.2 klein 4B ve 9B), stil danışmanı (Qwen3-VL 4B, akışlı yanıt)
- YZ motoru: gömülü Python + PyTorch CUDA; Ayarlar'dan tek tıkla kurulum
- Güçlü modeller motorda GPU ile: BiRefNet tam (detaylı kesim), 4x-UltraSharp V2 (kalite artırma), Depth Anything V2 Base; yeni: CodeFormer yüz onarma
- Hakkında ekranı sürümü package.json'dan okur

## 0.1.0 — 2026-10-13

- İlk sürüm: editör, ayarlar, filtreler/efektler, rötuş, temizle, kesim/arka plan, katmanlar, kolaj, toplu düzenleme, kamera, projeler; ONNX/MediaPipe ile yerel YZ, isteğe bağlı Gemini
