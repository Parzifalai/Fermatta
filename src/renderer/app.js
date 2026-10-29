// Fermatta — the app controller: wires input, recording, playback, pages.
import { store } from './store.js';
import { t, setLang } from './i18n.js';
import { h } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { Engine, DEFAULT_SOUND, wavFromBuffer } from './audio/engine.js';
import { MidiInput } from './core/midi-input.js';
import { Recorder, newId, finalize } from './core/take.js';
import { parseMidi, writeMidi } from './core/smf.js';
import { KeyboardStrip } from './ui/keyboard.js';
import { mountTransport } from './ui/transport.js';
import { mountTakesPage } from './ui/takes-page.js';
import { mountSoundPage } from './ui/sound-page.js';
import { mountExportPage } from './ui/export-page.js';
import { openSettings } from './ui/settings-modal.js';
import { Hotkeys } from './hotkeys.js';
import './visual/strings.js';
import { mountTilesPage, visualOf } from './ui/tiles-page.js';
import { openVideoExport } from './visual/video-export.js';
import { icon } from './ui/dom.js';

const fm = window.fm;
const TABS = ['takes', 'sound', 'notes', 'tiles', 'export'];

class App {
  constructor() {
    this.engine = new Engine();
    this.midi = new MidiInput();
    this.recorder = new Recorder();
    this.pages = {};
    this.undoStack = [];
    this.redoStack = [];
    this.pausedAt = 0;      // playback position while stopped
    this.lastPedalDown = 0;
    this.importers = [];    // extra file importers (MusicXML, audio, video…)
  }

  async start() {
    const settings = await fm.settings.get();
    setLang(settings.language);
    store.set({ settings });
    this.engine.sound = { ...DEFAULT_SOUND, ...settings.sound };
    this.buildFrame();
    this.hotkeys = new Hotkeys(settings.hotkeys, (a, e) => this.onHotkey(a, e));
    fm.pianos.onProgress((p) => this.onInstallProgress(p));
    await this.reloadData();
    this.midi.onStatus((s) => store.set({ midi: s }));
    this.midi.on((ev) => this.onMidi(ev));
    await this.midi.init(settings.midiInput);
    if (store.state.takes.length) this.openTake(store.state.takes[0].id);
    this.loadActivePiano();
    this.loop();
    document.dispatchEvent(new CustomEvent('fermatta:ready', { detail: this }));
  }

  // ---------- frame ----------
  buildFrame() {
    const tabs = document.getElementById('tabs');
    const view = document.getElementById('view');
    this.tabButtons = {};
    for (const id of TABS) {
      const b = h('button', { onclick: () => this.go(id) }, t('nav.' + id));
      this.tabButtons[id] = b;
      tabs.append(b);
      const page = h('div', { class: 'page', id: 'page-' + id });
      view.append(page);
      this.pages[id] = { el: page };
    }
    document.getElementById('btn-settings').addEventListener('click', () => openSettings(this));
    document.getElementById('btn-settings').title = t('settings.title');
    this.keyboard = new KeyboardStrip(document.getElementById('keyboard'));
    this.transport = mountTransport(document.getElementById('transport'), this);
    this.pages.takes.ui = mountTakesPage(this.pages.takes.el, this);
    this.pages.sound.ui = mountSoundPage(this.pages.sound.el, this);
    this.pages.export.ui = mountExportPage(this.pages.export.el, this);
    this.pages.tiles.ui = mountTilesPage(this.pages.tiles.el, this);
    this.pages.notes.el.append(h('div', { class: 'placeholder-page' }, '…'));
    this.pages.export.ui.addSection((section) => section(t('export.video'), t('export.video.desc'), ['9:16', '16:9', '1:1'].map((a, i) =>
      h('button', { class: 'btn' + (i === 0 ? ' primary' : ''), onclick: () => openVideoExport(this, { aspect: a }) }, i === 0 ? icon('video') : null, a))));
    const pill = document.getElementById('midi-pill');
    store.on((s, patch) => {
      if ('midi' in patch) {
        pill.classList.toggle('on', s.midi.ok);
        pill.querySelector('.label').textContent = s.midi.ok ? s.midi.name : t('midi.none');
        pill.title = s.midi.ok ? '' : t('midi.hint');
      }
      if ('settings' in patch) this.keyboard.setColors(this.handColors());
    });
    this.go('takes');
  }

  // Lets later modules (tiles, notes editor…) replace a placeholder page.
  mountPage(id, mount) {
    const page = this.pages[id];
    page.el.replaceChildren();
    page.ui = mount(page.el, this);
    if (store.state.tab === id) page.ui?.show?.();
  }

  go(tab) {
    if (!TABS.includes(tab)) return;
    for (const id of TABS) {
      this.pages[id].el.classList.toggle('active', id === tab);
      this.tabButtons[id].setAttribute('aria-current', id === tab ? 'page' : 'false');
    }
    const prev = store.state.tab;
    document.getElementById('keyboard').hidden = tab === 'tiles';
    store.set({ tab });
    if (prev !== tab) { this.pages[prev]?.ui?.hide?.(); this.pages[tab]?.ui?.show?.(); }
  }

  handColors() {
    const v = visualOf(store.state.settings);
    return { lh: v.lh, rh: v.rh };
  }

  loop() {
    const frame = () => {
      this.updatePlayingKeys();
      this.keyboard.draw();
      this.transport.tick();
      const page = this.pages[store.state.tab];
      page?.ui?.tick?.();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---------- data ----------
  async reloadData() {
    const [takes, trash, pianos] = await Promise.all([fm.library.list(), fm.library.trashList(), fm.pianos.catalog()]);
    store.set({ takes, trash, pianos });
  }

  async updateSettings(patch) {
    const settings = await fm.settings.set(patch);
    store.set({ settings });
    return settings;
  }

  async setLanguage(l) {
    await this.updateSettings({ language: l });
    location.reload();
  }

  selectMidi(id) {
    this.updateSettings({ midiInput: id });
    this.midi.select(id);
  }

  // ---------- pianos ----------
  async loadActivePiano() {
    const s = store.state;
    let id = s.settings.pianoId;
    let p = s.pianos.find((x) => x.id === id && x.installed);
    if (!p) p = s.pianos.find((x) => x.installed);
    if (!p) return;
    id = p.id;
    store.set({ pianoLoading: 0 });
    try {
      await this.engine.loadPiano(id, (r) => {
        if (Math.abs((store.state.pianoLoading ?? 0) - r) > 0.02 || r === 1) store.set({ pianoLoading: r });
      });
      if (s.settings.pianoId !== id) await this.updateSettings({ pianoId: id });
    } catch (e) {
      toast(t('err.generic', { e: e.message }), { error: true });
    }
    store.set({ pianoLoading: null });
  }

  async usePiano(id) {
    await this.updateSettings({ pianoId: id });
    store.set({ pianos: [...store.state.pianos] });
    await this.loadActivePiano();
  }

  async installPiano(id) {
    store.set({ progress: { ...store.state.progress, [id]: { stage: 'download', bytes: 0, total: 0 } } });
    try {
      await fm.pianos.install(id);
      await this.reloadData();
      if (!this.engine.pianoId || store.state.settings.pianoId === id) await this.usePiano(id);
    } catch (e) {
      if (e.message.includes('cancelled')) return;
      toast(t('err.generic', { e: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }), { error: true, ms: 8000 });
    }
  }

  onInstallProgress(p) {
    const progress = { ...store.state.progress, [p.id]: p };
    if (['done', 'error', 'cancelled'].includes(p.stage)) delete progress[p.id];
    store.set({ progress });
    if (p.stage === 'done') this.reloadData();
  }

  cancelInstall(id) { fm.pianos.cancel(id); }

  async removePiano(id) {
    if (this.engine.pianoId === id) return toast(t('sound.active'));
    await fm.pianos.remove(id);
    await this.reloadData();
  }

  async addCustomPiano() {
    try {
      const info = await fm.pianos.addCustom();
      if (info) { await this.reloadData(); await this.usePiano(info.id); }
    } catch (e) {
      toast(t('err.generic', { e: e.message }), { error: true });
    }
  }

  setSound(patch) {
    this.engine.setSound(patch);
    store.set({ sound: this.engine.sound });
    // tempo / transpose change the playback itself
    if (('tempo' in patch || 'transpose' in patch) && store.state.mode === 'playing') this.restartPlayback();
    clearTimeout(this.soundSave);
    this.soundSave = setTimeout(() => this.updateSettings({ sound: this.engine.sound }), 400);
  }

  // ---------- live input ----------
  liveHand(key) { return key < 60 ? 0 : 1; }

  onMidi(ev) {
    const s = store.state;
    if (ev.kind === 'on') this.keyboard.press(ev.key, this.liveHand(ev.key), ev.vel);
    else if (ev.kind === 'off') this.keyboard.release(ev.key);
    else if (ev.kind === 'cc' && ev.cc === 64) {
      const down = ev.value >= 64;
      this.keyboard.setPedal(down);
      if (down && s.settings.pedalStartsRecording && s.mode === 'idle') {
        const now = performance.now();
        if (now - this.lastPedalDown < 450) this.startRecord();
        this.lastPedalDown = now;
      }
    }
    if (s.settings.liveMonitor && this.engine.chain && s.mode !== 'playing') {
      this.engine.live({ ...ev, hand: ev.kind === 'on' ? this.liveHand(ev.key) : 1 });
    }
    if (this.recorder.active) {
      const first = this.recorder.t0 === null;
      this.recorder.input(ev);
      if (first && this.recorder.t0 !== null) { this.transport.render(); store.set({ mode: s.mode }); }
    }
    for (const cb of this.midiListeners || []) cb(ev);
  }

  onMidiEvent(cb) { (this.midiListeners ||= []).push(cb); }

  // ---------- recording ----------
  toggleRecord() {
    const m = store.state.mode;
    if (m === 'recording' || m === 'paused') return this.stopRecord();
    return this.startRecord();
  }

  startRecord() {
    this.stopPlayback();
    const n = store.state.takes.length + 1;
    this.recorder.start(t('take.untitled', { n }));
    store.set({ mode: 'recording', showTrash: false });
    this.go('takes');
  }

  pauseRecord() {
    const m = store.state.mode;
    if (m === 'recording') { this.recorder.pause(); store.set({ mode: 'paused' }); }
    else if (m === 'paused') { this.recorder.resume(); store.set({ mode: 'recording' }); }
  }

  async stopRecord() {
    const take = this.recorder.stop();
    store.set({ mode: 'idle' });
    this.keyboard.clearLive();
    if (!take) { toast(t('rec.empty')); return; }
    await fm.library.save(take);
    await this.reloadData();
    this.pausedAt = 0;
    store.set({ take });
    toast(t('rec.saved', { name: take.name }));
  }

  // ---------- playback ----------
  position() {
    const p = this.engine.position();
    return p === null ? this.pausedAt : p;
  }

  async togglePlay() {
    const s = store.state;
    if (s.mode === 'recording' || s.mode === 'paused') return;
    if (s.mode === 'playing') return this.pausePlayback();
    if (!s.take) return;
    if (!this.engine.chain) {
      toast(t('sound.needPiano'), { action: t('sound.install'), onAction: () => this.go('sound') });
      return;
    }
    await this.engine.ensureContext();
    if (this.pausedAt >= s.take.duration - 0.05) this.pausedAt = 0;
    this.engine.play(s.take, this.pausedAt);
    store.set({ mode: 'playing' });
  }

  pausePlayback() {
    this.pausedAt = this.position();
    this.engine.stop();
    store.set({ mode: 'idle' });
    this.keyboard.setPlaying(new Map());
  }

  stopPlayback() {
    if (store.state.mode === 'playing') this.engine.stop();
    this.pausedAt = 0;
    if (store.state.mode === 'playing') store.set({ mode: 'idle' });
    this.keyboard.setPlaying(new Map());
  }

  restartPlayback() {
    const pos = this.position();
    this.engine.play(store.state.take, pos);
  }

  stopAll() {
    const m = store.state.mode;
    if (m === 'recording' || m === 'paused') return this.stopRecord();
    this.stopPlayback();
  }

  seekTo(pos, autoplay = false) {
    const take = store.state.take;
    if (!take) return;
    pos = Math.max(0, Math.min(take.duration, pos));
    if (store.state.mode === 'playing') this.engine.play(take, pos);
    else {
      this.pausedAt = pos;
      if (autoplay) this.togglePlay();
    }
  }

  seekBy(d) { this.seekTo(this.position() + d); }

  updatePlayingKeys() {
    const take = store.state.take;
    if (store.state.mode !== 'playing' || !take) return;
    const pos = this.position();
    if (pos > take.duration + 0.3) { this.stopPlayback(); return; }
    const map = new Map();
    for (const n of take.notes) {
      if (n.t > pos) break;
      if (n.t + n.d >= pos) map.set(n.k, { hand: n.h, vel: n.v });
    }
    this.keyboard.setPlaying(map);
    let pedal = 0;
    for (const p of take.pedal) { if (p.t > pos) break; pedal = p.v; }
    this.keyboard.setPedal(pedal >= 64);
  }

  // ---------- takes ----------
  async openTake(id) {
    if (store.state.mode === 'recording' || store.state.mode === 'paused') return;
    if (store.state.take?.id === id) return;
    this.stopPlayback();
    let take;
    try { take = await fm.library.load(id); } catch {
      const tr = store.state.trash.find((x) => x.id === id);
      if (!tr) return;
      take = { ...tr, notes: [], pedal: [] };
    }
    this.undoStack = []; this.redoStack = [];
    store.set({ take });
  }

  // Applies a change to the open take with undo support and saves it.
  async changeTake(mutate, { label } = {}) {
    const take = store.state.take;
    if (!take) return;
    this.undoStack.push(JSON.stringify(take));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    mutate(take);
    await this.saveTake(take);
  }

  async saveTake(take) {
    const saved = await fm.library.save(take);
    store.set({ take: saved });
    clearTimeout(this.listRefresh);
    this.listRefresh = setTimeout(() => this.reloadData(), 300);
  }

  async undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(store.state.take));
    await this.saveTake(JSON.parse(prev));
  }

  async redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(store.state.take));
    await this.saveTake(JSON.parse(next));
  }

  renameTake(name) {
    name = name.trim();
    if (!name || name === store.state.take?.name) return;
    this.changeTake((tk) => { tk.name = name; });
  }

  async duplicateTake() {
    const take = store.state.take;
    if (!take) return;
    const copy = { ...JSON.parse(JSON.stringify(take)), id: newId(), name: t('take.copyName', { name: take.name }), created: Date.now() };
    await fm.library.save(copy);
    await this.reloadData();
    store.set({ take: copy });
  }

  async trashTake(id) {
    const s = store.state;
    const it = s.takes.find((x) => x.id === id);
    if (!it) return;
    if (s.take?.id === id) { this.stopPlayback(); store.set({ take: null }); }
    await fm.library.trash(id);
    await this.reloadData();
    toast(t('take.deleted', { name: it.name }), { action: t('common.undo'), onAction: () => this.restoreTake(id) });
  }

  async restoreTake(id) {
    const it = store.state.trash.find((x) => x.id === id);
    await fm.library.restore(id);
    await this.reloadData();
    if (it) toast(t('take.restored', { name: it.name }));
    if (store.state.take?.id === id) { store.set({ take: null }); this.openTake(id); }
  }

  async purgeTake(id) {
    await fm.library.purge(id);
    if (store.state.take?.id === id) store.set({ take: null });
    await this.reloadData();
  }

  toggleTrash() {
    store.set({ showTrash: !store.state.showTrash, take: null });
  }

  selectRelative(d) {
    const list = store.state.showTrash ? store.state.trash : store.state.takes;
    if (!list.length) return;
    const i = list.findIndex((x) => x.id === store.state.take?.id);
    const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))];
    if (next) this.openTake(next.id);
  }

  // ---------- import ----------
  registerImporter(imp) { this.importers.push(imp); }

  async importFile(paths) {
    if (!paths) {
      const exts = ['mid', 'midi', ...this.importers.flatMap((i) => i.extensions)];
      paths = await fm.dialog.open({ title: t('take.import'), properties: ['openFile'], filters: [{ name: 'Notes', extensions: exts }] });
      if (!paths) return;
    }
    for (const file of paths) {
      const name = file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
      const ext = file.split('.').pop().toLowerCase();
      try {
        let take;
        if (ext === 'mid' || ext === 'midi') {
          const data = await fm.fs.readFile(file);
          take = parseMidi(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), name);
        } else {
          const imp = this.importers.find((i) => i.extensions.includes(ext));
          if (!imp) throw new Error('unsupported');
          take = await imp.load(file, name);
        }
        if (!take) continue;
        await fm.library.save(take);
        await this.reloadData();
        store.set({ take, showTrash: false });
        this.go('takes');
      } catch (e) {
        toast(t('err.generic', { e: e.message }), { error: true, ms: 7000 });
      }
    }
  }

  // ---------- export ----------
  exportBase() {
    const take = store.state.take;
    const safe = (take?.name || 'Fermatta').replace(/[\\/:*?"<>|]+/g, '_');
    return `${store.state.settings.exportDir}\\${safe}`;
  }

  busy(title) {
    const bar = h('i');
    const label = h('div', { class: 'progress-label num' });
    const veil = h('div', { class: 'busy-veil' }, h('div', { class: 'busy-card' }, h('h3', {}, title), h('div', { class: 'progress' }, bar), label));
    document.body.append(veil);
    return {
      set: (r, text = '') => { bar.style.width = Math.round(r * 100) + '%'; label.textContent = text || `${Math.round(r * 100)}%`; },
      done: () => veil.remove(),
    };
  }

  async renderWav(onProgress) {
    const take = store.state.take;
    if (!this.engine.pack) throw new Error(t('err.noPiano'));
    const buf = await this.engine.render(take, { onProgress });
    const wav = wavFromBuffer(buf);
    const file = await fm.fs.tempFile(`${take.id}.wav`);
    await fm.fs.writeFile(file, wav);
    return file;
  }

  async exportAudio(format) {
    const take = store.state.take;
    if (!take) return;
    const out = await fm.dialog.save({ title: t('export.audio'), defaultPath: `${this.exportBase()}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (!out) return;
    this.stopPlayback();
    const b = this.busy(t('export.rendering'));
    try {
      const wav = await this.renderWav((r) => b.set(r * 0.9));
      b.set(0.95);
      await fm.media.mp3(wav, out, { title: take.name });
      b.done();
      toast(t('export.done', { file: out.split(/[\\/]/).pop() }), { action: t('export.show'), onAction: () => fm.shell.reveal(out) });
    } catch (e) {
      b.done();
      toast(t('export.failed', { e: e.message }), { error: true, ms: 8000 });
    }
  }

  async exportMidi() {
    const take = store.state.take;
    if (!take) return;
    const out = await fm.dialog.save({ title: t('export.midi'), defaultPath: `${this.exportBase()}.mid`, filters: [{ name: 'MIDI', extensions: ['mid'] }] });
    if (!out) return;
    await fm.fs.writeFile(out, writeMidi(take));
    toast(t('export.done', { file: out.split(/[\\/]/).pop() }), { action: t('export.show'), onAction: () => fm.shell.reveal(out) });
  }

  // ---------- hotkeys ----------
  onHotkey(action) {
    const s = store.state;
    const rec = s.mode === 'recording' || s.mode === 'paused';
    switch (action) {
      case 'record':
        // Space records on the Takes screen; elsewhere it plays / pauses.
        if (s.tab === 'takes' || rec) this.toggleRecord(); else this.togglePlay();
        return;
      case 'recordAlt': this.toggleRecord(); return;
      case 'pause': if (rec) this.pauseRecord(); else return false; return;
      case 'play': this.togglePlay(); return;
      case 'stop': if (document.querySelector('.modal-back')) return false; this.stopAll(); return;
      case 'prev': if (s.tab !== 'takes') return false; this.selectRelative(-1); return;
      case 'next': if (s.tab !== 'takes') return false; this.selectRelative(1); return;
      case 'back': this.seekBy(-5); return;
      case 'fwd': this.seekBy(5); return;
      case 'delete': if (s.tab !== 'takes' || !s.take) return false; this.trashTake(s.take.id); return;
      case 'rename': if (!s.take) return false; this.go('takes'); this.pages.takes.ui.focusRename(); return;
      case 'duplicate': this.duplicateTake(); return;
      case 'undo': this.undo(); return;
      case 'redo': this.redo(); return;
      case 'export': this.go('export'); return;
      case 'settings': openSettings(this); return;
      default: return false;
    }
  }
}

const app = new App();
window.fermatta = app;
app.start().catch((e) => {
  console.error(e);
  toast(t('err.generic', { e: e.message }), { error: true, ms: 15000 });
});
export default app;
