// Falling-notes renderer. Stateless: draw(time) depends only on the take, the
// style and the time, so a live preview and an exported frame are identical.
import { layout, isBlack, LOW, HIGH, hexToRgb } from '../core/keys.js';

export const DEFAULT_VISUAL = {
  lh: '#7fa6d9',
  rh: '#e8b86a',
  keyLh: '',            // lit key colours ('' = same as notes)
  keyRh: '',
  bg: { type: 'gradient', a: '#141220', b: '#07070a', angle: 180, image: '', video: '', blur: 0, dim: 0.35 },
  noteStyle: 'soft',    // soft | glass | neon | flat | pill
  speed: 3.2,           // seconds a note takes to fall to the keys
  glow: 0.7,
  sparks: 0.6,
  smoke: 0,
  beams: 0.6,
  brightness: 1,
  range: 'auto',        // auto | full
  guides: true,
  keyboard: 'classic',  // classic | ebony
  velocityShade: true,
  noteNames: false,
};

export const PALETTES = [
  { id: 'brass', lh: '#7fa6d9', rh: '#e8b86a' },
  { id: 'aurora', lh: '#4fd1c5', rh: '#b794f4' },
  { id: 'ember', lh: '#f6ad55', rh: '#fc8181' },
  { id: 'ice', lh: '#90cdf4', rh: '#e2e8f0' },
  { id: 'sakura', lh: '#f8b4d9', rh: '#fbd38d' },
  { id: 'forest', lh: '#68d391', rh: '#f6e05e' },
  { id: 'mono', lh: '#cbd5e0', rh: '#ffffff' },
];

export const BACKGROUNDS = [
  { id: 'night', a: '#141220', b: '#07070a' },
  { id: 'lacquer', a: '#1d1a22', b: '#0c0b0e' },
  { id: 'deep', a: '#0b1d2c', b: '#04080d' },
  { id: 'dusk', a: '#2a1424', b: '#0b0710' },
  { id: 'moss', a: '#12201a', b: '#060a08' },
  { id: 'paper', a: '#2b2620', b: '#14120f' },
];

const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const lighten = (hex, t) => { const c = hexToRgb(hex); return `rgb(${c.map((v) => Math.round(v + (255 - v) * t)).join(',')})`; };
const darken = (hex, t) => { const c = hexToRgb(hex); return `rgb(${c.map((v) => Math.round(v * (1 - t))).join(',')})`; };

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
    const portrait = H > W * 1.2;
    const kh = Math.round(portrait ? Math.min(H * 0.1, W * 0.2) : H * 0.15);
    const room = 0;
    const pad = Math.round(W * 0.01);
    const key = this.take?.id + style.range + W + H;
    if (!this.rangeCache || this.rangeCache.key !== key) {
      const [lo, hi] = keyRange(this.take, style.range);
      this.rangeCache = { key, lo, hi, L: layout(W - pad * 2, lo, hi) };
    }
    const { lo, hi, L } = this.rangeCache;
    const hitY = H - kh - room;
    return { W, H, kh, room, pad, lo, hi, L, hitY, pps: hitY / style.speed, unit: Math.min(W, H) / 1080 };
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
    if (S.guides && !matte) this.drawGuides(g, G);

    // collect visible and sounding notes
    const visible = [];
    const sounding = new Map();
    if (take) {
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

    if (S.beams > 0) this.drawBeams(g, G, S, sounding, matte);
    if (S.glow > 0 && !matte) this.drawGlow(g, G, S, visible, time);
    this.drawNotes(g, G, S, visible, time, matte);
    if (S.smoke > 0 && !matte) this.drawSmoke(g, G, S, time);
    this.drawKeyboard(g, G, S, sounding, matte);
    if (S.sparks > 0) this.drawSparks(g, G, S, time, matte);

    if (!matte && S.brightness !== 1) {
      if (S.brightness < 1) { g.fillStyle = `rgba(0,0,0,${1 - S.brightness})`; g.fillRect(0, 0, W, H); }
      else { g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,255,255,${Math.min(1, (S.brightness - 1) * 1.6)})`; g.fillRect(0, 0, W, H); }
    }
    g.restore();
    return G;
  }

  drawBackground(g, G, S, time) {
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
    const ang = ((bg.angle || 180) * Math.PI) / 180;
    const cx = W / 2, cy = H / 2, r = Math.hypot(W, H) / 2;
    const gr = g.createLinearGradient(cx - Math.sin(ang) * r, cy + Math.cos(ang) * r, cx + Math.sin(ang) * r, cy - Math.cos(ang) * r);
    gr.addColorStop(0, bg.a);
    gr.addColorStop(1, bg.b);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }

  drawGuides(g, G) {
    g.fillStyle = 'rgba(255,255,255,0.045)';
    for (let k = G.lo; k <= G.hi; k++) {
      if (k % 12 !== 0) continue;
      const x = G.pad + G.L.keys[k].x;
      g.fillRect(Math.round(x), 0, Math.max(1, G.unit), G.hitY);
    }
  }

  noteRect(G, S, n, time) {
    const key = G.L.keys[n.k];
    const black = key.black;
    const inset = black ? key.w * 0.06 : key.w * 0.1;
    const x = G.pad + key.x + inset;
    const w = key.w - inset * 2;
    const yBottom = G.hitY - (n.t - time) * G.pps;
    let yTop = G.hitY - (n.t + n.d - time) * G.pps;
    const h = Math.max(G.unit * 6, yBottom - yTop);
    yTop = yBottom - h;
    return { x, y: yTop, w, h, black };
  }

  colorOf(S, n) { return n.h === 0 ? S.lh : S.rh; }

  drawNotes(g, G, S, visible, time, matte) {
    const clipH = G.hitY;
    g.save();
    g.beginPath(); g.rect(0, 0, G.W, clipH); g.clip();
    // white-key notes first, black-key notes on top
    for (const pass of [false, true]) {
      for (const n of visible) {
        const r = this.noteRect(G, S, n, time);
        if (r.black !== pass) continue;
        if (r.y > clipH || r.y + r.h < 0) continue;
        const c = this.colorOf(S, n);
        const vel = S.velocityShade ? 0.55 + (n.v / 127) * 0.45 : 1;
        const playing = n.t <= time && n.t + n.d >= time;
        const rad = Math.min(r.w * 0.38, 10 * G.unit);
        if (matte) { g.fillStyle = '#fff'; roundRect(g, r.x, r.y, r.w, r.h, rad); g.fill(); continue; }
        // quieter notes are darker (not see-through, so glow never washes them out)
        const shade = S.velocityShade ? 0.55 + (n.v / 127) * 0.45 : 1;
        const base = playing ? lighten(c, 0.12) : shade < 1 ? darken(c, (1 - shade) * 0.9) : c;
        switch (S.noteStyle) {
          case 'flat':
            g.globalAlpha = 1;
            g.fillStyle = base;
            roundRect(g, r.x, r.y, r.w, r.h, Math.min(rad, 3 * G.unit)); g.fill();
            break;
          case 'neon':
            g.globalAlpha = 1;
            g.fillStyle = rgba(c, 0.12 * vel + (playing ? 0.15 : 0));
            roundRect(g, r.x, r.y, r.w, r.h, rad); g.fill();
            g.lineWidth = Math.max(1.5, 2.4 * G.unit);
            g.strokeStyle = lighten(c, playing ? 0.55 : 0.2);
            g.globalAlpha = vel;
            roundRect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad); g.stroke();
            break;
          case 'glass': {
            g.globalAlpha = 0.55 + vel * 0.4;
            const gr = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
            gr.addColorStop(0, lighten(base, 0.35)); gr.addColorStop(0.35, base); gr.addColorStop(1, darken(base, 0.3));
            g.fillStyle = gr;
            roundRect(g, r.x, r.y, r.w, r.h, rad); g.fill();
            g.globalAlpha = 0.5;
            g.fillStyle = 'rgba(255,255,255,0.55)';
            roundRect(g, r.x + r.w * 0.16, r.y + 3 * G.unit, Math.max(1, r.w * 0.12), Math.max(0, r.h - 6 * G.unit), r.w * 0.06); g.fill();
            break;
          }
          case 'pill':
            g.globalAlpha = 1;
            g.fillStyle = base;
            roundRect(g, r.x, r.y, r.w, r.h, r.w / 2); g.fill();
            break;
          default: { // soft
            g.globalAlpha = 1;
            const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
            gr.addColorStop(0, darken(base, 0.18)); gr.addColorStop(1, lighten(base, 0.12));
            g.fillStyle = gr;
            roundRect(g, r.x, r.y, r.w, r.h, rad); g.fill();
            g.globalAlpha = 0.6;
            g.strokeStyle = lighten(base, 0.45);
            g.lineWidth = Math.max(1, G.unit);
            roundRect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad); g.stroke();
          }
        }
        if (S.noteNames && r.h > 18 * G.unit && r.w > 10 * G.unit) {
          g.globalAlpha = 0.85;
          g.fillStyle = 'rgba(10,10,12,.75)';
          g.font = `600 ${Math.round(Math.min(r.w * 0.55, 15 * G.unit))}px Manrope, sans-serif`;
          g.textAlign = 'center';
          g.fillText(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n.k % 12], r.x + r.w / 2, r.y + r.h - 6 * G.unit);
        }
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // Bloom: notes drawn small and blurred, then added on top.
  drawGlow(g, G, S, visible, time) {
    const q = 4;
    const w = Math.ceil(G.W / q), h = Math.ceil(G.H / q);
    if (!this.glowCanvas || this.glowCanvas.width !== w || this.glowCanvas.height !== h) {
      this.glowCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    }
    const gc = this.glowCanvas.getContext('2d');
    gc.clearRect(0, 0, w, h);
    gc.save();
    gc.scale(1 / q, 1 / q);
    gc.beginPath(); gc.rect(0, 0, G.W, G.hitY + 30 * G.unit); gc.clip();
    for (const n of visible) {
      const r = this.noteRect(G, S, n, time);
      const playing = n.t <= time && n.t + n.d >= time;
      gc.globalAlpha = (playing ? 0.85 : 0.5) * (0.5 + (n.v / 127) * 0.5);
      gc.fillStyle = this.colorOf(S, n);
      gc.fillRect(r.x, r.y, r.w, r.h);
    }
    gc.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = S.glow * 0.7;
    g.filter = `blur(${Math.max(2, 14 * G.unit)}px)`;
    g.drawImage(this.glowCanvas, 0, 0, G.W, G.H);
    g.filter = 'none';
    g.restore();
  }

  // Light beams rising from keys that are sounding.
  drawBeams(g, G, S, sounding, matte) {
    g.save();
    g.globalCompositeOperation = matte ? 'source-over' : 'lighter';
    for (const n of sounding.values()) {
      const key = G.L.keys[n.k];
      const cx = G.pad + key.x + key.w / 2;
      const hgt = G.hitY * 0.32 * S.beams * (0.6 + (n.v / 127) * 0.6);
      const gr = g.createLinearGradient(0, G.hitY, 0, G.hitY - hgt);
      const c = matte ? '#ffffff' : this.colorOf(S, n);
      gr.addColorStop(0, rgba(c, matte ? 0.7 : 0.55 * S.beams));
      gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr;
      const bw = key.w * 1.6;
      g.fillRect(cx - bw / 2, G.hitY - hgt, bw, hgt);
      // flare on the hit line
      const fr = g.createRadialGradient(cx, G.hitY, 0, cx, G.hitY, key.w * 2.2);
      fr.addColorStop(0, matte ? 'rgba(255,255,255,1)' : 'rgba(255,248,232,0.55)');
      fr.addColorStop(0.35, rgba(c, matte ? 0.6 : 0.45));
      fr.addColorStop(1, rgba(c, 0));
      g.fillStyle = fr;
      g.fillRect(cx - key.w * 2.2, G.hitY - key.w * 2.2, key.w * 4.4, key.w * 4.4);
    }
    g.restore();
  }

  // Sparks: each note start throws particles that fly up and fall back.
  drawSparks(g, G, S, time, matte) {
    if (!this.take) return;
    const life = 0.9;
    const start = this.firstIndex(time - life - this.maxDur);
    g.save();
    g.globalCompositeOperation = matte ? 'source-over' : 'lighter';
    const grav = 1400 * G.unit;
    for (let i = start; i < this.sorted.length; i++) {
      const n = this.sorted[i];
      if (n.t > time) break;
      if (n.k < G.lo || n.k > G.hi) continue;
      const key = G.L.keys[n.k];
      const cx = G.pad + key.x + key.w / 2;
      const c = this.colorOf(S, n);
      // burst at the attack, then a light trickle while the key is held
      const bursts = [n.t];
      for (let tt = n.t + 0.12; tt < Math.min(n.t + n.d, time); tt += 0.12) bursts.push(tt);
      for (let b = 0; b < bursts.length; b++) {
        const age0 = time - bursts[b];
        if (age0 < 0 || age0 > life) continue;
        const count = b === 0 ? Math.round((4 + (n.v / 127) * 14) * S.sparks) : Math.round(2 * S.sparks);
        for (let j = 0; j < count; j++) {
          const r1 = hash(i * 31 + b, j), r2 = hash(j * 7 + b, i), r3 = hash(i + j * 13, b * 3 + 1);
          const pl = life * (0.45 + r3 * 0.55);
          const age = age0;
          if (age > pl) continue;
          const ang = -Math.PI / 2 + (r1 - 0.5) * 1.9;
          const sp = (220 + r2 * 520) * G.unit * (b === 0 ? 1 : 0.5);
          const x = cx + (r3 - 0.5) * key.w + Math.cos(ang) * sp * age;
          const y = G.hitY + Math.sin(ang) * sp * age + 0.5 * grav * age * age;
          if (y > G.hitY + 4 * G.unit) continue;
          const fade = 1 - age / pl;
          g.globalAlpha = fade * (matte ? 1 : 0.95);
          g.fillStyle = matte ? '#fff' : (r1 > 0.6 ? '#fff6e0' : lighten(c, 0.4));
          const sz = (1.2 + r2 * 2.4) * G.unit * (0.6 + fade * 0.6);
          g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }
    }
    g.restore();
  }

  // Slow smoke drifting above the keys (deterministic noise-like blobs).
  drawSmoke(g, G, S, time) {
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 14; i++) {
      const r1 = hash(i, 1), r2 = hash(i, 2), r3 = hash(i, 3);
      const period = 9 + r1 * 8;
      const ph = ((time / period + r2) % 1 + 1) % 1;
      const x = G.W * (r3 + Math.sin(time * 0.15 + i) * 0.05);
      const y = G.hitY - ph * G.hitY * 0.6;
      const rad = (120 + r1 * 180) * G.unit * (0.6 + ph);
      const a = Math.sin(ph * Math.PI) * 0.06 * S.smoke;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(200,200,215,${a})`);
      gr.addColorStop(1, 'rgba(200,200,215,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.restore();
  }

  drawKeyboard(g, G, S, sounding, matte) {
    const { W, H, kh, pad, L, hitY } = G;
    const ebony = S.keyboard === 'ebony';
    // body
    g.fillStyle = matte ? '#fff' : ebony ? '#0c0b0f' : '#121015';
    g.fillRect(0, hitY, W, kh + (G.room || 0));
    if (G.room && !matte) {
      const fr = g.createLinearGradient(0, hitY + kh, 0, H);
      fr.addColorStop(0, '#0b0a0d'); fr.addColorStop(1, '#030304');
      g.fillStyle = fr;
      g.fillRect(0, hitY + kh, W, G.room);
    }
    const top = hitY + Math.max(2, 4 * G.unit);
    const wh = kh - (top - hitY) - 2 * G.unit;
    const bh = wh * 0.62;
    const litColor = (n) => (n.h === 0 ? S.keyLh || S.lh : S.keyRh || S.rh);
    for (let k = G.lo; k <= G.hi; k++) {
      if (isBlack(k)) continue;
      const key = L.keys[k];
      const n = sounding.get(k);
      const press = n ? 2 * G.unit : 0;
      if (matte) g.fillStyle = '#fff';
      else if (n) {
        const gr = g.createLinearGradient(0, top, 0, top + wh);
        gr.addColorStop(0, lighten(litColor(n), 0.25)); gr.addColorStop(1, litColor(n));
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(0, top, 0, top + wh);
        gr.addColorStop(0, ebony ? '#2a2730' : '#d9d2bf'); gr.addColorStop(0.12, ebony ? '#1f1d24' : '#ece5d3'); gr.addColorStop(1, ebony ? '#18161c' : '#f4efe2');
        g.fillStyle = gr;
      }
      roundRect(g, pad + key.x + G.unit * 0.6, top + press, key.w - G.unit * 1.2, wh - press, 0, 0, 3 * G.unit, 3 * G.unit);
      g.fill();
    }
    for (let k = G.lo; k <= G.hi; k++) {
      if (!isBlack(k)) continue;
      const key = L.keys[k];
      const n = sounding.get(k);
      const press = n ? 1.5 * G.unit : 0;
      if (matte) g.fillStyle = '#fff';
      else if (n) g.fillStyle = litColor(n);
      else {
        const gr = g.createLinearGradient(0, top, 0, top + bh);
        gr.addColorStop(0, '#2b2830'); gr.addColorStop(0.85, '#141217'); gr.addColorStop(1, '#3a3640');
        g.fillStyle = gr;
      }
      roundRect(g, pad + key.x, top + press, key.w, bh - press, 0, 0, 2 * G.unit, 2 * G.unit);
      g.fill();
    }
    if (!matte) {
      // felt strip and a soft shadow where the keys meet the stage
      g.fillStyle = '#8f2723';
      g.fillRect(0, hitY, W, Math.max(2, 3 * G.unit));
      const sh = g.createLinearGradient(0, hitY - 26 * G.unit, 0, hitY);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = sh;
      g.fillRect(0, hitY - 26 * G.unit, W, 26 * G.unit);
    }
  }
}

export function roundRect(g, x, y, w, h, tl, tr = tl, br = tl, bl = tl) {
  const m = Math.min(w, h) / 2;
  tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m);
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
