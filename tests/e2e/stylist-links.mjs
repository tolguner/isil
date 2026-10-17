// Danışman önerilerinden araç bağlantıları: npm run build && node tests/e2e/stylist-links.mjs
import { _electron as electron } from 'playwright'
import { tempDir } from './_tmp.mjs'
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: tempDir('isil-styl-') } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const r = await win.evaluate(async () => {
  const m = await window.__isil.mod('stylist')
  const t = (s) => m.toolsIn(s).map((x) => x.tool)
  return {
    a: t('Cildin hafif yorgun görünüyor. Rötuş → Cilt ile göz altını aç, Makyaj bölümünden mercan bir ruj dene, arka planı Portre bulanıklığı ile yumuşat.'),
    b: t('Yüz hatların dengeli; saç için dalgalı bir model ve Saç aracında hacim önerebilirim.'),
    c: t('The light is lovely. Try the Looks tab and Portrait blur.'),
    d: t('Fotoğraf güzel, ekstra bir şeye gerek yok.')
  }
})
ok('Türkçe yanıttan cilt, makyaj, portre bulanıklığı', JSON.stringify(r.a) === JSON.stringify(['skin', 'makeup', 'pblur']), JSON.stringify(r.a))
ok('Saç bulunuyor, genel "yüz" kelimesi araç sayılmıyor', JSON.stringify(r.b) === JSON.stringify(['hair']), JSON.stringify(r.b))
ok('İngilizce yanıt', JSON.stringify(r.c) === JSON.stringify(['filters', 'pblur']), JSON.stringify(r.c))
ok('Araç geçmeyen yanıtta düğme yok', r.d.length === 0, JSON.stringify(r.d))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
