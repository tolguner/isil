# Işıl bileşenleri

Simge seti: Lucide (ISC). Yazı tipi: Inter (OFL, yerel paket). Hypic'in ikon/çizimleri kullanılmaz.
Tüm etkileşimli öğeler gerçek `<button>`/`<input>`; odak halkası `2px solid var(--c-focus)`, `outline-offset: 2px`.

Button
  variants  primary (accent), secondary (surface-2), ghost, danger, icon
  sizes     sm 28px, md 36px, lg 44px
  states    default, hover, active (scale .98), focus-visible, disabled (opacity .4), loading (spinner, etiket ekran okuyucuya kalır)
  tokens    primary: bg accent / text on-accent / radius md / fw 600
  used on   hepsi

Slider (Kaydırıcı)
  variants  unipolar 0..100, bipolar -100..100 (orta çizgi, dolgu ortadan), stepped (n durak)
  states    default, dragging (değer balonu), modified (etiket yanında accent nokta), disabled
  davranış  çift tık = sıfırla; ←/→ 1, Shift+←/→ 10; sürükleme bitince tek geri-al adımı
  a11y      role=slider, aria-valuemin/max/now, etiket bağlı
  used on   S04–S22

ToolTile (araç düğmesi, şeritte)
  ikon 24 + etiket 2xs, 72×64; states default, hover, selected (accent ikon+etiket), applied (altında 4px nokta), new (rozet)
  used on   rötuş şeridi, ayarla, temizle, efekt grupları

PresetCard
  küçük resim 64×80 radius sm + etiket; selected: 2px accent çerçeve; yükleniyor: shimmer; "Yok" kartı (⊘)
  used on   filtre, efekt, makyaj, saç rengi, tarif

CategoryTabs
  yatay kaydırılabilir metin sekmeleri; selected: text + 2px accent alt çizgi; ←/→ klavye; role=tablist
  used on   alt sekmeler (Oran/Yüz/Göz…), filtre kategorileri, ana sekme çubuğu

ToolPanel
  sağ panel 320px: başlık + içerik + alt çubuk [İptal (ghost, Esc)  ·  Uygula (primary, Enter)]
  states    açık, işleniyor (içerik kilitli + ProgressOverlay)

Canvas
  siyah zemin (canvas), görsel ortalanmış, tekerlek = yakınlaştır (imleç merkezli), Space+sürükle = kaydır, F = sığdır, 1 = %100
  karşılaştır: basılı tut (\ tuşu veya düğme) → orijinal
  overlay'ler: yüz çerçeveleri (seçili accent, diğer beyaz %70), fırça imleci (iç/dış daire), kırpma çerçevesi (3×3 ızgara, köşe tutamaçları), katman tutamaçları (sil, çoğalt, döndür/ölçek)

BrushControls
  boyut, sertlik, opaklık/yoğunluk kaydırıcıları + mod düğmeleri (boya / sil / geri yükle); [ ] = boyut

ColorRow
  damlalık, renk tekeri (native color input), şeffaf, palet daireleri 28px; selected: 2px text halka

FaceSidePicker
  segment: Her iki / Sol / Sağ

AspectList
  ikon + oran etiketi kartları; Serbest, Orijinal, 1:1, 4:5, 3:4, 2:3, 9:16, 16:9, 4:3, 3:2

ThumbGrid
  proje / fotoğraf ızgarası; hover: hafif büyüme; seçim modu: köşe onay kutusu; boş durum: ikon + tek satır + birincil eylem

ProgressOverlay
  tuval üstü yarı saydam katman + dairesel ilerleme + metin + İptal (iptal edilebilir işlemler)

Toast
  sağ alt, 4 sn; success / error / info; eylem bağlantısı (ör. "Klasörde göster"); role=status

Dialog
  ortada kart, odak tuzağı, Esc kapatır; onay / tehlikeli onay (danger) / bilgi
  used on   çıkış uyarısı, silme onayı, bulut gönderim onayı

TitleBar
  40px özel başlık çubuğu (frameless değil; titleBarOverlay ile Windows düğmeleri), uygulama adı + bağlam
