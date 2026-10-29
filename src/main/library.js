// Recordings ("takes"): one folder per take with take.json. Deleted takes go to .trash.
const path = require('path');
const fsp = require('fs').promises;

let settings;
const dir = () => settings.get().libraryDir;
const trashDir = () => path.join(dir(), '.trash');

async function init(s) {
  settings = s;
}

async function readTakes(base) {
  let names = [];
  try {
    names = await fsp.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const d of names) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    try {
      const take = JSON.parse(await fsp.readFile(path.join(base, d.name, 'take.json'), 'utf8'));
      // The list only needs a summary; notes stay on disk until a take is opened.
      out.push({
        id: take.id, name: take.name, created: take.created, modified: take.modified,
        duration: take.duration, noteCount: take.notes.length, source: take.source,
        preview: preview(take.notes, take.duration),
      });
    } catch { /* skip broken folders */ }
  }
  return out.sort((a, b) => b.created - a.created);
}

// 64 buckets of note density, drawn as a little skyline in the list.
function preview(notes, duration) {
  const n = 64;
  const b = new Array(n).fill(0);
  if (!duration) return b;
  for (const note of notes) {
    const i = Math.min(n - 1, Math.floor((note.t / duration) * n));
    b[i] += note.v / 127;
  }
  const max = Math.max(1, ...b);
  return b.map((x) => Math.round((x / max) * 100) / 100);
}

const list = () => readTakes(dir());
const trashList = () => readTakes(trashDir());

async function save(take) {
  take.modified = Date.now();
  const folder = path.join(dir(), take.id);
  await fsp.mkdir(folder, { recursive: true });
  const tmp = path.join(folder, 'take.json.tmp');
  await fsp.writeFile(tmp, JSON.stringify(take));
  await fsp.rename(tmp, path.join(folder, 'take.json'));
  return take;
}

async function load(id) {
  return JSON.parse(await fsp.readFile(path.join(dir(), id, 'take.json'), 'utf8'));
}

async function trash(id) {
  await fsp.mkdir(trashDir(), { recursive: true });
  await fsp.rename(path.join(dir(), id), path.join(trashDir(), id));
}

async function restore(id) {
  await fsp.rename(path.join(trashDir(), id), path.join(dir(), id));
}

async function purge(id) {
  await fsp.rm(path.join(trashDir(), id), { recursive: true, force: true });
}

module.exports = { init, list, trashList, save, load, trash, restore, purge };
