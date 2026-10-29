// Persistent user settings (JSON in the app's user-data folder).
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let file;
let data;

// Pianos weigh gigabytes, so by default they go to the fixed drive with the most free space.
function roomiestDrive(fallback) {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Free -gt 0} | Sort-Object Free -Descending | Select-Object -First 1 -ExpandProperty Root"', { encoding: 'utf8', timeout: 8000 }).trim();
    return out || fallback;
  } catch {
    return fallback;
  }
}

function defaults(app) {
  const root = roomiestDrive(app.getPath('documents'));
  const base = /^[A-Z]:\\$/i.test(root) && !/^C:/i.test(root) ? path.join(root, 'FermattaData') : path.join(app.getPath('documents'), 'Fermatta');
  return {
    language: app.getLocale().startsWith('en') ? 'en' : 'ru',
    libraryDir: path.join(base, 'recordings'),
    pianosDir: path.join(base, 'pianos'),
    exportDir: path.join(app.getPath('music'), 'Fermatta'),
    pianoId: 'accurate-salamander',
    midiInput: '',
    liveMonitor: false,
    pedalStartsRecording: false,
    hotkeys: {},
    sound: {},
    visual: {},
    firstRunDone: false,
  };
}

async function init(app) {
  file = path.join(app.getPath('userData'), 'settings.json');
  const def = defaults(app);
  try {
    data = { ...def, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    data = def;
  }
  fs.mkdirSync(data.libraryDir, { recursive: true });
  fs.mkdirSync(data.pianosDir, { recursive: true });
  write();
}

function write() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function get() {
  return data;
}

function set(patch) {
  data = { ...data, ...patch };
  if (patch.libraryDir) fs.mkdirSync(data.libraryDir, { recursive: true });
  if (patch.pianosDir) fs.mkdirSync(data.pianosDir, { recursive: true });
  write();
  return data;
}

module.exports = { init, get, set };
