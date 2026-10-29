// Sheet music recognition (PDF / photo → MusicXML) with Audiveris (AGPL-3.0),
// downloaded from its official GitHub release on first use and unpacked into
// the app's data folder (nothing is installed into Windows).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const VERSION = '5.11.0';
const URL = `https://github.com/Audiveris/audiveris/releases/download/${VERSION}/Audiveris-${VERSION}-windowsConsole-x86_64.msi`;
const SIZE = 85062430;

const toolsDir = (settings) => path.join(path.dirname(settings.get().pianosDir), 'tools');
const exePath = (settings) => path.join(toolsDir(settings), 'audiveris', 'Audiveris', 'Audiveris.exe');

async function ensure(settings, progress) {
  if (fs.existsSync(exePath(settings))) return exePath(settings);
  const dl = path.join(toolsDir(settings), '_dl', `audiveris-${VERSION}.msi`);
  if (!fs.existsSync(dl) || fs.statSync(dl).size !== SIZE) {
    await require('./pianos').download({ type: 'url', url: URL }, dl, { cancelled: false },
      (p) => progress({ stage: 'tool', ratio: p.total ? p.bytes / p.total : 0 }));
  }
  if (fs.statSync(dl).size !== SIZE) throw new Error('Audiveris download incomplete');
  progress({ stage: 'unpack', ratio: 0 });
  // administrative install = plain extraction into a folder
  await new Promise((resolve, reject) => {
    const p = spawn('msiexec.exe', ['/a', dl, '/qn', `TARGETDIR=${path.join(toolsDir(settings), 'audiveris')}`], { windowsHide: true });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('msiexec ' + c))));
  });
  await fsp.rm(dl, { force: true });
  if (!fs.existsSync(exePath(settings))) throw new Error('Audiveris was not unpacked');
  return exePath(settings);
}

async function recognize(file, settings, progress = () => {}) {
  const exe = await ensure(settings, progress);
  const out = path.join(os.tmpdir(), 'fermatta', 'omr-' + Date.now());
  await fsp.mkdir(out, { recursive: true });
  progress({ stage: 'read', ratio: 0 });
  await new Promise((resolve, reject) => {
    const p = spawn(exe, ['-batch', '-export', '-output', out, '--', file], { windowsHide: true });
    let log = '';
    const steps = ['LOAD', 'BINARY', 'SCALE', 'GRID', 'HEADERS', 'STEM_SEEDS', 'BEAMS', 'LEDGERS', 'HEADS', 'STEMS', 'REDUCTION', 'CUE_BEAMS', 'TEXTS', 'MEASURES', 'CHORDS', 'CURVES', 'SYMBOLS', 'LINKS', 'RHYTHMS', 'PAGE'];
    const onData = (d) => {
      const s = d.toString();
      log = (log + s).slice(-3000);
      const m = /StepMonitoring.*\|\s+(\w+)/.exec(s);
      if (m) { const i = steps.indexOf(m[1]); if (i >= 0) progress({ stage: 'read', ratio: (i + 1) / steps.length }); }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('Audiveris: ' + log.trim().split('\n').pop()))));
  });
  const files = (await fsp.readdir(out)).filter((f) => /\.(mxl|musicxml|xml)$/i.test(f)).sort();
  if (!files.length) throw new Error('no-notes');
  // multi-movement books export one file per movement; take them in order
  return Promise.all(files.map((f) => fsp.readFile(path.join(out, f))));
}

module.exports = { recognize };
