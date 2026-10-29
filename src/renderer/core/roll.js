// Compact piano-roll picture of a take (time → x, pitch → y).
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
  const end = to ?? Math.max(take.duration, 1);
  const span = end - from;
  let lo = 127, hi = 0;
  for (const n of take.notes) { lo = Math.min(lo, n.k); hi = Math.max(hi, n.k); }
  lo -= 3; hi += 3;
  const rows = hi - lo + 1;
  const rh = (H - 16) / rows;
  const x = (t) => ((t - from) / span) * W;
  // octave guides at every C
  g.fillStyle = 'rgba(236,229,211,.05)';
  for (let k = lo; k <= hi; k++) if (k % 12 === 0) g.fillRect(0, 8 + (hi - k) * rh, W, 1);
  // pedal band at the bottom
  g.fillStyle = 'rgba(201,163,90,.35)';
  let down = null;
  for (const p of take.pedal || []) {
    if (p.v >= 64 && down === null) down = p.t;
    else if (p.v < 64 && down !== null) { g.fillRect(x(down), H - 4, Math.max(1, x(p.t) - x(down)), 3); down = null; }
  }
  if (down !== null) g.fillRect(x(down), H - 4, W - x(down), 3);
  for (const n of take.notes) {
    if (n.t + n.d < from || n.t > end) continue;
    g.globalAlpha = 0.45 + (n.v / 127) * 0.55;
    g.fillStyle = n.h === 0 ? colors.lh : colors.rh;
    const y = 8 + (hi - n.k) * rh;
    g.fillRect(x(n.t), y, Math.max(1.5, x(n.t + n.d) - x(n.t)), Math.max(1.5, rh - 0.5));
  }
  g.globalAlpha = 1;
  if (pos !== null) {
    g.fillStyle = '#ece5d3';
    g.fillRect(Math.round(x(pos)), 0, 1.5, H);
  }
}
