// Yazı algılama: PP-OCRv4 algılayıcı (DBNet, Apache-2.0). Çıktı yazının daraltılmış çekirdeği olduğu için her
// bölge kendi yüksekliğiyle orantılı genişletilir (DBNet'in "unclip" adımının basit karşılığı). Sonuç beyaz = yazı
// maskesi; silme Temizle araçlarının doldurma yöntemleriyle yapılır.
import { ensureModel, runModel, ort } from './models'
import { toCanvas } from './ops'

type Src = CanvasImageSource & { width: number; height: number }

export async function detectText(src: Src): Promise<{ mask: HTMLCanvasElement; boxes: { x: number; y: number; w: number; h: number }[] } | null> {
  if (!(await ensureModel('textdet'))) return null
  const W = src.width, H = src.height
  const k = Math.min(1, 1280 / Math.max(W, H))
  const w = Math.max(32, Math.round((W * k) / 32) * 32), h = Math.max(32, Math.round((H * k) / 32) * 32)
  const d = toCanvas(src, w, h).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const t = new Float32Array(3 * w * h)
  // Paddle sırası: BGR, ImageNet ortalaması
  const mean = [0.406, 0.456, 0.485], std = [0.225, 0.224, 0.229]
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) t[c * w * h + i] = (d[i * 4 + (2 - c)] / 255 - mean[c]) / std[c]
  const { out, sess } = await runModel('textdet', { x: new ort.Tensor('float32', t, [1, 3, h, w]) })
  const p = out[sess.outputNames[0]].data as Float32Array
  // bağlı bileşenler (4 komşu), eşik 0,3
  const lab = new Int32Array(w * h).fill(-1)
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number; s: number }[] = []
  const stack: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (p[i] < 0.3 || lab[i] >= 0) continue
    const b = { x0: w, y0: h, x1: 0, y1: 0, n: 0, s: 0 }
    lab[i] = boxes.length
    stack.push(i)
    while (stack.length) {
      const j = stack.pop()!
      const x = j % w, y = (j / w) | 0
      b.n++; b.s += p[j]
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y
      for (const q of [j - 1, j + 1, j - w, j + w]) {
        if (q < 0 || q >= w * h || lab[q] >= 0 || p[q] < 0.3) continue
        if ((q === j - 1 && x === 0) || (q === j + 1 && x === w - 1)) continue
        lab[q] = boxes.length
        stack.push(q)
      }
    }
    boxes.push(b)
  }
  // güveni düşük ya da çok küçük bölgeleri ele (gürültü)
  const keep = boxes.filter((b) => b.n >= 12 && b.s / b.n > 0.55)
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const mc = mask.getContext('2d')!
  mc.fillStyle = '#000'
  mc.fillRect(0, 0, W, H)
  mc.fillStyle = '#fff'
  const sx = W / w, sy = H / h
  const out2: { x: number; y: number; w: number; h: number }[] = []
  for (const b of keep) {
    const bh = (b.y1 - b.y0 + 1) * sy
    // çekirdek → tam yazı: yükseklik ~2,6 katına, yanlara ~1 yükseklik kadar genişlet
    const padY = bh * 0.95, padX = bh * 0.8
    const x = b.x0 * sx - padX, y = b.y0 * sy - padY
    const ww = (b.x1 - b.x0 + 1) * sx + 2 * padX, hh = bh + 2 * padY
    mc.beginPath()
    mc.roundRect(x, y, ww, hh, hh * 0.25)
    mc.fill()
    out2.push({ x: x / W, y: y / H, w: ww / W, h: hh / H })
  }
  return { mask, boxes: out2 }
}
