// Renders design mockups to PNG: electron design/capture.js <page.html> <out-dir> a b c
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const [page, outDir, ...variants] = process.argv.slice(2);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false });
  for (const v of variants) {
    await w.loadURL('file:///' + path.resolve(page).replace(/\\/g, '/') + '?v=' + v);
    await new Promise((r) => setTimeout(r, 1500));
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `mockup-${v}.png`), img.toPNG());
  }
  app.quit();
});
