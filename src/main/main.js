// Fermatta — main process: window, local protocols, storage, pianos, ffmpeg.
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');
const settings = require('./settings');
const library = require('./library');
const pianos = require('./pianos');
const media = require('./media');
const transcriber = require('./transcribe');
const omr = require('./omr');

const ROOT = path.join(__dirname, '..', '..');

// Sound must start without a click first (the piano can be played right away).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// app:// serves the UI, fm:// serves user data (piano packs, media). Both are
// cross-origin isolated so the audio engine can share sample memory between
// the live and the offline (export) audio contexts.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: 'fm', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*',
};

async function serveFile(file, request) {
  const res = await net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(ISOLATION)) headers.set(k, v);
  if (file.endsWith('.mjs') || file.endsWith('.js')) headers.set('Content-Type', 'text/javascript');
  return new Response(res.body, { status: res.status, headers });
}

function registerProtocols() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    // UI files live in src/renderer; fonts and libraries come from node_modules.
    if (!rel.startsWith('/node_modules/')) rel = '/src/renderer' + rel;
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(file)) { console.warn('app:// missing', rel); return new Response('not found', { status: 404 }); }
    return serveFile(file, request);
  });
  // fm://pianos/<id>/<file>, fm://media/<absolute-path-encoded>
  protocol.handle('fm', (request) => {
    const url = new URL(request.url);
    const parts = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file;
    if (url.host === 'pianos') file = path.join(settings.get().pianosDir, parts);
    else if (url.host === 'library') file = path.join(settings.get().libraryDir, parts);
    else if (url.host === 'file') file = parts;
    else return new Response('not found', { status: 404 });
    return serveFile(path.normalize(file), request);
  });
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#17151b',
    title: 'Fermatta',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://fermatta/');
  if (process.env.FERMATTA_SHOT) devShot(win);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Development self-check: FERMATTA_SHOT=<png> [FERMATTA_EVAL=<js>] [FERMATTA_WAIT=ms]
// waits, optionally runs a script in the window, saves a screenshot and the console log, quits.
function devShot(w) {
  const logs = [];
  w.webContents.on('console-message', (e) => logs.push(`[${e.level}] ${e.message}  (${(e.sourceId || '').split('/').pop()}:${e.lineNumber})`));
  w.webContents.on('render-process-gone', (_e, d) => logs.push('[gone] ' + JSON.stringify(d)));
  const wait = +(process.env.FERMATTA_WAIT || 5000);
  setTimeout(async () => {
    if (process.env.FERMATTA_EVAL) {
      try {
        const r = await w.webContents.executeJavaScript(process.env.FERMATTA_EVAL, true);
        logs.push('[eval] ' + JSON.stringify(r));
      } catch (e) { logs.push('[eval error] ' + e.message); }
      await new Promise((r) => setTimeout(r, +(process.env.FERMATTA_WAIT2 || 1500)));
    }
    const img = await w.webContents.capturePage();
    fs.writeFileSync(process.env.FERMATTA_SHOT, img.toPNG());
    fs.writeFileSync(process.env.FERMATTA_SHOT + '.log', logs.join('\n'));
    app.quit();
  }, wait);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:set', (_e, patch) => settings.set(patch));

  ipcMain.handle('library:list', () => library.list());
  ipcMain.handle('library:save', (_e, take) => library.save(take));
  ipcMain.handle('library:load', (_e, id) => library.load(id));
  ipcMain.handle('library:trash', (_e, id) => library.trash(id));
  ipcMain.handle('library:restore', (_e, id) => library.restore(id));
  ipcMain.handle('library:trashList', () => library.trashList());
  ipcMain.handle('library:purge', (_e, id) => library.purge(id));

  ipcMain.handle('pianos:catalog', () => pianos.catalog());
  ipcMain.handle('pianos:install', (_e, id) => pianos.install(id, (p) => send('pianos:progress', p)));
  ipcMain.handle('pianos:cancel', (_e, id) => pianos.cancel(id));
  ipcMain.handle('pianos:remove', (_e, id) => pianos.remove(id));
  ipcMain.handle('pianos:addCustom', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Выберите файл рояля (.sfz)', filters: [{ name: 'SFZ', extensions: ['sfz'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return pianos.addCustom(r.filePaths[0], (p) => send('pianos:progress', p));
  });

  ipcMain.handle('dialog:open', async (_e, opts) => {
    const r = await dialog.showOpenDialog(win, opts);
    return r.canceled ? null : r.filePaths;
  });
  ipcMain.handle('dialog:save', async (_e, opts) => {
    const r = await dialog.showSaveDialog(win, opts);
    return r.canceled ? null : r.filePath;
  });
  ipcMain.handle('dialog:folder', async (_e, title) => {
    const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('fs:readFile', (_e, file) => fsp.readFile(file));
  ipcMain.handle('fs:writeFile', async (_e, file, data) => {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, Buffer.from(data));
    return file;
  });
  ipcMain.handle('fs:tempFile', (_e, name) => path.join(app.getPath('temp'), 'fermatta', name));
  ipcMain.handle('shell:reveal', (_e, file) => shell.showItemInFolder(file));
  ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url));

  // Streaming writes for big exports (video chunks arrive in order).
  const streams = new Map();
  ipcMain.handle('stream:open', async (_e, file) => {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const id = Math.random().toString(36).slice(2);
    streams.set(id, fs.createWriteStream(file));
    return id;
  });
  ipcMain.handle('stream:write', (_e, id, data) => new Promise((res, rej) => {
    streams.get(id).write(Buffer.from(data), (err) => (err ? rej(err) : res()));
  }));
  ipcMain.handle('stream:close', (_e, id) => new Promise((res) => {
    const s = streams.get(id); streams.delete(id); s.end(res);
  }));

  // Sheet music → PDF: a hidden window draws the score and prints it.
  ipcMain.handle('sheet:pdf', async (_e, xml, out) => {
    const w = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true } });
    try {
      await w.loadURL('app://fermatta/print.html');
      await w.webContents.executeJavaScript(`renderScore(${JSON.stringify(xml)})`, true);
      const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
      await fsp.mkdir(path.dirname(out), { recursive: true });
      await fsp.writeFile(out, pdf);
      return out;
    } finally {
      w.destroy();
    }
  });

  ipcMain.handle('transcribe:file', (_e, file) => transcriber.transcribe(file, settings, (p) => send('transcribe:progress', p)));
  ipcMain.handle('omr:recognize', (_e, file) => omr.recognize(file, settings, (p) => send('omr:progress', p)));
  ipcMain.handle('transcribe:ready', () => transcriber.modelReady(settings));

  ipcMain.handle('media:mp3', (_e, wav, out, meta) => media.toMp3(wav, out, meta));
  ipcMain.handle('media:mux', (_e, args) => media.mux(args, (p) => send('media:progress', p)));
  ipcMain.handle('media:probe', (_e, file) => media.probe(file));
  ipcMain.handle('media:extractAudio', (_e, file, out) => media.extractAudio(file, out));
}

app.whenReady().then(async () => {
  await settings.init(app);
  await library.init(settings);
  await pianos.init(settings, ROOT);
  registerProtocols();
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['midi', 'midiSysex', 'media'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ['midi', 'midiSysex', 'media'].includes(perm));
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
