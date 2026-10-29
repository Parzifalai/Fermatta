// Compact piano-roll picture of a take (time → x, pitch → y), with glowing notes.
export function drawRoll(canvas, take, { pos = null, colors = { lh: '#7fa6d9', rh: '#e8b86a' }, from = 0, to = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!take || !take.notes.length) return;
  const cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--ink').trim() || '#fff';
  const line = cs.getPropertyValue('--cv-line').trim();
  const accent = cs.getPropertyValue('--accent').trim();
  const pad = 18;
  const end = to ?? Math.max(take.duration, 1);
  const span = end - from;
  let lo = 127, hi = 0;
  for (const n of take.notes) { lo = Math.min(lo, n.k); hi = Math.max(hi, n.k); }
  lo -= 3; hi += 3;
  const rows = hi - lo + 1;
  const rh = (H - pad * 2) / rows;
  const x = (t) => pad + ((t - from) / span) * (W - pad * 2);
  // octave guides at every C
  g.fillStyle = line;
  for (let k = lo; k <= hi; k++) if (k % 12 === 0) g.fillRect(pad, pad + (hi - k) * rh, W - pad * 2, 1);
  // pedal band at the bottom
  g.fillStyle = accent;
  g.globalAlpha = 0.45;
  let down = null;
  for (const p of take.pedal || []) {
    if (p.v >= 64 && down === null) down = p.t;
    else if (p.v < 64 && down !== null) { g.fillRect(x(down), H - 6, Math.max(1, x(p.t) - x(down)), 3); down = null; }
  }
  if (down !== null) g.fillRect(x(down), H - 6, W - pad - x(down), 3);
  g.globalAlpha = 1;
  const bar = Math.max(3, Math.min(10, rh * 0.95));
  for (const n of take.notes) {
    if (n.t + n.d < from || n.t > end) continue;
    const c = n.h === 0 ? colors.lh : colors.rh;
    const played = pos !== null && n.t <= pos;
    g.globalAlpha = (0.35 + (n.v / 127) * 0.65) * (pos !== null && !played ? 0.6 : 1);
    g.fillStyle = c;
    g.shadowColor = c;
    g.shadowBlur = played ? 14 : 8;
    const y = pad + (hi - n.k) * rh + (rh - bar) / 2;
    g.beginPath();
    g.roundRect(x(n.t), y, Math.max(3, x(n.t + n.d) - x(n.t) - 1), bar, bar / 2);
    g.fill();
  }
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  if (pos !== null) {
    const px = Math.round(x(pos));
    const gr = g.createLinearGradient(px - 70, 0, px, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.1)');
    g.fillStyle = gr;
    g.fillRect(px - 70, 0, 70, H);
    g.fillStyle = ink;
    g.fillRect(px, 0, 2, H);
  }
}
