# Microsoft Store listelemesi (taslak)

Partner Center → Store listings → Türkçe ve English. Politika maddeleri: 10.1.1 (doğru açıklama), 10.2.4 (bağımlılık açıklamanın başında), 11.16 (canlı üretken YZ bildirimi), 10.5.1 (gizlilik politikası).

## Ortak alanlar

- **Gizlilik politikası URL'si:** https://github.com/tolguner/isil/blob/main/docs/PRIVACY.md
- **Destek / web sitesi:** https://github.com/tolguner/isil
- **Kategori:** Fotoğraf ve video
- **Fiyat:** Ücretsiz, uygulama içi satın alma yok
- **Gönderimde:** "Bu ürün canlı üretken YZ içeriği içeriyor" kutusu işaretlenecek (11.16)

## Türkçe

**Kısa açıklama:** Bilgisayarında çalışan ücretsiz fotoğraf düzenleyici: rötuş, makyaj, ışık ve renk, nesne silme ve yerel yapay zekâ.

**Açıklama:**

İsteğe bağlı indirmeler: bazı yapay zekâ araçları ilk kullanımda model dosyalarını Hugging Face'ten indirir. Üretken araçlar (YZ Editör, YZ efektleri, YZ ile değiştir, stil danışmanı) isteğe bağlı yerel YZ motorunu kullanır; motor yaklaşık 15 GB indirir (Python, PyTorch ve modeller) ve NVIDIA ekran kartı ister. Bu indirmeler yalnız sen onaylayınca başlar.

Üretken yapay zekâ: Işıl, yazdığın komutlara göre görüntü düzenleyen yerel bir üretken model (FLUX.2 klein) içerir. Üretilen sonuçlar komut engeli, çıplaklık denetimi ve yaş denetimiyle korunur; uygunsuz bir sonucu uygulama içindeki "Bildir" bağlantısıyla bildirebilirsin.

Işıl tamamen ücretsizdir; hesap, kredi, abonelik ya da filigran yoktur. Fotoğrafların bilgisayarından çıkmaz.

- Rötuş: tek dokunuş güzellik, yüz şekli, cilt, leke ve göz altı, makyaj, saç rengi, vücut
- Ayarla: ışık, renk, HSL, eğriler, seçmeli ayar, gece ve karşı ışık, kalite artırma
- Temizle: sihirli silgi, yoldan geçenleri sil, metin sil, klonla
- Arka plan: tek tıkla kesim, gökyüzü değiştirme, bulanık ya da renkli zemin
- Filtreler, efektler, metin, çıkartma, şablonlar, kolaj ve toplu düzenleme
- Dışa aktarmada konum bilgisi silinir; YZ kullanıldıysa "YZ ile düzenlendi" kaydı yazılır

**Özellik listesi (en çok 20):** Yerel ve ücretsiz rötuş · Makyaj ve göz rengi · Yüz ve vücut şekillendirme · Nesne ve yazı silme · Arka plan kaldırma · Gökyüzü değiştirme · Yerel üretken YZ ile düzenleme · Toplu düzenleme · Geçmiş ve geri alma · Hesap ve internet gerektirmez

## English

**Short description:** A free photo editor that runs on your PC: retouching, makeup, light and colour, object removal and local AI.

**Description:**

Optional downloads: some AI tools download model files from Hugging Face the first time you use them. Generative tools (AI Editor, AI effects, AI replace, style advisor) use the optional local AI engine, which downloads about 15 GB (Python, PyTorch and models) and needs an NVIDIA graphics card. These downloads only start after you approve them.

Generative AI: Işıl includes a local generative model (FLUX.2 klein) that edits images from your text prompts. Results are protected by a prompt filter, a nudity check and an age check; you can report an inappropriate result with the in-app "Report" link.

Işıl is completely free: no account, credits, subscription or watermark. Your photos never leave your computer.

- Retouch: one-tap beauty, face shape, skin, blemishes and under-eye, makeup, hair colour, body
- Adjust: light, colour, HSL, curves, selective edits, night and backlight, upscaling
- Clean up: magic eraser, remove passers-by, remove text, clone
- Background: one-click cutout, sky replacement, blurred or coloured backdrop
- Filters, effects, text, stickers, templates, collage and batch editing
- Location data is removed on export; an "edited with AI" record is written when AI was used

## Yaş derecelendirmesi (IARC anketi) için önerilen cevaplar

Anket soruları değişebilir; cevaplar uygulamanın gerçek davranışına göre:

- Şiddet, korku, kan, uyuşturucu, alkol, tütün, kumar: **Hayır**
- Cinsel içerik veya çıplaklık: **Hayır** (üretken araçlar çıplak/cinsel içeriği engeller)
- Küfür veya kaba dil: **Hayır**
- Kullanıcılar arası iletişim / sohbet / içerik paylaşımı: **Hayır** (uygulama içinde başka kullanıcılarla iletişim yok)
- Konum paylaşımı: **Hayır**
- Dijital satın alma: **Hayır**
- Kullanıcı tarafından üretilen içerik: üretken YZ sorusu ayrıca soruluyorsa **Evet, canlı üretken YZ** (11.16) ve filtre açıklaması
- Kişisel bilgi toplama: **Hayır**
