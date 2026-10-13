// Küçük WebGL2 yardımcıları.

export interface Tex { tex: WebGLTexture; w: number; h: number }
export interface Target extends Tex { fbo: WebGLFramebuffer }

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export class Program {
  prog: WebGLProgram
  private locs = new Map<string, WebGLUniformLocation | null>()
  constructor(private gl: WebGL2RenderingContext, frag: string, vert = VERT) {
    const vs = compile(gl, gl.VERTEX_SHADER, vert)
    const fs = compile(gl, gl.FRAGMENT_SHADER, frag)
    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.bindAttribLocation(p, 0, 'aPos')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p))
    this.prog = p
  }
  use() {
    this.gl.useProgram(this.prog)
    return this
  }
  loc(name: string) {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.prog, name))
    return this.locs.get(name)!
  }
  f(name: string, ...v: number[]) {
    const l = this.loc(name)
    if (!l) return this
    const gl = this.gl
    if (v.length === 1) gl.uniform1f(l, v[0])
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1])
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2])
    else gl.uniform4f(l, v[0], v[1], v[2], v[3])
    return this
  }
  fv(name: string, arr: Float32Array, size: 1 | 2 | 3 | 4) {
    const l = this.loc(name)
    if (!l) return this
    const gl = this.gl
    if (size === 1) gl.uniform1fv(l, arr)
    else if (size === 2) gl.uniform2fv(l, arr)
    else if (size === 3) gl.uniform3fv(l, arr)
    else gl.uniform4fv(l, arr)
    return this
  }
  i(name: string, v: number) {
    const l = this.loc(name)
    if (l) this.gl.uniform1i(l, v)
    return this
  }
  tex(name: string, unit: number, t: WebGLTexture | null) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    return this.i(name, unit)
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')
    throw new Error('shader: ' + log + '\n' + lines)
  }
  return s
}

export function makeQuad(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  return vao
}

export function createTexture(
  gl: WebGL2RenderingContext,
  src: TexImageSource | null,
  w?: number,
  h?: number,
  opts: { internal?: number; format?: number; type?: number; data?: ArrayBufferView | null; filter?: number } = {}
): Tex {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  const filter = opts.filter ?? gl.LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if (src) {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src)
    // video/img öğelerinde width özelliği 0 olabilir; gerçek piksel boyutunu kullan
    const s = src as { width: number; height: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }
    const w = s.videoWidth || s.naturalWidth || s.width
    const h = s.videoHeight || s.naturalHeight || s.height
    return { tex, w, h }
  }
  gl.texImage2D(
    gl.TEXTURE_2D, 0, opts.internal ?? gl.RGBA8, w!, h!, 0,
    opts.format ?? gl.RGBA, opts.type ?? gl.UNSIGNED_BYTE, opts.data ?? null
  )
  return { tex, w: w!, h: h! }
}

export function createTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const t = createTexture(gl, null, w, h)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { ...t, fbo }
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null) {
  if (!t) return
  gl.deleteTexture(t.tex)
  gl.deleteFramebuffer(t.fbo)
}

/** Boyutu değişirse yeniden oluşturan hedef havuzu. */
export class TargetPool {
  private map = new Map<string, Target>()
  constructor(private gl: WebGL2RenderingContext) {}
  get(name: string, w: number, h: number): Target {
    w = Math.max(1, Math.round(w))
    h = Math.max(1, Math.round(h))
    const t = this.map.get(name)
    if (t && t.w === w && t.h === h) return t
    deleteTarget(this.gl, t ?? null)
    const n = createTarget(this.gl, w, h)
    this.map.set(name, n)
    return n
  }
  dispose() {
    for (const t of this.map.values()) deleteTarget(this.gl, t)
    this.map.clear()
  }
}
