// Piano catalog: download, unpack and convert SFZ libraries into a fast "pack"
// (one raw 16-bit stereo file + JSON map) that the audio engine loads directly.
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn } = require('child_process');
const sfz = require('./sfz');
const ffmpeg = require('./ffmpeg');

const RATE = 48000;
let settings;
let catalogList = [];
const jobs = new Map(); // id -> { cancelled }

async function init(s, root) {
  settings = s;
  catalogList = JSON.parse(await fsp.readFile(path.join(root, 'src', 'main', 'catalog.json'), 'utf8'));
}

const pianosDir = () => settings.get().pianosDir;
const pianoDir = (id) => path.join(pianosDir(), id);

async function installedInfo(id) {
  try {
    const meta = JSON.parse(await fsp.readFile(path.join(pianoDir(id), 'pack.json'), 'utf8'));
    return { installed: true, packMB: Math.round(meta.totalFrames * 4 / 1048576), regions: meta.regions.length };
  } catch {
    return { installed: false };
  }
}

async function catalog() {
  const custom = [];
  try {
    for (const d of await fsp.readdir(pianosDir())) {
      if (!d.startsWith('custom-')) continue;
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(pianoDir(d), 'info.json'), 'utf8'));
        custom.push(meta);
      } catch { /* not finished */ }
    }
  } catch { /* no dir yet */ }
  const all = [...catalogList, ...custom];
  return Promise.all(all.map(async (p) => ({ ...p, ...(await installedInfo(p.id)), installing: jobs.has(p.id) })));
}

// ---------- downloading ----------

async function teracloudLocation(share) {
  const r = await fetch(`https://kamo.teracloud.jp/v2/api/share/public/${share}`, {
    method: 'POST', body: '',
    headers: { Accept: 'application/json', keyword: '', 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return 'https://kamo.teracloud.jp' + (await r.json()).location;
}

async function teracloudSize(share) {
  const r = await fetch(`https://kamo.teracloud.jp/v2/api/share/public/${share}`, { headers: { Accept: 'application/json', keyword: '' } });
  return (await r.json()).size;
}

// Downloads with many parallel ranges when the server allows it (much faster on slow mirrors).
async function download(source, out, job, progress) {
  let size = 0;
  let urlFor;
  if (source.type === 'teracloud') {
    size = await teracloudSize(source.share);
    urlFor = () => teracloudLocation(source.share);
  } else {
    const url = source.type === 'github' ? `https://codeload.github.com/${source.repo}/zip/refs/heads/${source.branch}` : source.url;
    urlFor = async () => url;
    const head = await fetch(url, { method: 'HEAD' });
    const len = parseInt(head.headers.get('content-length') || '0', 10);
    if (head.headers.get('accept-ranges') === 'bytes' && len) size = len;
  }
  await fsp.mkdir(path.dirname(out), { recursive: true });

  if (!size) { // single stream, size unknown
    const res = await fetch(await urlFor());
    const file = fs.createWriteStream(out);
    let got = 0;
    for await (const chunk of res.body) {
      if (job.cancelled) throw new Error('cancelled');
      got += chunk.length;
      if (!file.write(chunk)) await new Promise((r) => file.once('drain', r));
      progress({ stage: 'download', bytes: got, total: 0 });
    }
    await new Promise((r) => file.end(r));
    return;
  }

  const parts = Math.min(16, Math.max(1, Math.ceil(size / (8 << 20))));
  const chunk = Math.ceil(size / parts);
  const done = new Array(parts).fill(0);
  const tick = setInterval(() => progress({ stage: 'download', bytes: done.reduce((a, b) => a + b, 0), total: size }), 500);
  try {
    await Promise.all(Array.from({ length: parts }, async (_, i) => {
      const start = i * chunk;
      const end = Math.min(size, start + chunk) - 1;
      const partFile = `${out}.part${i}`;
      let have = fs.existsSync(partFile) ? fs.statSync(partFile).size : 0;
      let tries = 0;
      while (start + have <= end) {
        if (job.cancelled) throw new Error('cancelled');
        try {
          const res = await fetch(await urlFor(), { headers: { Range: `bytes=${start + have}-${end}` } });
          if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
          const fh = fs.createWriteStream(partFile, { flags: 'a' });
          for await (const c of res.body) {
            if (job.cancelled) { fh.destroy(); throw new Error('cancelled'); }
            if (!fh.write(c)) await new Promise((r) => fh.once('drain', r));
            have += c.length;
            done[i] = have;
          }
          await new Promise((r) => fh.end(r));
        } catch (e) {
          if (e.message === 'cancelled' || ++tries > 30) throw e;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      done[i] = have;
    }));
  } finally {
    clearInterval(tick);
  }
  const outFile = fs.createWriteStream(out);
  for (let i = 0; i < parts; i++) {
    await new Promise((res, rej) => {
      const r = fs.createReadStream(`${out}.part${i}`);
      r.on('error', rej).on('end', res);
      r.pipe(outFile, { end: false });
    });
    await fsp.rm(`${out}.part${i}`);
  }
  await new Promise((r) => outFile.end(r));
}

function unzip(zip, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dest, { recursive: true });
    // Windows ships bsdtar, which unpacks zip files quickly.
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    const p = spawn(fs.existsSync(tar) ? tar : 'tar', ['-xf', zip, '-C', dest], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('unzip: ' + err.slice(-300)))));
  });
}

async function findFile(dir, pattern) {
  const want = pattern.replace(/\\/g, '/').toLowerCase();
  const re = new RegExp('(^|/)' + want.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  const stack = [dir];
  const hits = [];
  while (stack.length) {
    const d = stack.pop();
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (re.test(path.relative(dir, full).replace(/\\/g, '/').toLowerCase())) hits.push(full);
    }
  }
  return hits.sort((a, b) => a.length - b.length)[0];
}

// ---------- pack building ----------

async function decode(file) {
  const raw = await ffmpeg.run(['-v', 'error', '-i', file, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '2', '-ar', String(RATE), '-']);
  const s = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
  // Drop the silent tail so memory goes to sound, not to zeros.
  let last = s.length - 1;
  while (last > 0 && Math.abs(s[last]) < 4) last--;
  const frames = Math.min(s.length >> 1, ((last >> 1) + Math.round(RATE * 0.05)));
  return Buffer.from(raw.buffer, raw.byteOffset, frames * 4);
}

async function buildPack(sfzFile, dest, job, progress, ccOverride = {}) {
  const regions = sfz.parse(sfzFile);
  if (!regions.length) throw new Error('В файле рояля не найдено ни одного сэмпла');
  const files = [...new Set(regions.map((r) => r.sample))].filter((f) => fs.existsSync(f));
  const index = new Map(files.map((f, i) => [f, i]));
  const samples = new Array(files.length);
  const packFile = path.join(dest, 'pack.bin');
  const out = fs.createWriteStream(packFile);
  let offset = 0;
  const conc = Math.max(2, Math.min(8, os.cpus().length - 1));
  for (let i = 0; i < files.length; i += conc) {
    if (job.cancelled) { out.destroy(); throw new Error('cancelled'); }
    const batch = await Promise.all(files.slice(i, i + conc).map(decode));
    for (let j = 0; j < batch.length; j++) {
      const frames = batch[j].length / 4;
      samples[i + j] = { offset, frames, name: path.basename(files[i + j]) };
      offset += frames;
      if (!out.write(batch[j])) await new Promise((r) => out.once('drain', r));
    }
    progress({ stage: 'convert', done: Math.min(files.length, i + conc), total: files.length });
  }
  await new Promise((r) => out.end(r));
  const packRegions = regions.filter((r) => index.has(r.sample)).map((r) => {
    const { sample, ...rest } = r;
    return { ...rest, s: index.get(sample) };
  });
  await fsp.writeFile(path.join(dest, 'pack.json'), JSON.stringify({ version: 1, sampleRate: RATE, channels: 2, totalFrames: offset, cc: { ...regions.cc, ...ccOverride }, samples, regions: packRegions }));
}

async function install(id, progress) {
  const p = catalogList.find((x) => x.id === id);
  if (!p) throw new Error('unknown piano ' + id);
  if (jobs.has(id)) return;
  const job = { cancelled: false };
  jobs.set(id, job);
  const dest = pianoDir(id);
  const send = (x) => progress({ id, ...x });
  try {
    const zip = path.join(pianosDir(), '_downloads', `${id}.zip`);
    const src = path.join(dest, 'source');
    if (!fs.existsSync(path.join(src, '.unpacked'))) {
      if (!fs.existsSync(zip) || fs.existsSync(`${zip}.part0`)) await download(p.source, zip, job, send);
      send({ stage: 'unpack' });
      await fsp.rm(src, { recursive: true, force: true });
      await unzip(zip, src);
      await fsp.writeFile(path.join(src, '.unpacked'), '');
      await fsp.rm(zip, { force: true });
    }
    const sfzFile = await findFile(src, p.sfz);
    if (!sfzFile) throw new Error('Не найден файл ' + p.sfz);
    await buildPack(sfzFile, dest, job, send, p.cc || {});
    send({ stage: 'done' });
  } catch (e) {
    send({ stage: e.message === 'cancelled' ? 'cancelled' : 'error', error: e.message });
    throw e;
  } finally {
    jobs.delete(id);
  }
}

async function addCustom(sfzFile, progress) {
  const id = 'custom-' + Date.now().toString(36);
  const dest = pianoDir(id);
  await fsp.mkdir(dest, { recursive: true });
  const job = { cancelled: false };
  jobs.set(id, job);
  const name = path.basename(sfzFile, '.sfz');
  try {
    await buildPack(sfzFile, dest, job, (x) => progress({ id, ...x }));
    const info = { id, name, piano: name, custom: true, character: { ru: 'Ваш рояль из файла SFZ.', en: 'Your own SFZ piano.' }, license: '—', credit: sfzFile, sfzPath: sfzFile };
    await fsp.writeFile(path.join(dest, 'info.json'), JSON.stringify(info));
    progress({ id, stage: 'done' });
    return info;
  } catch (e) {
    await fsp.rm(dest, { recursive: true, force: true });
    progress({ id, stage: 'error', error: e.message });
    throw e;
  } finally {
    jobs.delete(id);
  }
}

function cancel(id) {
  const j = jobs.get(id);
  if (j) j.cancelled = true;
}

async function remove(id) {
  await fsp.rm(pianoDir(id), { recursive: true, force: true });
}

module.exports = { init, catalog, install, cancel, remove, addCustom, buildPack, findFile, download };
