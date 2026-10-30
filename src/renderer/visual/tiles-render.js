// Falling notes: looks, presets and the 2D layers of a frame.
import { layout, isBlack, LOW, HIGH, hexToRgb } from '../core/keys.js';

export const DEFAULT_VISUAL = {
  preset: 'fire-ice',
  colorMode: 'hands',   // hands | pitch (low = lh, high = rh) | video (colours read from the video)
  lh: '#5b97ff',
  rh: '#86b6ff',
  keyLh: '#ff9b3d',     // lit key colours ('' = same as notes)
  keyRh: '#ffb04d',
  heat: 0.85,           // notes take on heatColor as they near the keys
  heatColor: '#ff8c42',
  bg: {
    type: 'gradient', a: '#1b1f2a', b: '#07080b', angle: 180, image: '', video: '', blur: 0, dim: 0.35,
    // photo / video: the part of the video used (s), framing and colour
    trimStart: 0, trimEnd: 0, zoom: 1, panX: 0, panY: 0, flip: false, bright: 1, contrast: 1, saturate: 1,
  },
  noteStyle: 'capsule', // capsule | neon | liquid | soft | glass | pill | flat
  opacity: 1,           // see-through notes: 1 solid .. 0.15 almost clear
  refract: 0.7,         // how strongly liquid-glass notes bend the background
  core: 0.4,            // white-hot core inside capsule / neon notes
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
    colorMode: 'hands',
    lh: '#2f8cff', rh: '#38c6ff', keyLh: '#4fb4ff', keyRh: '#6fd0ff', heat: 0, noteStyle: 'neon', core: 1,
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
  { id: 'liquid', style: {
    lh: '#9fd8ff', rh: '#d2c2ff', keyLh: '#7cc8ff', keyRh: '#b9a4ff', heat: 0, noteStyle: 'liquid', core: 0.4, opacity: 1, refract: 0.9,
    glow: 0.55, sparks: 0.25, sparkColor: '#ffffff', embers: 0, dust: 0.6, smoke: 0.9, smokeColor: '#7f93b0', beams: 0.2, flare: 0.6,
    line: 'laser', lineColor: '#bfe3ff', lineGlow: 0.8, keyboard: 'white', vignette: 0.45, tilt: 0, fog: 0.25,
    bg: { type: 'gradient', a: '#22324a', b: '#070a10', angle: 180 } } },
  { id: 'flame', style: {
    colorMode: 'pitch', lh: '#e3261c', rh: '#ffd61f', keyLh: '', keyRh: '', heat: 0, noteStyle: 'capsule', core: 0.55, opacity: 1,
    glow: 1, sparks: 0.8, sparkColor: '', embers: 1.2, emberColor: '', dust: 0.3, smoke: 0, beams: 0.1, flare: 0.9,
    line: 'laser', lineColor: '#2f6bff', lineGlow: 0.9, keyboard: 'white', vignette: 0.2, tilt: 0, fog: 0.15,
    bg: { type: 'solid', a: '#000000', b: '#000000' } } },
  { id: 'classic', style: {
    lh: '#7fa6d9', rh: '#e8b86a', keyLh: '', keyRh: '', heat: 0, noteStyle: 'soft', core: 0.4,
    glow: 0.7, sparks: 0.6, sparkColor: '', embers: 0, dust: 0, smoke: 0, beams: 0.6, flare: 0.5,
    line: 'felt', lineGlow: 0.6, keyboard: 'classic', vignette: 0.2, tilt: 0, fog: 0, guides: true,
    bg: { type: 'gradient', a: '#141220', b: '#07070a', angle: 180 } } },
];

// Colour along the keyboard: low notes take lh, high notes rh, blended in between.
const pitchCache = new Map();
export function pitchColour(S, k) {
  const key = `${S.lh}|${S.rh}|${k}`;
  let c = pitchCache.get(key);
  if (!c) {
    const t = Math.max(0, Math.min(1, (k - 30) / 66));
    const a = rgbOf(S.lh), b = rgbOf(S.rh);
    c = '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
    pitchCache.set(key, c);
  }
  return c;
}

export function applyPreset(style, id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  const base = { ...DEFAULT_VISUAL, ...p.style };
  const keep = { range: style.range, noteNames: style.noteNames, velocityShade: style.velocityShade, speed: style.speed, keyHeight: style.keyHeight };
  // your own photo or video and how you framed it stay; the preset sets the rest
  const own = {};
  for (const k of ['image', 'video', 'trimStart', 'trimEnd', 'zoom', 'panX', 'panY', 'flip', 'bright', 'contrast', 'saturate']) if (style.bg?.[k] !== undefined) own[k] = style.bg[k];
  return { ...base, ...keep, preset: p.id, bg: { ...DEFAULT_VISUAL.bg, ...(p.style.bg || {}), ...own } };
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
export function rgbOf(c) {
  let v = rgbCache.get(c);
  if (!v) { v = hexToRgb(c); rgbCache.set(c, v); }
  return v;
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [255, 255, 255];
const lightc = (c, t) => mixc(c, WHITE, t);
const darkc = (c, t) => [c[0] * (1 - t), c[1] * (1 - t), c[2] * (1 - t)];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// small deterministic random from integers
function hash(a, b) {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
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

export function fullStyle(style) {
  return { ...DEFAULT_VISUAL, ...style, bg: { ...DEFAULT_VISUAL.bg, ...(style.bg || {}) } };
}

// Particle instance: x, y, width, height, angle, r, g, b, a (colour 0..1, may exceed 1 for heat)
export const PSTRIDE = 9;

// Draws the picture in layers for the GPU composer (see gl-composer.js):
// background, the scene (notes + keyboard), an emissive layer that feeds the
// bloom, and particle / hit-line data. Everything depends only on the time,
// so a live preview and an exported frame are identical.
export class TilesRenderer {
  constructor() {
    this.media = { image: null, video: null };
    this.pdata = new Float32Array(PSTRIDE * 4096);
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

  // Everything one frame needs: geometry, visible and sounding notes.
  frame(W, H, time, style) {
    const S = fullStyle(style);
    const G = this.geometry(W, H, S);
    const visible = [];
    const sounding = new Map();
    if (this.take) {
      const until = time + S.speed + 0.05;
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
    return { S, G, visible, sounding, time };
  }

  // Plain 2D picture without GPU effects; with matte=true, a white-on-black
  // mask of the notes and keyboard (used to lay notes over a background video).
  draw(g, W, H, time, style, { matte = false } = {}) {
    const F = this.frame(W, H, time, style);
    g.save();
    if (matte) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); } else this.drawBackground(g, F);
    this.drawScene(g, F, matte);
    g.restore();
    return F.G;
  }

  drawBackground(g, { G, S }) {
    const { W, H } = G;
    const bg = S.bg;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if ((bg.type === 'image' && this.media.image) || (bg.type === 'video' && this.media.video)) {
      const src = bg.type === 'image' ? this.media.image : this.media.video;
      const sw = src.videoWidth || src.naturalWidth || src.width;
      const sh = src.videoHeight || src.naturalHeight || src.height;
      if (sw && sh) {
        // cover the frame, then zoom in and move the visible part (pan -1..1)
        const sc = Math.max(W / sw, H / sh) * (bg.blur > 0 ? 1.06 : 1) * Math.max(1, bg.zoom || 1);
        const dw = sw * sc, dh = sh * sc;
        const x = -(dw - W) * (0.5 + (bg.panX || 0) * 0.5);
        const y = -(dh - H) * (0.5 + (bg.panY || 0) * 0.5);
        const f = [];
        if (bg.blur > 0) f.push(`blur(${bg.blur * G.unit * 30}px)`);
        if ((bg.bright ?? 1) !== 1) f.push(`brightness(${bg.bright})`);
        if ((bg.contrast ?? 1) !== 1) f.push(`contrast(${bg.contrast})`);
        if ((bg.saturate ?? 1) !== 1) f.push(`saturate(${bg.saturate})`);
        g.filter = f.length ? f.join(' ') : 'none';
        g.save();
        if (bg.flip) { g.translate(W, 0); g.scale(-1, 1); }
        g.drawImage(src, x, y, dw, dh);
        g.restore();
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

  // Notes, beams and keyboard on a transparent layer.
  drawScene(g, F, matte = false) {
    const { G, S } = F;
    if (S.guides && !matte) this.drawGuides(g, G);
    this.drawNotes(g, F, matte);
    this.drawKeyboard(g, F, matte);
    if (!matte && S.line === 'felt') {
      g.fillStyle = '#8f2723';
      g.fillRect(0, G.hitY, G.W, Math.max(2, 3 * G.unit));
    }
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

  colorOf(S, n) {
    if (S.colorMode === 'video' && n.c) return n.c;
    if (S.colorMode === 'pitch') return pitchColour(S, n.k);
    return n.h === 0 ? S.lh : S.rh;
  }

  keyColor(S, n) { return (n.h === 0 ? S.keyLh : S.keyRh) || this.colorOf(S, n); }

  // Colour of a note at height fy: hand colour, warming up near the keys.
  tint(G, S, base, fy) {
    if (S.heat <= 0) return base;
    const c = 1 - clamp01(fy / G.hitY);
    return mixc(base, rgbOf(S.heatColor), S.heat * Math.pow(c, 1.6));
  }

  fogAt(G, S, fy) { return 1 - S.fog * smooth(0.45, 1.0, fy / G.hitY); }

  // Calls fn for each visible note part, white-key notes first.
  eachNote(F, fn) {
    const { G, S, visible, time } = F;
    const u = G.unit;
    for (const pass of [false, true]) {
      for (const n of visible) {
        const b = this.noteBox(G, S, n, time);
        if (b.black !== pass) continue;
        if (b.fy0 > G.hitY * 1.02 || b.fy1 < -4 * u) continue;
        const fy0 = Math.max(b.fy0, -6 * u);
        const fy1 = Math.min(b.fy1, G.hitY * 1.05);
        const playing = n.t <= time && n.t + n.d >= time;
        fn(n, b, fy0, fy1, playing);
      }
    }
  }

  noteRadius(S, G, b) {
    return S.noteStyle === 'flat' ? 3 * G.unit : ['pill', 'capsule', 'neon', 'liquid'].includes(S.noteStyle) ? b.w / 2 : Math.min(b.w * 0.38, 10 * G.unit);
  }

  drawNotes(g, F, matte) {
    const { G, S } = F;
    const u = G.unit;
    g.save();
    g.beginPath(); g.rect(0, 0, G.W, G.hitY); g.clip();
    this.eachNote(F, (n, b, fy0, fy1, playing) => {
      const rad = this.noteRadius(S, G, b);
      if (matte) { g.fillStyle = '#fff'; this.shape(g, G, b.x, fy0, b.w, fy1, rad); g.fill(); return; }
      const shade = S.velocityShade ? 0.62 + (n.v / 127) * 0.38 : 1;
      let base = rgbOf(this.colorOf(S, n));
      if (playing) base = lightc(base, 0.22);
      else if (shade < 1) base = darkc(base, (1 - shade) * 0.75);
      const c0 = this.tint(G, S, base, fy0), c1 = this.tint(G, S, base, fy1);
      const a0 = this.fogAt(G, S, fy0) * S.opacity, a1 = this.fogAt(G, S, fy1) * S.opacity;
      const p0 = this.proj(G, b.x + b.w / 2, fy0), p1 = this.proj(G, b.x + b.w / 2, fy1);
      const vgrad = (fn) => { const gr = g.createLinearGradient(0, p0[1], 0, p1[1]); fn(gr); return gr; };
      // left/right edges at mid height, for the round "tube" shading
      const pm = this.proj(G, b.x, (fy0 + fy1) / 2), pr = this.proj(G, b.x + b.w, (fy0 + fy1) / 2);
      const tube = (hi, lo) => {
        const gr = g.createLinearGradient(pm[0], 0, pr[0], 0);
        gr.addColorStop(0, `rgba(0,0,0,${lo})`);
        gr.addColorStop(0.3, `rgba(255,255,255,${hi})`);
        gr.addColorStop(0.55, 'rgba(255,255,255,0)');
        gr.addColorStop(1, `rgba(0,0,0,${lo * 1.2})`);
        return gr;
      };
      this.shape(g, G, b.x, fy0, b.w, fy1, rad);
      switch (S.noteStyle) {
        case 'capsule': {
          // a glass tube full of light: tinted body, round shading, bright core
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(c0, 0.96 * a0)); gr.addColorStop(1, css(c1, 0.88 * a1)); });
          g.fill();
          g.fillStyle = tube(0.2 * a0, 0.3);
          g.fill();
          g.lineWidth = Math.max(1, 1.2 * u);
          g.strokeStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.45), 0.9 * a0)); gr.addColorStop(1, css(lightc(c1, 0.35), 0.7 * a1)); });
          g.stroke();
          const cw = b.w * 0.3;
          const inset = Math.min(b.w * 0.26, (fy1 - fy0) * 0.2);
          if (fy1 - fy0 > inset * 2 + 2 * u) {
            const core = S.core * (playing ? 1.3 : 0.85);
            g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.7), Math.min(1, core * a0))); gr.addColorStop(1, css(lightc(c1, 0.55), Math.min(1, core * 0.75 * a1))); });
            this.shape(g, G, b.x + (b.w - cw) / 2 - b.w * 0.06, fy0 + inset, cw, fy1 - inset, cw / 2); g.fill();
          }
          break;
        }
        case 'neon': {
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(c0, (playing ? 0.5 : 0.3) * a0)); gr.addColorStop(1, css(c1, 0.22 * a1)); });
          g.fill();
          const iw = b.w * 0.5;
          const inset = Math.min(b.w * 0.25, (fy1 - fy0) * 0.25);
          if (fy1 - fy0 > inset * 2 + 2 * u) {
            g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.85), Math.min(1, S.core * 0.95 * a0))); gr.addColorStop(1, css(lightc(c1, 0.85), S.core * 0.6 * a1)); });
            this.shape(g, G, b.x + (b.w - iw) / 2, fy0 + inset, iw, fy1 - inset, iw / 2); g.fill();
          }
          this.shape(g, G, b.x + 1.5 * u, fy0 + 1.5 * u, b.w - 3 * u, fy1 - 1.5 * u, rad - 1.5 * u);
          g.lineWidth = Math.max(1.5, 3.4 * u);
          g.strokeStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.5), a0)); gr.addColorStop(1, css(lightc(c1, 0.45), a1)); });
          g.stroke();
          g.lineWidth = Math.max(1, 1.2 * u);
          g.strokeStyle = `rgba(255,255,255,${0.9 * a0})`;
          g.stroke();
          break;
        }
        case 'liquid': {
          // liquid glass: the GPU bends the background through the note (see
          // drawGlass); here only a faint tint, round shading, rim and highlight
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(c0, 0.2 * a0)); gr.addColorStop(1, css(c1, 0.1 * a1)); });
          g.fill();
          g.fillStyle = tube(0.18 * a0, 0.14);
          g.fill();
          g.lineWidth = Math.max(1, 1.5 * u);
          g.strokeStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.75), 0.9 * a0)); gr.addColorStop(1, css(lightc(c1, 0.6), 0.55 * a1)); });
          g.stroke();
          const sw = Math.max(1.5 * u, b.w * 0.11);
          const inset = Math.min(b.w * 0.3, (fy1 - fy0) * 0.18);
          if (fy1 - fy0 > inset * 2 + 2 * u) {
            g.fillStyle = vgrad((gr) => { gr.addColorStop(0, `rgba(255,255,255,${0.75 * a0})`); gr.addColorStop(1, `rgba(255,255,255,${0.2 * a1})`); });
            this.shape(g, G, b.x + b.w * 0.2, fy0 + inset, sw, fy1 - inset, sw / 2); g.fill();
          }
          break;
        }
        case 'glass': {
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.15), 0.85 * a0)); gr.addColorStop(1, css(darkc(c1, 0.15), 0.7 * a1)); });
          g.fill();
          g.fillStyle = tube(0.45 * a0, 0.2);
          g.fill();
          break;
        }
        case 'flat':
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(c0, a0)); gr.addColorStop(1, css(c1, a1)); });
          g.fill();
          break;
        case 'pill':
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.1), a0)); gr.addColorStop(1, css(c1, a1)); });
          g.fill();
          g.fillStyle = tube(0.25 * a0, 0.15);
          g.fill();
          break;
        default: { // soft
          g.fillStyle = vgrad((gr) => { gr.addColorStop(0, css(lightc(c0, 0.12), a0)); gr.addColorStop(1, css(darkc(c1, 0.18), a1)); });
          g.fill();
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
    });
    g.restore();
  }

  // What glows: notes, the keys being played and the light columns above them.
  drawEmissive(g, F) {
    const { G, S } = F;
    if (S.beams > 0) this.drawBeams(g, F);
    g.save();
    g.beginPath(); g.rect(0, 0, G.W, G.hitY); g.clip();
    this.eachNote(F, (n, b, fy0, fy1, playing) => {
      const mid = (fy0 + fy1) / 2;
      const c0 = this.tint(G, S, rgbOf(this.colorOf(S, n)), fy0), c1 = this.tint(G, S, rgbOf(this.colorOf(S, n)), fy1);
      const vel = 0.55 + (n.v / 127) * 0.45;
      const kind = S.noteStyle === 'neon' ? 1.6 : S.noteStyle === 'liquid' ? 0.35 : 1;
      const a = (playing ? 0.85 : 0.42) * kind * vel * this.fogAt(G, S, mid) * Math.max(0.35, S.opacity);
      const p0 = this.proj(G, b.x, fy0), p1 = this.proj(G, b.x, fy1);
      const gr = g.createLinearGradient(0, p0[1], 0, p1[1]);
      gr.addColorStop(0, css(lightc(c0, playing ? 0.2 : 0), a));
      gr.addColorStop(1, css(c1, a * 0.8));
      g.fillStyle = gr;
      if (S.noteStyle === 'neon') {
        this.shape(g, G, b.x + 1.5 * G.unit, fy0 + 1.5 * G.unit, b.w - 3 * G.unit, fy1 - 1.5 * G.unit, b.w / 2);
        g.lineWidth = 5 * G.unit;
        g.strokeStyle = gr;
        g.stroke();
      } else {
        this.shape(g, G, b.x, fy0, b.w, fy1, this.noteRadius(S, G, b));
        g.fill();
      }
    });
    g.restore();
    // lit keys glow up through the keyboard
    const top = G.hitY + 3 * G.unit;
    for (const n of F.sounding.values()) {
      const key = G.L.keys[n.k];
      const c = rgbOf(this.keyColor(S, n));
      const h = key.black ? G.kh * 0.6 : G.kh;
      const gr = g.createLinearGradient(0, top, 0, top + h);
      gr.addColorStop(0, css(lightc(c, 0.4), 0.9 * S.keyGlow));
      gr.addColorStop(1, css(c, 0.25 * S.keyGlow));
      g.fillStyle = gr;
      g.fillRect(G.pad + key.x + 1, top, key.w - 2, h);
    }
  }

  // Liquid glass: a mask whose red channel is the sideways slope of each note
  // (left edge 0, middle 0.5, right edge 1); the GPU bends the background by it.
  drawGlass(g, F) {
    const { G, S } = F;
    g.save();
    g.beginPath(); g.rect(0, 0, G.W, G.hitY); g.clip();
    this.eachNote(F, (n, b, fy0, fy1) => {
      const pm = this.proj(G, b.x, (fy0 + fy1) / 2), pr = this.proj(G, b.x + b.w, (fy0 + fy1) / 2);
      const gr = g.createLinearGradient(pm[0], 0, pr[0], 0);
      const a = this.fogAt(G, S, (fy0 + fy1) / 2) * Math.max(0.3, S.opacity);
      gr.addColorStop(0, `rgba(0,128,0,${a})`);
      gr.addColorStop(0.5, `rgba(128,128,0,${a})`);
      gr.addColorStop(1, `rgba(255,128,0,${a})`);
      g.fillStyle = gr;
      this.shape(g, G, b.x, fy0, b.w, fy1, this.noteRadius(S, G, b));
      g.fill();
    });
    g.restore();
  }

  // Light columns rising from keys that are sounding.
  drawBeams(g, F) {
    const { G, S, sounding } = F;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const n of sounding.values()) {
      const key = G.L.keys[n.k];
      const x = G.pad + key.x;
      const hgt = G.hitY * 0.5 * S.beams * (0.6 + (n.v / 127) * 0.6);
      const c = rgbOf(this.keyColor(S, n));
      const p0 = this.proj(G, x, 0), p1 = this.proj(G, x, hgt);
      const gr = g.createLinearGradient(0, p0[1], 0, p1[1]);
      gr.addColorStop(0, css(c, 0.9 * Math.min(1, S.beams)));
      gr.addColorStop(1, css(c, 0));
      g.fillStyle = gr;
      this.shape(g, G, x - key.w * 0.25, 0, key.w * 1.5, hgt, 0);
      g.fill();
    }
    g.restore();
  }

  drawKeyboard(g, F, matte) {
    const { G, S, sounding } = F;
    const { W, kh, pad, L, hitY, unit: u } = G;
    const kind = S.keyboard;
    g.fillStyle = matte ? '#fff' : kind === 'white' ? '#141417' : kind === 'ebony' ? '#0c0b0f' : '#121015';
    g.fillRect(0, hitY, W, kh);
    const top = hitY + Math.max(2, 3 * u);
    const wh = kh - (top - hitY) - 1 * u;
    const bh = wh * 0.62;
    const lit = (n) => rgbOf(this.keyColor(S, n));
    const PAL = {
      white: ['#bfc1c7', '#e9ebef', '#fdfdff'],
      classic: ['#d9d2bf', '#ece5d3', '#f4efe2'],
      ebony: ['#3b3742', '#2e2b35', '#25222b'],
    }[kind] || ['#bfc1c7', '#e9ebef', '#fdfdff'];
    for (let k = G.lo; k <= G.hi; k++) {
      if (isBlack(k)) continue;
      const key = L.keys[k];
      const n = sounding.get(k);
      const press = n ? 2 * u : 0;
      if (matte) g.fillStyle = '#fff';
      else if (n) {
        const c = lit(n);
        const gr = g.createLinearGradient(0, top, 0, top + wh);
        gr.addColorStop(0, css(lightc(c, 0.6))); gr.addColorStop(0.25, css(lightc(c, 0.1))); gr.addColorStop(1, css(darkc(c, 0.15)));
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(0, top, 0, top + wh);
        gr.addColorStop(0, PAL[0]); gr.addColorStop(0.08, PAL[1]); gr.addColorStop(0.92, PAL[2]); gr.addColorStop(1, PAL[0]);
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
      const x = pad + key.x, y = top + press, w = key.w, h = bh - press;
      if (matte) { g.fillStyle = '#fff'; roundRect(g, x, y, w, h, 0, 0, 2 * u, 2 * u); g.fill(); continue; }
      if (n) {
        const c = lit(n);
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, css(lightc(c, 0.45))); gr.addColorStop(1, css(darkc(c, 0.25)));
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#2c2930'); gr.addColorStop(0.8, '#0f0e12'); gr.addColorStop(1, '#3d3944');
        g.fillStyle = gr;
      }
      roundRect(g, x, y, w, h, 0, 0, 2 * u, 2 * u);
      g.fill();
      // glossy top bevel of the black key
      if (!n) {
        const gl = g.createLinearGradient(x, 0, x + w, 0);
        gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.13)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        g.fillRect(x + w * 0.2, y + h * 0.04, w * 0.6, h * 0.8);
      }
    }
    if (matte) return;
    // shade where the keys meet the stage
    const sh = g.createLinearGradient(0, top, 0, top + 12 * u);
    sh.addColorStop(0, 'rgba(0,0,0,0.4)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(0, top, W, 12 * u);
  }

  // Strength of the hit-line light along x (0..~2), sampled at n points.
  boost(F, n = 256) {
    const { G, S, sounding, time } = F;
    const out = new Float32Array(n);
    const pts = [];
    for (const nt of sounding.values()) {
      const key = G.L.keys[nt.k];
      const age = time - nt.t;
      pts.push({ x: (G.pad + key.x + key.w / 2) / G.W, w: (key.w * 1.4) / G.W, a: 0.75 + 1.1 * Math.exp(-age * 5) * (0.4 + nt.v / 127) });
    }
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n;
      let s = 0;
      for (const p of pts) { const d = (x - p.x) / p.w; if (d > -3 && d < 3) s += p.a * Math.exp(-d * d); }
      out[i] = Math.min(2.5, s) * S.lineGlow;
    }
    return out;
  }

  // Particles of the frame as instances for the GPU: flares, sparks, embers, dust.
  particles(F) {
    const { G, S, sounding, time } = F;
    const u = G.unit;
    let d = this.pdata;
    let n = 0;
    const push = (x, y, w, h, ang, c, a) => {
      if (a <= 0.003) return;
      if ((n + 1) * PSTRIDE > d.length) { const nd = new Float32Array(d.length * 2); nd.set(d); d = this.pdata = nd; }
      const o = n * PSTRIDE;
      d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h; d[o + 4] = ang;
      d[o + 5] = c[0] / 255; d[o + 6] = c[1] / 255; d[o + 7] = c[2] / 255; d[o + 8] = a;
      n++;
    };
    // flares where notes meet the keys: a round glow and a lens streak
    if (S.flare > 0) {
      for (const nt of sounding.values()) {
        const key = G.L.keys[nt.k];
        const x = G.pad + key.x + key.w / 2;
        const age = time - nt.t;
        const hit = 1 + 1.8 * Math.exp(-age * 7);
        const col = rgbOf(S.line === 'laser' && S.sparkColor ? S.sparkColor : this.keyColor(S, nt));
        const r = key.w * 1.1 * S.flare * hit * (0.7 + (nt.v / 127) * 0.5);
        push(x, G.hitY, r * 2, r * 1.4, 0, col, 0.5 * Math.min(1.2, S.flare));
        push(x, G.hitY, key.w * 8 * S.flare * hit, r * 0.22, 0, lightc(col, 0.3), 0.35 * Math.min(1.2, S.flare));
      }
    }
    const each = (life, fn) => {
      if (!this.take) return;
      const start = this.firstIndex(time - life - this.maxDur);
      for (let i = start; i < this.sorted.length; i++) {
        const nt = this.sorted[i];
        if (nt.t > time) break;
        if (nt.k < G.lo || nt.k > G.hi) continue;
        if (nt.t + nt.d + life < time) continue;
        fn(nt, i, G.pad + G.L.keys[nt.k].x + G.L.keys[nt.k].w / 2, G.L.keys[nt.k].w);
      }
    };
    // sparks: fast streaks thrown up from the attack, pulled back by gravity
    if (S.sparks > 0) {
      const life = 0.9, grav = 1500 * u;
      each(life, (nt, i, cx, kw) => {
        const age = time - nt.t;
        if (age > life) return;
        // no spark colour set: each note throws sparks of its own colour
        const sc = rgbOf(S.sparkColor || this.keyColor(S, nt));
        const count = Math.round((6 + (nt.v / 127) * 22) * S.sparks);
        for (let j = 0; j < count; j++) {
          const r1 = hash(i * 31, j), r2 = hash(j * 7, i), r3 = hash(i + j * 13, 1);
          const pl = life * (0.4 + r3 * 0.6);
          if (age > pl) continue;
          const ang = -Math.PI / 2 + (r1 - 0.5) * 1.6;
          const sp = (300 + r2 * 700) * u;
          const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp + grav * age;
          const x = cx + (r3 - 0.5) * kw + Math.cos(ang) * sp * age;
          const y = G.hitY + Math.sin(ang) * sp * age + 0.5 * grav * age * age;
          if (y > G.hitY + 2 * u) continue;
          const fade = 1 - age / pl;
          const speed = Math.hypot(vx, vy);
          push(x, y, Math.max(3 * u, speed * 0.022), (1.6 + r2 * 1.6) * u, Math.atan2(vy, vx), mixc(sc, WHITE, fade * 0.6), fade);
        }
      });
    }
    // embers: hot specks that rise, swirl and cool from white to deep red
    if (S.embers > 0) {
      const life = 3.6;
      each(life, (nt, i, cx, kw) => {
        const ec = rgbOf(S.emberColor || this.keyColor(S, nt));
        const deep = darkc(mixc(ec, [255, 40, 10], 0.5), 0.35);
        const held = Math.min(nt.d, 3, time - nt.t);
        const waves = 1 + Math.floor(held / 0.12);
        for (let b = Math.max(0, waves - 30); b < waves; b++) {
          const age = time - (nt.t + b * 0.12);
          if (age < 0 || age > life) continue;
          const count = b === 0 ? Math.round((10 + (nt.v / 127) * 26) * S.embers) : Math.round(2.5 * S.embers);
          for (let j = 0; j < count; j++) {
            const r1 = hash(i * 17 + b, j + 3), r2 = hash(j * 11 + b, i + 7), r3 = hash(i + j * 5, b + 11), r4 = hash(i * 3 + j, b * 7 + 2), r5 = hash(j + b * 13, i * 5 + 1);
            const pl = 1.2 + r3 * 2.4;
            if (age > pl) continue;
            const vy = (40 + r2 * 170) * u;
            const rise = vy * age + 0.5 * 60 * u * age * age;
            const swirl = Math.sin(age * (1.2 + r4 * 2.8) + r5 * 6.28) * (10 + r1 * 40) * u * Math.min(1, age * 1.4);
            const x = cx + (r1 - 0.5) * kw * 1.6 + swirl + (r5 - 0.5) * 80 * u * age;
            const y = G.hitY - 4 * u - rise;
            if (y < -10) continue;
            const f = age / pl;
            const flicker = 0.6 + 0.4 * Math.sin(age * (9 + r1 * 16) + r3 * 20);
            const a = Math.min(1, age * 10) * (1 - f * f) * flicker;
            const col = f < 0.25 ? mixc([255, 250, 225], ec, f / 0.25) : mixc(ec, deep, (f - 0.25) / 0.75);
            const sz = (3.2 + r2 * 5.5) * u * (1 - f * 0.45);
            push(x, y, sz, sz, 0, col, a);
          }
        }
      });
    }
    // dust: fine motes drifting up from the keys, plus a little in the air
    if (S.dust > 0) {
      const life = 4.5;
      each(life, (nt, i, cx, kw) => {
        const age = time - nt.t;
        if (age > life) return;
        const tint = lightc(rgbOf(this.colorOf(S, nt)), 0.6);
        const count = Math.round((10 + (nt.v / 127) * 18) * S.dust);
        for (let j = 0; j < count; j++) {
          const r1 = hash(i * 23 + 5, j), r2 = hash(j * 19, i + 3), r3 = hash(i + j * 29, 9), r4 = hash(j * 3 + 1, i * 7);
          const pl = 2 + r3 * 2.5;
          if (age > pl) continue;
          const x = cx + (r1 - 0.5) * kw * 7 * (0.3 + Math.min(1, age)) + Math.sin(age * 0.9 + r4 * 6) * 10 * u;
          const y = G.hitY - 6 * u - (20 + r2 * 170) * u * Math.sqrt(age) * 1.6;
          if (y < 0) continue;
          const tw = 0.5 + 0.5 * Math.sin(age * (4 + r4 * 8) + r1 * 9);
          const sz = (1.3 + r3 * 1.8) * u;
          push(x, y, sz, sz, 0, r2 > 0.5 ? WHITE : tint, Math.min(1, age * 4) * (1 - age / pl) * (0.35 + tw * 0.65));
        }
      });
      const amb = Math.round(90 * S.dust);
      for (let i = 0; i < amb; i++) {
        const r1 = hash(i, 101), r2 = hash(i, 202), r3 = hash(i, 303);
        const per = 9 + r2 * 9;
        const ph = ((time / per + r3) % 1 + 1) % 1;
        const sz = (1 + r2 * 1.4) * u;
        push(r1 * G.W + Math.sin(time * 0.3 + i) * 12 * u, G.hitY * (1 - ph), sz, sz, 0, WHITE, Math.sin(ph * Math.PI) * 0.3 * (0.5 + 0.5 * Math.sin(time * 2 + i)));
      }
    }
    return { data: d, count: n };
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
