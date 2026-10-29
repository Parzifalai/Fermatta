// Minimal SFZ reader: enough of the format to play sampled pianos faithfully.
// Supports #define/#include, <control>/<global>/<master>/<group>/<region>,
// note names, velocity/key ranges, release triggers, CC conditions, round robins.
const fs = require('fs');
const path = require('path');

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteNumber(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  const m = /^([a-g])([#b]?)(-?\d+)$/i.exec(v.trim());
  if (!m) return undefined;
  let n = NOTE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return n + (parseInt(m[3], 10) + 1) * 12;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// Expands #include and #define recursively, returning one flat text.
function preprocess(file, defines = {}, depth = 0) {
  if (depth > 16) return '';
  const base = path.dirname(file);
  let text = stripComments(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (let line of text.split(/\r?\n/)) {
    const def = /^\s*#define\s+(\$\w+)\s+(.*?)\s*$/.exec(line);
    if (def) { defines[def[1]] = def[2]; continue; }
    line = line.replace(/\$\w+/g, (m) => (m in defines ? defines[m] : m));
    const inc = /^\s*#include\s+"([^"]+)"/.exec(line);
    if (inc) {
      const target = path.resolve(base, inc[1].replace(/\\/g, '/'));
      if (fs.existsSync(target)) out.push(preprocess(target, defines, depth + 1));
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// Splits "a=1 sample=My File.wav b=2" respecting spaces inside values.
function parseOpcodes(chunk, into) {
  const re = /([A-Za-z0-9_]+)=/g;
  const found = [];
  let m;
  while ((m = re.exec(chunk))) found.push({ key: m[1], start: m.index, valStart: re.lastIndex });
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].start : chunk.length;
    let value = chunk.slice(found[i].valStart, end).trim();
    if (found[i].key !== 'sample') value = value.split(/\s+/)[0];
    into[found[i].key] = value;
  }
}

function parse(file) {
  const text = preprocess(file);
  const levels = { control: {}, global: {}, master: {}, group: {}, region: null };
  const regions = [];
  let current = null;
  const flush = () => {
    if (current === 'region' && levels.region) {
      regions.push({ ...levels.global, ...levels.master, ...levels.group, ...levels.region });
    }
  };
  const tokens = text.split(/(<\w+>)/);
  for (const tok of tokens) {
    const h = /^<(\w+)>$/.exec(tok);
    if (h) {
      flush();
      current = h[1].toLowerCase();
      if (current === 'global') { levels.global = {}; levels.master = {}; levels.group = {}; }
      if (current === 'master') { levels.master = {}; levels.group = {}; }
      if (current === 'group') levels.group = {};
      if (current === 'region') levels.region = {};
      continue;
    }
    const target = current === 'region' ? levels.region : current && levels[current];
    if (target && typeof target === 'object') parseOpcodes(tok, target);
  }
  flush();

  const defaultPath = (levels.control.default_path || '').replace(/\\/g, '/');
  const base = path.dirname(file);
  const out = regions
    .filter((r) => r.sample && !r.sample.startsWith('*'))
    .map((r) => normalize(r, base, defaultPath));
  // initial controller values from <control> set_ccN=
  out.cc = {};
  for (const [k, v] of Object.entries(levels.control)) {
    const m = /^set_cc(\d+)$/.exec(k);
    if (m) out.cc[m[1]] = num(v, 0);
  }
  return out;
}

const num = (v, d) => (v === undefined || v === '' || isNaN(parseFloat(v)) ? d : parseFloat(v));

function normalize(r, base, defaultPath) {
  const key = noteNumber(r.key);
  const lokey = noteNumber(r.lokey) ?? key ?? 0;
  const hikey = noteNumber(r.hikey) ?? key ?? 127;
  const center = noteNumber(r.pitch_keycenter) ?? key ?? lokey;
  const sample = path.resolve(base, (defaultPath + r.sample).replace(/\\/g, '/'));
  const cond = {};
  const onCC = {};
  for (const k of Object.keys(r)) {
    let m = /^(lo|hi)cc(\d+)$/.exec(k);
    if (m) { (cond[m[2]] ||= [0, 127])[m[1] === 'lo' ? 0 : 1] = num(r[k], 0); continue; }
    m = /^on_(lo|hi)cc(\d+)$/.exec(k);
    if (m) (onCC[m[2]] ||= [0, 127])[m[1] === 'lo' ? 0 : 1] = num(r[k], 0);
  }
  const velcurve = [];
  for (const k of Object.keys(r)) {
    const m = /^amp_velcurve_(\d+)$/.exec(k);
    if (m) velcurve.push([parseInt(m[1], 10), num(r[k], 0)]);
  }
  velcurve.sort((a, b) => a[0] - b[0]);
  return {
    sample,
    lokey, hikey, center,
    lovel: num(r.lovel, 1), hivel: num(r.hivel, 127),
    trigger: (r.trigger || 'attack').toLowerCase(),
    tune: num(r.tune, 0) + num(r.transpose, 0) * 100 + num(r.pitch, 0),
    volume: num(r.volume, 0) + num(r.amplitude ? 20 * Math.log10(num(r.amplitude, 100) / 100) : 0, 0) + num(r.gain, 0)
      + num(r.group_volume, 0) + num(r.master_volume, 0) + num(r.global_volume, 0),
    notePolyphony: num(r.note_polyphony, 0),
    veltrack: num(r.amp_veltrack, 100),
    keytrack: num(r.pitch_keytrack, 100),
    ampKeytrack: num(r.amp_keytrack, 0),
    ampKeycenter: noteNumber(r.amp_keycenter) ?? 60,
    attack: num(r.ampeg_attack, 0),
    hold: num(r.ampeg_hold, 0),
    decay: num(r.ampeg_decay, 0),
    sustain: num(r.ampeg_sustain, 100),
    release: num(r.ampeg_release, 0.001),
    rtDecay: num(r.rt_decay, 0),
    offset: num(r.offset, 0),
    delay: num(r.delay, 0),
    pan: num(r.pan, 0),
    seqLength: num(r.seq_length, 1),
    seqPosition: num(r.seq_position, 1),
    lorand: num(r.lorand, 0), hirand: num(r.hirand, 1),
    group: num(r.group, 0), offBy: num(r.off_by, 0),
    loopMode: r.loop_mode || '',
    xfinLo: num(r.xfin_lovel, 0), xfinHi: num(r.xfin_hivel, 0),
    xfoutLo: num(r.xfout_lovel, 127), xfoutHi: num(r.xfout_hivel, 127),
    cond, onCC, velcurve,
  };
}

module.exports = { parse, noteNumber };
