# Görsel eleştirmen ajanının yardımcısı: yan yana dizilmiş karşılaştırma şeridinden panel kırpar, yakınlaştırır,
# iki paneli yan yana koyar. Çıktıyı ajan Read ile görüntüler.
#
#   python panel.py one  <şerit> <panel_sayısı> <i> <çıktı.png> [x0 y0 x1 y1] [--zoom 2]
#   python panel.py pair <şerit> <panel_sayısı> <i> <j> <çıktı.png> [x0 y0 x1 y1] [--zoom 2]
#   python panel.py file <görsel> <çıktı.png> [x0 y0 x1 y1] [--zoom 2]
#   python panel.py files <görsel_a> <görsel_b> <çıktı.png> [x0 y0 x1 y1] [--zoom 2]   (iki ayrı dosyayı aynı bölgeden yan yana)
#
# x0 y0 x1 y1: 0..1 arası oranlar (panel içinde bölge). --zoom: büyütme katı (LANCZOS).
import sys
from PIL import Image

args = sys.argv[1:]
zoom = 1.0
if '--zoom' in args:
    k = args.index('--zoom')
    zoom = float(args[k + 1])
    del args[k:k + 2]
mode = args[0]


def panel(path, n, i):
    im = Image.open(path).convert('RGB')
    w = im.width / int(n)
    return im.crop((round(int(i) * w), 0, round((int(i) + 1) * w), im.height))


def region(im, box):
    if not box:
        return im
    x0, y0, x1, y1 = (float(v) for v in box)
    return im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))


def scale(im):
    if zoom != 1:
        im = im.resize((max(1, round(im.width * zoom)), max(1, round(im.height * zoom))), Image.LANCZOS)
    # çok büyükse görüntüleyici için küçült (uzun kenar 1600)
    m = max(im.size)
    if m > 1600:
        k = 1600 / m
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    return im


def side(a, b):
    h = max(a.height, b.height)
    out = Image.new('RGB', (a.width + b.width + 8, h), (255, 0, 255))
    out.paste(a, (0, 0))
    out.paste(b, (a.width + 8, 0))
    return out


if mode == 'one':
    _, strip, n, i, out, *box = args
    scale(region(panel(strip, n, i), box)).save(out)
elif mode == 'pair':
    _, strip, n, i, j, out, *box = args
    a = region(panel(strip, n, i), box)
    b = region(panel(strip, n, j), box)
    scale(side(a, b)).save(out)
elif mode == 'file':
    _, src, out, *box = args
    scale(region(Image.open(src).convert('RGB'), box)).save(out)
elif mode == 'files':
    _, sa, sb, out, *box = args
    a = Image.open(sa).convert('RGB')
    b = Image.open(sb).convert('RGB').resize(a.size, Image.LANCZOS)
    scale(side(region(a, box), region(b, box))).save(out)
else:
    sys.exit('mod: one | pair | file | files')
print(out)
