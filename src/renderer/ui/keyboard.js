// The keyboard strip at the bottom of the window: lights up live and during playback.
import { layout, isBlack, LOW, HIGH, mix } from '../core/keys.js';
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
  }

  setColors(c) { this.colors = { ...this.colors, ...c }; this.dirty = true; }
  setPedal(down) { this.pedal.classList.toggle('down', down); }
  press(key, hand, vel) { this.live.set(key, { hand, vel }); this.dirty = true; }
  release(key) { this.live.delete(key); this.dirty = true; }
  clearLive() { this.live.clear(); this.dirty = true; }
  setPlaying(map) { this.play = map; this.dirty = true; }

  draw() {
    if (!this.dirty) return;
    this.dirty = false;
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const pad = 8;
    const L = layout(W - pad * 2, LOW, HIGH);
    const top = 6;
    const wh = H - top - 4;
    const bh = wh * 0.62;
    const lit = (k) => this.live.get(k) || this.play.get(k);
    const colorFor = (s) => (s.hand === 0 ? this.colors.lh : this.colors.rh);
    for (let k = LOW; k <= HIGH; k++) {
      if (isBlack(k)) continue;
      const key = L.keys[k];
      const s = lit(k);
      g.fillStyle = s ? mix('#ece5d3', colorFor(s), 0.75) : '#e6dfcc';
      roundRect(g, pad + key.x + 0.5, top, key.w - 1, wh, 0, 0, 3, 3);
      g.fill();
      if (s) {
        g.fillStyle = colorFor(s);
        g.fillRect(pad + key.x + 0.5, top + wh - 5, key.w - 1, 5);
      }
    }
    for (let k = LOW; k <= HIGH; k++) {
      if (!isBlack(k)) continue;
      const key = L.keys[k];
      const s = lit(k);
      g.fillStyle = s ? colorFor(s) : '#1b1a1f';
      roundRect(g, pad + key.x, top, key.w, bh, 0, 0, 2, 2);
      g.fill();
      if (!s) {
        g.fillStyle = 'rgba(255,255,255,.07)';
        g.fillRect(pad + key.x + 2, top + bh - 7, key.w - 4, 4);
      }
    }
    // felt strip above the keys
    g.fillStyle = '#8f2723';
    g.fillRect(pad, 0, W - pad * 2, top - 2);
    // middle C mark
    const mc = L.keys[60];
    g.fillStyle = 'rgba(23,21,27,.35)';
    g.beginPath();
    g.arc(pad + mc.x + mc.w / 2, top + wh - 12, 2, 0, Math.PI * 2);
    g.fill();
    this.canvas.title = t('midi.hint');
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
