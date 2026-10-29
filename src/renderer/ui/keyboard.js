// The keyboard strip at the bottom of the window: lights up live and during playback.
import { layout, isBlack, LOW, HIGH } from '../core/keys.js';
import { h } from './dom.js';
import { t } from '../i18n.js';

export class KeyboardStrip {
  constructor(root) {
    this.canvas = h('canvas');
    this.pedal = document.getElementById('pedal-mark');
    this.pedal.querySelector('span').textContent = t('pedal');
    root.append(this.canvas);
    this.live = new Map();   // key -> {hand, vel}
    this.play = new Map();
    this.colors = { lh: '#7fa6d9', rh: '#e8b86a' };
    this.dirty = true;
    new ResizeObserver(() => { this.dirty = true; }).observe(this.canvas);
    document.addEventListener('fermatta:theme', () => { this.palette = null; this.dirty = true; });
    this.canvas.title = t('midi.hint');
  }

  setColors(c) { this.colors = { ...this.colors, ...c }; this.dirty = true; }
  setPedal(down) { this.pedal.classList.toggle('down', down); }
  press(key, hand, vel) { this.live.set(key, { hand, vel }); this.dirty = true; }
  release(key) { this.live.delete(key); this.dirty = true; }
  clearLive() { this.live.clear(); this.dirty = true; }
  setPlaying(map) { this.play = map; this.dirty = true; }

  readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    this.palette = { white: v('--key-white'), white2: v('--key-white-2'), black: v('--key-black'), edge: v('--key-edge') };
  }

  draw() {
    if (!this.dirty) return;
    this.dirty = false;
    if (!this.palette) this.readPalette();
    const P = this.palette;
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = layout(W, LOW, HIGH);
    const top = 2;
    const wh = H - top;
    const bh = wh * 0.62;
    const lit = (k) => this.live.get(k) || this.play.get(k);
    const colorFor = (s) => (s.hand === 0 ? this.colors.lh : this.colors.rh);
    for (let k = LOW; k <= HIGH; k++) {
      if (isBlack(k)) continue;
      const key = L.keys[k];
      const s = lit(k);
      const gr = g.createLinearGradient(0, top, 0, top + wh);
      if (s) { gr.addColorStop(0, colorFor(s)); gr.addColorStop(1, '#ffffff'); }
      else { gr.addColorStop(0, P.white2); gr.addColorStop(0.25, P.white); gr.addColorStop(1, P.white); }
      g.fillStyle = gr;
      roundRect(g, key.x + 1, top, key.w - 2, wh, 2, 2, 6, 6);
      g.fill();
      g.strokeStyle = P.edge;
      g.lineWidth = 1;
      g.stroke();
    }
    // glow over pressed white keys
    for (let k = LOW; k <= HIGH; k++) {
      const s = lit(k);
      if (!s || isBlack(k)) continue;
      const key = L.keys[k];
      g.save();
      g.shadowColor = colorFor(s);
      g.shadowBlur = 22;
      g.fillStyle = colorFor(s);
      g.fillRect(key.x + 3, top - 1, key.w - 6, 3);
      g.restore();
    }
    for (let k = LOW; k <= HIGH; k++) {
      if (!isBlack(k)) continue;
      const key = L.keys[k];
      const s = lit(k);
      if (s) {
        g.save();
        g.shadowColor = colorFor(s);
        g.shadowBlur = 18;
        g.fillStyle = colorFor(s);
      } else {
        const gr = g.createLinearGradient(0, top, 0, top + bh);
        gr.addColorStop(0, P.black); gr.addColorStop(0.85, P.black); gr.addColorStop(1, '#3a3550');
        g.fillStyle = gr;
      }
      roundRect(g, key.x, top, key.w, bh, 0, 0, 4, 4);
      g.fill();
      if (s) g.restore();
    }
    // middle C mark
    const mc = L.keys[60];
    g.fillStyle = 'rgba(40,30,70,.3)';
    g.beginPath();
    g.arc(mc.x + mc.w / 2, top + wh - 10, 2, 0, Math.PI * 2);
    g.fill();
  }
}

export function roundRect(g, x, y, w, h, tl, tr, br, bl) {
  g.beginPath();
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + tr);
  g.lineTo(x + w, y + h - br);
  g.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  g.lineTo(x + bl, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - bl);
  g.lineTo(x, y + tl);
  g.quadraticCurveTo(x, y, x + tl, y);
  g.closePath();
}
