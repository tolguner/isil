# Test planı — Işıl 0.2.0 (Aşama 1)

Tarih: 2026-10-14 · Ortam: Windows 11, RTX 3050 6 GB, Electron 44, ayrı test veri klasörü · Plan: `plan-0.3.md`

Akışlar `recon.md`'den (F01–F12). "oto" = Playwright ile otomatik, "elle" = 13.10 akşamı masaüstünde fare/klavyeyle denendi.

## Nasıl çalıştırılır

```bash
python tests/fixtures/make.py          # kenar durumu dosyaları (git dışı: tests/fixtures/out/)
npm run build
node tests/e2e/smoke.mjs               # temel akış (11)
node tests/e2e/audit.mjs               # kenar durumları + çıktı ölçümü (35), görüntüler replica/audit/
node tests/e2e/ui-sweep.mjs            # her sekme ve araç (36), ekran görüntüleri replica/audit/ui/
node tests/e2e/ai-local.mjs            # yerel YZ (9)
```

## Sonuç özeti

| paket | durum |
| --- | --- |
| smoke | 11/11 |
| audit | 35/35 (düzeltmelerden sonra; ilk koşuda 2 gerçek hata) |
| ui-sweep | 36/36 |
| ai-local | 9/9 (0.2.0'da) |

## Durumlar

| durum | akış | tür | adımlar | beklenen | nasıl | sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| F00-01…13 | dosya aç | kenar | GIF, CMYK JPEG, EXIF yönlü, 16-bit PNG, gri, 48 MP, yüzsüz, minik (40×30), saydam PNG, üç yüzlü, Türkçe+emoji uzun ad | açılır, boyut doğru, çıktı boş değil | oto | geçti |
| F00-N1 | dosya aç | olumsuz | yarısı kesik JPEG | açılmaz, anlaşılır hata | oto | geçti |
| F00-N2 | dosya aç | olumsuz | uzantısı .jpg olan metin dosyası | açılmaz, anlaşılır hata | oto | geçti |
| F00-E1 | dosya aç | kenar | iPhone HEIC | açılır | kod + Chromium | **desteklenmiyor** (karar: K-1) |
| X-01 | dışa aktar | kenar | saydam PNG aç → PNG ver | saydamlık korunur | oto | geçti |
| X-02 | dışa aktar | mutlu | JPG / PNG / WebP | doğru MIME | oto | geçti |
| X-03 | dışa aktar | kenar | EXIF yönlü foto | çıktı dik | oto | geçti |
| X-04 | dışa aktar | mutlu | en uzun kenar 1024 | 1024 | oto | geçti |
| X-05 | dışa aktar | mutlu | kalite 60 / 90 / 100 | boyut artar (52 / 148 / 516 KB) | oto | geçti |
| X-06 | dışa aktar | mutlu | önerilen ad | uzantısız proje adı | oto | geçti |
| X-07 | dışa aktar | kenar | 48 MP tam çözünürlük | 8000×6000, 2,2 sn | oto | geçti |
| X-08 | dışa aktar | kenar | 165 karakterlik Türkçe+emoji ad | ad korunur | oto | geçti |
| F01-H1 | rötuş | mutlu | portrede yüz algılama | 1 yüz | oto | geçti |
| F01-E1 | rötuş | kenar | yüzsüz manzara | 0 yüz, araçlar uyarır | oto | geçti |
| F01-E2 | rötuş | kenar | üç yüzlü foto | 3 yüz | oto | geçti |
| F02-H1 | ayar | mutlu | 20 değişiklik, 20 geri al, 20 ileri al | başlangıç / son birebir | oto | geçti |
| F02-E1 | ayar | kenar | geri al sonra yeni değişiklik | ileri geçmişi silinir | oto | geçti |
| F03-H1 | kesim | mutlu | arka planı kaldır → PNG | saydam arka plan | oto | geçti |
| F03-E1 | kesim | kenar | model indirilmemiş (ilk kullanım) | indirme onayı sorulur, çökme yok | oto | geçti |
| F06-H1 | kırp | mutlu | 1:1 | kare çıktı | oto | geçti |
| F06-H2 | kırp | mutlu | sağa 90° | en/boy yer değiştirir | oto | geçti |
| F06-E1 | kırp | kenar | 10° ince döndürme | boş köşe yok | oto | geçti |
| F07-H1 | metin | mutlu | Türkçe + emoji metin | çıktıda doğru çizilir | oto | geçti |
| F07-E1 | metin | kenar | uzun metin, dar foto | tuvale sığar | oto | **hata → düzeltildi** (BUG-002) |
| F08-H1 | proje | mutlu | düzenle, kapat, yeniden aç | aynı belge | oto | geçti |
| F10-E1 | toplu | kenar | aynı adlı iki çıktı | ikisi de kalır | oto | **hata → düzeltildi** (BUG-001) |
| UI-01…36 | tüm araçlar | mutlu | her sekme/aracı aç, iptal et | panel çizilir, hata yok, iptal belgeyi değiştirmez | oto | geçti |
| M-01 | dosya diyaloğu, kaydet diyaloğu, sürükle-bırak | mutlu | gerçek pencere | çalışır | elle (13.10) | geçti |
| M-02 | fırçayla silme, akıllı seçim, klonlama | mutlu | fareyle boyama | çalışır | elle (13.10) | geçti |
| M-03 | yüz inceltme, göz büyütme, kaydırıcı sürükleme | mutlu | fare | çalışır | elle (13.10) | geçti |
| M-04 | kolaj (3 foto, yerleşim, 1:1, hücre kaydırma) | mutlu | fare | çalışır | elle (13.10) | geçti |
| M-05 | kamera | mutlu | web kamerası | görüntü gelir | elle (13.10, piksel ölçümü) | geçti |

## Henüz denenmeyenler (kontrol listesi)

- Toplu düzenlemede bir dosyası bozuk olan klasör (kısmi hata mesajı).
- Kolajda 9 fotoğraf ve çok farklı oranlar.
- 260 karakteri aşan Windows yolları (derin klasöre toplu dışa aktarma).
- Klavyeyle tam gezinme ve ekran okuyucu etiketleri (erişilebilirlik taraması).
- Çok uzun süre açık kalan oturumda bellek artışı (20+ ağır işlem).
