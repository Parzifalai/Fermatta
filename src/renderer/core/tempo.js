// Tempo and beats of a free performance, and "tidying up" the timing.
//
// Beats are found with dynamic-programming beat tracking (Ellis, 2007): the
// note attacks form an "onset strength" curve, the most likely beat length is
// read from its autocorrelation, then the best chain of beats is chosen so
// beats land on strong attacks while keeping a steady (but flexible) pace.
// Because beats follow the player, rubato stays musical when notes are snapped.

const FPS = 100;

function onsetEnvelope(notes, duration) {
  const n = Math.ceil((duration + 2) * FPS);
  const env = new Float32Array(n);
  for (const note of notes) {
    const c = Math.round(note.t * FPS);
    const w = 0.4 + note.v / 127;
    for (let d = -3; d <= 3; d++) {
      const i = c + d;
      if (i >= 0 && i < n) env[i] += w * Math.exp(-(d * d) / 4);
    }
  }
  return env;
}

// Beat length (in frames) from autocorrelation, preferring 60–140 bpm.
function estimatePeriod(env) {
  let best = 50, bestScore = -Infinity;
  for (let p = Math.round(FPS * 60 / 220); p <= Math.round(FPS * 60 / 40); p++) {
    let s = 0;
    for (let i = p; i < env.length; i++) s += env[i] * env[i - p];
    // half and double periods also count a little
    const bpm = (60 * FPS) / p;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 100) / 0.9, 2));
    const score = s * prior;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

export function trackBeats(notes, { bpm = null, tightness = 120 } = {}) {
  if (notes.length < 4) return { bpm: bpm || 120, beats: [] };
  const duration = notes.reduce((m, n) => Math.max(m, n.t), 0);
  const env = onsetEnvelope(notes, duration);
  const period = bpm ? (60 * FPS) / bpm : estimatePeriod(env);
  const n = env.length;
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2), hi = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let best = 0, arg = -1;
    for (let p = t - hi; p <= t - lo; p++) {
      if (p < 0) continue;
      const pen = Math.log((t - p) / period);
      const v = score[p] - tightness * pen * pen;
      if (arg < 0 || v > best) { best = v; arg = p; }
    }
    score[t] = env[t] + (arg >= 0 ? Math.max(0, best) : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // start from the best beat near the end
  let t = n - 1, bestEnd = -Infinity;
  for (let i = Math.max(0, n - Math.round(period * 1.5)); i < n; i++) if (score[i] > bestEnd) { bestEnd = score[i]; t = i; }
  const beats = [];
  while (t >= 0) { beats.push(t / FPS); t = back[t]; }
  beats.reverse();
  // extend one beat before and a few after so every note has a grid
  const P = period / FPS;
  while (beats[0] > 0.02) beats.unshift(Math.max(0, beats[0] - P));
  while (beats[beats.length - 1] < duration + 4 * P) beats.push(beats[beats.length - 1] + P);
  const avg = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  return { bpm: Math.round((60 / avg) * 10) / 10, beats };
}

// Steady grid from a bpm and a start offset.
export function steadyBeats(bpm, offset, duration) {
  const P = 60 / bpm;
  const out = [];
  for (let t = offset - P * Math.ceil(offset / P); t < duration + 4 * P; t += P) out.push(t);
  return out;
}

function beatIndex(beats, t) {
  let lo = 0, hi = beats.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beats[m] <= t) lo = m; else hi = m - 1; }
  return Math.max(0, Math.min(beats.length - 2, lo));
}

// Nearest grid point: `division` steps per beat (4 = sixteenths, 3 = triplets).
export function snapTime(beats, t, division) {
  if (beats.length < 2) return t;
  const i = beatIndex(beats, t);
  const a = beats[i], b = beats[i + 1];
  const step = (b - a) / division;
  const k = Math.round((t - a) / step);
  return a + k * step;
}

// Moves notes toward the grid by `strength` (0..1). Optionally snaps note ends
// and evens out the tempo (rubato removed, `steady` 0..1).
export function quantize(take, { beats, division = 4, strength = 0.6, ends = true, steady = 0 }) {
  if (!beats || beats.length < 2) return take;
  const avg = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const warp = (t) => {
    const i = beatIndex(beats, t);
    const f = (t - beats[i]) / (beats[i + 1] - beats[i]);
    return beats[0] + (i + f) * avg;
  };
  const map = (t) => {
    let x = t + (snapTime(beats, t, division) - t) * strength;
    if (steady > 0) x = x + (warp(x) - x) * steady;
    return Math.max(0, x);
  };
  for (const n of take.notes) {
    const start = map(n.t);
    let end = ends ? map(n.t + n.d) : start + n.d;
    const minLen = (avg / division) * 0.5;
    if (end - start < minLen) end = start + minLen;
    n.t = start;
    n.d = end - start;
  }
  for (const p of take.pedal) p.t = map(p.t);
  take.notes.sort((a, b) => a.t - b.t || a.k - b.k);
  take.pedal.sort((a, b) => a.t - b.t);
  if (steady >= 1) take.bpm = Math.round(60 / avg * 10) / 10;
  return take;
}
