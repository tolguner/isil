# Aşama 8: iki sürümün kalite seti sonuçlarını yan yana koyar.
#   python tests/fixtures/compare_versions.py dev-models/eval/out-0.2.0 dev-models/eval/out 0.2.0 0.3.0
# Çıktı: Markdown tablo (stdout).
import json
import sys
from pathlib import Path
from statistics import mean, median

old_dir, new_dir, old_v, new_v = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]


def load(d, name):
    p = d / f"{name}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def faces(rows):
    exp = [r for r in rows if r["expected"]]
    exact = sum(r["found"] == r["expected"] for r in exp)
    found = sum(min(r["found"], r["expected"]) for r in exp)
    total = sum(r["expected"] for r in exp)
    false_pos = sum(max(0, r["found"] - r["expected"]) for r in rows)
    return exact, len(exp), found, total, false_pos, median(r["ms"] for r in rows)


out = [f"## Yüz algılama ({len(load(new_dir, 'faces'))} fotoğraf)", "", f"| ölçüt | {old_v} | {new_v} |", "| --- | --- | --- |"]
a, b = faces(load(old_dir, "faces")), faces(load(new_dir, "faces"))
out += [
    f"| sayısı doğru fotoğraf | {a[0]}/{a[1]} | {b[0]}/{b[1]} |",
    f"| bulunan yüz | {a[2]}/{a[3]} | {b[2]}/{b[3]} |",
    f"| fazladan (yanlış) yüz | {a[4]} | {b[4]} |",
    f"| süre (ortanca) | {a[5]:.0f} ms | {b[5]:.0f} ms |",
    "",
    "| fotoğraf | beklenen | " + old_v + " | " + new_v + " |",
    "| --- | --- | --- | --- |",
]
old_f = {r["id"]: r for r in load(old_dir, "faces")}
for r in load(new_dir, "faces"):
    o = old_f.get(r["id"], {})
    if r["found"] != o.get("found") or r["found"] != r["expected"]:
        out.append(f"| {r['id']} | {r['expected']} | {o.get('found', '–')} | {r['found']} |")

out += ["", "## Yüz onarma (bozulmuş yüz → onarılmış; ArcFace kimlik benzerliği, 1 = aynı kişi)", ""]
ro, rn = load(old_dir, "restore"), load(new_dir, "restore")
out += [f"| güç | {old_v} kimlik | {new_v} kimlik | {old_v} en kötü | {new_v} en kötü | {new_v} süre |", "| --- | --- | --- | --- | --- | --- |"]
deg = mean(r["degraded"]["sim"] for r in rn if "degraded" in r)
out.append(f"| bozuk (onarımsız) | {mean(r['degraded']['sim'] for r in ro if 'degraded' in r):.3f} | {deg:.3f} | | | |")
for k in ["b0.5", "b0.8", "b1"]:
    so = [r[k]["sim"] for r in ro if k in r]
    sn = [r[k]["sim"] for r in rn if k in r]
    ms = [r[k]["ms"] for r in rn if k in r]
    if so and sn:
        out.append(f"| {k[1:]} | {mean(so):.3f} | {mean(sn):.3f} | {min(so):.3f} | {min(sn):.3f} | {median(ms):.0f} ms |")

out += ["", "## Kesim süreleri (ortanca, 1600 px)", "", f"| model | {old_v} | {new_v} | hata |", "| --- | --- | --- | --- |"]
co, cn = load(old_dir, "cutout"), load(new_dir, "cutout")
for m in ["isnet", "birefnet"]:
    o = [r["ms"] for r in co if r["model"] == m and r.get("ms")]
    n = [r["ms"] for r in cn if r["model"] == m and r.get("ms")]
    errs = sum(1 for r in cn if r["model"] == m and r.get("err"))
    if o and n:
        out.append(f"| {m} | {median(o):.0f} ms | {median(n):.0f} ms | {errs} |")

print("\n".join(out))
