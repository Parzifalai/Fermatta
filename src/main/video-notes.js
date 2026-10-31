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
  // white keys sit on an even grid; each black key marks the boundary between
  // two of them, so a straight-line fit through the black keys gives the grid
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const pts = midi.map((m, i) => [whites.indexOf(m - 1) + 1, centers[i]]).filter(([j]) => j > 0);
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const wWhite = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const x0 = (sy - wWhite * sx) / n;
  whites.forEach((m, i) => {
    const x = Math.round(x0 + (i + 0.5) * wWhite);
    if (x >= 1 && x <= W - 2) keys.push({ m, x, y: yw, black: false });
  });
  midi.forEach((m, i) => keys.push({ m, x: Math.round(centers[i]), y: yk, black: true }));
  keys.sort((a2, b2) => a2.m - b2.m);
  for (const k of keys) k.base = px(k.x, k.y);
  // a dark row just above the keyboard, where falling notes pass by
  let yt = top - 2;
  while (yt > 2 && bright[yt] > 0.05) yt--;
  return { top, bot, keys, yt: Math.max(0, yt - 1), blacks: centers.length, whiteWidth: wWhite };
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

  // 2. every frame: the keys themselves, and a row high above them where the
  // falling notes pass (flames and sparks near the keys do not reach it)
  const yR = Math.max(1, Math.round(kb.top * 0.45));
  const y0 = yR;
  const ch = kb.bot - y0 + 1;
  const fps = Math.min(60, info.fps || 30);
  const total = Math.ceil(info.duration * fps);
  const thr = 55;
  const ww = kb.whiteWidth;
  const bgRow = (y) => { const out = []; for (let x = 0; x < W; x++) out.push([med[(y * W + x) * 3], med[(y * W + x) * 3 + 1], med[(y * W + x) * 3 + 2]]); return out; };
  const bgA = bgRow(yR), bgB = bgRow(yR + 2);
  const frameRuns = []; // per frame: the tiles crossing the row, as [x0, x1, colour]
  const keyState = kb.keys.map(() => ({ on: false, t0: 0, cols: [] }));
  const lit = [];   // notes seen on the keys (onsets are reliable, lengths not always)
  const tiles = []; // notes seen as falling tiles (exact lengths, shifted in time)
  const avg = (arr) => (arr.length ? arr.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((v) => Math.round(v / arr.length)) : [255, 255, 255]);
  const closeKey = (k, s, t) => { if (t - s.t0 > 0.02) lit.push({ k: k.m, t: s.t0, d: t - s.t0, c: avg(s.cols), v: 80 }); s.on = false; s.cols = []; };
  await frames(file, ['-vf', `fps=${fps},${scale},crop=${W}:${ch}:0:${y0}`], W, ch, (b, i) => {
    const t = i / fps;
    const px = (x, y) => { const o = ((y - y0) * W + x) * 3; return [b[o], b[o + 1], b[o + 2]]; };
    const at = (x, y) => {
      const o = ((y - y0) * W + x) * 3;
      return [(b[o - 3] + b[o] + b[o + 3]) / 3, (b[o - 2] + b[o + 1] + b[o + 4]) / 3, (b[o - 1] + b[o + 2] + b[o + 5]) / 3];
    };
    // a title card or transition: the keyboard is not on screen, nothing is played
    let calm = 0;
    for (const k of kb.keys) if (dist(at(k.x, k.y), k.base) < thr * 0.45) calm++;
    if (calm < kb.keys.length * 0.4) {
      kb.keys.forEach((k, ki) => { if (keyState[ki].on) closeKey(k, keyState[ki], t); });
      frameRuns.push([]);
      return;
    }
    kb.keys.forEach((k, ki) => {
      // the key: lights up when played (black keys often turn a dark red, so colour counts, not just brightness)
      const c = at(k.x, k.y);
      const d = dist(c, k.base);
      const sc = sat(c[0], c[1], c[2]);
      const on = k.black ? d > thr && (lum(...c) > lum(...k.base) + 35 || sc > 0.5) : d > thr && sc > 0.3 && lum(...c) > 70;
      const s = keyState[ki];
      if (!s.on && on) { s.on = true; s.t0 = t; s.cols = [c]; }
      else if (s.on) {
        // many videos light a key brightly and let it fade: it stays pressed until back to its own colour
        if (d < thr * 0.45) closeKey(k, s, t);
        else if (on) s.cols.push(c);
      }
    });
    // the falling tiles crossing the row: runs of note-coloured pixels on two rows
    const runs = [];
    for (let x = 0; x < W; x++) {
      const isTile = (xx) => { const v = px(xx, yR), w2 = px(xx, yR + 2); return lum(...v) > 55 && dist(v, bgA[xx]) > 45 && lum(...w2) > 55 && dist(w2, bgB[xx]) > 45; };
      if (!isTile(x)) continue;
      let e = x;
      while (e + 1 < W && isTile(e + 1)) e++;
      if (e - x + 1 >= ww * 0.3) runs.push([x, e, px((x + e) >> 1, yR)]);
      x = e;
    }
    frameRuns.push(runs);
    if (i % 30 === 0) progress({ stage: 'watch', ratio: Math.min(1, i / total) });
  });
  const end = total / fps;
  kb.keys.forEach((k, ki) => { if (keyState[ki].on) closeKey(k, keyState[ki], end); });
  // a single tile's width is the most common run width; wider runs are neighbouring tiles side by side
  const keyXs = kb.keys.map((k) => k.x);
  const nearest = (x) => { let bi = 0; for (let j = 1; j < keyXs.length; j++) if (Math.abs(keyXs[j] - x) < Math.abs(keyXs[bi] - x)) bi = j; return bi; };
  // single tiles are as wide as their key's tiles: learn both widths
  const single = (black) => frameRuns.flat().filter((r) => kb.keys[nearest((r[0] + r[1]) / 2)].black === black).map((r) => r[1] - r[0] + 1);
  const wW = Math.max(ww * 0.4, median(single(false)));
  const bw = single(true);
  const wB = bw.length ? Math.min(wW, Math.max(ww * 0.3, median(bw.filter((x) => x <= wW)))) : wW * 0.75;
  const tw = (ki) => (kb.keys[ki].black ? wB : wW);
  // which keys explain a run best: one tile, or two or three side by side
  // (adjacent black keys' tiles often touch and merge into one run)
  const explain = (x0, x1) => {
    const cand = [];
    keyXs.forEach((x, ki) => { if (x > x0 - wW && x < x1 + wW) cand.push(ki); });
    const fit = (set) => {
      const L = keyXs[set[0]] - tw(set[0]) / 2, R = keyXs[set[set.length - 1]] + tw(set[set.length - 1]) / 2;
      for (let j = 1; j < set.length; j++) {
        // neighbouring tiles must not overlap much
        if (keyXs[set[j]] - keyXs[set[j - 1]] < (tw(set[j]) + tw(set[j - 1])) / 2 * 0.75) return Infinity;
      }
      return Math.abs(x0 - L) + Math.abs(x1 - R) + (set.length - 1) * ww * 0.15;
    };
    let best = null, bestErr = Infinity;
    for (let i = 0; i < cand.length; i++) {
      const e1 = fit([cand[i]]);
      if (e1 < bestErr) { bestErr = e1; best = [cand[i]]; }
      for (let j = i + 1; j < cand.length; j++) {
        const e2 = fit([cand[i], cand[j]]);
        if (e2 < bestErr) { bestErr = e2; best = [cand[i], cand[j]]; }
        for (let k = j + 1; k < cand.length; k++) {
          const e3 = fit([cand[i], cand[j], cand[k]]);
          if (e3 < bestErr) { bestErr = e3; best = [cand[i], cand[j], cand[k]]; }
        }
      }
    }
    return best || [nearest((x0 + x1) / 2)];
  };
  const tileOn = kb.keys.map(() => null);
  frameRuns.forEach((runs, fi) => {
    const t = fi / fps;
    const now = new Map();
    for (const [x0, x1, c] of runs) {
      // very wide runs (big clusters): cut into tile-sized pieces first
      const pieces = Math.max(1, Math.round((x1 - x0 + 1) / (wW * 3)));
      const part = (x1 - x0 + 1) / pieces;
      for (let j = 0; j < pieces; j++) for (const ki of explain(x0 + part * j, x0 + part * (j + 1) - 1)) now.set(ki, c);
    }
    kb.keys.forEach((k, ki) => {
      const cur = tileOn[ki];
      if (now.has(ki)) {
        if (!cur) tileOn[ki] = { a: t, cols: [now.get(ki)] };
        else if (cur.cols.length < 60) cur.cols.push(now.get(ki));
      } else if (cur) {
        tiles.push({ k: k.m, a: cur.a, b: t, c: avg(cur.cols) });
        tileOn[ki] = null;
      }
    });
  });
  kb.keys.forEach((k, ki) => { if (tileOn[ki]) tiles.push({ k: k.m, a: tileOn[ki].a, b: end, c: avg(tileOn[ki].cols) }); });
  const burst = (list, time) => list.filter((n) => list.filter((o) => Math.abs(time(o) - time(n)) < 1.5 / fps).length <= 10);
  const keyNotes = burst(lit, (n) => n.t).sort((x, y) => x.t - y.t || x.k - y.k);

  // 3. how long a tile takes from the row to the keys: the most common gap
  // between a key lighting up and a tile on that key passing the row earlier
  const byKey = new Map();
  for (const tl of tiles) { if (!byKey.has(tl.k)) byKey.set(tl.k, []); byKey.get(tl.k).push(tl); }
  const votes = new Map();
  for (const n of keyNotes) {
    for (const tl of byKey.get(n.k) || []) {
      const dt = n.t - tl.a;
      if (dt > 0.05 && dt < 8) { const bin = Math.round(dt * fps); votes.set(bin, (votes.get(bin) || 0) + 1); }
    }
  }
  let bestBin = null, bestVotes = 0;
  for (const [bin, v] of votes) {
    const sum = v + (votes.get(bin - 1) || 0) + (votes.get(bin + 1) || 0);
    if (sum > bestVotes) { bestVotes = sum; bestBin = bin; }
  }
  const delay = bestBin === null ? 0 : bestBin / fps;
  const support = bestBin === null ? 0 : keyNotes.filter((n) => (byKey.get(n.k) || []).some((tl) => Math.abs(n.t - tl.a - delay) <= 2.5 / fps)).length;
  const useTiles = support >= Math.max(10, keyNotes.length * 0.5);
  if (!useTiles) return { notes: keyNotes, keys: kb.keys.length, blacks: kb.blacks, fps, from: 'keys' };
  // tiles give exact lengths and separate repeated notes; shift them to the moment they reach the keys
  const all = burst(tiles, (tl) => tl.a).map((tl) => ({ k: tl.k, t: tl.a + delay, d: tl.b - tl.a, c: tl.c, v: 80 }));
  // keys light up a little after their tile reaches them (white keys light from
  // the top, the sample point is low): learn that lag for black and white keys
  const isB = (k) => isBlack(k);
  const lag = { true: [], false: [] };
  for (const n of keyNotes) {
    const m = all.find((x) => x.k === n.k && Math.abs(n.t - x.t) < 0.4 && x.d > 1.6 / fps);
    if (m) lag[isB(n.k)].push(n.t - m.t);
  }
  const lagOf = (k) => (lag[isB(k)].length > 5 ? median(lag[isB(k)]) : 0);
  const litAt = (k, t) => keyNotes.some((n) => n.k === k && Math.abs(n.t - lagOf(k) - t) < 0.3);
  // tiny tiles (grace notes, very short notes) cross the row in a single frame:
  // keep them when the key really lights up
  const notes = all.filter((n) => n.d > 1.6 / fps || litAt(n.k, n.t)).map((n) => ({ ...n, d: Math.max(n.d, 0.1) }));
  // a key that lit up with no tile at all: add it from the key
  for (const n of keyNotes) {
    const t = n.t - lagOf(n.k);
    if (!notes.some((x) => x.k === n.k && Math.abs(x.t - t) < 0.3)) notes.push({ k: n.k, t, d: Math.max(0.1, n.d), c: n.c, v: 80 });
  }
  notes.splice(0, notes.length, ...notes.filter((n) => n.t < info.duration + 0.5).sort((x, y) => x.t - y.t || x.k - y.k));
  return { notes, keys: kb.keys.length, blacks: kb.blacks, fps, from: 'tiles', delay, support, keyNotes: keyNotes.length, keyList: keyNotes };
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
function merge(visual, audio, { split = true } = {}) {
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
    const inner = split ? (byKey.get(v.k) || []).filter((a) => !a.used && a.t - shift > v.t + 0.12 && a.t - shift < v.t + v.d - 0.06).sort((x, y) => x.t - y.t) : [];
    let start = v.t, vel = v.v;
    for (const a of inner) {
      out.push({ ...v, t: start, d: a.t - shift - start, v: vel });
      start = a.t - shift; vel = a.v; a.used = true;
    }
    out.push({ ...v, t: start, d: v.t + v.d - start, v: vel });
  }
  out.shift = shift;
  return out;
}

// The pedal heard in the sound is a little late and its changes are blurry.
// Each change is moved to where a pianist makes it: lifted just before the next
// chord and pressed again right after it, so the new chord is caught and the
// old harmony is cleared.
function alignPedal(pedal, notes, shift = 0) {
  if (!pedal?.length) return pedal || [];
  const onsets = [...new Set(notes.map((n) => Math.round(n.t * 100) / 100))].sort((x, y) => x - y);
  const out = [];
  let down = false;
  const ev = pedal.map((p) => ({ t: Math.max(0, p.t - shift), v: p.v })).sort((x, y) => x.t - y.t);
  for (let i = 0; i < ev.length; i++) {
    const p = ev[i];
    if (p.v >= 64 && !down) {
      // pressed a little after the phrase began: press it with the first chord instead
      const early = onsets.filter((o) => o < p.t && o > p.t - 0.6 && (!out.length || o > out[out.length - 1].t + 0.05));
      out.push({ t: early.length ? early[0] + 0.04 : p.t, v: 127 });
      down = true;
      continue;
    }
    if (p.v < 64 && down) {
      const next = ev.slice(i + 1).find((q) => q.v >= 64);
      // a quick change near a chord: snap it to that chord
      const near = onsets.filter((o) => o > p.t - 0.3 && o < p.t + 0.35);
      if (next && next.t - p.t < 0.6 && near.length) {
        const o = near.reduce((a, b2) => (Math.abs(b2 - p.t) < Math.abs(a - p.t) ? b2 : a));
        // same bass before and after: the harmony did not change, keep the pedal down
        const low = (a, z) => notes.filter((n) => n.t >= a && n.t < z).reduce((m, n) => Math.min(m, n.k), 128);
        const before = low(o - 1.5, o - 0.02), after = low(o - 0.02, o + 0.4);
        if (before < 128 && after < 128 && before % 12 === after % 12) { i = ev.indexOf(next); continue; }
        out.push({ t: Math.max(0, o - 0.03), v: 0 }, { t: o + 0.06, v: 127 });
        i = ev.indexOf(next);
        continue;
      }
      out.push({ t: p.t, v: 0 });
      down = false;
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

module.exports = { readVideo, merge, alignPedal, handsFromColour, findKeyboard };
