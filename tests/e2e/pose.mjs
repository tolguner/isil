// 3B yüz yönü: npm run build && node tests/e2e/pose.mjs [çıktı klasörü]
// Her ayarda yüz yeniden bulunur; burun ucunun yüz ovaline göre yatay/dikey konumu (dönme göstergesi), göz çizgisi
// açısı (eğim) ve sol-sağ yarım yüz genişlik farkı (simetri) ölçülür. Çıktı klasörü verilirse kırpımlar ve
// ArcFace ölçümü için noktalar.json yazılır (isil-olcum/kimlik/benzerlik.py).
import { _electron as electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const outDir = process.argv[2]
if (outDir) mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-pose-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const S = (await window.__isil.store()).getState(); S.setTab('retouch'); S.openTool('faceShape')
  for (let i = 0; i < 100 && !(s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 100))
  S.closeTool(true)
})
const cases = { orig: {}, yawL: { yaw: -100 }, yawR: { yaw: 100 }, up: { pitch: 100 }, down: { pitch: -100 }, rollL: { roll: -100 }, rollR: { roll: 100 }, sym: { symmetry: 100 }, mix: { yaw: 60, pitch: 40, symmetry: 50 } }
const m = {}, meta = {}
for (const [k, shape] of Object.entries(cases)) {
  const r = await win.evaluate(async (shape) => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    const v = await window.__isil.mod('vision')
    const F = await window.__isil.mod('face')
    S().update((d) => { d.retouch.faces = [{ index: 0, side: 'both', shape, skin: {}, makeup: {} }] })
    await new Promise((r) => setTimeout(r, 900))
    const c = document.querySelector('canvas')
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0)
    const lm = (await v.detectFaces(t))[0]
    if (!lm) return { err: 'yüz yok' }
    const W = t.width, H = t.height
    const g = new F.FaceGeo(lm, W, H)
    const nose = g.p(1), L = g.p(234), R = g.p(454), top = g.p(10), chin = g.p(152)
    const ex = (nose.x - (L.x + R.x) / 2) / g.width          // + = burun görüntüde sağa
    const ey = ((nose.y - top.y) / (chin.y - top.y))          // burun ucunun dikey konumu
    const eR = g.m(F.EYE_R), eL = g.m(F.EYE_L)
    const tilt = Math.atan2(eL.y - eR.y, eL.x - eR.x) * 180 / Math.PI
    const half = F.asymmetry(g)
    const pts = [[eR.x, eR.y], [eL.x, eL.y], [nose.x, nose.y], [g.p(61).x, g.p(61).y], [g.p(291).x, g.p(291).y]]
    const b = g.bbox(0.3)
    const cc = document.createElement('canvas'); cc.width = 400; cc.height = Math.round(400 * b.h / b.w)
    cc.getContext('2d').drawImage(t, b.x, b.y, b.w, b.h, 0, 0, cc.width, cc.height)
    const enc = async (x, ty) => { const bl = await new Promise((r) => x.toBlob(r, ty, 0.92)); const u = new Uint8Array(await bl.arrayBuffer()); let s2 = ''; for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s2) }
    return { ex: +ex.toFixed(3), ey: +ey.toFixed(3), tilt: +tilt.toFixed(2), half: +half.toFixed(3), pts, full: await enc(t, 'image/png'), crop: await enc(cc, 'image/jpeg') }
  }, shape)
  if (r.err) { ok(k, false, r.err); continue }
  m[k] = r
  if (outDir) { writeFileSync(join(outDir, `${k}.png`), Buffer.from(r.full, 'base64')); writeFileSync(join(outDir, `${k}-yuz.jpg`), Buffer.from(r.crop, 'base64')); meta[k] = { ms: 0, pts: r.pts } }
  console.log(k, JSON.stringify({ ex: r.ex, ey: r.ey, tilt: r.tilt, half: r.half }))
}
if (outDir) writeFileSync(join(outDir, 'noktalar.json'), JSON.stringify(meta))
const o = m.orig
ok('Sağa-sola çevir burnu iki yöne kaydırıyor', m.yawL.ex < o.ex - 0.02 && m.yawR.ex > o.ex + 0.015, JSON.stringify([m.yawL.ex, o.ex, m.yawR.ex]))
ok('Yukarı-aşağı burun konumunu iki yöne değiştiriyor', Math.abs(m.up.ey - m.down.ey) > 0.015, JSON.stringify([m.up.ey, o.ey, m.down.ey]))
ok('Baş eğimi göz çizgisini döndürüyor (±5° üstü)', m.rollR.tilt - o.tilt > 5 && o.tilt - m.rollL.tilt > 5, JSON.stringify([m.rollL.tilt, o.tilt, m.rollR.tilt]))
// simetri: sol göz ve kaş yapay olarak kaydırılır; simetri hedef noktaları asimetriyi geri almalı
const sym = await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  const F = await window.__isil.mod('face')
  const g0 = s.faceGeos()[0]
  // önden görünüme çevrilmiş yüzle sına (duruş tahmini ölçümü bozmasın)
  const fr = F.frontalize(g0).F
  const g = Object.assign(Object.create(Object.getPrototypeOf(g0)), g0, { P: fr.map((v) => ({ x: v.x + 1000, y: v.y + 1000 })), Z: fr.map((v) => v.z) })
  const gp = Object.assign(Object.create(Object.getPrototypeOf(g)), g, { P: g.P.map((v) => ({ ...v })), Z: [...g.Z] })
  for (const i of [...F.EYE_L, ...F.BROW_L]) { gp.P[i].x += g.width * 0.03; gp.P[i].y -= g.width * 0.03 }
  const before = F.asymmetry(gp)
  const pr = F.orientPairs(gp, { symmetry: 100 })
  const g2 = Object.assign(Object.create(Object.getPrototypeOf(g)), gp, { P: gp.P.map((v) => ({ ...v })) })
  F.ORIENT_PTS.forEach((idx, k) => { g2.P[idx] = pr.p[k] })
  return { orig: +F.asymmetry(g).toFixed(4), bozuk: +before.toFixed(4), simetrik: +F.asymmetry(g2).toFixed(4) }
})
ok('Simetri asimetriyi azaltıyor (yapay bozulmuş yüzde)', sym.simetrik < Math.min(sym.orig, sym.bozuk) * 0.7, JSON.stringify(sym))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
