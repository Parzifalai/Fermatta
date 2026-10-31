// MusicXML in and out (the format of MuseScore, Finale, Sibelius, Dorico).
import { emptyTake, finalize } from './take.js';
import { unzipSync, strFromU8 } from '/node_modules/fflate/esm/browser.js';

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DYN = { pppp: 22, ppp: 30, pp: 42, p: 56, mp: 68, mf: 80, f: 96, ff: 110, fff: 120, ffff: 126, sf: 105, sfz: 110, fz: 108 };

// ---------- reading ----------
export function readMxl(bytes) {
  const files = unzipSync(bytes);
  let root = null;
  if (files['META-INF/container.xml']) {
    const m = /full-path="([^"]+)"/.exec(strFromU8(files['META-INF/container.xml']));
    if (m) root = m[1];
  }
  root ||= Object.keys(files).find((f) => !f.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(f));
  if (!root || !files[root]) throw new Error('В архиве .mxl не найдены ноты');
  return strFromU8(files[root]);
}

export function parseMusicXML(text, name = 'MusicXML') {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Файл MusicXML повреждён');
  if (doc.documentElement.nodeName === 'score-timewise') throw new Error('Формат score-timewise пока не поддерживается');
  const title = doc.querySelector('work-title, movement-title')?.textContent?.trim();
  const take = emptyTake(title || name);
  take.source = 'musicxml';
  const parts = [...doc.querySelectorAll('part')];
  // tempo map in quarter notes: [{q, bpm}]
  const tempos = [{ q: 0, bpm: 100 }];
  const raw = []; // {q, dq, k, v, staff, part}
  const pedals = []; // {q, v}
  parts.forEach((part, pi) => {
    let divisions = 1;
    let q = 0;
    const vel = { 1: 80, 2: 80 };
    const lastStart = {};
    const open = new Map(); // tie: pitch -> note
    for (const measure of part.querySelectorAll(':scope > measure')) {
      const measureStart = q;
      let maxQ = q;
      for (const el of measure.children) {
        const tag = el.nodeName;
        if (tag === 'attributes') {
          const d = el.querySelector('divisions');
          if (d) divisions = +d.textContent || 1;
        } else if (tag === 'backup') {
          q -= (+el.querySelector('duration')?.textContent || 0) / divisions;
        } else if (tag === 'forward') {
          q += (+el.querySelector('duration')?.textContent || 0) / divisions;
        } else if (tag === 'direction' || tag === 'sound') {
          const snd = tag === 'sound' ? el : el.querySelector('sound');
          const off = (+el.querySelector('offset')?.textContent || 0) / divisions;
          if (snd?.getAttribute('tempo')) tempos.push({ q: q + off, bpm: +snd.getAttribute('tempo') });
          if (snd?.getAttribute('dynamics')) { const v = Math.round(+snd.getAttribute('dynamics') * 0.9); vel[1] = vel[2] = Math.min(127, v); }
          const staff = +(el.querySelector('staff')?.textContent || 1);
          const dyn = el.querySelector('dynamics');
          if (dyn && dyn.firstElementChild && DYN[dyn.firstElementChild.nodeName] && !snd?.getAttribute('dynamics')) vel[staff] = DYN[dyn.firstElementChild.nodeName];
          const met = el.querySelector('metronome per-minute');
          if (met && !snd?.getAttribute('tempo')) {
            const unit = el.querySelector('metronome beat-unit')?.textContent;
            const mult = { half: 2, quarter: 1, eighth: 0.5 }[unit] || 1;
            tempos.push({ q: q + off, bpm: +met.textContent * mult });
          }
          const ped = el.querySelector('pedal');
          if (ped) {
            const tp = ped.getAttribute('type');
            if (tp === 'start' || tp === 'resume') pedals.push({ q: q + off, v: 127 });
            else if (tp === 'stop' || tp === 'discontinue') pedals.push({ q: q + off, v: 0 });
            else if (tp === 'change') { pedals.push({ q: q + off - 0.01, v: 0 }); pedals.push({ q: q + off + 0.02, v: 127 }); }
          }
        } else if (tag === 'note') {
          if (el.querySelector('grace')) continue;
          const dur = (+el.querySelector(':scope > duration')?.textContent || 0) / divisions;
          const isChord = !!el.querySelector(':scope > chord');
          const staff = +(el.querySelector(':scope > staff')?.textContent || 1);
          const voice = el.querySelector(':scope > voice')?.textContent || '1';
          const start = isChord ? lastStart[voice] ?? q : q;
          if (!isChord) lastStart[voice] = q;
          const pitch = el.querySelector(':scope > pitch');
          if (pitch) {
            const k = STEP[pitch.querySelector('step').textContent] + (+pitch.querySelector('alter')?.textContent || 0) + (+pitch.querySelector('octave').textContent + 1) * 12;
            const ties = [...el.querySelectorAll(':scope > tie')].map((x) => x.getAttribute('type'));
            const key = `${pi}:${staff}:${k}`;
            if (ties.includes('stop') && open.has(key)) {
              const n = open.get(key);
              n.dq = start + dur - n.q;
              if (!ties.includes('start')) open.delete(key);
            } else {
              const n = { q: start, dq: dur, k: Math.round(k), v: vel[staff] || 80, staff, part: pi };
              raw.push(n);
              if (ties.includes('start')) open.set(key, n);
            }
          }
          if (!isChord) q += dur;
        }
        maxQ = Math.max(maxQ, q);
      }
      q = Math.max(q, maxQ, measureStart);
    }
  });
  // quarters → seconds
  tempos.sort((a, b) => a.q - b.q);
  const segs = [];
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    if (i) sec += ((tempos[i].q - tempos[i - 1].q) * 60) / tempos[i - 1].bpm;
    segs.push({ q: tempos[i].q, sec, bpm: tempos[i].bpm });
  }
  const toSec = (qq) => {
    let s = segs[0];
    for (const x of segs) if (x.q <= qq) s = x; else break;
    return s.sec + ((qq - s.q) * 60) / s.bpm;
  };
  const twoStaves = raw.some((n) => n.staff === 2);
  for (const n of raw) {
    const t = toSec(n.q);
    const d = Math.max(0.05, toSec(n.q + n.dq) - t);
    const h = twoStaves ? (n.staff === 2 ? 0 : 1) : parts.length === 2 ? (n.part === 1 ? 0 : 1) : 1;
    take.notes.push({ k: n.k, v: n.v, t, d: d * 0.97, h });
  }
  take.handsManual = twoStaves || parts.length === 2;
  take.pedal = pedals.map((p) => ({ t: toSec(p.q), v: p.v }));
  take.bpm = tempos[tempos.length > 1 ? 1 : 0].bpm;
  return finalize(take);
}

// ---------- writing ----------
const TYPES = [[16, 'whole', 0], [12, 'half', 1], [8, 'half', 0], [6, 'quarter', 1], [4, 'quarter', 0], [3, 'eighth', 1], [2, 'eighth', 0], [1, '16th', 0]];
const NAMES = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
// in flat keys black keys are written as flats
const FLAT_NAMES = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];

// split a duration (in 16ths) into notatable pieces, respecting beats
function pieces(start, len) {
  const out = [];
  let pos = start;
  let left = len;
  while (left > 0) {
    let pick = 1;
    for (const [d] of TYPES) {
      if (d > left) continue;
      // longer values only when they start on a matching boundary
      const align = d >= 8 ? 8 : d >= 4 ? 4 : d >= 2 ? 2 : 1;
      if (d === 12 && pos % 4 !== 0) continue;
      if (d === 6 && pos % 2 !== 0) continue;
      if (pos % align !== 0 && d !== 3 && d !== 6 && d !== 12) continue;
      pick = d; break;
    }
    out.push(pick);
    pos += pick;
    left -= pick;
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// readable: written for reading at the piano rather than as played: notes of a
// hand are joined over gaps of up to a beat and chord ends are evened out.
export function writeMusicXML(take, { bpm = 100, beats = null, downbeats = null, fifths = 0, time = '4/4', readable = false, title } = {}) {
  const PER_BEAT = 4; // 16ths
  let [num, den] = String(time).split('/').map(Number);
  if (den !== 4 || !(num >= 2 && num <= 4)) { num = 4; den = 4; }
  const M = num * PER_BEAT; // one bar
  const GAP = readable ? PER_BEAT : 2;
  if (beats && beats.length > 2) {
    const d = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
    bpm = 60 / d[d.length >> 1];
  }
  // seconds → sixteenths, along the detected beats when available
  const rawTick = (t) => {
    if (beats && beats.length > 1) {
      let i = 0;
      while (i < beats.length - 2 && beats[i + 1] <= t) i++;
      const f = (t - beats[i]) / (beats[i + 1] - beats[i]);
      return (i + f) * PER_BEAT;
    }
    return (t * bpm / 60) * PER_BEAT;
  };
  const toTick = (t) => Math.round(rawTick(t));
  const shift = take.notes.length ? Math.min(...take.notes.map((n) => toTick(n.t))) : 0;
  let startTick = shift - (((shift % PER_BEAT) + PER_BEAT) % PER_BEAT); // the first note's beat opens bar 1
  // with known bar lines, bar 1 starts on a downbeat (a pickup bar is filled with rests)
  if (downbeats && downbeats.length) {
    const d0 = toTick(downbeats[0]);
    startTick = d0 - Math.ceil((d0 - shift) / M) * M;
  }
  const staves = [[], []];
  for (const n of take.notes) {
    const s = toTick(n.t) - startTick;
    const e = Math.max(s + 1, toTick(n.t + n.d) - startTick);
    staves[(n.h ?? 1) === 0 ? 1 : 0].push({ s, e, k: n.k, raw: rawTick(n.t) - startTick, rawEnd: rawTick(n.t + n.d) - startTick });
  }
  // readable: a beat whose notes all sit near eighth positions is written in
  // eighths, not sixteenths with dots and rests
  if (readable) {
    for (const notes of staves) {
      const byBeat = new Map();
      for (const n of notes) { const b = Math.floor(n.s / PER_BEAT); if (!byBeat.has(b)) byBeat.set(b, []); byBeat.get(b).push(n); }
      for (const group of byBeat.values()) {
        if (group.every((n) => Math.abs(n.raw - Math.round(n.raw / 2) * 2) < 0.75)) {
          for (const n of group) {
            n.s = Math.round(n.raw / 2) * 2;
            n.e = Math.max(n.s + 2, Math.round(n.rawEnd / 2) * 2);
          }
        }
      }
    }
  }
  const total = Math.max(M, ...staves.flat().map((n) => n.e));
  const measures = Math.ceil(total / M);

  // voices per staff: events with the same start & end form a chord.
  // Played notes are a little shorter than written ones, so ends of a chord
  // are unified and small gaps before the next note are closed.
  const voicesOf = (notes) => {
    const byStart = new Map();
    for (const n of notes) {
      if (!byStart.has(n.s)) byStart.set(n.s, []);
      byStart.get(n.s).push(n);
    }
    const ev = new Map();
    for (const group of byStart.values()) {
      group.sort((a, b) => b.e - a.e);
      let anchor = group[0].e;
      for (const n of group) {
        if (anchor - n.e <= GAP) n.e = anchor; else anchor = n.e;
        const key = `${n.s}:${n.e}`;
        if (!ev.has(key)) ev.set(key, { s: n.s, e: n.e, keys: [] });
        ev.get(key).keys.push(n.k);
      }
    }
    const events = [...ev.values()].sort((a, b) => a.s - b.s || b.e - a.e);
    const voices = [];
    for (const e of events) {
      // a gap of up to an eighth before this event counts as legato
      let v = voices.find((x) => x.end <= e.s) || voices.find((x) => x.end - e.s <= 1 && x.end > e.s);
      if (v && v.end > e.s) v.events[v.events.length - 1].e = e.s;
      if (!v) { v = { end: 0, events: [] }; voices.push(v); }
      const prev = v.events[v.events.length - 1];
      if (prev && e.s - prev.e > 0 && e.s - prev.e <= GAP) prev.e = e.s;
      v.events.push(e);
      v.end = e.e;
    }
    for (const v of voices) {
      const last = v.events[v.events.length - 1];
      if (last) { const up = Math.ceil(last.e / PER_BEAT) * PER_BEAT; if (up - last.e <= 2) last.e = up; }
    }
    return voices.length ? voices : [{ end: 0, events: [] }];
  };
  const staffVoices = staves.map(voicesOf);

  const pitchXml = (k) => {
    const [step, alter] = (fifths < 0 ? FLAT_NAMES : NAMES)[k % 12];
    return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(k / 12) - 1}</octave></pitch>`;
  };
  const noteXml = ({ rest, keys, dur, voice, staff, tieStart, tieStop, hidden }) => {
    const [, type, dot] = TYPES.find((x) => x[0] === dur);
    if (rest) return `<note${hidden ? ' print-object="no"' : ''}><rest${dur === M ? ' measure="yes"' : ''}/><duration>${dur}</duration><voice>${voice}</voice><type>${type}</type>${dot ? '<dot/>' : ''}<staff>${staff}</staff></note>`;
    return keys.map((k, i) => `<note>${i ? '<chord/>' : ''}${pitchXml(k)}<duration>${dur}</duration>` +
      `${tieStop ? '<tie type="stop"/>' : ''}${tieStart ? '<tie type="start"/>' : ''}<voice>${voice}</voice><type>${type}</type>${dot ? '<dot/>' : ''}` +
      `<staff>${staff}</staff>${tieStart || tieStop ? `<notations>${tieStop ? '<tied type="stop"/>' : ''}${tieStart ? '<tied type="start"/>' : ''}</notations>` : ''}</note>`).join('');
  };

  // pedal marks in the bass staff
  let pedalAt = [];
  let down = false;
  for (const p of take.pedal || []) {
    const isDown = p.v >= 64;
    if (isDown === down) continue;
    down = isDown;
    pedalAt.push({ tick: Math.max(0, toTick(p.t) - startTick), type: isDown ? 'start' : 'stop' });
  }
  // a quick lift and press again is one pedal change: a notch in the pedal line
  if (readable) {
    const merged = [];
    for (let i = 0; i < pedalAt.length; i++) {
      const p = pedalAt[i], q = pedalAt[i + 1];
      if (p.type === 'stop' && q && q.type === 'start' && q.tick - p.tick <= 2) { merged.push({ tick: q.tick, type: 'change' }); i++; } else merged.push(p);
    }
    pedalAt = merged;
  }

  let body = '';
  for (let m = 0; m < measures; m++) {
    const m0 = m * M, m1 = m0 + M;
    let x = `<measure number="${m + 1}">`;
    if (m === 0) {
      x += `<attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>${num}</beats><beat-type>${den}</beat-type></time><staves>2</staves>` +
        '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' +
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${Math.round(bpm)}"/></direction>`;
    }
    for (const p of pedalAt) {
      if (p.tick >= m0 && p.tick < m1) x += `<direction placement="below"><direction-type><pedal type="${p.type}" line="yes"/></direction-type><offset>${p.tick - m0}</offset><staff>2</staff></direction>`;
    }
    let voiceNo = 0;
    let first = true;
    staffVoices.forEach((voices, si) => {
      voices.forEach((v, vi) => {
        voiceNo++;
        if (!first) x += `<backup><duration>${M}</duration></backup>`;
        first = false;
        let pos = m0;
        const emitRest = (len) => {
          for (const d of pieces(pos - m0, len)) { x += noteXml({ rest: true, dur: d, voice: voiceNo, staff: si + 1, hidden: vi > 0 }); pos += d; }
        };
        for (const e of v.events) {
          if (e.e <= m0 || e.s >= m1) continue;
          const s = Math.max(e.s, m0), en = Math.min(e.e, m1);
          if (s > pos) emitRest(s - pos);
          const parts = pieces(s - m0, en - s);
          parts.forEach((d, i) => {
            const tieStop = i > 0 || e.s < m0;
            const tieStart = i < parts.length - 1 || e.e > m1;
            x += noteXml({ keys: e.keys.slice().sort((a, b) => a - b), dur: d, voice: voiceNo, staff: si + 1, tieStart, tieStop });
          });
          pos = en;
        }
        if (pos < m1) emitRest(m1 - pos);
      });
    });
    x += '</measure>';
    body += x;
  }
  const name = esc(title || take.name || 'Fermatta');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    `<score-partwise version="4.0"><work><work-title>${name}</work-title></work>` +
    '<identification><encoding><software>Fermatta</software></encoding></identification>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
    `<part id="P1">${body}</part></score-partwise>`;
}
