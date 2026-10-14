# Kenar durumu deneme dosyalarını üretir: python tests/fixtures/make.py  (Pillow; HEIC için pillow-heif)
import os, sys
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image, ImageDraw, ImageFilter

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, 'out')
os.makedirs(out, exist_ok=True)
src = os.path.join(here, '..', '..', 'src', 'renderer', 'public', 'test', 'portrait.jpg')
p = Image.open(src).convert('RGB')

def save(name, im, **kw):
    im.save(os.path.join(out, name), **kw)
    print(name, im.size, im.mode)

# 48 MP (8000x6000) — çok büyük görsel
big = Image.new('RGB', (8000, 6000))
big.paste(p.resize((4000, 6000)), (0, 0)); big.paste(p.resize((4000, 6000)).transpose(Image.FLIP_LEFT_RIGHT), (4000, 0))
save('huge-48mp.jpg', big, quality=88)

# EXIF yönü 6 (90° saat yönünde göster): piksel yatay saklanır, doğru açılırsa dikey görünür
rot = p.resize((700, 1050)).rotate(90, expand=True)  # 1050x700 yatay piksel
exif = Image.Exif(); exif[0x0112] = 6
save('exif-orient-6.jpg', rot, quality=90, exif=exif.tobytes())

# saydam PNG (konu kesilmiş gibi)
rgba = p.resize((600, 900)).convert('RGBA')
m = Image.new('L', rgba.size, 0); ImageDraw.Draw(m).ellipse((120, 120, 480, 820), fill=255)
rgba.putalpha(m.filter(ImageFilter.GaussianBlur(6)))
save('transparent.png', rgba)

# 16-bit PNG (gri tonlu, I;16)
g16 = p.resize((600, 900)).convert('L').point(lambda v: v * 257, 'I').convert('I;16')
save('gray-16bit.png', g16)

# üç yüz yan yana (çoklu yüz)
tri = Image.new('RGB', (1500, 750))
for i in range(3): tri.paste(p.resize((500, 750)), (i * 500, 0))
save('three-faces.jpg', tri, quality=90)

# minik görsel
save('tiny-40x30.png', p.resize((40, 30)))

# yüz olmayan görsel (manzara benzeri)
nf = Image.new('RGB', (1600, 1000), (120, 170, 220)); d = ImageDraw.Draw(nf)
d.rectangle((0, 650, 1600, 1000), fill=(70, 120, 60)); d.polygon([(200, 650), (600, 250), (1000, 650)], fill=(110, 110, 120)); d.ellipse((1250, 120, 1400, 270), fill=(250, 230, 120))
save('no-face.jpg', nf.filter(ImageFilter.GaussianBlur(1)), quality=90)

# gri tonlu ve CMYK JPEG
save('grayscale.jpg', p.resize((700, 1050)).convert('L'), quality=90)
save('cmyk.jpg', p.resize((700, 1050)).convert('CMYK'), quality=90)

# hareketli GIF (3 kare)
frames = [p.resize((300, 450)).rotate(a) for a in (0, 5, 10)]
frames[0].save(os.path.join(out, 'animated.gif'), save_all=True, append_images=frames[1:], duration=200, loop=0); print('animated.gif')

# bozuk JPEG (yarısı kesik)
b = open(src, 'rb').read(); open(os.path.join(out, 'corrupt.jpg'), 'wb').write(b[: len(b) // 3]); print('corrupt.jpg')
# uzantısı yalan söyleyen dosya
open(os.path.join(out, 'not-an-image.jpg'), 'wb').write(b'hello, this is text'); print('not-an-image.jpg')

# Türkçe karakter + emoji + çok uzun ad
name = 'Çok uzun ğüşiöç adlı yaz tatili fotoğrafı 😀 ' + 'x' * 120 + '.jpg'
save(name, p.resize((700, 1050)), quality=90)

# HEIC (iPhone)
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    save('iphone.heic', p.resize((700, 1050)), quality=85)
except ImportError:
    print('HEIC atlandı: pillow-heif yok', file=sys.stderr)
