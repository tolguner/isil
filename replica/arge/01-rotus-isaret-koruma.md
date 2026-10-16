# Ar-Ge 1 — Rötuşta işaretleri koruma (dövme, ben, çil, hızma)

Tarih: 2026-10-16. Yöntem: yayımlanmış akademik literatür + genel görüntü işleme desenleri. Hiçbir ticari uygulamanın kodu kullanılmadı; aşağıdaki her şey açık kaynaklardan ve kendi çıkarımımızdan. Uygulama kodu Işıl'da sıfırdan yazılır.

## Problem

Çevrimiçi turda ölçtük: PicsArt'ın otomatik cilt yumuşatması ve Işıl'ın leke gidericisi (güç 60), yanaktaki geleneksel yüz dövmesini "leke" sanıp büyük ölçüde siliyor; hızma da soluyor. Oysa dövme, ben, çil ve piercing kişinin kimliğini taşıyan kalıcı işaretler — silinmemeli. Kanıt: `replica/screens/rakip/isil/yanak-karsilastirma.jpg`.

## Literatür ne diyor

- **AutoRetouch (Shafaei ve ark., WACV 2021).** Profesyonel yüz rötuşunu öğrenen hızlı bir ağ + 70.000 görüntülük FFHQR veri seti (profesyonel retoşörlerin elle rötuşladığı). Ana tez: "körlemesine yumuşatma, benleri ve çilleri yok eder ve ince cilt dokusunu bozar"; iyi rötuş, lekeyi giderirken **cildin kimlik taşıyan özelliklerini korur**. Kaynak: openaccess.thecvf.com WACV 2021.
- **BeautyGRPO (arXiv 2026).** Genel görüntü düzenleyicilerin "benleri kusur sanıp fazla düzenlediğini", kendi yönteminin ise benleri koruyup kimlik tutarlılığını yüksek tuttuğunu raporluyor. Yani bu, bilinen ve adı konmuş bir hata türü.
- **Kenar tabanlı otomatik leke giderme (UMD yüksek lisans tezi, NessAiver).** Boru hattı: yüz özellik maskesi + cilt haritası → **Laplacian-of-Gaussian ölçek-uzayı blob tespiti** ile leke adayları → eşikleme ve morfolojik filtreyle yanlış pozitifleri ele → yama tabanlı inpaint ile doldur (güçlü kenarları ve konturları koru). Kaynak: drum.lib.umd.edu/handle/1903/14774.
- **Patentler (US9959603B2, US11250241).** Aynı iskelet: blob tespiti → cilt rengi ve gradyan bilgisiyle eleme → onarım. Bizim için patent **talep** etmek değil, kamuya açık tarif önemli: hepsi "bul → ele → yalnız eleyip kalanı onar" diyor.
- **Ticari ürünlerin kendi anlatımı (Evoto, Aftershoot, Autoretouch).** Ben ile çili ayırıyor, yalnız beni gideriyor; çil, ben, dövme dokunulmadan kalıyor; istenirse korunacak ben geri getiriliyor. Yani sektör standardı **ayrıştırılmış kontrol + geri getirme**, tek bir "her şeyi yumuşat" kaydırıcısı değil.

## Çıkarılan tasarım ilkesi

Lekeyi işaretten ayıran sinyal **tek piksel koyuluğu değil**. Bir dövme çizgisi de, bir ben de çevresinden koyudur — Işıl'ın mevcut leke terimi (çevreden koyu küçük alanları sil) tam da bu yüzden onları siliyor. Literatürdeki ayraçlar:

1. **Ölçek/alan.** Leke küçük ve tekil bir blob (LoG tek ölçekte güçlü yanıt). Dövme/ben çoğu zaman daha büyük, bağlı ya da çok koyu. → küçük ölçekli, orta kontrastlı adayları hedefle; büyük ya da çok koyu olanı bırak.
2. **Kontrast bandı.** Çok koyu (mürekkep, koyu ben) işaretler eşiğin üstünde kalıp korunur; çok hafif olanlar (doğal gölge, por) zaten dokunulmaz. Ortadaki bant lekedir.
3. **Açık kontrol (en güvenilir).** Pro araçların yaptığı: kullanıcı "koru" fırçasıyla saklamak istediği işareti boyar; otomatik adımlar o bölgeye dokunmaz. Overpromise yok, sessiz hata yok.

## Işıl'a uygulama planı (sıfırdan, kendi kodumuz)

- **A — Otomatik iyileştirme (shader):** leke terimine ölçek + kontrast bandı. Çevreyi geniş yarıçaplı referansla ölç, çok koyu / geniş işaretleri koru. Ölçümle doğrula (aşağıdaki test seti).
- **B — "İşaretleri koru" fırçası (asıl çözüm):** yüz başına bir koruma maskesi; kullanıcı dövme/ben/piercing'i boyar, leke + yumuşatma + ten birleştirme o maskede sıfırlanır. Evoto/Aftershoot'un güvenilir yolu.
- **Kalite ölçütü:** deneme setine dövme/ben/çil/piercing içeren yüzler ekle. Ölçüt: işaret bölgesinde onarım öncesi/sonrası fark (düşük = korundu), cildin geri kalanında yumuşama (yüksek = iş yapıyor). Böylece "ne kadar korudu" sayıyla izlenir.

## Kaynaklar

- AutoRetouch WACV 2021 — https://openaccess.thecvf.com/content/WACV2021/papers/Shafaei_AutoRetouch_Automatic_Professional_Face_Retouching_WACV_2021_paper.pdf
- FFHQR veri seti — https://github.com/skylab-tech/ffhqr-dataset (lisans: repodaki LICENSE.txt'ye bakılacak)
- BeautyGRPO — https://arxiv.org/pdf/2603.01163
- Kenar tabanlı leke giderme (UMD) — https://drum.lib.umd.edu/handle/1903/14774
- US9959603B2 — https://patents.google.com/patent/US9959603
