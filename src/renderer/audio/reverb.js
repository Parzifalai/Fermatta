// Algorithmic hall impulses: decorrelated noise with frequency-dependent decay
// and a few early reflections. Deterministic, so exports always sound the same.

export const HALLS = {
  none: { rt: 0, pre: 0, damp: 0 },
  room: { rt: 0.7, pre: 0.006, damp: 0.55 },
  studio: { rt: 1.3, pre: 0.012, damp: 0.45 },
  hall: { rt: 2.4, pre: 0.022, damp: 0.38 },
  concert: { rt: 3.2, pre: 0.03, damp: 0.32 },
  cathedral: { rt: 5.5, pre: 0.045, damp: 0.25 },
  cinema: { rt: 9, pre: 0.05, damp: 0.3 },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();

// size scales the decay time, pre adds pre-delay (s), tone -1 dark .. +1 bright.
export function makeImpulse(ctx, name, { size = 1, pre = 0, tone = 0 } = {}) {
  const base = HALLS[name] || HALLS.hall;
  const h = { rt: base.rt * size, pre: base.pre + pre, damp: Math.max(0.05, Math.min(0.9, base.damp - tone * 0.22)) };
  const key = `${name}|${size.toFixed(2)}|${pre.toFixed(3)}|${tone.toFixed(2)}@${ctx.sampleRate}`;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.round(sr * (h.rt + h.pre + 0.2)));
  let data = cache.get(key);
  if (!data) {
    data = [0, 1].map((c) => {
      const out = new Float32Array(len);
      if (!h.rt) { out[0] = 1; return out; }
      const rand = rng(1234 + c * 999);
      const pre = Math.round(h.pre * sr);
      const tau = h.rt / 6.91;
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        // high frequencies die faster: the low-pass closes as time goes on
        const a = Math.min(0.97, h.damp * 0.2 + (t / h.rt) * 0.85);
        lp = lp * a + (rand() * 2 - 1) * (1 - a);
        const fadeIn = Math.min(1, t / 0.012);
        out[i] = lp * Math.exp(-t / tau) * fadeIn;
      }
      // early reflections
      for (let k = 0; k < 9; k++) {
        const d = pre + Math.round((0.004 + rand() * 0.06) * sr);
        if (d < len) out[d] += (rand() * 0.6 + 0.2) * (c ? -1 : 1) * Math.exp(-k * 0.35) * 0.5;
      }
      let sum = 0;
      for (let i = 0; i < len; i++) sum += out[i] * out[i];
      const norm = 1 / Math.sqrt(sum || 1);
      for (let i = 0; i < len; i++) out[i] *= norm * 0.9;
      return out;
    });
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    cache.set(key, data);
  }
  const buf = ctx.createBuffer(2, len, sr);
  buf.copyToChannel(data[0], 0);
  buf.copyToChannel(data[1], 1);
  return buf;
}
