// Renders → transcribes → compares with the original notes (onset ±50 ms, same pitch).
const tr = require('../src/main/transcribe');
const settings = { get: () => ({ pianosDir: 'D:/FermattaData/pianos' }) };
const wav = process.argv[2];
const ref = require('./shots/mary.json');
(async () => {
  const t0 = Date.now();
  const r = await tr.transcribe(wav, settings, () => {});
  const sec = (Date.now() - t0) / 1000;
  const used = new Set();
  let tp = 0, velErr = 0;
  for (const n of ref.notes) {
    const m = r.notes.findIndex((x, i) => !used.has(i) && x.k === n.k && Math.abs(x.t - n.t) < 0.05);
    if (m >= 0) { used.add(m); tp++; velErr += Math.abs(r.notes[m].v - n.v); }
  }
  const p = tp / r.notes.length, rc = tp / ref.notes.length;
  console.log(`time ${sec}s  found ${r.notes.length} / ref ${ref.notes.length}  precision ${(p * 100).toFixed(1)}%  recall ${(rc * 100).toFixed(1)}%  F1 ${(200 * p * rc / (p + rc)).toFixed(1)}%  mean |dVel| ${(velErr / tp).toFixed(1)}  pedal events ${r.pedal.length} (ref ${ref.pedal.length})`);
})().catch((e) => console.error(e));
