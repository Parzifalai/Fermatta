// GPU composer for the falling-notes picture. The 2D renderer draws the
// background, the notes and keyboard, and what should glow; WebGL adds smoke,
// the fire / laser line, thousands of particles and a multi-level bloom.
import { TilesRenderer, PSTRIDE, rgbOf } from './tiles-render.js';

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const NOISE = `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}`;

const FS_BLIT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uGain;
void main() { o = texture(uTex, vUv) * uGain; }`;

// Slow clouds of smoke: domain-warped fractal noise, denser near the keys.
const FS_SMOKE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uTime, uAmt, uHit; uniform vec3 uCol;
${NOISE}
void main() {
  vec2 p = gl_FragCoord.xy / uRes.y * 1.7;
  float yTop = 1.0 - vUv.y;
  p.y -= uTime * 0.04;
  vec2 w = vec2(fbm(p + vec2(0.0, uTime * 0.03)), fbm(p + vec2(5.2, 1.3) - uTime * 0.02));
  float f = fbm(p * 1.2 + w * 2.0 + vec2(uTime * 0.012, 0.0));
  float d = smoothstep(0.3, 0.9, f);
  float mask = (1.0 - smoothstep(uHit - 0.01, uHit + 0.01, yTop)) * mix(0.35, 1.0, clamp(yTop / uHit, 0.0, 1.0));
  o = vec4(uCol * d * mask * uAmt * 0.95, 1.0);
}`;

// The line above the keys: living flames or a laser, brighter at played keys.
const FS_LINE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes; uniform float uTime, uHit, uUnit, uMode, uGlow; uniform vec3 uCol;
uniform sampler2D uBoost;
${NOISE}
void main() {
  float x = gl_FragCoord.x;
  float d = uHit - (uRes.y - gl_FragCoord.y);   // px above the line
  float b = texture(uBoost, vec2(x / uRes.x, 0.5)).r;
  vec3 hot = mix(uCol, vec3(1.0), 0.55);
  vec3 c = vec3(0.0);
  float core = exp(-abs(d) / (1.4 * uUnit));
  if (uMode < 1.5) {
    float H = uUnit * (24.0 + 95.0 * b) * max(0.3, uGlow);
    vec2 np = vec2(x / (uUnit * 16.0), d / (uUnit * 24.0) - uTime * 2.6);
    float n = fbm(np), n2 = fbm(np * 2.4 + 7.0);
    float flame = clamp(1.0 - d / H + (n - 0.5) * 1.2 + (n2 - 0.5) * 0.6, 0.0, 1.0) * step(-2.0 * uUnit, d);
    flame = pow(flame, 1.7);
    vec3 ember = uCol * vec3(0.55, 0.12, 0.05);
    vec3 fc = mix(mix(ember, uCol, smoothstep(0.0, 0.45, flame)), vec3(1.0, 0.96, 0.85), smoothstep(0.62, 1.0, flame));
    c += fc * flame * (1.0 + 0.7 * b);
    c += hot * core * (0.9 + 0.7 * b);
    c += uCol * exp(-max(d, 0.0) / (18.0 * uUnit * uGlow)) * (0.25 + 0.4 * b);
    c += uCol * exp(-max(-d, 0.0) / (4.0 * uUnit)) * step(d, 0.0) * 0.35;
  } else {
    float sh = 0.85 + 0.3 * fbm(vec2(x / (uUnit * 50.0), uTime * 2.5));
    c += hot * core * 1.7 * sh;
    c += uCol * exp(-abs(d) / (6.0 * uUnit)) * (0.7 + 1.1 * b) * sh;
    c += uCol * exp(-abs(d) / (30.0 * uUnit * uGlow)) * (0.18 + 0.45 * b);
    c += uCol * b * exp(-max(d, 0.0) / (110.0 * uUnit)) * step(0.0, d) * 0.22 * (1.0 - smoothstep(220.0 * uUnit, 400.0 * uUnit, d));
  }
  o = vec4(c, 1.0);
}`;

// Liquid glass: the background is bent through each note like through a lens,
// with a slow ripple and a touch of colour fringing at the edges.
const FS_GLASS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uGlass; uniform float uStrength, uTime; uniform vec2 uRes;
${NOISE}
void main() {
  vec4 m = texture(uGlass, vUv);
  vec3 base = texture(uScene, vUv).rgb;
  if (m.a < 0.004) { o = vec4(base, 1.0); return; }
  float nx = m.r * 2.0 - 1.0;
  float rip = fbm(vec2(gl_FragCoord.x / 38.0, gl_FragCoord.y / 85.0 + uTime * 0.7)) - 0.5;
  vec2 off = vec2(nx * (0.4 + 0.6 * abs(nx)) * 0.045 * uStrength + rip * 0.01, rip * 0.012) * m.a;
  off.x *= uRes.y / uRes.x;
  vec3 bent;
  bent.r = texture(uScene, vUv - off * 1.1).r;
  bent.g = texture(uScene, vUv - off).g;
  bent.b = texture(uScene, vUv - off * 0.9).b;
  o = vec4(mix(base, bent * 1.07 + 0.02, m.a), 1.0);
}`;

const VS_PART = `#version 300 es
in vec2 aCorner;
in vec4 aBox;    // x, y (px from top-left), width, height
in float aAng;
in vec4 aCol;
uniform vec2 uRes;
out vec2 vUv; out vec4 vCol;
void main() {
  vec2 c = aCorner * aBox.zw;
  float cs = cos(aAng), sn = sin(aAng);
  vec2 px = aBox.xy + vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = aCorner; vCol = aCol;
}`;

const FS_PART = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; out vec4 o;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  // gaussian that reaches exactly zero at the quad edge, so no boxes show
  float g = (exp(-r2 * 5.0) - 0.006738) / 0.993262;
  float core = exp(-r2 * 26.0);
  o = vec4((vCol.rgb * g + vec3(1.0) * core * 0.6) * vCol.a, 1.0);
}`;

// Call-of-Duty style 13-tap downsample and tent upsample for a smooth bloom.
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 a = texture(uTex, vUv + t * vec2(-2, 2)).rgb, b = texture(uTex, vUv + t * vec2(0, 2)).rgb, c = texture(uTex, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture(uTex, vUv + t * vec2(-2, 0)).rgb, e = texture(uTex, vUv).rgb, f = texture(uTex, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(uTex, vUv + t * vec2(-2, -2)).rgb, h = texture(uTex, vUv + t * vec2(0, -2)).rgb, i = texture(uTex, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture(uTex, vUv + t * vec2(-1, 1)).rgb, k = texture(uTex, vUv + t * vec2(1, 1)).rgb;
  vec3 l = texture(uTex, vUv + t * vec2(-1, -1)).rgb, m = texture(uTex, vUv + t * vec2(1, -1)).rgb;
  vec3 s = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  o = vec4(s, 1.0);
}`;

const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uGain;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(uTex, vUv).rgb * 4.0;
  s += (texture(uTex, vUv + t * vec2(-1, 0)).rgb + texture(uTex, vUv + t * vec2(1, 0)).rgb + texture(uTex, vUv + t * vec2(0, -1)).rgb + texture(uTex, vUv + t * vec2(0, 1)).rgb) * 2.0;
  s += texture(uTex, vUv + t * vec2(-1, -1)).rgb + texture(uTex, vUv + t * vec2(1, -1)).rgb + texture(uTex, vUv + t * vec2(-1, 1)).rgb + texture(uTex, vUv + t * vec2(1, 1)).rgb;
  o = vec4(s / 16.0 * uGain, 1.0);
}`;

const FS_FINAL = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uFx, uBloom;
uniform float uBloomK, uVig, uBright, uHit;
void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 light = texture(uFx, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
  // light is added like real light: it saturates towards white instead of clipping
  vec3 c = 1.0 - (1.0 - scene) * exp(-light);
  float yTop = 1.0 - vUv.y;
  vec2 p = (vUv - vec2(0.5, 0.55)) * vec2(1.0, 1.25);
  float v = 1.0 - uVig * smoothstep(0.3, 0.95, length(p));
  c *= mix(v, 1.0, smoothstep(uHit - 0.02, uHit + 0.02, yTop));
  c *= uBright;
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

const make2d = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

export class TilesComposer {
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: preserve });
    if (!gl) throw new Error('WebGL2 is unavailable');
    this.gl = gl;
    this.half = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.renderer = new TilesRenderer();
    this.layers = null;
    this.size = [0, 0];
    this.progs = {
      blit: this.program(VS, FS_BLIT), smoke: this.program(VS, FS_SMOKE), line: this.program(VS, FS_LINE),
      down: this.program(VS, FS_DOWN), glass: this.program(VS, FS_GLASS), up: this.program(VS, FS_UP), final: this.program(VS, FS_FINAL),
      part: this.program(VS_PART, FS_PART),
    };
    // full-screen triangle pair
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vaoQuad = gl.createVertexArray();
    gl.bindVertexArray(this.vaoQuad);
    for (const p of Object.values(this.progs)) {
      const loc = gl.getAttribLocation(p, 'aPos');
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
    }
    // particles: one quad instanced per particle
    const pp = this.progs.part;
    this.vaoPart = gl.createVertexArray();
    gl.bindVertexArray(this.vaoPart);
    const corner = gl.getAttribLocation(pp, 'aCorner');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    this.partBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    const stride = PSTRIDE * 4;
    const attr = (name, size, off) => {
      const l = gl.getAttribLocation(pp, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, off * 4);
      gl.vertexAttribDivisor(l, 1);
    };
    attr('aBox', 4, 0); attr('aAng', 1, 4); attr('aCol', 4, 5);
    gl.bindVertexArray(null);
    this.tex = { bg: this.texture(), fg: this.texture(), em: this.texture(), boost: this.texture(), glass: this.texture() };
  }

  program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); p.u[info.name] = gl.getUniformLocation(p, info.name); }
    return p;
  }

  texture() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  target(w, h, float) {
    const gl = this.gl;
    const tex = this.texture();
    if (float && this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  resize(W, H) {
    if (this.size[0] === W && this.size[1] === H) return;
    const gl = this.gl;
    this.size = [W, H];
    this.canvas.width = W; this.canvas.height = H;
    for (const t of this.targets || []) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.scene = this.target(W, H, false);
    this.scene2 = this.target(W, H, false);
    this.fx = this.target(W, H, true);
    this.mips = [];
    let w = Math.max(1, W >> 1), h = Math.max(1, H >> 1);
    for (let i = 0; i < 7 && w >= 4 && h >= 4; i++) { this.mips.push(this.target(w, h, true)); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
    this.targets = [this.scene, this.scene2, this.fx, ...this.mips];
    this.layers = { bg: make2d(W, H), fg: make2d(W, H), em: make2d(Math.ceil(W / 2), Math.ceil(H / 2)), glass: make2d(Math.ceil(W / 2), Math.ceil(H / 2)) };
  }

  upload(tex, src, premultiply) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  pass(prog, target, uniforms = {}, textures = {}) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.size[0], target ? target.h : this.size[1]);
    let unit = 0;
    for (const [name, tex] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.u[name], unit++);
    }
    for (const [name, v] of Object.entries(uniforms)) {
      const loc = prog.u[name];
      if (loc == null) continue;
      if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : gl.uniform3fv).call(gl, loc, v);
      else gl.uniform1f(loc, v);
    }
    gl.bindVertexArray(this.vaoQuad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Draws one frame into the canvas.
  render(W, H, time, style) {
    const gl = this.gl;
    this.resize(W, H);
    const R = this.renderer;
    const F = R.frame(W, H, time, style);
    const { S, G } = F;
    const L = this.layers;

    // 1. 2D layers
    const bg = L.bg.getContext('2d');
    R.drawBackground(bg, F);
    const fg = L.fg.getContext('2d');
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.clearRect(0, 0, W, H);
    R.drawScene(fg, F);
    const em = L.em.getContext('2d');
    em.setTransform(1, 0, 0, 1, 0, 0);
    em.clearRect(0, 0, L.em.width, L.em.height);
    em.setTransform(0.5, 0, 0, 0.5, 0, 0);
    R.drawEmissive(em, F);
    this.upload(this.tex.bg, L.bg, false);
    this.upload(this.tex.fg, L.fg, true);
    this.upload(this.tex.em, L.em, true);

    // 2. scene: background, smoke, then notes and keyboard on top
    gl.disable(gl.BLEND);
    this.pass(this.progs.blit, this.scene, { uGain: 1 }, { uTex: this.tex.bg });
    gl.enable(gl.BLEND);
    if (S.smoke > 0) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      this.pass(this.progs.smoke, this.scene, { uRes: [W, H], uTime: time, uAmt: S.smoke, uHit: G.hitY / H, uCol: rgbOf(S.smokeColor).map((v) => v / 255) });
    }
    let scene = this.scene;
    if (S.noteStyle === 'liquid') {
      // bend the background through the glass notes before drawing them on top
      const gg = L.glass.getContext('2d');
      gg.setTransform(1, 0, 0, 1, 0, 0);
      gg.clearRect(0, 0, L.glass.width, L.glass.height);
      gg.setTransform(0.5, 0, 0, 0.5, 0, 0);
      R.drawGlass(gg, F);
      this.upload(this.tex.glass, L.glass, false);
      gl.disable(gl.BLEND);
      this.pass(this.progs.glass, this.scene2, { uStrength: S.refract, uTime: time, uRes: [W, H] }, { uScene: this.scene.tex, uGlass: this.tex.glass });
      gl.enable(gl.BLEND);
      scene = this.scene2;
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.pass(this.progs.blit, scene, { uGain: 1 }, { uTex: this.tex.fg });

    // 3. light: hit line and particles, added together
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fx.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE);
    if (S.line === 'fire' || S.line === 'laser') {
      const b = R.boost(F);
      const rgba = new Float32Array(b.length * 4);
      for (let i = 0; i < b.length; i++) rgba[i * 4] = b[i];
      gl.bindTexture(gl.TEXTURE_2D, this.tex.boost);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, b.length, 1, 0, gl.RGBA, gl.FLOAT, rgba);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, b.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, Uint8Array.from(rgba, (v) => Math.min(255, v * 100)));
      gl.enable(gl.SCISSOR_TEST);
      const top = Math.max(0, G.hitY - 420 * G.unit);
      gl.scissor(0, H - G.hitY - 40 * G.unit, W, G.hitY - top + 40 * G.unit);
      this.pass(this.progs.line, this.fx, {
        uRes: [W, H], uTime: time, uHit: G.hitY, uUnit: G.unit, uMode: S.line === 'fire' ? 1 : 2, uGlow: S.lineGlow,
        uCol: rgbOf(S.lineColor).map((v) => v / 255),
      }, { uBoost: this.tex.boost });
      gl.disable(gl.SCISSOR_TEST);
    }
    const parts = R.particles(F);
    if (parts.count) {
      const pp = this.progs.part;
      gl.useProgram(pp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fx.fb);
      gl.viewport(0, 0, W, H);
      gl.uniform2fv(pp.u.uRes, [W, H]);
      gl.bindVertexArray(this.vaoPart);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
      gl.bufferData(gl.ARRAY_BUFFER, parts.data.subarray(0, parts.count * PSTRIDE), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, parts.count);
      gl.bindVertexArray(null);
    }

    // 4. bloom: glowing layer + light, blurred down a mip chain and back up
    const m = this.mips;
    gl.disable(gl.BLEND);
    this.pass(this.progs.blit, m[0], { uGain: 1 }, { uTex: this.tex.em });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.pass(this.progs.blit, m[0], { uGain: 0.55 }, { uTex: this.fx.tex });
    gl.disable(gl.BLEND);
    for (let i = 1; i < m.length; i++) this.pass(this.progs.down, m[i], { uTexel: [1 / m[i - 1].w, 1 / m[i - 1].h] }, { uTex: m[i - 1].tex });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    // stop at level 1: level 0 still holds the sharp source and would wash the notes out
    for (let i = m.length - 2; i >= 1; i--) this.pass(this.progs.up, m[i], { uTexel: [1 / m[i + 1].w, 1 / m[i + 1].h], uGain: 1 }, { uTex: m[i + 1].tex });
    gl.disable(gl.BLEND);

    // 5. final picture
    this.pass(this.progs.final, null, {
      uBloomK: S.glow * 0.75, uVig: S.vignette, uBright: S.brightness, uHit: G.hitY / H,
    }, { uScene: scene.tex, uFx: this.fx.tex, uBloom: m[1].tex });
    return G;
  }
}

// One shared hidden composer that renders small pictures (style previews).
let thumbComposer = null;
export function renderThumb(target, take, style, time) {
  if (!thumbComposer) thumbComposer = new TilesComposer(new OffscreenCanvas(2, 2), { preserve: true });
  thumbComposer.renderer.setTake(take);
  thumbComposer.render(target.width, target.height, time, style);
  target.getContext('2d').drawImage(thumbComposer.canvas, 0, 0);
}
