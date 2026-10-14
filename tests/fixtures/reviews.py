# App Store yorum akışlarını temalara ayırır: python tests/fixtures/reviews.py → dev-models/rekabet/reviews/ozet.json
import json, glob, os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
D = 'dev-models/rekabet/reviews'
THEMES = {
    'abonelik/ücret': r'subscri|paywall|pay |paid|charg|refund|expensive|price|premium|vip|money|trial|cancel|free version|\$',
    'reklam': r'\bads?\b|advert',
    'çökme/hata': r'crash|bug|freez|glitch|not working|doesn.t work|won.t open|stuck|error',
    'yavaşlık': r'slow|lag|loading|takes forever|long time',
    'doğal olmayan sonuç': r'fake|unrealistic|distort|warp|blurr|weird|ugly|plastic|doesn.t look like|not me|uncanny',
    'kalite iyi': r'realistic|natural|amazing result|looks real|best editor|love (this|the) app',
    'gizlilik': r'privacy|data|upload|server|personal info|steal',
    'filigran': r'watermark',
    'kaldırılan/eskisi daha iyi': r'removed|used to|old version|since the update|new update|bring back|went downhill',
    'istek': r'wish|please add|would be (nice|great)|should add|feature request|i want|hope you',
    'hesap/giriş': r'log ?in|sign ?in|account',
    'kalite kaybı/çözünürlük': r'resolution|quality loss|compress|pixelat|low quality',
}
out = {}
for app in sorted({os.path.basename(f).split('-')[0] for f in glob.glob(D + '/*-*.json')}):
    seen = {}
    for f in glob.glob(f'{D}/{app}-*.json'):
        try:
            entries = json.load(open(f, encoding='utf-8')).get('feed', {}).get('entry', [])
        except Exception:
            continue
        for e in entries if isinstance(entries, list) else [entries]:
            if 'im:rating' not in e:
                continue
            rid = e['id']['label']
            seen[rid] = {'r': int(e['im:rating']['label']), 't': e['title']['label'], 'c': e['content']['label'], 'v': e.get('im:version', {}).get('label', ''), 'd': e.get('updated', {}).get('label', '')[:10]}
    rows = list(seen.values())
    if not rows:
        continue
    dist = {s: sum(1 for x in rows if x['r'] == s) for s in range(1, 6)}
    th = {}
    for name, pat in THEMES.items():
        hits = [x for x in rows if re.search(pat, (x['t'] + ' ' + x['c']).lower())]
        th[name] = {'n': len(hits), 'neg': sum(1 for x in hits if x['r'] <= 2), 'ex': [{'r': x['r'], 't': x['t'][:80], 'c': x['c'][:300], 'd': x['d']} for x in sorted(hits, key=lambda x: x['r'])[:6]]}
    out[app] = {'n': len(rows), 'avg': round(sum(x['r'] for x in rows) / len(rows), 2), 'dist': dist, 'from': min(x['d'] for x in rows), 'to': max(x['d'] for x in rows), 'themes': th}
    print(f"{app:9s} n={len(rows):3d} ort={out[app]['avg']} dağılım={dist} {out[app]['from']}..{out[app]['to']}")
    print('   ' + ' | '.join(f"{k} {v['n']}({v['neg']} olumsuz)" for k, v in th.items() if v['n']))
json.dump(out, open(D + '/ozet.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
