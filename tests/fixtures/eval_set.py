# YZ kalite ölçümü deneme seti: seçilen Wikimedia Commons fotoğraflarını indirir ve lisans kaydını yazar.
#   python tests/fixtures/eval_set.py   → dev-models/eval/set/*.jpg + set.json (git dışı)
# Adaylar commons.py ile dev-models/eval/cand/ altına çekilmiş olmalı.
import json, os, re, shutil, sys, urllib.request

sys.stdout.reconfigure(encoding='utf-8')
C = 'dev-models/eval/cand'
O = 'dev-models/eval/set'
os.makedirs(O, exist_ok=True)
UA = {'User-Agent': 'IsilEval/0.1 (personal test set; tolgaolguner1@gmail.com)'}
PICK = [
    ('portre-gunbatimi', '__local__', 'tek portre, sıcak ışık'),
    ('sakal-turban', 'beard-2', 'sakal, gülümseme, sarık'),
    ('gozluk-gunes', 'beard-3', 'güneş gözlüğü, şapka, renkli fon'),
    ('gozluk-yasli', 'glasses-5', 'numaralı gözlük, beyaz sakal, siyah-beyaz'),
    ('yasli-adam', 'elderly-3', 'yaşlı yüz, kırışıklık'),
    ('koyu-ten-orgu', 'darkskin-4', 'koyu ten, örgü saç'),
    ('cocuk-portre', 'child-2', 'çocuk, stüdyo'),
    ('cocuk-gulen', 'child-5', 'çocuk, koyu ten, karmaşık arka plan'),
    ('profil', 'profile-2', 'yandan yüz'),
    ('arka-isik', 'backlit-3', 'sahne ışığı, arkadan aydınlatma'),
    ('karanlik-telefon', 'noisy-2', 'düşük ışık, telefon ışığıyla yüz, gürültü'),
    ('grup-karanlik', 'group-0', 'grup, loş ışık'),
    ('grup-iki-cocuk', 'group-2', 'iki yüz yan yana'),
    ('kivircik-sac', 'curly-0', 'kabarık beyaz saç, oturan tüm vücut'),
    ('tum-vucut', 'fullbody-5', 'tüm vücut, küçük figür'),
    ('eski-foto-kadin', 'oldphoto-3', 'eski fotoğraf, 1950ler'),
    ('eski-foto-adam', 'oldphoto-1', 'eski siyah-beyaz portre'),
    ('kedi-yakin', 'pet-3', 'evcil hayvan, tüy'),
    ('kedi-kar', 'pet-1', 'evcil hayvan tüm gövde, kuyruk, karlı fon'),
    ('urun-saat', 'product-5', 'ürün, deri doku'),
    ('urun-vazo', 'glass-1', 'ürün, gri stüdyo fonu'),
    ('yemek', 'food-1', 'yemek, tabak'),
    ('manzara-gol', 'landscape-1', 'manzara, su, gökyüzü'),
    ('bina-cizgiler', 'building-0', 'düz çizgiler (bükülme kontrolü)'),
    ('tabela', 'street-5', 'metinli tabela'),
    ('plaj-kalabalik', 'tourists-0', 'kalabalık (kişi silme)'),
    ('gece-pazar', 'noisy-4', 'gece, gürültü, insanlar'),
    ('eller', 'hands-1', 'eller, kiraz (YZ için zor)'),
]
man = []
for id_, ref, why in PICK:
    out = os.path.join(O, id_ + '.jpg')
    if ref == '__local__':
        shutil.copy('src/renderer/public/test/portrait.jpg', out)
        man.append({'id': id_, 'why': why, 'license': 'projenin mevcut test görseli', 'artist': '', 'page': ''})
        continue
    pre, i = ref.rsplit('-', 1)
    js = json.load(open(os.path.join(C, pre + '.json'), encoding='utf-8'))[int(i)]
    url = re.sub(r'/\d+px-', '/1280px-', js['thumb']) if js['w'] > 1280 else js['url']
    if not os.path.exists(out):
        data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        open(out, 'wb').write(data)
    man.append({'id': id_, 'why': why, 'license': js['license'], 'artist': re.sub('<[^>]+>', '', js['artist']).strip(), 'page': js['page'], 'title': js['title']})
json.dump(man, open(os.path.join(O, 'set.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from PIL import Image
for m in man:
    print(m['id'], Image.open(os.path.join(O, m['id'] + '.jpg')).size, m['license'])
