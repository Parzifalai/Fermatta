// Dev helper: launches Fermatta, runs an optional script in the window, saves screenshots.
const { _electron: electron } = require('playwright-core');
const path = require('path');
(async () => {
  const out = process.argv[2] || 'shot';
  const script = process.argv[3] || '';
  const wait = +(process.argv[4] || 4000);
  const app = await electron.launch({ args: [path.join(__dirname, '..')], cwd: path.join(__dirname, '..') });
  const win = await app.firstWindow();
  const logs = [];
  win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  win.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await win.waitForTimeout(wait);
  if (script) {
    try { console.log('result:', JSON.stringify(await win.evaluate(script))); } catch (e) { console.log('script error', e.message); }
    await win.waitForTimeout(1500);
  }
  await win.screenshot({ path: path.join(__dirname, 'shots', out + '.png') });
  console.log(logs.join('\n'));
  await app.close();
})();
