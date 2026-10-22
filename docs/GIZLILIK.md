# Gizlilik notu

Işıl fotoğraflarını yalnız senin bilgisayarında işler.

- **Fotoğrafların hiçbir yere gönderilmez.** Düzenleme, yüz bulma, rötuş ve yapay zekâ araçlarının hepsi bilgisayarında çalışır. Hesap, oturum açma ya da bulut depolama yoktur.
- **Yüz verisi:** yüz noktaları yalnız düzenleme sırasında bellekte hesaplanır; saklanmaz, kimlik tanıma için kullanılmaz ve hiçbir yere iletilmez. KVKK açısından Işıl'ın geliştiricisi senin verilerini işlemez; veri sorumlusu sensin.
- **İnternete ne zaman çıkılır:** yalnız senin başlattığın indirmelerde. Yapay zekâ modelleri Hugging Face'ten, isteğe bağlı motor python.org, PyPI ve download.pytorch.org'dan iner. Bu indirmelerde fotoğraf ya da kişisel bilgi gönderilmez. Uygulama kullanım istatistiği, reklam ya da izleme içermez; kullandığı kütüphanelerin istatistik denemeleri uygulama içinde engellidir.
- **Kayıtlar:** projelerin, ayarların ve hata günlüğü `%APPDATA%\Işıl` klasöründe durur. Hata günlüğünde fotoğraf ya da kişisel bilgi yoktur; yalnız sen paylaşırsan bir yere gider.
- **Dışa aktarma:** dışa aktarılan fotoğraflardan konum (GPS) her zaman silinir. Çekim tarihi ve kamera bilgisi varsayılan olarak korunur; Ayarlar'dan bunları da silebilirsin. Üretken yapay zekâ kullanıldıysa dosyaya makinece okunabilir "YZ ile düzenlendi" kaydı (IPTC DigitalSourceType) yazılır.

## Kabul edilebilir kullanım

Işıl çıplak ya da cinsel içerikli görüntü üretmek, kişilerin kıyafetlerini çıkarmak, başkalarını aldatmak ya da taciz etmek için kullanılamaz; bu tür istekler uygulama tarafından engellenir. Başkalarının fotoğraflarını izinleri olmadan düzenleyip paylaşma.
