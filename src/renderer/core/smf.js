// Standard MIDI File reading and writing.
import { emptyTake, finalize } from './take.js';

function readVar(dv, p) {
  let v = 0;
  let b;
  do { b = dv.getUint8(p.i++); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
  return v;
}

export function parseMidi(buffer, name = 'MIDI') {
  const dv = new DataView(buffer);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buffer, o, n));
  if (str(0, 4) !== 'MThd') throw new Error('Это не MIDI-файл');
  const ntracks = dv.getUint16(10);
  const division = dv.getUint16(12);
  if (division & 0x8000) throw new Error('SMPTE-время в MIDI не поддерживается');
  let off = 8 + dv.getUint32(4);
  const raw = []; // {tick, track, type, ...}
  const tempos = [{ tick: 0, us: 500000 }];
  for (let tr = 0; tr < ntracks && off < buffer.byteLength; tr++) {
    if (str(off, 4) !== 'MTrk') break;
    const end = off + 8 + dv.getUint32(off + 4);
    const p = { i: off + 8 };
    let tick = 0;
    let status = 0;
    while (p.i < end) {
      tick += readVar(dv, p);
      let b = dv.getUint8(p.i);
      if (b & 0x80) { status = b; p.i++; } else if (status < 0x80) break;
      const type = status & 0xf0;
      const ch = status & 0x0f;
      if (status === 0xff) {
        const mt = dv.getUint8(p.i++);
        const len = readVar(dv, p);
        if (mt === 0x51) tempos.push({ tick, us: (dv.getUint8(p.i) << 16) | (dv.getUint8(p.i + 1) << 8) | dv.getUint8(p.i + 2) });
        p.i += len;
        status = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        p.i += readVar(dv, p);
        status = 0;
      } else if (type === 0x90 || type === 0x80) {
        const k = dv.getUint8(p.i++), v = dv.getUint8(p.i++);
        if (ch !== 9) raw.push({ tick, tr, ch, kind: type === 0x90 && v > 0 ? 'on' : 'off', k, v });
      } else if (type === 0xb0) {
        const c = dv.getUint8(p.i++), v = dv.getUint8(p.i++);
        if (c === 64 && ch !== 9) raw.push({ tick, tr, ch, kind: 'cc', c, v });
      } else if (type === 0xc0 || type === 0xd0) p.i += 1;
      else p.i += 2;
    }
    off = end;
  }
  // tick → seconds through the tempo map
  tempos.sort((a, b) => a.tick - b.tick);
  const segs = [];
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    if (i > 0) sec += ((tempos[i].tick - tempos[i - 1].tick) * tempos[i - 1].us) / 1e6 / division;
    segs.push({ tick: tempos[i].tick, sec, us: tempos[i].us });
  }
  const toSec = (tick) => {
    let s = segs[0];
    for (const x of segs) if (x.tick <= tick) s = x; else break;
    return s.sec + ((tick - s.tick) * s.us) / 1e6 / division;
  };
  raw.sort((a, b) => a.tick - b.tick || (a.kind === 'off' ? -1 : 1));
  const take = emptyTake(name);
  take.source = 'midi';
  const open = new Map();
  const trackOf = new Map();
  for (const e of raw) {
    const t = toSec(e.tick);
    const id = `${e.ch}:${e.k}`;
    if (e.kind === 'on') {
      if (open.has(id)) { const n = open.get(id); n.d = Math.max(0.01, t - n.t); }
      const n = { k: e.k, v: e.v, t, d: 0.01, h: 1 };
      take.notes.push(n);
      trackOf.set(n, e.tr * 16 + e.ch);
      open.set(id, n);
    } else if (e.kind === 'off') {
      const n = open.get(id);
      if (n) { n.d = Math.max(0.01, t - n.t); open.delete(id); }
    } else {
      take.pedal.push({ t, v: e.v });
    }
  }
  // Two note tracks are usually right + left hand.
  const groups = [...new Set(trackOf.values())];
  if (groups.length === 2) {
    const avg = (g) => {
      const ns = take.notes.filter((n) => trackOf.get(n) === g);
      return ns.reduce((a, n) => a + n.k, 0) / ns.length;
    };
    const leftGroup = avg(groups[0]) < avg(groups[1]) ? groups[0] : groups[1];
    for (const n of take.notes) { n.h = trackOf.get(n) === leftGroup ? 0 : 1; }
    take.handsManual = true;
  }
  // start at the first sound
  const first = Math.min(...take.notes.map((n) => n.t));
  if (isFinite(first) && first > 0.5) {
    for (const n of take.notes) n.t -= first - 0.25;
    for (const p of take.pedal) p.t = Math.max(0, p.t - (first - 0.25));
  }
  return finalize(take);
}

function varLen(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

// Writes a type-1 file: tempo track + right hand + left hand (pedal on both).
export function writeMidi(take, { bpm = 120 } = {}) {
  const ppq = 480;
  const tps = (ppq * bpm) / 60;
  const tick = (s) => Math.max(0, Math.round(s * tps));
  const track = (events, name) => {
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const bytes = [0x00, 0xff, 0x03, ...varLen(name.length), ...[...name].map((c) => c.charCodeAt(0) & 0x7f)];
    let last = 0;
    for (const e of events) {
      bytes.push(...varLen(e.tick - last), ...e.data);
      last = e.tick;
    }
    bytes.push(0x00, 0xff, 0x2f, 0x00);
    return bytes;
  };
  const tempo = Math.round(60e6 / bpm);
  const t0 = [0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8, 0x00, 0xff, 0x2f, 0x00];
  const hands = [1, 0].map((h) => {
    const ev = [];
    for (const n of take.notes) {
      if ((n.h ?? 1) !== h) continue;
      ev.push({ tick: tick(n.t), order: 1, data: [0x90 | h, n.k, Math.max(1, n.v)] });
      ev.push({ tick: tick(n.t + n.d), order: 0, data: [0x80 | h, n.k, 64] });
    }
    for (const p of take.pedal) ev.push({ tick: tick(p.t), order: 2, data: [0xb0 | h, 64, p.v] });
    return track(ev, h ? 'Right hand' : 'Left hand');
  });
  const chunks = [t0, ...hands];
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, chunks.length, (ppq >> 8) & 255, ppq & 255];
  const out = [...header];
  for (const c of chunks) {
    out.push(0x4d, 0x54, 0x72, 0x6b, (c.length >>> 24) & 255, (c.length >>> 16) & 255, (c.length >>> 8) & 255, c.length & 255, ...c);
  }
  return new Uint8Array(out);
}
