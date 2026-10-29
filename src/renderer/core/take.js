// A "take" is one performance: notes {k key, v velocity, t start, d duration, h hand}
// and sustain pedal changes {t, v}. Times are in seconds from the start.
import { assignHands } from './hands.js';

export function newId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyTake(name) {
  return { id: newId(), name, created: Date.now(), duration: 0, notes: [], pedal: [], source: 'live', version: 1 };
}

export function finalize(take) {
  take.notes.sort((a, b) => a.t - b.t || a.k - b.k);
  take.pedal.sort((a, b) => a.t - b.t);
  const lastNote = take.notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  const lastPedal = take.pedal.length ? take.pedal[take.pedal.length - 1].t : 0;
  take.duration = Math.max(lastNote, lastPedal);
  if (!take.handsManual) assignHands(take.notes);
  return take;
}

// Records live MIDI into a take. Silence before the first note is trimmed.
export class Recorder {
  constructor() {
    this.take = null;
    this.open = new Map();
    this.pedal = 0;
    this.paused = false;
    this.pausedAt = 0;
    this.pausedTotal = 0;
  }

  get active() { return !!this.take; }

  start(name) {
    this.take = emptyTake(name);
    this.open.clear();
    this.t0 = null; // set on the first event
    this.startedAt = performance.now();
    this.paused = false;
    this.pausedTotal = 0;
  }

  pause() {
    if (!this.take || this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    this.releaseAll(this.pausedAt);
  }

  resume() {
    if (!this.paused) return;
    this.pausedTotal += performance.now() - this.pausedAt;
    this.paused = false;
  }

  rel(time) {
    if (this.t0 === null) this.t0 = time;
    return Math.max(0, (time - this.t0 - this.pausedTotal) / 1000);
  }

  // Elapsed time shown in the transport while recording.
  elapsed() {
    if (!this.take) return 0;
    if (this.t0 === null) return 0;
    const now = this.paused ? this.pausedAt : performance.now();
    return Math.max(0, (now - this.t0 - this.pausedTotal) / 1000);
  }

  input(ev) {
    if (!this.take || this.paused) return;
    if (ev.kind === 'on') {
      const t = this.rel(ev.time);
      if (this.open.has(ev.key)) this.close(ev.key, t);
      const n = { k: ev.key, v: ev.vel, t, d: 0, h: 1 };
      this.take.notes.push(n);
      this.open.set(ev.key, n);
      if (this.pedal >= 64 && !this.take.pedal.length) this.take.pedal.push({ t: 0, v: this.pedal });
    } else if (ev.kind === 'off') {
      if (this.t0 === null) return;
      this.close(ev.key, this.rel(ev.time));
    } else if (ev.kind === 'cc' && ev.cc === 64) {
      this.pedal = ev.value;
      if (this.t0 === null) return; // pedal before the first note is applied at 0
      this.take.pedal.push({ t: this.rel(ev.time), v: ev.value });
    }
  }

  close(key, t) {
    const n = this.open.get(key);
    if (!n) return;
    n.d = Math.max(0.01, t - n.t);
    this.open.delete(key);
  }

  releaseAll(time) {
    const t = this.t0 === null ? 0 : this.rel(time);
    for (const k of [...this.open.keys()]) this.close(k, t);
    if (this.pedal >= 64 && this.t0 !== null) this.take.pedal.push({ t, v: 0 });
  }

  stop() {
    if (!this.take) return null;
    if (!this.paused) this.releaseAll(performance.now());
    const take = finalize(this.take);
    this.take = null;
    return take.notes.length ? take : null;
  }

  cancel() {
    this.take = null;
    this.open.clear();
  }
}
