// Guesses which hand plays each note. Notes struck together form a chord; every
// chord is split between the hands where it costs least: notes far from that
// hand's current position, stretches wider than a hand, and more than five
// fingers per hand are expensive. Hand positions then drift with the music.
// Notes the user fixed by hand (n.hLock) are kept.

const SPAN = 13;

function chords(notes) {
  const out = [];
  let cur = [];
  for (const n of notes) {
    if (cur.length && n.t - cur[0].t > 0.045) { out.push(cur); cur = []; }
    cur.push(n);
  }
  if (cur.length) out.push(cur);
  return out;
}

function handCost(keys, center, active) {
  if (!keys.length) return 0;
  let c = 0;
  for (const k of keys) c += Math.abs(k - center) * 0.6;
  const all = keys.concat(active);
  const span = Math.max(...all) - Math.min(...all);
  if (span > SPAN) c += (span - SPAN) * 6;
  if (keys.length > 5) c += (keys.length - 5) * 40;
  return c;
}

export function assignHands(notes, { split = 60 } = {}) {
  if (!notes.length) return notes;
  const sorted = notes.slice().sort((a, b) => a.t - b.t || a.k - b.k);
  let L = Math.min(split - 7, sorted[0].k);
  let R = Math.max(split + 7, sorted[0].k);
  const sounding = []; // notes still held: {n, end}
  for (const chord of chords(sorted)) {
    const t = chord[0].t;
    for (let i = sounding.length - 1; i >= 0; i--) if (sounding[i].t + sounding[i].d < t) sounding.splice(i, 1);
    const actL = sounding.filter((n) => n.h === 0).map((n) => n.k);
    const actR = sounding.filter((n) => n.h === 1).map((n) => n.k);
    chord.sort((a, b) => a.k - b.k);
    const keys = chord.map((n) => n.k);
    let best = { cost: Infinity, at: 0 };
    for (let at = 0; at <= keys.length; at++) {
      const left = keys.slice(0, at);
      const right = keys.slice(at);
      // locked notes must stay on their side
      if (chord.some((n, i) => n.hLock && (i < at ? n.h !== 0 : n.h !== 1))) continue;
      let cost = handCost(left, L, actL) + handCost(right, R, actR);
      // a lone low note is usually the left hand and vice versa
      if (left.length && Math.max(...left) > split + 12) cost += 8;
      if (right.length && Math.min(...right) < split - 12) cost += 8;
      if (cost < best.cost) best = { cost, at };
    }
    chord.forEach((n, i) => { if (!n.hLock) n.h = i < best.at ? 0 : 1; });
    const lk = keys.slice(0, best.at);
    const rk = keys.slice(best.at);
    if (lk.length) L = L * 0.6 + (lk.reduce((a, b) => a + b, 0) / lk.length) * 0.4;
    if (rk.length) R = R * 0.6 + (rk.reduce((a, b) => a + b, 0) / rk.length) * 0.4;
    // hands never cross over on average
    if (R - L < 5) { const mid = (L + R) / 2; L = mid - 2.5; R = mid + 2.5; }
    sounding.push(...chord);
  }
  return notes;
}
