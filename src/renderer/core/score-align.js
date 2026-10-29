// Compares a performance with the written notes of the piece.
// Both are turned into chord sequences and aligned (Needleman–Wunsch), so a
// skipped bar or an extra note does not throw the rest off. Matched chords
// also give a time map: written time → when you actually played it.

function chords(notes, gap = 0.07) {
  const sorted = notes.slice().sort((a, b) => a.t - b.t || a.k - b.k);
  const out = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n.t - last.t < gap) { last.notes.push(n); last.keys.add(n.k); }
    else out.push({ t: n.t, notes: [n], keys: new Set([n.k]) });
  }
  return out;
}

function similarity(a, b) {
  let common = 0;
  for (const k of a) if (b.has(k)) common++;
  // pitch classes count half (octave slips are near-misses)
  const pa = new Set([...a].map((k) => k % 12)), pb = new Set([...b].map((k) => k % 12));
  let pc = 0;
  for (const k of pa) if (pb.has(k)) pc++;
  const union = new Set([...a, ...b]).size;
  return (common + 0.3 * (pc - Math.min(pc, common))) / union;
}

export function alignToScore(perf, score) {
  const P = chords(perf.notes), S = chords(score.notes);
  const n = P.length, m = S.length;
  const GAP = -0.45;
  const W = m + 1;
  const dp = new Float32Array((n + 1) * W);
  const bt = new Uint8Array((n + 1) * W); // 1 diag, 2 up (perf extra), 3 left (score missing)
  for (let i = 1; i <= n; i++) { dp[i * W] = i * GAP; bt[i * W] = 2; }
  for (let j = 1; j <= m; j++) { dp[j] = j * GAP; bt[j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(P[i - 1].keys, S[j - 1].keys);
      const d = dp[(i - 1) * W + j - 1] + (sim > 0 ? sim : -0.6);
      const u = dp[(i - 1) * W + j] + GAP;
      const l = dp[i * W + j - 1] + GAP;
      if (d >= u && d >= l) { dp[i * W + j] = d; bt[i * W + j] = 1; }
      else if (u >= l) { dp[i * W + j] = u; bt[i * W + j] = 2; }
      else { dp[i * W + j] = l; bt[i * W + j] = 3; }
    }
  }
  const pairs = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = bt[i * W + j];
    if (b === 1) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (b === 2 || j === 0) { pairs.push([i - 1, -1]); i--; }
    else { pairs.push([-1, j - 1]); j--; }
  }
  pairs.reverse();

  // time map from matched chords
  const anchors = pairs.filter(([a, b]) => a >= 0 && b >= 0 && similarity(P[a].keys, S[b].keys) >= 0.5)
    .map(([a, b]) => [S[b].t, P[a].t]);
  const warp = makeWarp(anchors);

  const marks = []; // {type: wrong|missing|extra, k, t, d, note?}
  let correct = 0;
  for (const [a, b] of pairs) {
    const pc = a >= 0 ? P[a] : null, sc = b >= 0 ? S[b] : null;
    if (pc && sc) {
      const extra = pc.notes.filter((x) => !sc.keys.has(x.k));
      const missing = sc.notes.filter((x) => !pc.keys.has(x.k));
      correct += pc.notes.length - extra.length;
      for (const x of extra) {
        const near = missing.find((y) => Math.abs(y.k - x.k) <= 2);
        marks.push({ type: near ? 'wrong' : 'extra', k: x.k, t: x.t, d: x.d, note: x, should: near?.k });
      }
      for (const y of missing) if (!extra.some((x) => Math.abs(y.k - x.k) <= 2)) marks.push({ type: 'missing', k: y.k, t: warp(y.t), d: warp(y.t + y.d) - warp(y.t) });
    } else if (pc) {
      for (const x of pc.notes) marks.push({ type: 'extra', k: x.k, t: x.t, d: x.d, note: x });
    } else {
      for (const y of sc.notes) marks.push({ type: 'missing', k: y.k, t: warp(y.t), d: Math.max(0.1, warp(y.t + y.d) - warp(y.t)) });
    }
  }
  // the same key played a little early or late is a timing slip, not a mistake
  for (const x of marks) {
    if (x.type !== 'extra' || x.gone) continue;
    const y = marks.find((m) => m.type === 'missing' && !m.gone && m.k === x.k && Math.abs(m.t - x.t) < 0.3);
    if (y) { x.gone = y.gone = true; correct++; }
  }
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i].gone) marks.splice(i, 1);
  const total = score.notes.length;
  return {
    marks,
    correct,
    wrong: marks.filter((x) => x.type === 'wrong').length,
    missing: marks.filter((x) => x.type === 'missing').length,
    extra: marks.filter((x) => x.type === 'extra').length,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    // the written notes laid out on your timing, with your loudness
    fixed: () => fixedTake(perf, score, pairs, P, S, warp),
  };
}

function makeWarp(anchors) {
  if (!anchors.length) return (t) => t;
  const a = anchors.filter((x, i) => i === 0 || x[1] > anchors[i - 1][1] && x[0] > anchors[i - 1][0]);
  const rate = a.length > 1 ? (a[a.length - 1][1] - a[0][1]) / Math.max(1e-3, a[a.length - 1][0] - a[0][0]) : 1;
  return (t) => {
    if (t <= a[0][0]) return a[0][1] + (t - a[0][0]) * rate;
    for (let i = 1; i < a.length; i++) {
      if (t <= a[i][0]) {
        const f = (t - a[i - 1][0]) / (a[i][0] - a[i - 1][0]);
        return a[i - 1][1] + f * (a[i][1] - a[i - 1][1]);
      }
    }
    const l = a[a.length - 1];
    return l[1] + (t - l[0]) * rate;
  };
}

function fixedTake(perf, score, pairs, P, S, warp) {
  const velOf = new Map(); // score note → velocity
  const avgVel = perf.notes.reduce((s, n) => s + n.v, 0) / Math.max(1, perf.notes.length);
  for (const [a, b] of pairs) {
    if (a < 0 || b < 0) continue;
    const pv = P[a].notes;
    const chordVel = pv.reduce((s, n) => s + n.v, 0) / pv.length;
    for (const y of S[b].notes) {
      const same = pv.find((x) => x.k === y.k);
      velOf.set(y, same ? same.v : chordVel);
    }
  }
  const notes = score.notes.map((y) => {
    const t = warp(y.t);
    const d = Math.max(0.03, warp(y.t + y.d) - t);
    return { k: y.k, v: Math.round(velOf.get(y) ?? avgVel), t: Math.max(0, t), d, h: y.h ?? 1, hLock: !!score.handsManual };
  });
  return { ...perf, notes: notes.sort((a, b) => a.t - b.t || a.k - b.k), beats: null, handsManual: !!score.handsManual };
}
