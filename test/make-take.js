// Builds a humanised test performance (melody + left-hand chords) for checks.
(async () => {
  const a = window.fermatta;
  for (let i = 0; i < 150 && !a.engine.chain; i++) await new Promise((r) => setTimeout(r, 200));
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const P = 60 / 92, notes = [], pedal = [];
  const mel = [76, 74, 72, 74, 76, 76, 76, 0, 74, 74, 74, 0, 76, 79, 79, 0, 76, 74, 72, 74, 76, 76, 76, 76, 74, 74, 76, 74, 72, 0, 0, 0];
  mel.forEach((k, i) => { if (k) notes.push({ k, v: 70 + Math.round(rnd() * 30), t: i * P + rnd() * 0.06 + 0.3, d: P * 0.9 + rnd() * 0.05, h: 1 }); });
  const chords = [[48, 55, 64], [43, 55, 62], [48, 55, 64], [43, 50, 59], [48, 55, 64], [43, 55, 62], [45, 52, 60], [48, 55, 64]];
  chords.forEach((c, bar) => { const t = bar * 4 * P + 0.3; c.forEach((k) => notes.push({ k, v: 58, t: t + rnd() * 0.05, d: 4 * P - 0.1, h: 0 })); pedal.push({ t: t + 0.05, v: 127 }, { t: t + 4 * P - 0.08, v: 0 }); });
  notes.sort((x, y) => x.t - y.t);
  const take = { id: 'test-mary-' + Date.now(), name: 'Тест «Мэри» с неровностями', created: Date.now(), duration: 0, notes, pedal, source: 'live', version: 1 };
  take.duration = Math.max(...notes.map((n) => n.t + n.d));
  await window.fm.library.save(take);
  await a.reloadData();
  await a.openTake(take.id);
  return take.id;
})()
