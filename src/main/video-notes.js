// Reads notes straight from a falling-notes video (Synthesia-style tutorials):
// finds the keyboard at the bottom, works out where every key is, then
// watches frame by frame which keys light up. Timing and lengths come from the
// picture; loudness, pedal and quick repeats are filled in from the sound.
const { spawn } = require('child_process');
const ffmpeg = require('./ffmpeg');
const media = require('./media');

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function sat(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx < 1 ? 0 : (mx - mn) / mx;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (arr) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12);

// Streams raw RGB frames from ffmpeg; onFrame(buf, index) for each one.
function frames(file, args, w, h, onFrame) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg.bin, ['-v', 'error', '-i', file, ...args, '-an', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    const size = w * h * 3;
    let buf = Buffer.alloc(0);
    let n = 0;
    let err = '';
    p.stdout.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= size) {
        onFrame(buf.subarray(0, size), n++);
        buf = buf.subarray(size);
      }
    });
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(n) : reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${code}`))));
  });
}

// Finds the keyboard in a "typical" frame (median of several frames, so lit
// keys and passing notes disappear) and returns a sample point for every key.
function findKeyboard(img, W, H) {
  const px = (x, y) => { const o = (y * W + x) * 3; return [img[o], img[o + 1], img[o + 2]]; };
  const L = (x, y) => { const o = (y * W + x) * 3; return lum(img[o], img[o + 1], img[o + 2]); };
  // rows that are mostly bright = white keys
  const bright = [];
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) if (L(x, y) > 150) c++;
    bright.push(c / W);
  }
  let best = null;
  for (let y = Math.floor(H * 0.3); y < H; y++) {
    if (bright[y] < 0.35) continue;
    let e = y;
    while (e + 1 < H && bright[e + 1] >= 0.35) e++;
    if (!best || e - y > best.bot - best.top) best = { top: y, bot: e };
    y = e;
  }
  if (!best || best.bot - best.top < H * 0.06) return null;
  const { top, bot } = best;
  const kh = bot - top + 1;
  // black keys: dark runs across a row in the upper part of the keyboard
  const yb = Math.round(top + kh * 0.3);
  const runs = [];
  for (let x = 0; x < W; x++) {
    if (L(x, yb) >= 90) continue;
    let e = x;
    while (e + 1 < W && L(e + 1, yb) < 90) e++;
    runs.push({ a: x, b: e, c: (x + e) / 2, w: e - x + 1 });
    x = e;
  }
  const mw = median(runs.map((r) => r.w));
  const blacks = runs.filter((r) => r.w >= mw * 0.5 && r.w <= mw * 1.9);
  if (blacks.length < 10) return null;
  const centers = blacks.map((r) => r.c);
  const gaps = centers.slice(1).map((c, i) => c - centers[i]);
  const ww = median(gaps.filter((g) => g < median(gaps) * 1.3)); // white key width ≈ gap inside a group
  // split into groups of 2 (C# D#) and 3 (F# G# A#)
  const groups = [[0]];
  for (let i = 1; i < centers.length; i++) {
    if (gaps[i - 1] > ww * 1.25) groups.push([i]); else groups[groups.length - 1].push(i);
  }
  const sizes = groups.map((g) => g.length);
  // pitch class of the first black key, from the first complete group
  const full = sizes.findIndex((s) => s === 2 || s === 3);
  if (full < 0) return null;
  const pcs = new Array(centers.length);
  const pattern = (s) => (s === 2 ? [1, 3] : [6, 8, 10]);
  let kind = sizes[full];
  for (let gi = full; gi < groups.length; gi++) {
    const pc = pattern(kind);
    groups[gi].forEach((idx, j) => { pcs[idx] = pc[j]; });
    kind = kind === 2 ? 3 : 2;
  }
  kind = sizes[full];
  for (let gi = full - 1; gi >= 0; gi--) {
    kind = kind === 2 ? 3 : 2;
    const pc = pattern(kind);
    const g = groups[gi];
    // a cut group at the left edge keeps its last members
    g.forEach((idx, j) => { pcs[idx] = pc[pc.length - g.length + j]; });
  }
  // octave: a full 88-key piano starts at A#0; otherwise put the middle C# group at C#4
  let oct = 0;
  const rel = [];
  for (let i = 0; i < centers.length; i++) { if (i > 0 && pcs[i] <= pcs[i - 1]) oct++; rel.push(oct * 12 + pcs[i]); }
  let shift;
  if (centers.length === 36 && pcs[0] === 10) shift = 22 - rel[0];
  else {
    let mid = -1;
    centers.forEach((c, i) => { if (pcs[i] === 1 && (mid < 0 || Math.abs(c - W / 2) < Math.abs(centers[mid] - W / 2))) mid = i; });
    shift = 61 - rel[mid];
  }
  const midi = rel.map((r) => r + shift);
  const blackX = new Map(midi.map((m, i) => [m, centers[i]]));
  const lo = midi[0] - (isBlack(midi[0] - 1) ? 2 : 1);
  const hi = midi[midi.length - 1] + (isBlack(midi[midi.length - 1] + 1) ? 2 : 1);
  const keys = [];
  const yw = Math.round(bot - kh * 0.13);
  const yk = Math.round(top + kh * 0.42);
  // edges of a white key: black neighbours sit on its boundaries; E|F and B|C lie one white width to the right of D#/A#
  const leftEdge = (m) => (blackX.has(m - 1) ? blackX.get(m - 1) : blackX.has(m - 2) ? blackX.get(m - 2) + ww : null);
  const rightEdge = (m) => (blackX.has(m + 1) ? blackX.get(m + 1) : blackX.has(m - 1) ? blackX.get(m - 1) + ww : null);
  for (let m = lo; m <= hi; m++) {
    if (isBlack(m)) {
      if (blackX.has(m)) keys.push({ m, x: Math.round(blackX.get(m)), y: yk, black: true });
      continue;
    }
    let l = leftEdge(m), r = rightEdge(m);
    if (l === null && r !== null) l = r - ww;
    if (r === null && l !== null) r = l + ww;
    if (l === null) continue;
    const x = Math.round((l + r) / 2);
    if (x < 1 || x > W - 2) continue;
    keys.push({ m, x, y: yw, black: false });
  }
  for (const k of keys) k.base = px(k.x, k.y);
  // a dark row just above the keyboard, where falling notes pass by
  let yt = top - 2;
  while (yt > 2 && bright[yt] > 0.05) yt--;
  return { top, bot, keys, yt: Math.max(0, yt - 1), blacks: centers.length, whiteWidth: ww };
}

async function readVideo(file, progress = () => {}) {
  const info = await media.probe(file);
  if (!info.width || !info.duration) throw new Error('NO_VIDEO');
  const W = Math.min(1280, info.width - (info.width % 2));
  const H = Math.round((info.height * W) / info.width / 2) * 2;
  const scale = `scale=${W}:${H}`;
  // 1. a typical frame: per-pixel median of 15 frames spread over the video
  progress({ stage: 'look', ratio: 0 });
  const samples = [];
  const nS = 15;
  await frames(file, ['-vf', `fps=${(nS / info.duration).toFixed(6)},${scale}`, '-frames:v', String(nS)], W, H, (b) => samples.push(Buffer.from(b)));
  if (!samples.length) throw new Error('NO_FRAMES');
  const med = Buffer.alloc(W * H * 3);
  const tmp = new Array(samples.length);
  for (let i = 0; i < med.length; i++) {
    for (let s = 0; s < samples.length; s++) tmp[s] = samples[s][i];
    tmp.sort((a, b) => a - b);
    med[i] = tmp[tmp.length >> 1];
  }
  const kb = findKeyboard(med, W, H);
  if (!kb || kb.keys.length < 24) return null;

  // 2. every frame, only the strip with the keyboard and the row above it
  const y0 = Math.max(0, kb.yt);
  const ch = kb.bot - y0 + 1;
  const fps = Math.min(60, info.fps || 30);
  const total = Math.ceil(info.duration * fps);
  const state = kb.keys.map(() => ({ on: false, t0: 0, cols: [], tileSeen: false, tileGap: false, splits: [] }));
  const notes = [];
  const thr = 55;
  const close = (k, s, t) => {
    const c = s.cols.length ? s.cols.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((v) => Math.round(v / s.cols.length)) : [255, 255, 255];
    let start = s.t0;
    for (const sp of [...s.splits, t]) {
      if (sp - start > 0.02) notes.push({ k: k.m, t: start, d: sp - start, c, v: 80 });
      start = sp;
    }
    s.on = false; s.cols = []; s.splits = [];
  };
  await frames(file, ['-vf', `fps=${fps},${scale},crop=${W}:${ch}:0:${y0}`], W, ch, (b, i) => {
    const t = i / fps;
    const at = (x, y) => {
      // average of three pixels across
      const o = ((y - y0) * W + x) * 3;
      return [(b[o - 3] + b[o] + b[o + 3]) / 3, (b[o - 2] + b[o + 1] + b[o + 4]) / 3, (b[o - 1] + b[o + 2] + b[o + 5]) / 3];
    };
    // a title card or transition: the keyboard is not on screen, nothing is played
    let calm = 0;
    for (const k of kb.keys) if (dist(at(k.x, k.y), k.base) < thr * 0.45) calm++;
    if (calm < kb.keys.length * 0.4) {
      kb.keys.forEach((k, ki) => { if (state[ki].on) close(k, state[ki], t); });
      return;
    }
    kb.keys.forEach((k, ki) => {
      const c = at(k.x, k.y);
      const d = dist(c, k.base);
      const sc = sat(c[0], c[1], c[2]);
      const lit = k.black ? d > thr && lum(...c) > lum(...k.base) + 35 : d > thr && sc > 0.3 && lum(...c) > 70;
      // many videos light a key brightly and let it fade: it stays pressed until back to its own colour
      const off = d < thr * 0.45;
      const s = state[ki];
      // a falling note crossing the row above the key
      const tc = at(k.x, kb.yt);
      const tile = lum(...tc) > 70;
      if (!s.on && lit) { s.on = true; s.t0 = t; s.cols = [c]; s.tileSeen = tile; s.tileGap = false; return; }
      if (s.on) {
        if (off) { close(k, s, t); return; }
        if (lit && sat(...c) > 0.3) s.cols.push(c);
        // a gap between two notes on the same key, then a new note: split here
        if (!tile && s.tileSeen) s.tileGap = true;
        if (tile && s.tileGap && t - (s.splits.length ? s.splits[s.splits.length - 1] : s.t0) > 0.08) { s.splits.push(t); s.tileGap = false; }
        if (tile) s.tileSeen = true;
      }
    });
    if (i % 30 === 0) progress({ stage: 'watch', ratio: Math.min(1, i / total) });
  });
  const end = total / fps;
  kb.keys.forEach((k, ki) => { if (state[ki].on) close(k, state[ki], end); });
  notes.sort((a, b) => a.t - b.t || a.k - b.k);
  // intros and transitions light up half the keyboard at once: not music
  const clean = notes.filter((n) => notes.filter((o) => Math.abs(o.t - n.t) < 1.5 / fps).length <= 10);
  return { notes: clean, keys: kb.keys.length, blacks: kb.blacks, fps };
}

// Hue in degrees, for telling hand colours apart.
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  let h;
  if (mx === r) h = ((g - b) / (mx - mn)) % 6;
  else if (mx === g) h = (b - r) / (mx - mn) + 2;
  else h = (r - g) / (mx - mn) + 4;
  return (h * 60 + 360) % 360;
}

// Two clearly different colours that are not simply "lower = redder" mean two hands.
function handsFromColour(notes) {
  if (notes.length < 12) return false;
  const hs = notes.map((n) => hue(n.c));
  // rank correlation between pitch and hue: a pitch gradient is not a hand split
  const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); idx.forEach(([, i], j) => { r[i] = j; }); return r; };
  const rp = rank(notes.map((n) => n.k)), rh = rank(hs);
  const mean = (notes.length - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < notes.length; i++) { num += (rp[i] - mean) * (rh[i] - mean); da += (rp[i] - mean) ** 2; db += (rh[i] - mean) ** 2; }
  if (Math.abs(num / Math.sqrt(da * db)) > 0.55) return false;
  // two hue clusters
  let a = Math.min(...hs), b = Math.max(...hs);
  let lab = [];
  for (let it = 0; it < 12; it++) {
    lab = hs.map((h) => (Math.abs(h - a) <= Math.abs(h - b) ? 0 : 1));
    const ma = hs.filter((_, i) => !lab[i]), mb = hs.filter((_, i) => lab[i]);
    if (!ma.length || !mb.length) return false;
    a = ma.reduce((x, y) => x + y, 0) / ma.length;
    b = mb.reduce((x, y) => x + y, 0) / mb.length;
  }
  const share = lab.filter(Boolean).length / lab.length;
  if (Math.abs(a - b) < 35 || share < 0.12 || share > 0.88) return false;
  const pitch = (c) => { const ks = notes.filter((_, i) => lab[i] === c).map((n) => n.k); return ks.reduce((x, y) => x + y, 0) / ks.length; };
  const leftLabel = pitch(0) < pitch(1) ? 0 : 1;
  notes.forEach((n, i) => { n.h = lab[i] === leftLabel ? 0 : 1; });
  return true;
}

// Picture notes + sound notes: loudness, pedal and re-strikes the picture missed.
// Timing stays the picture's: the frames are exact, the ear lags a little.
function merge(visual, audio) {
  const byKey = new Map();
  for (const n of audio.notes) { if (!byKey.has(n.k)) byKey.set(n.k, []); byKey.get(n.k).push(n); }
  const offsets = [];
  for (const v of visual) {
    const list = byKey.get(v.k) || [];
    let best = null;
    for (const a of list) { const dt = a.t - v.t; if (Math.abs(dt) < 0.15 && (!best || Math.abs(dt) < Math.abs(best.t - v.t))) best = a; }
    if (best) { v.v = best.v; offsets.push(best.t - v.t); best.used = true; }
  }
  const shift = offsets.length > 8 ? median(offsets) : 0;
  const out = [];
  for (const v of visual) {
    // the sound struck the same key again while the key stayed lit: split
    const inner = (byKey.get(v.k) || []).filter((a) => !a.used && a.t - shift > v.t + 0.12 && a.t - shift < v.t + v.d - 0.06).sort((x, y) => x.t - y.t);
    let start = v.t, vel = v.v;
    for (const a of inner) {
      out.push({ ...v, t: start, d: a.t - shift - start, v: vel });
      start = a.t - shift; vel = a.v; a.used = true;
    }
    out.push({ ...v, t: start, d: v.t + v.d - start, v: vel });
  }
  return out;
}

module.exports = { readVideo, merge, handsFromColour, findKeyboard };
