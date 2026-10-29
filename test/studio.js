// Opens a rich demo take in the video studio at a moment where many keys sound.
// Usage: FERMATTA_EVAL="$(cat test/studio.js)" with optional globals set before it:
//   PRESET (id), TAB (studio tab), AT (seconds), ASPECT, PATCH (style patch)
(async () => {
  const a = window.fermatta;
  const { store } = await import('./store.js');
  const { demoTake, applyPreset } = await import('./visual/tiles-render.js');
  const NAME = 'Тест студии';
  let it = store.state.takes.find((x) => x.name === NAME);
  if (!it) {
    const d = demoTake();
    // two more bars of fast right-hand runs for sparks and embers
    for (let i = 0; i < 24; i++) d.notes.push({ k: 72 + ((i * 5) % 14), v: 100, t: 16 + i * 0.12, d: 0.3, h: 1 });
    d.notes.push({ k: 36, v: 110, t: 16, d: 3, h: 0 }, { k: 43, v: 100, t: 16, d: 3, h: 0 });
    d.notes.sort((x, y) => x.t - y.t);
    const take = { ...d, id: 'studio-test', name: NAME, created: Date.now(), duration: 19.5, source: 'live', version: 1 };
    await window.fm.library.save(take);
    await a.reloadData();
    it = store.state.takes.find((x) => x.name === NAME);
  }
  await a.openTake(it.id);
  if (window.ASPECT) await a.updateSettings({ tilesAspect: window.ASPECT });
  a.go('tiles');
  const ui = a.pages.tiles.ui;
  if (window.PRESET) document.querySelector(`.preset[data-id="${window.PRESET}"]`)?.click();
  if (window.TAB) document.querySelector(`.studio-tabs [data-tab="${window.TAB}"]`)?.click();
  if (window.ASPECT) document.querySelector(`.tiles-head [data-a="${window.ASPECT}"]`)?.click();
  a.pausedAt = window.AT ?? 4.3;
  ui.show();
  return { preset: a.visualStyle().preset, tab: window.TAB };
})()
