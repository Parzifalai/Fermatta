// Readable sheet music: PM2S (a neural network for beats, bars, hands, key and
// time signature) runs in a small Python environment, and MuseScore engraves
// the PDF. Both are downloaded once, on first use, into <data>/tools and <data>/models.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const https = require('https');

const MODELS = ['RNNJointBeatModel', 'RNNHandPartModel', 'RNNKeySignatureModel', 'CNNTimeSignatureModel'];
const MODEL_URL = (name) => `https://zenodo.org/records/10520196/files/${name}.pth?download=1`;
const MUSESCORE = { version: '4.6.2', url: 'https://github.com/musescore/MuseScore/releases/download/v4.6.2/MuseScore-Studio-4.6.2.252830930-x86_64.msi', size: 115232768 };

const dataDir = (settings) => path.dirname(settings.get().pianosDir);
const envDir = (settings) => path.join(dataDir(settings), 'tools', 'notation');
const envPython = (settings) => path.join(envDir(settings), 'venv', 'Scripts', 'python.exe');
const modelDir = (settings) => path.join(dataDir(settings), 'models', 'pm2s');
const museDir = (settings) => path.join(dataDir(settings), 'tools', 'musescore');
const museExe = (settings) => path.join(museDir(settings), 'MuseScore 4', 'bin', 'MuseScore4.exe');
const script = () => path.join(__dirname, 'notation', 'score_features.py').replace('app.asar', 'app.asar.unpacked');

function run(cmd, args, { onLine, timeout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    const timer = timeout ? setTimeout(() => p.kill(), timeout) : null;
    const feed = (d) => { for (const l of d.toString().split(/\r?\n/)) if (l.trim()) onLine?.(l.trim()); };
    p.stdout.on('data', feed);
    p.stderr.on('data', (d) => { err = (err + d).slice(-3000); feed(d); });
    p.on('error', reject);
    p.on('close', (code) => { if (timer) clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err.split('\n').filter(Boolean).slice(-2).join(' ') || `${path.basename(cmd)} exited ${code}`)); });
  });
}

// Plain HTTPS download with redirects and progress.
function download(url, out, onProgress) {
  return new Promise((resolve, reject) => {
    const get = (u, hops = 0) => https.get(u, { headers: { 'User-Agent': 'Fermatta' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 8) { res.resume(); get(new URL(res.headers.location, u).toString(), hops + 1); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const total = +res.headers['content-length'] || 0;
      let got = 0;
      const tmp = out + '.part';
      const f = fs.createWriteStream(tmp);
      res.on('data', (d) => { got += d.length; onProgress?.(got, total); });
      res.pipe(f);
      f.on('finish', () => f.close(() => fs.rename(tmp, out, (e) => (e ? reject(e) : resolve()))));
      f.on('error', reject);
    }).on('error', reject);
    get(url);
  });
}

async function findPython() {
  for (const [cmd, pre] of [['py', ['-3']], ['python', []], ['python3', []]]) {
    const ok = await new Promise((r) => execFile(cmd, [...pre, '-c', 'import sys;print(sys.version_info[:2]>=(3,9))'], { windowsHide: true }, (e, o) => r(!e && o.includes('True'))));
    if (ok) return [cmd, pre];
  }
  return null;
}

function status(settings) {
  return {
    env: fs.existsSync(path.join(envDir(settings), 'ready')),
    models: MODELS.every((m) => fs.existsSync(path.join(modelDir(settings), m + '.pth'))),
    musescore: fs.existsSync(museExe(settings)),
  };
}

// Python environment (PyTorch for CPU, ~200 MB) and the four models (~200 MB).
async function prepare(settings, progress) {
  const st = status(settings);
  if (!st.env) {
    const py = await findPython();
    if (!py) throw new Error('PYTHON_MISSING');
    const dir = envDir(settings);
    await fsp.mkdir(dir, { recursive: true });
    progress({ stage: 'env', ratio: 0.05 });
    await run(py[0], [...py[1], '-m', 'venv', path.join(dir, 'venv')]);
    progress({ stage: 'env', ratio: 0.2 });
    await run(envPython(settings), ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu']);
    progress({ stage: 'env', ratio: 0.8 });
    await run(envPython(settings), ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', 'numpy', 'pandas', 'pretty_midi', 'mido']);
    await fsp.writeFile(path.join(dir, 'ready'), new Date().toISOString());
  }
  if (!st.models) {
    await fsp.mkdir(modelDir(settings), { recursive: true });
    for (let i = 0; i < MODELS.length; i++) {
      const file = path.join(modelDir(settings), MODELS[i] + '.pth');
      if (fs.existsSync(file)) continue;
      await download(MODEL_URL(MODELS[i]), file, (got, total) => progress({ stage: 'models', ratio: (i + (total ? got / total : 0)) / MODELS.length }));
    }
  }
}

// notes: [[pitch, onset, duration, velocity], …] → beats, downbeats, hands, key, time signature
async function analyze(settings, notes, progress = () => {}) {
  await prepare(settings, progress);
  progress({ stage: 'analyze', ratio: 0.5 });
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'fermatta-score-'));
  const inp = path.join(tmp, 'in.json'), out = path.join(tmp, 'out.json');
  await fsp.writeFile(inp, JSON.stringify({ notes }));
  await run(envPython(settings), ['-I', script(), inp, out, modelDir(settings)], { timeout: 5 * 60 * 1000 });
  const r = JSON.parse(await fsp.readFile(out, 'utf8'));
  fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  return r;
}

// MuseScore Studio, unpacked from its official installer without installing it.
async function ensureMuseScore(settings, progress) {
  if (fs.existsSync(museExe(settings))) return museExe(settings);
  const dl = path.join(dataDir(settings), 'tools', '_dl', `musescore-${MUSESCORE.version}.msi`);
  await fsp.mkdir(path.dirname(dl), { recursive: true });
  if (!fs.existsSync(dl) || (await fsp.stat(dl)).size !== MUSESCORE.size) {
    await download(MUSESCORE.url, dl, (got, total) => progress({ stage: 'musescore', ratio: (got / (total || MUSESCORE.size)) * 0.9 }));
  }
  progress({ stage: 'unpack', ratio: 0.95 });
  await run('msiexec.exe', ['/a', dl, '/qn', `TARGETDIR=${museDir(settings)}`]);
  if (!fs.existsSync(museExe(settings))) throw new Error('MuseScore could not be unpacked');
  return museExe(settings);
}

// MusicXML → PDF (or another format MuseScore can write, chosen by the extension)
async function engrave(settings, xml, out, progress = () => {}) {
  const exe = await ensureMuseScore(settings, progress);
  progress({ stage: 'engrave', ratio: 0.97 });
  const tmp = path.join(os.tmpdir(), `fermatta-${Date.now()}.musicxml`);
  await fsp.writeFile(tmp, xml);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await run(exe, ['-o', out, tmp], { timeout: 3 * 60 * 1000 });
  fsp.rm(tmp, { force: true }).catch(() => {});
  // pictures come out one per page: name-1.png, name-2.png…
  const paged = out.replace(/(\.[^.]+)$/, '-1$1');
  if (!fs.existsSync(out) && !fs.existsSync(paged)) throw new Error('MuseScore did not write the file');
  return out;
}

module.exports = { status, prepare, analyze, engrave };
