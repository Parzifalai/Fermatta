(async () => {
  const a = window.fermatta;
  for (let i = 0; i < 150 && !a.engine.chain; i++) await new Promise((r) => setTimeout(r, 200));
  const { store } = await import('./store.js');
  const tr = await window.fm.library.trashList();
  for (const x of tr) if (x.name.startsWith('Тест «Мэри»')) await window.fm.library.restore(x.id);
  await a.reloadData();
  const id = store.state.takes.find((x) => x.name.startsWith('Тест «Мэри»')).id;
  await a.openTake(id);
  return id;
})()
