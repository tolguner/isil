// Tüm shader kaynakları. İç kural: doku uzayında v=0 görüntünün ÜSTÜ.
// FBO'ya çizerken vUv doğrudan doku uzayıdır; ekrana çizerken PRESENT ters çevirir.

const COMMON = `
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 softLight(vec3 a, vec3 b){
  return mix(2.0*a*b + a*a*(1.0-2.0*b), sqrt(a)*(2.0*b-1.0) + 2.0*a*(1.0-b), step(0.5, b));
}
vec3 overlayB(vec3 a, vec3 b){ return mix(2.0*a*b, 1.0-2.0*(1.0-a)*(1.0-b), step(0.5, a)); }
vec3 screenB(vec3 a, vec3 b){ return 1.0 - (1.0-a)*(1.0-b); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
`

export const BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uStep;
void main(){
  vec4 s = texture(uTex, vUv) * 0.2270270270;
  s += texture(uTex, vUv + uStep * 1.3846153846) * 0.3162162162;
  s += texture(uTex, vUv - uStep * 1.3846153846) * 0.3162162162;
  s += texture(uTex, vUv + uStep * 3.2307692308) * 0.0702702703;
  s += texture(uTex, vUv - uStep * 3.2307692308) * 0.0702702703;
  o = s;
}`

export const COPY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
void main(){ o = texture(uTex, vUv); }`

// Kaynak uzayında rötuş/makyaj. Maske A: R cilt, G göz altı, B dişler, A gözler.
// Maske B: R dudak, G yanak, B göz kapağı, A kaş. Maske C: R yüz kimliği (n/8), G saç, B kontür, A aydınlatıcı.
export const RETOUCH = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uBase, uBlurS, uBlurM, uMaskA, uMaskB, uMaskC;
uniform vec4 uSkin[8];   // pürüzsüz, leke, beyazlat, gözenek
uniform vec4 uSkin2[8];  // göz altı, diş, göz parlat, ten tonu miktarı
uniform vec4 uTone[8];   // ten rengi rgb + doku(ayrıntı)
uniform vec4 uLip[8];    // renk + miktar
uniform vec4 uBlush[8];
uniform vec4 uLid[8];
uniform vec4 uBrow[8];
uniform vec4 uSculpt[8]; // kontür, aydınlatıcı, dolgun ışık, kırışık
uniform vec4 uHair;      // saç rengi + miktar
uniform float uHairOn;
${COMMON}
void main(){
  vec4 c4 = texture(uBase, vUv);
  vec3 c = c4.rgb;
  vec3 b = texture(uBlurS, vUv).rgb;
  vec3 m = texture(uBlurM, vUv).rgb;
  vec4 A = texture(uMaskA, vUv);
  vec4 B = texture(uMaskB, vUv);
  vec4 C = texture(uMaskC, vUv);
  int id = int(floor(C.r * 8.0 + 0.5)) - 1;
  vec3 col = c;
  if (id >= 0 && id < 8) {
    vec4 sk = uSkin[id]; vec4 sk2 = uSkin2[id];
    float skin = A.r;
    vec3 high = c - b;
    vec3 low = mix(b, m, 0.55);
    float wb = exp(-dot(c - low, c - low) * 28.0);
    float k = skin * sk.x * wb;
    col = mix(col, low + high * mix(0.45, 0.12, sk.w), k);
    // leke: çevresinden koyu küçük alanlar
    float d = luma(m) - luma(c);
    float k2 = skin * sk.y * smoothstep(0.015, 0.07, d);
    col = mix(col, m + high * 0.15, clamp(k2 * 1.4, 0.0, 1.0));
    // kırışık: yüksek frekansı kır
    col = mix(col, col - high * 0.6, skin * uSculpt[id].w * 0.8);
    // ayrıntı/doku geri kazanma
    col += high * skin * uTone[id].w * 0.8;
    // cilt aydınlatma
    vec3 lift = col + (1.0 - col) * 0.22;
    lift = mix(vec3(luma(lift)), lift, 0.9);
    col = mix(col, lift, skin * sk.z);
    // göz altı
    float ue = A.g * sk2.x;
    vec3 under = max(col, m * 1.06);
    col = mix(col, mix(under, vec3(luma(under)) * vec3(1.02, 1.0, 0.98), 0.25), ue);
    // dişler
    float L = luma(col);
    float tk = B.r < 0.5 ? A.b * sk2.y * smoothstep(0.18, 0.45, L) : 0.0;
    vec3 white = vec3(L) * vec3(1.06, 1.08, 1.12) + 0.04;
    col = mix(col, white, tk);
    // gözler
    vec3 eyeC = (col - 0.5) * 1.18 + 0.5 + 0.035;
    col = mix(col, eyeC, A.a * sk2.z);
    // ten tonu
    vec3 tone = uTone[id].rgb;
    vec3 toned = softLight(col, tone);
    col = mix(col, toned, skin * sk2.w);
    // makyaj
    vec4 lp = uLip[id];
    vec3 lipCol = mix(col * lp.rgb * 1.35, softLight(col, lp.rgb), 0.45);
    col = mix(col, lipCol, B.r * lp.a);
    vec4 bl = uBlush[id];
    col = mix(col, col * mix(vec3(1.0), bl.rgb * 1.25, 0.55), B.g * bl.a);
    vec4 ld = uLid[id];
    col = mix(col, col * ld.rgb * 1.2, B.b * ld.a);
    vec4 br = uBrow[id];
    col = mix(col, min(col, col * br.rgb * 1.4), B.a * br.a);
    vec4 sc = uSculpt[id];
    col = mix(col, col * vec3(0.86, 0.83, 0.82), C.b * sc.x);
    col = mix(col, screenB(col, vec3(0.16)), C.a * (sc.y + sc.z * 0.6));
  }
  if (uHairOn > 0.5) {
    float h = C.g * uHair.a;
    float L = luma(col);
    vec3 dyed = uHair.rgb * (0.35 + L * 1.5);
    dyed = mix(dyed, softLight(vec3(L), uHair.rgb), 0.5);
    col = mix(col, dyed, h);
  }
  o = vec4(clamp(col, 0.0, 1.0), c4.a);
}`

// Ana geçiş: geometri + bükme + renk + filtre + arka plan.
export const MAIN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc, uBlurL, uWarp, uMask, uCurve, uBgImg, uBgBlur;
uniform vec2 uRotSize;       // çeyrek dönüş sonrası kaynak px
uniform vec2 uCropC, uCropS; // normalize (dönmüş uzay)
uniform float uRot;          // radyan
uniform int uQuarter;
uniform vec2 uFlip;
uniform vec2 uPersp;
uniform vec4 uPlace;         // tuvalde görüntü dikdörtgeni (uv)
uniform vec2 uOutSize;
uniform float uWarpOn, uMaskOn, uTexel;
uniform int uFill;           // 0 yok,1 renk,2 degrade,3 bulanık,4 görsel,5 şeffaf
uniform vec4 uFillA, uFillB;
uniform float uFillAngle, uFillBlur;
uniform float uA[20];
uniform vec3 uHsl[8];
uniform vec4 uSplitS, uSplitH;
uniform float uCurveOn;
uniform vec2 uSrcSize;
${COMMON}

vec2 outToSrc(vec2 uv){
  if (uFlip.x > 0.5) uv.x = 1.0 - uv.x;
  if (uFlip.y > 0.5) uv.y = 1.0 - uv.y;
  vec2 p = uv - 0.5;
  p.x *= 1.0 + uPersp.y * (p.y) * 1.2;
  p.y *= 1.0 + uPersp.x * (p.x) * 1.2;
  vec2 sz = uCropS * uRotSize;
  p *= sz;
  float c = cos(uRot), s = sin(uRot);
  p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  vec2 r = (uCropC * uRotSize + p) / uRotSize;
  if (uQuarter == 1) return vec2(r.y, 1.0 - r.x);
  if (uQuarter == 2) return vec2(1.0 - r.x, 1.0 - r.y);
  if (uQuarter == 3) return vec2(1.0 - r.y, r.x);
  return r;
}

float bandW(float h, float center){
  float d = abs(fract(h - center + 0.5) - 0.5);
  return smoothstep(0.09, 0.0, d);
}

vec3 grade(vec3 c, vec2 uv, vec2 suv){
  // 0 exposure 1 brightness 2 contrast 3 highlights 4 shadows 5 whites 6 blacks
  // 7 temperature 8 tint 9 saturation 10 vibrance 11 brilliance 12 clarity 13 sharpen
  // 14 structure 15 dehaze 16 fade 17 grain 18 vignette 19 glow
  vec3 bl = texture(uBlurL, suv).rgb;
  // keskinlik / yapı / netlik (yerel kontrast)
  vec2 t = vec2(uTexel) * vec2(uSrcSize.y / uSrcSize.x, 1.0);
  vec3 n = texture(uSrc, suv + vec2(t.x, 0.0)).rgb + texture(uSrc, suv - vec2(t.x, 0.0)).rgb
         + texture(uSrc, suv + vec2(0.0, t.y)).rgb + texture(uSrc, suv - vec2(0.0, t.y)).rgb;
  c += (c - n * 0.25) * uA[13] * 2.5;
  vec3 n2 = texture(uSrc, suv + vec2(t.x, t.y) * 3.0).rgb + texture(uSrc, suv - vec2(t.x, t.y) * 3.0).rgb
          + texture(uSrc, suv + vec2(t.x, -t.y) * 3.0).rgb + texture(uSrc, suv - vec2(t.x, -t.y) * 3.0).rgb;
  c += (c - n2 * 0.25) * uA[14] * 1.2;
  float Lc = luma(c);
  c += (c - bl) * uA[12] * 0.9 * (1.0 - abs(Lc - 0.5));
  // pusu giderme
  if (uA[15] != 0.0) {
    float dark = min(min(bl.r, bl.g), bl.b);
    float hz = uA[15];
    c = hz > 0.0 ? (c - dark * hz * 0.6) / max(1.0 - dark * hz * 0.6, 0.2) : mix(c, vec3(0.8), -hz * 0.35);
  }
  // pozlama (doğrusal)
  c = toSrgb(toLin(c) * exp2(uA[0] * 2.0));
  // parlaklık (orta tonlar)
  c = pow(max(c, 0.0), vec3(1.0 / (1.0 + uA[1] * 0.6)));
  // sıcaklık / renk tonu
  vec3 warmK = uA[7] >= 0.0 ? vec3(0.16, 0.05, -0.14) : vec3(0.15, 0.02, -0.17);
  c += warmK * uA[7] * mix(0.6, 1.0, luma(c));
  c += vec3(0.05, -0.1, 0.05) * uA[8];
  // vurgular / gölgeler / beyazlar / siyahlar
  float L = clamp(luma(c), 0.0, 1.0);
  float sh = 1.0 - smoothstep(0.0, 0.55, L);
  float hi = smoothstep(0.45, 1.0, L);
  float L2 = L + uA[4] * 0.32 * sh * (1.0 - L) + uA[3] * 0.32 * hi * (uA[3] < 0.0 ? L : (1.0 - L));
  c *= (L2 + 0.001) / (L + 0.001);
  float bp = -uA[6] * 0.08;
  float wp = 1.0 - uA[5] * 0.12;
  c = (c - bp) / max(wp - bp, 0.05);
  // kontrast (S eğrisi)
  float k = uA[2];
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = k >= 0.0 ? mix(c, s, k) : mix(c, vec3(0.5) + (c - 0.5) * 0.6, -k);
  // parlaklık (brilliance): gölgeleri aç, vurguları koru
  L = clamp(luma(c), 0.0, 1.0);
  c += uA[11] * 0.18 * (1.0 - L) * (0.5 - abs(L - 0.4));
  // doygunluk / canlılık
  vec3 g = vec3(luma(c));
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  c = mix(g, c, 1.0 + uA[9]);
  c = mix(vec3(luma(c)), c, 1.0 + uA[10] * (1.0 - sat) * 1.2);
  // HSL
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float dh = 0.0, ds = 0.0, dl = 0.0;
  float centers[8] = float[8](0.0, 0.083, 0.166, 0.333, 0.5, 0.633, 0.75, 0.875);
  for (int i = 0; i < 8; i++) {
    float w = bandW(hsv.x, centers[i]);
    dh += w * uHsl[i].x; ds += w * uHsl[i].y; dl += w * uHsl[i].z;
  }
  hsv.x = fract(hsv.x + dh * 0.08);
  hsv.y = clamp(hsv.y * (1.0 + ds), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (1.0 + dl * 0.5 * hsv.y), 0.0, 1.0);
  c = hsv2rgb(hsv);
  // eğriler
  if (uCurveOn > 0.5) {
    c = clamp(c, 0.0, 1.0);
    c = vec3(texture(uCurve, vec2(c.r, 0.5)).r, texture(uCurve, vec2(c.g, 0.5)).g, texture(uCurve, vec2(c.b, 0.5)).b);
  }
  // bölünmüş tonlama
  L = clamp(luma(c), 0.0, 1.0);
  c = mix(c, softLight(clamp(c, 0.0, 1.0), uSplitS.rgb), uSplitS.a * (1.0 - L));
  c = mix(c, softLight(clamp(c, 0.0, 1.0), uSplitH.rgb), uSplitH.a * L);
  // solukluk
  c = mix(c, c * (1.0 - uA[16] * 0.22) + uA[16] * 0.12, step(0.0, uA[16]));
  // ışıltı
  c = mix(c, screenB(clamp(c, 0.0, 1.0), bl * smoothstep(0.35, 1.0, luma(bl))), clamp(uA[19], 0.0, 1.0));
  // vinyet
  vec2 vd = (uv - 0.5) * vec2(uOutSize.x / max(uOutSize.x, uOutSize.y), uOutSize.y / max(uOutSize.x, uOutSize.y));
  float v = smoothstep(0.85, 0.2, length(vd) * 1.25);
  c *= uA[18] >= 0.0 ? mix(1.0, v, uA[18]) : 1.0;
  c = uA[18] < 0.0 ? mix(c, screenB(c, vec3(1.0 - v)), -uA[18] * 0.7) : c;
  // gren
  if (uA[17] > 0.0) {
    float nz = hash12(uv * uOutSize + 17.0) - 0.5;
    c += nz * uA[17] * 0.16 * (1.0 - abs(luma(c) - 0.5));
  }
  return clamp(c, 0.0, 1.0);
}

vec4 fillAt(vec2 uv, vec2 suv){
  if (uFill == 1) return vec4(uFillA.rgb, 1.0);
  if (uFill == 2) {
    float a = radians(uFillAngle);
    float t = dot(uv - 0.5, vec2(cos(a), sin(a))) + 0.5;
    return vec4(mix(uFillA.rgb, uFillB.rgb, clamp(t, 0.0, 1.0)), 1.0);
  }
  if (uFill == 3) return vec4(texture(uBgBlur, clamp(suv, 0.0, 1.0)).rgb, 1.0);
  if (uFill == 4) {
    vec2 r = uOutSize / max(uOutSize.x, uOutSize.y);
    return vec4(texture(uBgImg, uv).rgb, 1.0);
  }
  if (uFill == 5) return vec4(0.0);
  return vec4(0.0, 0.0, 0.0, 0.0);
}

void main(){
  vec2 cuv = vUv; // tuval uv'si (v=0 üst)
  vec2 iuv = (cuv - uPlace.xy) / uPlace.zw;
  bool inside = all(greaterThanEqual(iuv, vec2(0.0))) && all(lessThanEqual(iuv, vec2(1.0)));
  vec2 suv = outToSrc(clamp(iuv, 0.0, 1.0));
  vec4 bg = fillAt(cuv, suv);
  if (!inside) { o = uFill == 0 ? vec4(0.0) : bg; return; }
  if (uWarpOn > 0.5) suv += texture(uWarp, suv).rg;
  if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) { o = uFill == 0 ? vec4(0.0) : bg; return; }
  vec4 src = texture(uSrc, suv);
  vec3 c = grade(src.rgb, iuv, suv);
  float a = src.a;
  if (uMaskOn > 0.5) a *= smoothstep(0.08, 0.92, texture(uMask, suv).r);
  if (uFill == 0) { o = vec4(c, a); return; }
  o = vec4(mix(bg.rgb, c, a), max(bg.a, a));
}`

// Efektler: tek shader, uFx ile seçilir.
export const EFFECT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex, uBlur;
uniform int uFx;
uniform float uAmt, uSeed;
uniform vec2 uSize;
${COMMON}
vec4 tap(vec2 uv){ return texture(uTex, clamp(uv, 0.0, 1.0)); }
void main(){
  vec2 uv = vUv;
  vec4 base = texture(uTex, uv);
  vec3 c = base.rgb;
  vec3 r = c;
  float A = uAmt;
  vec2 px = 1.0 / uSize;
  float asp = uSize.x / uSize.y;
  if (uFx == 1) { // yumuşak odak / rüya
    vec3 b = texture(uBlur, uv).rgb;
    r = mix(c, screenB(c, b * 0.85), 0.75);
  } else if (uFx == 2) { // radyal (zoom) bulanıklık
    vec3 acc = vec3(0.0); vec2 d = uv - 0.5;
    for (int i = 0; i < 24; i++) acc += tap(uv - d * float(i) / 24.0 * 0.12).rgb;
    r = mix(c, acc / 24.0, smoothstep(0.05, 0.5, length(d)));
  } else if (uFx == 3) { // dönme bulanıklığı
    vec3 acc = vec3(0.0); vec2 d = (uv - 0.5) * vec2(asp, 1.0);
    for (int i = 0; i < 24; i++) {
      float a = (float(i) / 23.0 - 0.5) * 0.12;
      vec2 q = vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
      acc += tap(q / vec2(asp, 1.0) + 0.5).rgb;
    }
    r = acc / 24.0;
  } else if (uFx == 4) { // hareket bulanıklığı
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 24; i++) acc += tap(uv + vec2((float(i) / 23.0 - 0.5) * 0.06, 0.0)).rgb;
    r = acc / 24.0;
  } else if (uFx == 5) { // tilt-shift
    float m = smoothstep(0.08, 0.32, abs(uv.y - 0.5));
    r = mix(c, texture(uBlur, uv).rgb, m);
    r = mix(vec3(luma(r)), r, 1.25);
  } else if (uFx == 6) { // renk sapması
    vec2 d = (uv - 0.5) * 0.018;
    r = vec3(tap(uv + d).r, c.g, tap(uv - d).b);
  } else if (uFx == 7) { // glitch
    float row = floor(uv.y * 40.0);
    float n = hash12(vec2(row, floor(uSeed * 7.0)));
    float off = step(0.82, n) * (hash12(vec2(row, 3.1)) - 0.5) * 0.12;
    vec2 q = uv + vec2(off, 0.0);
    r = vec3(tap(q + vec2(0.006, 0.0)).r, tap(q).g, tap(q - vec2(0.006, 0.0)).b);
  } else if (uFx == 8) { // VHS / DV
    float sl = 0.92 + 0.08 * sin(uv.y * uSize.y * 1.4);
    vec2 d = vec2(0.004, 0.0);
    r = vec3(tap(uv + d).r, c.g, tap(uv - d).b) * sl;
    r = mix(vec3(luma(r)), r, 0.8) + (hash12(uv * uSize + uSeed) - 0.5) * 0.08;
    r = r * vec3(1.03, 1.0, 0.95);
  } else if (uFx == 9) { // piksel
    float cells = mix(160.0, 24.0, A);
    vec2 g = vec2(cells, cells / asp);
    r = tap((floor(uv * g) + 0.5) / g).rgb; A = 1.0;
  } else if (uFx == 10) { // yarım ton
    float s = 0.0045 * uSize.y;
    vec2 p = uv * uSize / s;
    vec2 cell = fract(p) - 0.5;
    float L = luma(tap((floor(p) + 0.5) * s / uSize).rgb);
    float d = length(cell);
    r = vec3(step(d, (1.0 - L) * 0.6)) * -1.0 + 1.0;
    r = mix(r, c, 0.25);
  } else if (uFx == 11) { // ayna yatay
    r = tap(vec2(uv.x > 0.5 ? 1.0 - uv.x : uv.x, uv.y)).rgb; A = 1.0;
  } else if (uFx == 12) { // ayna dikey
    r = tap(vec2(uv.x, uv.y > 0.5 ? 1.0 - uv.y : uv.y)).rgb; A = 1.0;
  } else if (uFx == 13) { // posterize
    float lv = mix(12.0, 3.0, A);
    r = floor(c * lv + 0.5) / lv; A = 1.0;
  } else if (uFx == 14) { // ikili ton
    float L = luma(c);
    r = mix(vec3(0.12, 0.06, 0.32), vec3(1.0, 0.72, 0.42), L);
  } else if (uFx == 15) { // termal
    float L = luma(c);
    r = hsv2rgb(vec3(0.66 - L * 0.66, 1.0, 0.5 + L * 0.5));
  } else if (uFx == 16) { // eskiz
    float gx = luma(tap(uv + vec2(px.x, 0.0)).rgb) - luma(tap(uv - vec2(px.x, 0.0)).rgb);
    float gy = luma(tap(uv + vec2(0.0, px.y)).rgb) - luma(tap(uv - vec2(0.0, px.y)).rgb);
    float e = clamp(length(vec2(gx, gy)) * 6.0, 0.0, 1.0);
    r = vec3(1.0 - e) * vec3(0.98, 0.96, 0.92);
  } else if (uFx == 17) { // ışık sızıntısı (sıcak)
    vec2 p = uv - vec2(0.05 + 0.2 * uSeed, 0.1);
    float g = exp(-dot(p * vec2(1.0, 1.6), p * vec2(1.0, 1.6)) * 4.0);
    r = screenB(c, vec3(1.0, 0.45, 0.15) * g * 1.2);
  } else if (uFx == 18) { // ışık sızıntısı (pembe-mor)
    vec2 p = uv - vec2(0.95, 0.85 - 0.2 * uSeed);
    float g = exp(-dot(p, p) * 3.5);
    r = screenB(c, vec3(0.95, 0.3, 0.7) * g * 1.3);
  } else if (uFx == 19) { // prizma / gökkuşağı
    float t = uv.x * 0.8 + uv.y * 0.4 + uSeed;
    vec3 rb = hsv2rgb(vec3(fract(t), 0.7, 1.0));
    float band = smoothstep(0.35, 0.0, abs(uv.x - uv.y * 0.6 - 0.35));
    r = screenB(c, rb * band * 0.55);
  } else if (uFx == 20) { // halation (kırmızı hale)
    vec3 b = texture(uBlur, uv).rgb;
    float h = smoothstep(0.55, 1.0, luma(b));
    r = screenB(c, vec3(1.0, 0.25, 0.1) * h * 0.8);
  } else if (uFx == 21) { // flaş
    vec2 d = (uv - vec2(0.5, 0.42)) * vec2(asp, 1.0);
    float f = exp(-dot(d, d) * 3.0);
    r = c * (0.55 + f * 0.75) + f * 0.08;
    r = mix(vec3(luma(r)), r, 0.9);
  } else if (uFx == 22) { // digicam / CCD
    vec3 b = texture(uBlur, uv).rgb;
    r = c + (c - b) * 0.6;
    r = r * vec3(0.96, 1.0, 1.08) + 0.03;
    r = mix(r, screenB(r, b * 0.35), 0.5);
    r += (hash12(uv * uSize + uSeed * 9.0) - 0.5) * 0.06;
  } else if (uFx == 23) { // kaleydoskop
    vec2 d = (uv - 0.5) * vec2(asp, 1.0);
    float a = atan(d.y, d.x), rr = length(d);
    float seg = 6.2831853 / 6.0;
    a = abs(mod(a, seg) - seg * 0.5);
    r = tap(vec2(cos(a), sin(a)) * rr / vec2(asp, 1.0) + 0.5).rgb; A = 1.0;
  } else if (uFx == 24) { // film tozu + çizik
    float n = hash12(floor(uv * uSize / 3.0) + uSeed * 13.0);
    float dust = step(0.9975, n);
    float scratch = step(0.997, hash12(vec2(floor(uv.x * uSize.x / 2.0), uSeed)));
    r = c * vec3(1.02, 1.0, 0.94);
    r = mix(r, vec3(0.95), dust * 0.8) - scratch * 0.15;
  } else if (uFx == 25) { // kabartma
    vec3 e = tap(uv - px).rgb - tap(uv + px).rgb;
    r = vec3(0.5 + luma(e) * 2.0);
  } else if (uFx == 26) { // yağlı boya (basit kuwahara)
    vec3 m0 = vec3(0.0), m1 = vec3(0.0); vec3 s0 = vec3(0.0), s1 = vec3(0.0);
    for (int j = -3; j <= 0; j++) for (int i = -3; i <= 0; i++) { vec3 t = tap(uv + vec2(i, j) * px * 1.5).rgb; m0 += t; s0 += t * t; }
    for (int j = 0; j <= 3; j++) for (int i = 0; i <= 3; i++) { vec3 t = tap(uv + vec2(i, j) * px * 1.5).rgb; m1 += t; s1 += t * t; }
    m0 /= 16.0; m1 /= 16.0;
    float v0 = dot(s0 / 16.0 - m0 * m0, vec3(1.0)), v1 = dot(s1 / 16.0 - m1 * m1, vec3(1.0));
    r = v0 < v1 ? m0 : m1;
  } else if (uFx == 27) { // ters çevir
    r = 1.0 - c;
  } else if (uFx == 28) { // siyah beyaz kontrast
    float L = luma(c);
    r = vec3(smoothstep(0.1, 0.9, L));
  } else if (uFx == 29) { // sepya
    float L = luma(c);
    r = vec3(L) * vec3(1.07, 0.92, 0.72) + vec3(0.04, 0.02, 0.0);
  } else if (uFx == 30) { // çift pozlama hissi (kayık kopya)
    r = screenB(c, tap(uv + vec2(0.04, -0.02)).rgb * 0.5);
  } else if (uFx == 31) { // bokeh ışıkları
    vec3 b = texture(uBlur, uv).rgb;
    vec2 g = uv * vec2(asp, 1.0) * 9.0;
    vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
    float hsh = hash12(cell + floor(uSeed * 5.0));
    vec2 off = vec2(hash12(cell + 1.7), hash12(cell + 3.1)) - 0.5;
    float circ = smoothstep(0.32, 0.28, length(f - off * 0.4)) * step(0.72, hsh);
    r = screenB(mix(c, b, 0.5), hsv2rgb(vec3(0.08 + hsh * 0.12, 0.5, 1.0)) * circ * 0.5);
  }
  o = vec4(mix(c, clamp(r, 0.0, 1.0), clamp(A, 0.0, 1.0)), base.a);
}`

// Ekrana çizim: doku uzayını ters çevirir, şeffaf alanlarda dama deseni.
export const PRESENT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uSize;
void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 c = texture(uTex, uv);
  vec2 cell = floor(gl_FragCoord.xy / 10.0);
  float chk = mod(cell.x + cell.y, 2.0) < 1.0 ? 0.20 : 0.26;
  o = vec4(mix(vec3(chk), c.rgb, c.a), 1.0);
}`

// Okuma için ters çevirmeden kopya (FBO -> FBO, alfa ön-çarpımsız).
export const READBACK = COPY
