// İndirilen model dosyalarının sabit sürüm (commit) ve doğrulama bilgisini üretir: src/shared/manifest.json.
// Hugging Face'teki "main" dalı değişse ya da depo güncellense de Işıl hep aynı dosyayı indirir ve sha256 ile
// doğrular. Yeni bir model eklenince ya da sürüm yükseltilince yeniden çalıştır: node scripts/model-manifest.mjs
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const src = readFileSync('src/renderer/src/ai/models.ts', 'utf8') + readFileSync('src/main/engine.ts', 'utf8')
const repos = new Set([...src.matchAll(/([\w.-]+\/[\w.-]+)\/resolve\/main\//g)].map((m) => m[1]))
for (const m of src.matchAll(/hf\('([\w.-]+\/[\w.-]+)'/g)) repos.add(m[1])
for (const m of src.matchAll(/const \w+ = '([\w.-]+\/[\w.-]+)'/g)) repos.add(m[1])

const out = {}
for (const repo of [...repos].sort()) {
  const r = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`)
  if (!r.ok) { console.error('ERİŞİLEMEDİ', repo, r.status); process.exitCode = 1; continue }
  const d = await r.json()
  let n = 0
  for (const s of d.siblings) {
    const base = s.rfilename.split('/').pop()
    if (!src.includes(base)) continue
    let sha256 = s.lfs?.sha256
    // küçük (LFS dışı) dosyalar: içerik commit ile sabit; yine de bir kez indirip sha256'sını yaz
    if (!sha256) {
      const b = await fetch(`https://huggingface.co/${repo}/resolve/${d.sha}/${s.rfilename}`)
      if (!b.ok) { console.error('İNMEDİ', repo, s.rfilename); continue }
      sha256 = createHash('sha256').update(Buffer.from(await b.arrayBuffer())).digest('hex')
    }
    out[`${repo}/${s.rfilename}`] = { rev: d.sha, size: s.size ?? s.lfs?.size, sha256 }
    n++
  }
  console.log(repo, d.sha.slice(0, 10), n, 'dosya')
}
writeFileSync('src/shared/manifest.json', JSON.stringify(out, null, 1) + '\n')
console.log('yazıldı:', Object.keys(out).length, 'dosya')
