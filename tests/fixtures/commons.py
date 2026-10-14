# Wikimedia Commons'tan lisansı açık deneme görseli adayı arar: python commons.py "<arama>" <adet> <klasör> <önek>
# Yalnızca CC0 / PD / CC BY / CC BY-SA; her aday için lisans ve yazar adayların .json dosyasına yazılır.
import json, os, sys, urllib.parse, urllib.request

UA = {'User-Agent': 'IsilEval/0.1 (personal test set; tolgaolguner1@gmail.com)'}
q, n, out, pre = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
os.makedirs(out, exist_ok=True)
params = {
    'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': '6', 'gsrlimit': '40',
    'gsrsearch': q + ' filetype:bitmap', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata|mime',
    'iiurlwidth': '360',
}
r = json.load(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params), headers=UA), timeout=60))
pages = sorted(r.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
ok = []
for p in pages:
    ii = (p.get('imageinfo') or [{}])[0]
    md = ii.get('extmetadata', {})
    lic = md.get('LicenseShortName', {}).get('value', '')
    if ii.get('mime') not in ('image/jpeg', 'image/png') or ii.get('width', 0) < 1000:
        continue
    if not any(k in lic.upper() for k in ('CC0', 'PUBLIC DOMAIN', 'CC BY', 'PD')) or 'NC' in lic.upper() or 'ND' in lic.upper():
        continue
    ok.append({'title': p['title'], 'license': lic, 'artist': md.get('Artist', {}).get('value', '')[:200], 'page': ii.get('descriptionurl'),
               'url': ii.get('url'), 'thumb': ii.get('thumburl'), 'w': ii.get('width'), 'h': ii.get('height')})
    if len(ok) >= n:
        break
for i, c in enumerate(ok):
    f = os.path.join(out, f'{pre}-{i}.jpg')
    if not os.path.exists(f):
        urllib.request.urlretrieve if False else None
        data = urllib.request.urlopen(urllib.request.Request(c['thumb'], headers=UA), timeout=60).read()
        open(f, 'wb').write(data)
    c['file'] = f'{pre}-{i}.jpg'
json.dump(ok, open(os.path.join(out, f'{pre}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(pre, len(ok))
