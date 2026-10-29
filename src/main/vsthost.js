// Plays VST3 instruments (Kontakt with Noire, Pianoteq…) through a small Python
// host built on Spotify's Pedalboard. The host environment is set up on first
// use in <data>/tools/vsthost; the host process stays alive between renders
// because Kontakt takes a while to start.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const PACKAGES = ['pedalboard==0.9.26', 'mido==1.3.3', 'numpy'];
const toolsDir = (settings) => path.join(path.dirname(settings.get().pianosDir), 'tools', 'vsthost');
const venvPython = (settings) => path.join(toolsDir(settings), 'venv', 'Scripts', 'python.exe');
// each plugin keeps its own chosen instrument
function statePath(settings) {
  const p = settings.get().vstPlugin || findKontakt();
  const file = path.join(toolsDir(settings), `instrument-${p ? path.basename(p, '.vst3') : 'none'}.state`);
  const old = path.join(toolsDir(settings), 'instrument.state');
  if (!fs.existsSync(file) && fs.existsSync(old) && p && /kontakt/i.test(p)) fs.renameSync(old, file);
  return file;
}
const hostScript = () => path.join(__dirname, 'vsthost', 'host.py').replace('app.asar', 'app.asar.unpacked');

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    const feed = (d) => { for (const l of d.toString().split(/\r?\n/)) if (l.trim()) onLine?.(l.trim()); };
    p.stdout.on('data', feed);
    p.stderr.on('data', (d) => { err += d; feed(d); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.split('\n').filter(Boolean).slice(-3).join(' ') || `${cmd} exited ${code}`))));
  });
}

// A system Python 3.9+ to create the host environment from.
async function findPython() {
  const tries = [['py', ['-3']], ['python', []], ['python3', []]];
  for (const [cmd, pre] of tries) {
    const ok = await new Promise((r) => execFile(cmd, [...pre, '-c', 'import sys;print(sys.version_info[:2]>=(3,9))'], { windowsHide: true }, (e, out) => r(!e && out.includes('True'))));
    if (ok) return [cmd, pre];
  }
  return null;
}

// Default instrument: Kontakt, if it is installed.
function findKontakt() {
  const dir = path.join(process.env.CommonProgramFiles || 'C:\\Program Files\\Common Files', 'VST3');
  try {
    const hits = fs.readdirSync(dir).filter((f) => /^kontakt/i.test(f) && f.endsWith('.vst3')).sort().reverse();
    return hits.length ? path.join(dir, hits[0]) : null;
  } catch { return null; }
}

function status(settings) {
  const s = settings.get();
  return {
    envReady: fs.existsSync(venvPython(settings)) && fs.existsSync(path.join(toolsDir(settings), 'ready')),
    plugin: s.vstPlugin || findKontakt(),
    hasState: fs.existsSync(statePath(settings)),
    running: !!host.proc,
    loaded: host.loaded,
  };
}

async function setup(settings, progress) {
  if (status(settings).envReady) return;
  const py = await findPython();
  if (!py) throw new Error('PYTHON_MISSING');
  const dir = toolsDir(settings);
  fs.mkdirSync(dir, { recursive: true });
  progress({ stage: 'venv' });
  await run(py[0], [...py[1], '-m', 'venv', path.join(dir, 'venv')]);
  progress({ stage: 'packages' });
  await run(venvPython(settings), ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', ...PACKAGES], (l) => progress({ stage: 'packages', line: l }));
  fs.writeFileSync(path.join(dir, 'ready'), new Date().toISOString());
}

// The long-lived host process.
const host = {
  proc: null, loaded: null, seq: 0, pending: new Map(), buf: '',
  start(settings) {
    if (this.proc) return;
    const p = spawn(venvPython(settings), ['-u', hostScript()], { windowsHide: true });
    this.proc = p;
    p.stdout.on('data', (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        const req = this.pending.get(m.id);
        if (!req) continue;
        this.pending.delete(m.id);
        if (m.ok) req.resolve(m); else req.reject(new Error(m.error));
      }
    });
    p.stderr.on('data', () => {});
    p.on('close', () => {
      this.proc = null; this.loaded = null;
      for (const r of this.pending.values()) r.reject(new Error('The plugin host stopped'));
      this.pending.clear();
    });
  },
  send(cmd) {
    if (!this.proc) return Promise.reject(new Error('The plugin host is not running'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ id, ...cmd }) + '\n');
    });
  },
  stop() {
    if (!this.proc) return;
    this.send({ cmd: 'quit' }).catch(() => {});
    setTimeout(() => this.proc?.kill(), 3000);
  },
};

async function load(settings) {
  const st = status(settings);
  if (!st.plugin) throw new Error('PLUGIN_MISSING');
  host.start(settings);
  if (host.loaded === st.plugin) return { name: path.basename(st.plugin, '.vst3') };
  const r = await host.send({ cmd: 'load', plugin: st.plugin, state: st.hasState ? statePath(settings) : null });
  host.loaded = st.plugin;
  return r;
}

async function editor(settings) {
  await load(settings);
  return host.send({ cmd: 'editor', state: statePath(settings) });
}

// events: [[seconds, 'on'|'off'|'cc', a, b], …] → bytes of a float WAV
async function render(settings, events, duration) {
  await load(settings);
  const out = path.join(os.tmpdir(), `fermatta-vst-${Date.now()}.wav`);
  const r = await host.send({ cmd: 'render', events, duration, out, sr: 48000 });
  const data = fs.readFileSync(out);
  fs.unlink(out, () => {});
  return { data, peak: r.peak, seconds: r.seconds };
}

app.on('will-quit', () => host.stop());

module.exports = { status, setup, load, editor, render, stop: () => host.stop(), findKontakt };
