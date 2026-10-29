// Falling-notes renderer. Stateless: draw(time) depends only on the take, the
// style and the time, so a live preview and an exported frame are identical.
import { layout, isBlack, LOW, HIGH, hexToRgb } from '../core/keys.js';

export const DEFAULT_VISUAL = {
  preset: 'fire-ice',
  lh: '#5b97ff',
  rh: '#86b6ff',
  keyLh: '#ff9b3d',     // lit key colours ('' = same as notes)
  keyRh: '#ffb04d',
  heat: 0.85,           // notes take on heatColor as they near the keys
  heatColor: '#ff8c42',
  bg: { type: 'gradient', a: '#1b1f2a', b: '#07080b', angle: 180, image: '', video: '', blur: 0, dim: 0.35 },
  noteStyle: 'capsule', // capsule | neon | soft | glass | pill | flat
  core: 0.55,           // white-hot core inside capsule / neon notes
  noteWidth: 0.82,      // share of the key width
  speed: 3.2,           // seconds of music visible above the keys
  tilt: 0,              // 0 flat .. 1 strong 3D perspective
  fog: 0.3,             // far notes fade into the distance
  keyHeight: 0.15,      // keyboard height, share of the frame
  glow: 1,
  sparks: 0.3, sparkColor: '#ffc266',
  embers: 1, emberColor: '#ffb347',
  dust: 0.2,
  smoke: 0.7, smokeColor: '#8d96a8',
  beams: 0.15,
  flare: 0.7,           // light where a note hits the keys
  line: 'fire',         // fire | laser | felt | none
  lineColor: '#ff9a2e',
  lineGlow: 1,
  vignette: 0.5,
  brightness: 1,
  range: 'auto',        // auto | full
  guides: false,
  keyboard: 'white',    // white | classic | ebony
  keyGlow: 0.8,
  velocityShade: true,
  noteNames: false,
};

// Ready-made looks. A preset only sets the look; file paths of image/video
// backgrounds stay as they are.
export const PRESETS = [
  { id: 'fire-ice', style: {} },
  { id: 'neon', style: {
    lh: '#2f8cff', rh: '#38c6ff', keyLh: '#4fb4ff', keyRh: '#6fd0ff', heat: 0, noteStyle: 'neon', core: 0.8,
    glow: 1.1, sparks: 0.9, sparkColor: '#ff6a3d', embers: 0.35, emberColor: '#ff7a45', dust: 0.8, smoke: 0, beams: 0.2,
    flare: 1, line: 'laser', lineColor: '#3fb8ff', lineGlow: 1.1, keyboard: 'white', vignette: 0.3, tilt: 0, fog: 0.2,
    bg: { type: 'solid', a: '#000000', b: '#000000' } } },
  { id: 'aurora', style: {
    lh: '#3ee0c8', rh: '#b38cff', keyLh: '', keyRh: '', heat: 0.35, heatColor: '#f2edff', noteStyle: 'capsule', core: 0.6,
    glow: 0.9, sparks: 0.5, sparkColor: '', embers: 0, dust: 0.6, smoke: 0.35, smokeColor: '#5b4d8a', beams: 0.35, flare: 0.7,
    line: 'laser', lineColor: '#9d7bff', lineGlow: 0.9, keyboard: 'white', vignette: 0.45, tilt: 0.4, fog: 0.45,
    bg: { type: 'gradient', a: '#170f2e', b: '#05040b', angle: 180 } } },
  { id: 'gold', style: {
    lh: '#f3c76b', rh: '#fff1c9', keyLh: '', keyRh: '', heat: 0, noteStyle: 'glass', core: 0.5,
    glow: 0.8, sparks: 0.4, sparkColor: '#ffe3a3', embers: 0.6, emberColor: '#ffd27a', dust: 0.3, smoke: 0.4, smokeColor: '#8a7a5e', beams: 0.4, flare: 0.8,
    line: 'fire', lineColor: '#ffcc66', lineGlow: 0.8, keyboard: 'ebony', vignette: 0.55, tilt: 0.3, fog: 0.5,
    bg: { type: 'gradient', a: '#221d18', b: '#0a0908', angle: 180 } } },
  { id: 'sakura', style: {
    lh: '#ff9ecf', rh: '#ffd29e', keyLh: '', keyRh: '', heat: 0, noteStyle: 'pill', core: 0.6,
    glow: 0.8, sparks: 0.3, sparkColor: '#ffffff', embers: 0.5, emberColor: '#ffc0de', dust: 0.5, smoke: 0.2, smokeColor: '#a06a8a', beams: 0.3, flare: 0.6,
    line: 'laser', lineColor: '#ff8fc8', lineGlow: 0.8, keyboard: 'white', vignette: 0.4, tilt: 0, fog: 0.3,
    bg: { type: 'gradient', a: '#2a1424', b: '#0b0710', angle: 180 } } },
  { id: 'classic', style: {
    lh: '#7fa6d9', rh: '#e8b86a', keyLh: '', keyRh: '', heat: 0, noteStyle: 'soft', core: 0.4,
    glow: 0.7, sparks: 0.6, sparkColor: '', embers: 0, dust: 0, smoke: 0, beams: 0.6, flare: 0.5,
    line: 'felt', lineGlow: 0.6, keyboard: 'classic', vignette: 0.2, tilt: 0, fog: 0, guides: true,
    bg: { type: 'gradient', a: '#141220', b: '#07070a', angle: 180 } } },
];

export function applyPreset(style, id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  const base = { ...DEFAULT_VISUAL, ...p.style };
  const keep = { range: style.range, noteNames: style.noteNames, velocityShade: style.velocityShade, speed: style.speed, keyHeight: style.keyHeight };
  return { ...base, ...keep, preset: p.id, bg: { ...style.bg, ...DEFAULT_VISUAL.bg, ...(p.style.bg || {}), image: style.bg?.image || '', video: style.bg?.video || '' } };
}

export const PALETTES = [
  { id: 'ice', lh: '#5b97ff', rh: '#86b6ff' },
  { id: 'brass', lh: '#7fa6d9', rh: '#e8b86a' },
  { id: 'aurora', lh: '#4fd1c5', rh: '#b794f4' },
  { id: 'ember', lh: '#f6ad55', rh: '#fc8181' },
  { id: 'neon', lh: '#2f8cff', rh: '#38c6ff' },
  { id: 'sakura', lh: '#f8b4d9', rh: '#fbd38d' },
  { id: 'forest', lh: '#68d391', rh: '#f6e05e' },
  { id: 'mono', lh: '#cbd5e0', rh: '#ffffff' },
];

export const BACKGROUNDS = [
  { id: 'storm', a: '#1b1f2a', b: '#07080b' },
  { id: 'night', a: '#141220', b: '#07070a' },
  { id: 'black', a: '#000000', b: '#000000' },
  { id: 'deep', a: '#0b1d2c', b: '#04080d' },
  { id: 'dusk', a: '#2a1424', b: '#0b0710' },
  { id: 'violet', a: '#170f2e', b: '#05040b' },
  { id: 'moss', a: '#12201a', b: '#060a08' },
  { id: 'amber', a: '#221d18', b: '#0a0908' },
];

// ---------- colour helpers (cached, rgb arrays) ----------
const rgbCache = new Map();
function rgbOf(c) {
  let v = rgbCache.get(c);
  if (!v) { v = hexToRgb(c); rgbCache.set(c, v); }
  return v;
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [255, 255, 255];
const lightc = (c, t) => mixc(c, WHITE, t);
const darkc = (c, t) => [c[0] * (1 - t), c[1] * (1 - t), c[2] * (1 - t)];
const rgba = (hex, a) => css(rgbOf(hex), a);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// small deterministic random from integers
function hash(a, b) {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// smooth value noise in two dimensions
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

// Soft round light, tinted. Used for embers, flares and key glow.
const spriteCache = new Map();
function lightSprite(color) {
  let s = spriteCache.get(color);
  if (s) return s;
  s = makeCanvas(64, 64);
  const g = s.getContext('2d');
  const c = rgbOf(color);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, css(lightc(c, 0.85), 1));
  gr.addColorStop(0.18, css(lightc(c, 0.35), 0.85));
  gr.addColorStop(0.45, css(c, 0.32));
  gr.addColorStop(1, css(c, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  spriteCache.set(color, s);
  return s;
}

// A puff of smoke: fractal noise inside a soft circle, tinted.
let smokeBase = null;
const smokeCache = new Map();
function smokeSprite(color) {
  let s = smokeCache.get(color);
  if (s) return s;
  if (!smokeBase) {
    const N = 256;
    smokeBase = makeCanvas(N, N);
    const g = smokeBase.getContext('2d');
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        let f = 0, amp = 0.5, fr = 3 / N;
        for (let o = 0; o < 5; o++) { f += vnoise(x * fr + o * 17, y * fr + o * 31) * amp; amp *= 0.5; fr *= 2; }
        const a = clamp01((f - 0.32) * 2.1) * Math.pow(clamp01(1 - r), 1.6);
        const i = (y * N + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
  }
  s = makeCanvas(256, 256);
  const g = s.getContext('2d');
  g.drawImage(smokeBase, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  smokeCache.set(color, s);
  return s;
}

export function keyRange(take, mode) {
  if (mode === 'full' || !take || !take.notes.length) return [LOW, HIGH];
  let lo = 127, hi = 0;
  for (const n of take.notes) { lo = Math.min(lo, n.k); hi = Math.max(hi, n.k); }
  // widen to whole octaves (C..B) with a little air, at least three octaves
  lo = Math.max(LOW, Math.floor((lo - 2) / 12) * 12);
  hi = Math.min(HIGH, Math.ceil((hi + 3) / 12) * 12 - 1);
  while (hi - lo < 35) { if (lo > LOW) lo -= 12; if (hi - lo < 35 && hi < HIGH) hi += 12; if (lo <= LOW && hi >= HIGH) break; }
  if (isBlack(lo)) lo--;
  if (isBlack(hi)) hi++;
  return [Math.max(LOW, lo), Math.min(HIGH, hi)];
}

export function keyboardHeight(W, H, keyHeight) {
  const portrait = H > W * 1.2;
  return Math.round(H * keyHeight * (portrait ? 0.6 : 1));
}

export class TilesRenderer {
  constructor() {
    this.glowCanvas = null;
    this.media = { image: null, video: null };
  }

  // Index notes by start time for fast visible-window lookups.
  setTake(take) {
    this.take = take;
    this.sorted = take ? take.notes.slice().sort((a, b) => a.t - b.t) : [];
    this.maxDur = this.sorted.reduce((m, n) => Math.max(m, n.d), 0);
    this.rangeCache = null;
  }

  firstIndex(t) {
    // first note with n.t >= t (binary search)
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.sorted[m].t < t) lo = m + 1; else hi = m; }
    return lo;
  }

  geometry(W, H, style) {
    const kh = keyboardHeight(W, H, style.keyHeight);
    const pad = Math.round(W * 0.01);
    const key = this.take?.id + style.range + W + H;
    if (!this.rangeCache || this.rangeCache.key !== key) {
      const [lo, hi] = keyRange(this.take, style.range);
      this.rangeCache = { key, lo, hi, L: layout(W - pad * 2, lo, hi) };
    }
    const { lo, hi, L } = this.rangeCache;
    const hitY = H - kh;
    // perspective: distance above the keys (fy, px when flat) → screen
    const k = style.tilt * 2.2;
    const s1 = 1 / (1 + k);
    return {
      W, H, kh, pad, lo, hi, L, hitY, pps: hitY / style.speed, unit: Math.min(W, H) / 1080,
      k, s1, cx: W / 2, tilted: k > 0.001,
    };
  }

  // flat point (x, fy above the hit line) → screen [x, y]
  proj(G, x, fy) {
    if (!G.tilted) return [x, G.hitY - fy];
    const u = Math.max(-0.2, fy / G.hitY);
    const s = 1 / (1 + G.k * u);
    return [G.cx + (x - G.cx) * s, G.hitY - (G.hitY * (1 - s)) / (1 - G.s1)];
  }

  // Rounded rectangle on the note plane (projected when tilted).
  shape(g, G, x, fy0, w, fy1, r) {
    const h = fy1 - fy0;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!G.tilted) { roundRect(g, x, G.hitY - fy1, w, h, r); return; }
    g.beginPath();
    const seg = r > 1 ? 4 : 0;
    let first = true;
    const corner = (cx, cy, a0) => {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / Math.max(1, seg)) * (Math.PI / 2);
        const p = this.proj(G, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        if (first) { g.moveTo(p[0], p[1]); first = false; } else g.lineTo(p[0], p[1]);
      }
    };
    // bottom-left → bottom-right → top-right → top-left (fy grows upward)
    corner(x + r, fy0 + r, Math.PI);
    corner(x + w - r, fy0 + r, Math.PI * 1.5);
    corner(x + w - r, fy1 - r, 0);
    corner(x + r, fy1 - r, Math.PI / 2);
    g.closePath();
  }

  draw(g, W, H, time, style, { matte = false } = {}) {
    const S = { ...DEFAULT_VISUAL, ...style, bg: { ...DEFAULT_VISUAL.bg, ...(style.bg || {}) } };
    const G = this.geometry(W, H, S);
    const take = this.take;
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.filter = 'none';

    if (matte) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
    else this.drawBackground(g, G, S, time);
    if (S.smoke > 0 && !matte) this.drawSmoke(g, G, S, time);
    if (S.guides && !matte) this.drawGuides(g, G);

    // collect visible and sounding notes
    const visible = [];
    const sounding = new Map();
    if (take) {
      const ahead = S.speed * (G.tilted ? 1 : 1) + 0.05;
      const until = time + ahead;
      const start = this.firstIndex(time - this.maxDur - 0.1);
      for (let i = start; i < this.sorted.length; i++) {
        const n = this.sorted[i];
        if (n.t > until) break;
        if (n.t + n.d < time - 0.02) continue;
        if (n.k < G.lo || n.k > G.hi) continue;
        visible.push(n);
        if (n.t <= time && n.t + n.d >= time) sounding.set(n.k, n);
      }
    }

    if (S.beams > 0 && !matte) this.drawBeams(g, G, S, sounding, time);
    if (S.glow > 0 && !matte) this.drawGlow(g, G, S, visible, sounding, time);
    this.drawNotes(g, G, S, visible, time, matte);
    if (!matte && S.vignette > 0) this.drawVignette(g, G, S);
    this.drawKeyboard(g, G, S, sounding, matte, time);
    if (!matte) {
      this.drawLine(g, G, S, sounding, time);
      if (S.flare > 0) this.drawFlares(g, G, S, sounding, time);
      if (S.dust > 0) this.drawDust(g, G, S, time);
      if (S.embers > 0) this.drawEmbers(g, G, S, time);
      if (S.sparks > 0) this.drawSparks(g, G, S, time);
    }

    if (!matte && S.brightness !== 1) {
      if (S.brightness < 1) { g.fillStyle = `rgba(0,0,0,${1 - S.brightness})`; g.fillRect(0, 0, W, H); }
      else { g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,255,255,${Math.min(1, (S.brightness - 1) * 1.6)})`; g.fillRect(0, 0, W, H); }
    }
    g.restore();
    return G;
  }

  drawBackground(g, G, S) {
    const { W, H } = G;
    const bg = S.bg;
    if ((bg.type === 'image' && this.media.image) || (bg.type === 'video' && this.media.video)) {
      const src = bg.type === 'image' ? this.media.image : this.media.video;
      const sw = src.videoWidth || src.naturalWidth || src.width;
      const sh = src.videoHeight || src.naturalHeight || src.height;
      if (sw && sh) {
        const sc = Math.max(W / sw, H / sh) * (bg.blur > 0 ? 1.06 : 1);
        g.filter = bg.blur > 0 ? `blur(${bg.blur * G.unit * 30}px)` : 'none';
        g.drawImage(src, (W - sw * sc) / 2, (H - sh * sc) / 2, sw * sc, sh * sc);
        g.filter = 'none';
      } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
      g.fillStyle = `rgba(0,0,0,${bg.dim})`;
      g.fillRect(0, 0, W, H);
      return;
    }
    if (bg.type === 'solid') { g.fillStyle = bg.a; g.fillRect(0, 0, W, H); return; }
    const ang = ((bg.angle ?? 180) * Math.PI) / 180;
    const cx = W / 2, cy = H / 2, r = Math.hypot(W, H) / 2;
    const gr = g.createLinearGradient(cx - Math.sin(ang) * r, cy + Math.cos(ang) * r, cx + Math.sin(ang) * r, cy - Math.cos(ang) * r);
    gr.addColorStop(0, bg.a);
    gr.addColorStop(1, bg.b);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }

  drawGuides(g, G) {
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = Math.max(1, G.unit);
    g.beginPath();
    for (let k = G.lo; k <= G.hi; k++) {
      if (k % 12 !== 0) continue;
      const x = G.pad + G.L.keys[k].x;
      const a = this.proj(G, x, 0), b = this.proj(G, x, G.hitY);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
  }

  // Note placement on the flat plane: x, width and its two ends above the hit line.
  noteBox(G, S, n, time) {
    const key = G.L.keys[n.k];
    const black = key.black;
    const share = black ? Math.min(1, S.noteWidth + 0.12) : S.noteWidth;
    const w = key.w * share;
    const x = G.pad + key.x + (key.w - w) / 2;
    const fy0 = (n.t - time) * G.pps;
    let fy1 = (n.t + n.d - time) * G.pps;
    if (fy1 - fy0 < G.unit * 8) fy1 = fy0 + G.unit * 8;
    return { x, w, fy0, fy1, black, key };
  }

  colorOf(S, n) { return n.h === 0 ? S.lh : S.rh; }

  // Colour of a note at height fy: hand colour, warming up near the keys.
  tint(G, S, base, fy) {
    if (S.heat <= 0) return base;
    const c = 1 - clamp01(fy / G.hitY);
    return mixc(base, rgbOf(S.heatColor), S.heat * Math.pow(c, 1.6));
  }

  fogAt(G, S, fy) { return 1 - S.fog * smooth(0.45, 1.0, fy / G.hitY); }

  drawNotes(g, G, S, visible, time, matte) {
    const u = G.unit;
    g.save();
    g.beginPath(); g.rect(0, 0, G.W, G.hitY); g.clip();
    // white-key notes first, black-key notes on top
    for (const pass of [false, true]) {
      for (const n of visible) {
        const b = this.noteBox(G, S, n, time);
        if (b.black !== pass) continue;
        if (b.fy0 > G.hitY * 1.02 || b.fy1 < -4 * u) continue;
        const fy0 = Math.max(b.fy0, -6 * u);
        const fy1 = Math.min(b.fy1, G.hitY * 1.05);
        const rad = S.noteStyle === 'flat' ? 3 * u : S.noteStyle === 'pill' || S.noteStyle === 'capsule' || S.noteStyle === 'neon' ? b.w / 2 : Math.min(b.w * 0.38, 10 * u);
        if (matte) { g.fillStyle = '#fff'; this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill(); continue; }
        const playing = n.t <= time && n.t + n.d >= time;
        const shade = S.velocityShade ? 0.6 + (n.v / 127) * 0.4 : 1;
        let base = rgbOf(this.colorOf(S, n));
        if (playing) base = lightc(base, 0.18);
        else if (shade < 1) base = darkc(base, (1 - shade) * 0.8);
        const c0 = this.tint(G, S, base, fy0), c1 = this.tint(G, S, base, fy1);
        const a0 = this.fogAt(G, S, fy0), a1 = this.fogAt(G, S, fy1);
        const p0 = this.proj(G, b.x + b.w / 2, fy0), p1 = this.proj(G, b.x + b.w / 2, fy1);
        const grad = (fn) => { const gr = g.createLinearGradient(0, p0[1], 0, p1[1]); fn(gr); return gr; };
        switch (S.noteStyle) {
          case 'capsule': {
            // a tube of light: tinted body, bright rim, white-hot core
            g.fillStyle = grad((gr) => { gr.addColorStop(0, css(c0, 0.95 * a0)); gr.addColorStop(1, css(darkc(c1, 0.1), 0.85 * a1)); });
            this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill();
            g.lineWidth = Math.max(1, 1.4 * u);
            g.strokeStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.45), 0.9 * a0)); gr.addColorStop(1, css(lightc(c1, 0.35), 0.7 * a1)); });
            g.stroke();
            const cw = b.w * 0.34;
            const inset = Math.min(b.w * 0.24, (fy1 - fy0) * 0.2);
            if (fy1 - fy0 > inset * 2 + 2 * u) {
              const core = S.core * (playing ? 1.35 : 1);
              g.fillStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.62), Math.min(1, core * 1.1 * a0))); gr.addColorStop(1, css(lightc(c1, 0.5), Math.min(1, core * 0.8 * a1))); });
              this.shape(g, G, b.x + (b.w - cw) / 2, fy0 + inset, cw, fy1 - inset, cw / 2); g.fill();
            }
            break;
          }
          case 'neon': {
            // bright outline, faint body, glowing white inside
            g.fillStyle = grad((gr) => { gr.addColorStop(0, css(c0, (playing ? 0.4 : 0.22) * a0)); gr.addColorStop(1, css(c1, 0.16 * a1)); });
            this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill();
            const iw = b.w * 0.55;
            const inset = Math.min(b.w * 0.25, (fy1 - fy0) * 0.25);
            if (fy1 - fy0 > inset * 2 + 2 * u) {
              g.fillStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.9), S.core * 0.5 * a0)); gr.addColorStop(1, css(lightc(c1, 0.9), S.core * 0.35 * a1)); });
              this.shape(g, G, b.x + (b.w - iw) / 2, fy0 + inset, iw, fy1 - inset, iw / 2); g.fill();
            }
            this.shape(g, G, b.x + 1.5 * u, fy0 + 1.5 * u, b.w - 3 * u, fy1 - 1.5 * u, rad - 1.5 * u);
            g.lineWidth = Math.max(1.5, 3.2 * u);
            g.strokeStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.55), a0)); gr.addColorStop(1, css(lightc(c1, 0.5), a1)); });
            g.stroke();
            g.lineWidth = Math.max(1, 1.1 * u);
            g.strokeStyle = `rgba(255,255,255,${0.85 * a0})`;
            g.stroke();
            break;
          }
          case 'glass': {
            g.fillStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.15), 0.85 * a0)); gr.addColorStop(1, css(darkc(c1, 0.15), 0.7 * a1)); });
            this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill();
            g.fillStyle = `rgba(255,255,255,${0.32 * a0})`;
            this.shape(g, G, b.x + b.w * 0.16, fy0 + 3 * u, Math.max(1, b.w * 0.14), fy1 - 3 * u, b.w * 0.07); g.fill();
            break;
          }
          case 'flat':
            g.fillStyle = grad((gr) => { gr.addColorStop(0, css(c0, a0)); gr.addColorStop(1, css(c1, a1)); });
            this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill();
            break;
          case 'pill':
            g.fillStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.1), a0)); gr.addColorStop(1, css(c1, a1)); });
            this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill();
            break;
          default: { // soft
            g.fillStyle = grad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.12), a0)); gr.addColorStop(1, css(darkc(c1, 0.18), a1)); });
            this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill();
            g.lineWidth = Math.max(1, u);
            g.strokeStyle = css(lightc(c0, 0.45), 0.6 * a0);
            g.stroke();
          }
        }
        if (S.noteNames && !G.tilted && fy1 - fy0 > 18 * u && b.w > 10 * u) {
          g.fillStyle = 'rgba(10,10,12,.75)';
          g.font = `700 ${Math.round(Math.min(b.w * 0.5, 15 * u))}px Manrope, sans-serif`;
          g.textAlign = 'center';
          g.fillText(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n.k % 12], b.x + b.w / 2, G.hitY - fy0 - 6 * u);
        }
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // Bloom: notes and lit keys drawn small, blurred, then added on top.
  drawGlow(g, G, S, visible, sounding, time) {
    const q = 4;
    const w = Math.ceil(G.W / q), h = Math.ceil(G.H / q);
    if (!this.glowCanvas || this.glowCanvas.width !== w || this.glowCanvas.height !== h) this.glowCanvas = makeCanvas(w, h);
    const gc = this.glowCanvas.getContext('2d');
    gc.clearRect(0, 0, w, h);
    gc.save();
    gc.scale(1 / q, 1 / q);
    gc.beginPath(); gc.rect(0, 0, G.W, G.hitY + 30 * G.unit); gc.clip();
    for (const n of visible) {
      const b = this.noteBox(G, S, n, time);
      if (b.fy0 > G.hitY || b.fy1 < 0) continue;
      const playing = n.t <= time && n.t + n.d >= time;
      const fy0 = Math.max(b.fy0, 0), fy1 = Math.min(b.fy1, G.hitY);
      const c = this.tint(G, S, rgbOf(this.colorOf(S, n)), (fy0 + fy1) / 2);
      gc.globalAlpha = (playing ? 0.95 : 0.6) * (0.55 + (n.v / 127) * 0.45) * this.fogAt(G, S, (fy0 + fy1) / 2);
      gc.fillStyle = css(c);
      this.shape(gc, G, b.x, fy0, b.w, fy1, b.w / 2);
      gc.fill();
    }
    gc.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    // a wide soft halo and a tight one hugging the notes
    g.globalAlpha = Math.min(1, S.glow * 0.8);
    g.filter = `blur(${Math.max(3, 22 * G.unit)}px)`;
    g.drawImage(this.glowCanvas, 0, 0, G.W, G.H);
    g.globalAlpha = Math.min(1, S.glow * 0.55);
    g.filter = `blur(${Math.max(2, 7 * G.unit)}px)`;
    g.drawImage(this.glowCanvas, 0, 0, G.W, G.H);
    if (S.glow > 1) { g.globalAlpha = S.glow - 1; g.drawImage(this.glowCanvas, 0, 0, G.W, G.H); }
    g.filter = 'none';
    g.restore();
  }

  // Light columns rising from keys that are sounding.
  drawBeams(g, G, S, sounding) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const n of sounding.values()) {
      const key = G.L.keys[n.k];
      const x = G.pad + key.x;
      const hgt = G.hitY * 0.5 * S.beams * (0.6 + (n.v / 127) * 0.6);
      const c = rgbOf(this.keyColor(S, n));
      const p0 = this.proj(G, x, 0), p1 = this.proj(G, x, hgt);
      const gr = g.createLinearGradient(0, p0[1], 0, p1[1]);
      gr.addColorStop(0, css(c, 0.5 * Math.min(1, S.beams)));
      gr.addColorStop(1, css(c, 0));
      g.fillStyle = gr;
      this.shape(g, G, x - key.w * 0.25, 0, key.w * 1.5, hgt, 0);
      g.fill();
    }
    g.restore();
  }

  drawVignette(g, G, S) {
    const { W, hitY } = G;
    const gr = g.createRadialGradient(W / 2, hitY * 0.75, Math.min(W, hitY) * 0.25, W / 2, hitY * 0.6, Math.hypot(W, hitY) * 0.65);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${S.vignette})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, hitY);
  }

  keyColor(S, n) { return n.h === 0 ? S.keyLh || S.lh : S.keyRh || S.rh; }

  // Light of the hit line near the keys that sound (0..~1.5).
  boostMap(G, S, sounding, time) {
    const pts = [];
    for (const n of sounding.values()) {
      const key = G.L.keys[n.k];
      const age = time - n.t;
      pts.push({ x: G.pad + key.x + key.w / 2, w: key.w * 1.6, a: 0.7 + 0.8 * Math.exp(-age * 6) * (n.v / 127) });
    }
    return (x) => {
      let s = 0;
      for (const p of pts) { const d = (x - p.x) / p.w; if (d > -3 && d < 3) s += p.a * Math.exp(-d * d); }
      return s;
    };
  }

  drawLine(g, G, S, sounding, time) {
    const { W, hitY: y, unit: u } = G;
    const lg = S.lineGlow;
    const c = rgbOf(S.lineColor);
    if (S.line === 'none') return;
    if (S.line === 'felt') {
      g.fillStyle = '#8f2723';
      g.fillRect(0, y, W, Math.max(2, 3 * u));
      const sh = g.createLinearGradient(0, y - 26 * u, 0, y);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = sh;
      g.fillRect(0, y - 26 * u, W, 26 * u);
      return;
    }
    const boost = this.boostMap(G, S, sounding, time);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // soft band of light above (and a little below) the line
    const band = 46 * u * lg;
    let gr = g.createLinearGradient(0, y - band, 0, y + band * 0.3);
    gr.addColorStop(0, css(c, 0));
    gr.addColorStop(0.75, css(c, 0.22 * lg));
    gr.addColorStop(0.93, css(lightc(c, 0.3), 0.5 * lg));
    gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, y - band, W, band * 1.3);
    if (S.line === 'fire') {
      // flickering flames along the edge, taller where keys are played
      const fh = 34 * u * lg;
      gr = g.createLinearGradient(0, y, 0, y - fh * 2.2);
      gr.addColorStop(0, css(lightc(c, 0.75), 0.95));
      gr.addColorStop(0.18, css(lightc(c, 0.2), 0.75));
      gr.addColorStop(0.55, css(c, 0.28));
      gr.addColorStop(1, css(c, 0));
      g.fillStyle = gr;
      const step = Math.max(2, 3 * u);
      for (let x = 0; x < W; x += step) {
        const b = boost(x);
        const n1 = vnoise(x / (26 * u), time * 3.1);
        const n2 = vnoise(x / (9 * u) + 40, time * 6.3);
        const hh = fh * (0.12 + n1 * 0.35 + n2 * 0.18 + b * 0.9);
        g.globalAlpha = 0.45 + n2 * 0.4 + Math.min(0.4, b * 0.3);
        g.fillRect(x, y - hh, step * 1.3, hh + 2 * u);
      }
      g.globalAlpha = 1;
    } else {
      // laser: brighter pools around the played keys
      const sp = lightSprite(S.lineColor);
      for (const n of sounding.values()) {
        const key = G.L.keys[n.k];
        const x = G.pad + key.x + key.w / 2;
        const r = key.w * 5 * lg;
        g.globalAlpha = 0.6;
        g.drawImage(sp, x - r, y - r * 0.22, r * 2, r * 0.44);
      }
      g.globalAlpha = 1;
    }
    // the line itself: coloured edge and a white-hot core
    g.fillStyle = css(c, 0.95);
    g.fillRect(0, y - 2.5 * u, W, 5 * u);
    g.fillStyle = css(lightc(c, 0.8), 1);
    g.fillRect(0, y - 1 * u, W, Math.max(1, 2 * u));
    g.restore();
  }

  // Bursts of light where a note meets the keyboard.
  drawFlares(g, G, S, sounding, time) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const n of sounding.values()) {
      const key = G.L.keys[n.k];
      const x = G.pad + key.x + key.w / 2;
      const age = time - n.t;
      const hit = 1 + 1.6 * Math.exp(-age * 7);
      const col = S.line === 'laser' && S.sparkColor ? S.sparkColor : this.keyColor(S, n);
      const sp = lightSprite(col);
      const r = key.w * 1.6 * S.flare * hit * (0.7 + (n.v / 127) * 0.5);
      g.globalAlpha = Math.min(1, 0.75 * S.flare);
      g.drawImage(sp, x - r, G.hitY - r, r * 2, r * 2);
      // a thin horizontal streak, like a lens flare
      const L = key.w * 5 * S.flare * hit;
      g.globalAlpha = Math.min(1, 0.4 * S.flare);
      g.drawImage(sp, x - L, G.hitY - r * 0.18, L * 2, r * 0.36);
    }
    g.restore();
  }

  // Particles thrown by a note: bursts at the attack, a trickle while held.
  forParticles(time, life, G, fn) {
    if (!this.take) return;
    const start = this.firstIndex(time - life - this.maxDur);
    for (let i = start; i < this.sorted.length; i++) {
      const n = this.sorted[i];
      if (n.t > time) break;
      if (n.k < G.lo || n.k > G.hi) continue;
      if (n.t + n.d + life < time) continue;
      fn(n, i);
    }
  }

  // Fast sparks that fly up and fall back.
  drawSparks(g, G, S, time) {
    const life = 0.9;
    const grav = 1400 * G.unit;
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.forParticles(time, life, G, (n, i) => {
      const key = G.L.keys[n.k];
      const cx = G.pad + key.x + key.w / 2;
      const c = S.sparkColor || this.keyColor(S, n);
      const cl = css(lightc(rgbOf(c), 0.4));
      const bursts = [n.t];
      for (let tt = n.t + 0.12; tt < Math.min(n.t + n.d, time); tt += 0.12) bursts.push(tt);
      for (let b = Math.max(0, bursts.length - 10); b < bursts.length; b++) {
        const age = time - bursts[b];
        if (age < 0 || age > life) continue;
        const count = b === 0 ? Math.round((4 + (n.v / 127) * 14) * S.sparks) : Math.round(2 * S.sparks);
        for (let j = 0; j < count; j++) {
          const r1 = hash(i * 31 + b, j), r2 = hash(j * 7 + b, i), r3 = hash(i + j * 13, b * 3 + 1);
          const pl = life * (0.45 + r3 * 0.55);
          if (age > pl) continue;
          const ang = -Math.PI / 2 + (r1 - 0.5) * 1.9;
          const sp = (220 + r2 * 520) * G.unit * (b === 0 ? 1 : 0.5);
          const x = cx + (r3 - 0.5) * key.w + Math.cos(ang) * sp * age;
          const y = G.hitY + Math.sin(ang) * sp * age + 0.5 * grav * age * age;
          if (y > G.hitY + 4 * G.unit) continue;
          const fade = 1 - age / pl;
          g.globalAlpha = fade * 0.95;
          g.fillStyle = r1 > 0.6 ? '#fff6e0' : cl;
          const sz = (1.2 + r2 * 2.4) * G.unit * (0.6 + fade * 0.6);
          g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }
    });
    g.restore();
  }

  // Embers: glowing specks that rise slowly and swirl, like a campfire.
  drawEmbers(g, G, S, time) {
    const life = 3.4;
    const u = G.unit;
    const sp = lightSprite(S.emberColor);
    const core = css(lightc(rgbOf(S.emberColor), 0.7));
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.forParticles(time, life, G, (n, i) => {
      const key = G.L.keys[n.k];
      const cx = G.pad + key.x + key.w / 2;
      const held = Math.min(n.d, 3, time - n.t);
      const waves = 1 + Math.floor(held / 0.15);
      for (let b = Math.max(0, waves - 24); b < waves; b++) {
        const t0 = n.t + b * 0.15;
        const age = time - t0;
        if (age < 0 || age > life) continue;
        const count = b === 0 ? Math.round((5 + (n.v / 127) * 14) * S.embers) : Math.round(1.5 * S.embers);
        for (let j = 0; j < count; j++) {
          const r1 = hash(i * 17 + b, j + 3), r2 = hash(j * 11 + b, i + 7), r3 = hash(i + j * 5, b + 11), r4 = hash(i * 3 + j, b * 7 + 2), r5 = hash(j + b * 13, i * 5 + 1);
          const pl = 1.4 + r3 * 2;
          if (age > pl) continue;
          const vy = (50 + r2 * 150) * u;
          const rise = vy * age + 0.5 * 50 * u * age * age;
          const sway = Math.sin(age * (1.4 + r4 * 2.6) + r5 * 6.28) * (8 + r1 * 34) * u * Math.min(1, age * 1.5);
          const x = cx + (r1 - 0.5) * key.w * 1.4 + sway + (r5 - 0.5) * 70 * u * age;
          const y = G.hitY - 3 * u - rise;
          if (y < 0) continue;
          const fade = age / pl;
          const flicker = 0.55 + 0.45 * Math.sin(age * (8 + r1 * 14) + r3 * 20);
          const a = Math.min(1, age * 8) * (1 - fade * fade) * flicker;
          const sz = (1.4 + r2 * 2.6) * u * (1 - fade * 0.5);
          g.globalAlpha = a * 0.8;
          g.drawImage(sp, x - sz * 3.5, y - sz * 3.5, sz * 7, sz * 7);
          g.globalAlpha = a;
          g.fillStyle = core;
          g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }
    });
    g.restore();
  }

  // Dust: fine motes that drift up slowly from the keys and hang in the air.
  drawDust(g, G, S, time) {
    const u = G.unit;
    const life = 4.5;
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.forParticles(time, life, G, (n, i) => {
      const key = G.L.keys[n.k];
      const cx = G.pad + key.x + key.w / 2;
      const age = time - n.t;
      if (age > life) return;
      const tint = css(lightc(rgbOf(this.colorOf(S, n)), 0.6));
      const count = Math.round((8 + (n.v / 127) * 14) * S.dust);
      for (let j = 0; j < count; j++) {
        const r1 = hash(i * 23 + 5, j), r2 = hash(j * 19, i + 3), r3 = hash(i + j * 29, 9), r4 = hash(j * 3 + 1, i * 7);
        const pl = 2 + r3 * 2.5;
        if (age > pl) continue;
        const spread = (r1 - 0.5) * key.w * 6 * (0.3 + Math.min(1, age));
        const x = cx + spread + Math.sin(age * 0.9 + r4 * 6) * 10 * u;
        const y = G.hitY - 6 * u - (20 + r2 * 160) * u * Math.sqrt(age) * 1.6;
        if (y < 0) continue;
        const tw = 0.5 + 0.5 * Math.sin(age * (4 + r4 * 8) + r1 * 9);
        g.globalAlpha = Math.min(1, age * 4) * (1 - age / pl) * (0.4 + tw * 0.6);
        g.fillStyle = r2 > 0.5 ? '#ffffff' : tint;
        const sz = (0.8 + r3 * 1.3) * u;
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    });
    // a little ambient dust everywhere
    const amb = Math.round(70 * S.dust);
    for (let i = 0; i < amb; i++) {
      const r1 = hash(i, 101), r2 = hash(i, 202), r3 = hash(i, 303);
      const per = 9 + r2 * 9;
      const ph = ((time / per + r3) % 1 + 1) % 1;
      const x = r1 * G.W + Math.sin(time * 0.3 + i) * 12 * u;
      const y = G.hitY * (1 - ph);
      g.globalAlpha = Math.sin(ph * Math.PI) * 0.35 * (0.5 + 0.5 * Math.sin(time * 2 + i));
      g.fillStyle = '#ffffff';
      const sz = (0.7 + r2) * u;
      g.fillRect(x, y, sz, sz);
    }
    g.restore();
  }

  // Slow clouds of smoke drifting up behind the notes.
  drawSmoke(g, G, S, time) {
    const u = G.unit;
    const sp = smokeSprite(S.smokeColor);
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 11; i++) {
      const r1 = hash(i, 11), r2 = hash(i, 12), r3 = hash(i, 13), r4 = hash(i, 14);
      const period = 22 + r1 * 16;
      const ph = ((time / period + r2) % 1 + 1) % 1;
      const size = (520 + r3 * 620) * u * (0.75 + ph * 0.5);
      const x = G.W * (r3 * 1.1 - 0.05) + Math.sin(time * 0.05 + i * 2) * G.W * 0.06;
      const y = G.hitY + size * 0.15 - ph * G.hitY * 0.95;
      g.globalAlpha = Math.sin(ph * Math.PI) * 0.5 * Math.min(1.4, S.smoke);
      g.save();
      g.translate(x, y);
      g.rotate(r4 * 6.28 + time * 0.03 * (r1 - 0.5));
      g.drawImage(sp, -size / 2, -size / 2, size, size);
      g.restore();
    }
    g.restore();
  }

  drawKeyboard(g, G, S, sounding, matte) {
    const { W, kh, pad, L, hitY, unit: u } = G;
    const kind = S.keyboard;
    g.fillStyle = matte ? '#fff' : kind === 'white' ? '#1a1a1e' : kind === 'ebony' ? '#0c0b0f' : '#121015';
    g.fillRect(0, hitY, W, kh);
    const top = hitY + Math.max(2, 3 * u);
    const wh = kh - (top - hitY) - 1 * u;
    const bh = wh * 0.62;
    const lit = (n) => rgbOf(this.keyColor(S, n));
    const PAL = {
      white: ['#c9cbd0', '#eceef2', '#ffffff'],
      classic: ['#d9d2bf', '#ece5d3', '#f4efe2'],
      ebony: ['#3b3742', '#2e2b35', '#25222b'],
    }[kind] || ['#c9cbd0', '#eceef2', '#ffffff'];
    for (let k = G.lo; k <= G.hi; k++) {
      if (isBlack(k)) continue;
      const key = L.keys[k];
      const n = sounding.get(k);
      const press = n ? 2 * u : 0;
      if (matte) g.fillStyle = '#fff';
      else if (n) {
        const c = lit(n);
        const gr = g.createLinearGradient(0, top, 0, top + wh);
        gr.addColorStop(0, css(lightc(c, 0.55))); gr.addColorStop(0.3, css(c)); gr.addColorStop(1, css(darkc(c, 0.12)));
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(0, top, 0, top + wh);
        gr.addColorStop(0, PAL[0]); gr.addColorStop(0.1, PAL[1]); gr.addColorStop(1, PAL[2]);
        g.fillStyle = gr;
      }
      roundRect(g, pad + key.x + u * 0.6, top + press, key.w - u * 1.2, wh - press, 0, 0, 3 * u, 3 * u);
      g.fill();
    }
    for (let k = G.lo; k <= G.hi; k++) {
      if (!isBlack(k)) continue;
      const key = L.keys[k];
      const n = sounding.get(k);
      const press = n ? 1.5 * u : 0;
      if (matte) g.fillStyle = '#fff';
      else if (n) {
        const c = lit(n);
        const gr = g.createLinearGradient(0, top, 0, top + bh);
        gr.addColorStop(0, css(lightc(c, 0.4))); gr.addColorStop(1, css(darkc(c, 0.2)));
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(0, top, 0, top + bh);
        gr.addColorStop(0, '#2b2830'); gr.addColorStop(0.85, '#121014'); gr.addColorStop(1, '#3a3640');
        g.fillStyle = gr;
      }
      roundRect(g, pad + key.x, top + press, key.w, bh - press, 0, 0, 2 * u, 2 * u);
      g.fill();
    }
    if (matte) return;
    // lit keys glow through the keyboard
    if (S.keyGlow > 0 && sounding.size) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const n of sounding.values()) {
        const key = L.keys[n.k];
        const x = pad + key.x + key.w / 2;
        const sp = lightSprite(this.keyColor(S, n));
        g.globalAlpha = 0.55 * S.keyGlow;
        g.drawImage(sp, x - key.w * 1.6, top - kh * 0.1, key.w * 3.2, kh * 0.9);
      }
      g.restore();
    }
    // shade where the keys meet the stage
    const sh = g.createLinearGradient(0, top, 0, top + 10 * u);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(0, top, W, 10 * u);
  }
}

export function roundRect(g, x, y, w, h, tl, tr = tl, br = tl, bl = tl) {
  const m = Math.max(0, Math.min(w, h) / 2);
  tl = Math.max(0, Math.min(tl, m)); tr = Math.max(0, Math.min(tr, m)); br = Math.max(0, Math.min(br, m)); bl = Math.max(0, Math.min(bl, m));
  g.beginPath();
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  g.arcTo(x + w, y, x + w, y + tr, tr);
  g.lineTo(x + w, y + h - br);
  g.arcTo(x + w, y + h, x + w - br, y + h, br);
  g.lineTo(x + bl, y + h);
  g.arcTo(x, y + h, x, y + h - bl, bl);
  g.lineTo(x, y + tl);
  g.arcTo(x, y, x + tl, y, tl);
  g.closePath();
}

// A short made-up piece used to preview styles when no take is open.
export function demoTake() {
  const notes = [];
  const prog = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]];
  for (let bar = 0; bar < 8; bar++) {
    const ch = prog[bar % 4];
    const t0 = bar * 2;
    notes.push({ k: ch[0] - 12, v: 90, t: t0, d: 1.9, h: 0 });
    notes.push({ k: ch[0], v: 70, t: t0 + 0.5, d: 1.3, h: 0 });
    notes.push({ k: ch[1], v: 70, t: t0 + 1, d: 0.9, h: 0 });
    const mel = [ch[2] + 12, ch[2] + 7, ch[2] + 9, ch[2] + 4];
    mel.forEach((k, j) => notes.push({ k, v: 80 + j * 8, t: t0 + j * 0.5, d: 0.45, h: 1 }));
  }
  return { id: 'demo', name: 'demo', notes, pedal: [], duration: 16 };
}
