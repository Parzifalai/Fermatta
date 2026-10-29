// Punch-in check with simulated MIDI: replace from 8 s, then overlay from the end.
(async () => {
  const a = window.fermatta;
  const { store } = await import('./store.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 150 && !a.engine.chain; i++) await sleep(200);
  const it = store.state.takes.find((x) => x.name === 'Тест студии');
  await a.openTake(it.id);
  a.go('takes');
  const before = store.state.take.notes.length;
  const afterMark = store.state.take.notes.filter((n) => n.t >= 8).length;
  const play = async (keys) => {
    for (const k of keys) {
      a.onMidi({ kind: 'on', key: k, vel: 90, time: performance.now() });
      await sleep(180);
      a.onMidi({ kind: 'off', key: k, time: performance.now() });
      await sleep(40);
    }
  };
  // 1. replace from 8 s with a 1 s lead-in
  await a.updateSettings({ punchMode: 'replace', punchPreroll: 1 });
  a.pausedAt = 8;
  await a.startPunch();
  const during = { mode: store.state.mode, punch: store.state.punch };
  await play([60]);                // inside the lead-in: must be ignored
  await sleep(1000);
  await play([62, 64, 65, 67]);    // after the mark: recorded
  await a.stopRecord();
  const tk = store.state.take;
  const replaced = {
    total: tk.notes.length,
    afterMarkNow: tk.notes.filter((n) => n.t >= 8).length,
    newKeys: tk.notes.filter((n) => n.t >= 8).map((n) => n.k),
    firstNew: +tk.notes.filter((n) => n.t >= 8)[0]?.t.toFixed(2),
    duration: +tk.duration.toFixed(2),
    playhead: +a.pausedAt.toFixed(2),
  };
  // 2. overlay from the end
  await a.updateSettings({ punchMode: 'overlay' });
  a.markAtEnd();
  const mark2 = a.pausedAt;
  await a.startPunch();
  await sleep(1100);
  await play([72, 74]);
  await a.stopRecord();
  const overlay = { mark2: +mark2.toFixed(2), total: store.state.take.notes.length, added: store.state.take.notes.filter((n) => n.t >= mark2 - 0.01).map((n) => n.k) };
  // 3. undo restores the overlay step
  await a.undo();
  const undone = store.state.take.notes.length;
  return { before, afterMark, during, replaced, overlay, undone };
})()
