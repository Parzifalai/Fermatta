// "Notes": piano-roll editor (FL Studio style), timing tidy-up and sheet music.
import { h, icon, paintRange } from './dom.js';
import { t, getLang } from '../i18n.js';
import { store } from '../store.js';
import { isBlack, keyName } from '../core/keys.js';
import { trackBeats, steadyBeats, snapTime, quantize } from '../core/tempo.js';
import { assignHands } from '../core/hands.js';
import { writeMusicXML } from '../core/musicxml.js';
import { toast } from './toast.js';
import { alignToScore } from '../core/score-align.js';

const KEYS_W = 58;
const RULER_H = 26;
const VEL_H = 74;
const PED_H = 26;
const GRIDS = [['0', 'notes.grid.off'], ['1', '1/4'], ['2', '1/8'], ['3', '1/8т'], ['4', '1/16'], ['6', '1/16т'], ['8', '1/32']];

export function mountNotesPage(root, app) {
  const canvas = h('canvas', { class: 'roll-canvas', tabindex: 0 });
  const sheet = h('div', { class: 'sheet-paper', hidden: true });
  const area = h('div', { class: 'roll-area' }, canvas, sheet);
  const toolbar = h('div', { class: 'roll-toolbar' });
  const cmpBar = h('div', { class: 'cmp-bar', hidden: true });
  root.append(h('div', { class: 'notes' }, toolbar, cmpBar, area));
  let cmp = null; // comparison with written notes

  let tool = 'select';
  let division = +(store.state.settings.gridDivision ?? 4);
  let view = { t0: -0.25, pps: 140, kTop: 84, rowH: 13 };
  let selection = new Set();
  let drag = null;
  let lastLen = 0.4;
  let lastVel = 80;
  let sheetMode = false;
  let hover = null;
  let follow = true;
  let clipboard = [];
  let dirtyDraw = true;

  const take = () => store.state.take;

  // ---------- beats / grid ----------
  function beatsOf(tk) {
    if (!tk) return [];
    if (tk.beats && tk.beats.length > 1) return tk.beats;
    return steadyBeats(tk.bpm || 120, 0, Math.max(tk.duration, 4));
  }
  function ensureTempo(tk) {
    if (!tk || tk.beats || tk.notes.length < 4) return;
    const r = trackBeats(tk.notes, tk.source === 'live' ? {} : { bpm: tk.bpm || null });
    tk.beats = r.beats;
    tk.bpm = r.bpm;
    window.fm.library.save(tk);
  }
  // bars start on the beat where the music starts
  const downbeat = (beats) => {
    const first = take()?.notes[0]?.t ?? 0;
    const i = beats.findIndex((b) => b >= first - 0.12);
    return i < 0 ? 0 : i;
  };
  const snap = (tm) => (division > 0 ? snapTime(beatsOf(take()), tm, division) : tm);
  const gridStep = (tm) => {
    const b = beatsOf(take());
    if (b.length < 2) return 0.1;
    let i = 0;
    while (i < b.length - 2 && b[i + 1] <= tm) i++;
    return (b[i + 1] - b[i]) / Math.max(1, division || 4);
  };

  // ---------- geometry ----------
  const size = () => ({ W: canvas.clientWidth, H: canvas.clientHeight });
  const gridBottom = () => size().H - VEL_H - PED_H;
  const xOf = (tm) => KEYS_W + (tm - view.t0) * view.pps;
  const tOf = (x) => view.t0 + (x - KEYS_W) / view.pps;
  const yOf = (k) => RULER_H + (view.kTop - k) * view.rowH;
  const keyAt = (y) => Math.floor(view.kTop + 1 - (y - RULER_H) / view.rowH);

  function noteAt(x, y) {
    const tk = take();
    if (!tk || y < RULER_H || y > gridBottom() || x < KEYS_W) return null;
    const k = keyAt(y);
    const tm = tOf(x);
    for (let i = tk.notes.length - 1; i >= 0; i--) {
      const n = tk.notes[i];
      if (n.k !== k) continue;
      if (tm >= n.t && tm <= n.t + n.d) {
        const x1 = xOf(n.t), x2 = xOf(n.t + n.d);
        const edge = x2 - x < 7 && x2 - x1 > 12 ? 'end' : x - x1 < 5 && x2 - x1 > 16 ? 'start' : 'body';
        return { n, edge };
      }
    }
    return null;
  }

  // ---------- drawing ----------
  function draw() {
    const { W, H } = size();
    if (!W || !H || sheetMode) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tk = take();
    const colors = app.handColors();
    const gb = gridBottom();
    g.fillStyle = '#121115';
    g.fillRect(0, 0, W, H);

    // rows
    for (let k = Math.floor(view.kTop - (gb - RULER_H) / view.rowH) - 1; k <= view.kTop + 1; k++) {
      const y = yOf(k);
      if (y > gb || y + view.rowH < RULER_H) continue;
      g.fillStyle = isBlack(k) ? '#16151a' : '#1b1a20';
      g.fillRect(KEYS_W, y, W - KEYS_W, view.rowH);
      if (k % 12 === 0) { g.fillStyle = '#2c2833'; g.fillRect(KEYS_W, y + view.rowH - 1, W - KEYS_W, 1); }
    }
    // grid
    const beats = beatsOf(tk);
    const db = downbeat(beats);
    const tA = tOf(KEYS_W), tB = tOf(W);
    for (let i = 0; i < beats.length - 1; i++) {
      const b0 = beats[i], b1 = beats[i + 1];
      if (b1 < tA || b0 > tB) continue;
      const bar = (((i - db) % 4) + 4) % 4 === 0;
      g.fillStyle = bar ? '#3a3542' : '#2a2730';
      g.fillRect(Math.round(xOf(b0)), RULER_H, 1, gb - RULER_H);
      if (division > 1 && (b1 - b0) * view.pps / division > 9) {
        g.fillStyle = '#211f26';
        for (let j = 1; j < division; j++) g.fillRect(Math.round(xOf(b0 + ((b1 - b0) * j) / division)), RULER_H, 1, gb - RULER_H);
      }
    }
    // notes
    if (tk) {
      g.save();
      g.beginPath(); g.rect(KEYS_W, RULER_H, W - KEYS_W, gb - RULER_H); g.clip();
      for (const n of tk.notes) {
        const x = xOf(n.t), w = Math.max(3, n.d * view.pps), y = yOf(n.k);
        if (x > W || x + w < KEYS_W || y > gb || y + view.rowH < RULER_H) continue;
        const sel = selection.has(n);
        g.globalAlpha = 0.45 + (n.v / 127) * 0.55;
        g.fillStyle = n.h === 0 ? colors.lh : colors.rh;
        rr(g, x + 0.5, y + 1, w - 1, view.rowH - 2, 3);
        g.fill();
        g.globalAlpha = 1;
        if (sel) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; rr(g, x + 0.5, y + 1, w - 1, view.rowH - 2, 3); g.stroke(); }
        if (n.hLock) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x + 2, y + view.rowH / 2 - 1, 3, 2); }
        if (w > 30 && view.rowH >= 12) {
          g.fillStyle = 'rgba(15,14,18,.7)';
          g.font = '500 10px Golos Text';
          g.fillText(keyName(n.k), x + 4, y + view.rowH - 3);
        }
      }
      g.restore();
    }
    // comparison marks
    if (cmp && tk) {
      g.save();
      g.beginPath(); g.rect(KEYS_W, RULER_H, W - KEYS_W, gb - RULER_H); g.clip();
      for (const m of cmp.result.marks) {
        const x = xOf(m.t), w = Math.max(6, m.d * view.pps), y = yOf(m.k);
        if (x > W || x + w < KEYS_W || y > gb || y + view.rowH < RULER_H) continue;
        g.lineWidth = 2;
        if (m.type === 'missing') {
          g.setLineDash([4, 3]);
          g.strokeStyle = 'rgba(236,229,211,.85)';
          g.fillStyle = 'rgba(236,229,211,.12)';
          rr(g, x + 0.5, y + 1, w - 1, view.rowH - 2, 3); g.fill(); g.stroke();
          g.setLineDash([]);
        } else {
          g.strokeStyle = m.type === 'wrong' ? '#ff6b5e' : '#ff9f43';
          if (m.type === 'extra') g.setLineDash([5, 3]);
          rr(g, x - 1, y, w + 2, view.rowH, 4); g.stroke();
          g.setLineDash([]);
          if (m.type === 'wrong' && m.should != null) {
            g.fillStyle = '#ff6b5e'; g.font = '600 10px Golos Text';
            g.fillText('\u2192 ' + keyName(m.should), x + w + 4, y + view.rowH - 3);
          }
        }
      }
      g.restore();
    }
    // rubber band
    if (drag && drag.type === 'band') {
      g.fillStyle = 'rgba(236,229,211,.08)';
      g.strokeStyle = 'rgba(236,229,211,.5)';
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
      g.fillRect(x, y, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
      g.strokeRect(x + 0.5, y + 0.5, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
    }
    // keys column
    for (let k = Math.floor(view.kTop - (gb - RULER_H) / view.rowH) - 1; k <= view.kTop + 1; k++) {
      const y = yOf(k);
      if (y > gb || y + view.rowH < RULER_H) continue;
      g.fillStyle = isBlack(k) ? '#1b1a1f' : '#e6dfcc';
      g.fillRect(0, y, KEYS_W - 1, view.rowH - (isBlack(k) ? 0 : 1));
      if (hover && hover.key === k) { g.fillStyle = 'rgba(201,163,90,.5)'; g.fillRect(0, y, KEYS_W - 1, view.rowH); }
      if (k % 12 === 0) { g.fillStyle = '#6b655a'; g.font = '600 10px Golos Text'; g.fillText(keyName(k), KEYS_W - 26, y + view.rowH - 3); }
    }
    // velocity lane
    const vy = gb + PED_H;
    g.fillStyle = '#16151a'; g.fillRect(0, gb, W, H - gb);
    g.fillStyle = '#2c2833'; g.fillRect(0, gb, W, 1); g.fillRect(0, vy, W, 1);
    g.fillStyle = '#7b7468'; g.font = '500 11px Golos Text';
    g.fillText(t('pedal'), 8, gb + 17);
    g.fillText(t('notes.velocity'), 8, vy + 17);
    if (tk) {
      // pedal
      g.fillStyle = 'rgba(201,163,90,.55)';
      const intervals = pedalIntervals(tk.pedal);
      for (const [a, b] of intervals) {
        const x1 = Math.max(KEYS_W, xOf(a)), x2 = Math.min(W, xOf(b));
        if (x2 > x1) g.fillRect(x1, gb + 6, x2 - x1, PED_H - 12);
      }
      // velocity stems
      for (const n of tk.notes) {
        const x = xOf(n.t);
        if (x < KEYS_W || x > W) continue;
        const hh = ((VEL_H - 12) * n.v) / 127;
        g.fillStyle = selection.has(n) ? '#ffffff' : n.h === 0 ? colors.lh : colors.rh;
        g.globalAlpha = selection.size && !selection.has(n) ? 0.35 : 0.9;
        g.fillRect(x, H - 4 - hh, 2, hh);
        g.beginPath(); g.arc(x + 1, H - 4 - hh, 2.5, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    // ruler
    g.fillStyle = '#17161b'; g.fillRect(0, 0, W, RULER_H);
    g.fillStyle = '#2c2833'; g.fillRect(0, RULER_H - 1, W, 1);
    g.fillStyle = '#9a9384'; g.font = '500 11px Golos Text';
    for (let i = db; i < beats.length; i += 4) {
      const x = xOf(beats[i]);
      if (x < KEYS_W - 20 || x > W) continue;
      g.fillRect(Math.round(x), RULER_H - 8, 1, 8);
      g.fillText(String((i - db) / 4 + 1), x + 4, RULER_H - 9);
    }
    // playhead
    const pos = app.position();
    const px = xOf(pos);
    if (px >= KEYS_W && px <= W) {
      g.fillStyle = '#ece5d3';
      g.fillRect(Math.round(px), 0, 1.5, H);
      g.beginPath(); g.moveTo(px - 5, 0); g.lineTo(px + 6, 0); g.lineTo(px + 0.5, 7); g.fill();
    }
    g.fillStyle = '#121115'; g.fillRect(0, 0, KEYS_W, RULER_H);
  }

  // ---------- editing helpers ----------
  const snapshot = () => JSON.stringify(take());
  const commit = (snap) => { app.commitEdit(snap); renderToolbar(); };
  function audition(k, v = 90, hand = 1) {
    if (!app.engine.chain) return;
    app.engine.live({ kind: 'on', key: k, vel: v, hand });
    setTimeout(() => app.engine.live({ kind: 'off', key: k }), 260);
  }
  function deleteNotes(set) {
    if (!set.size) return;
    const snap = snapshot();
    const tk = take();
    tk.notes = tk.notes.filter((n) => !set.has(n));
    selection.clear();
    commit(snap);
  }

  // ---------- mouse ----------
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    const tk = take();
    if (!tk) return;
    canvas.focus();
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const gb = gridBottom();
    // ruler: seek
    if (y < RULER_H) { app.seekTo(Math.max(0, tOf(x))); drag = { type: 'seek' }; return; }
    // keys: audition
    if (x < KEYS_W && y < gb) { audition(keyAt(y)); return; }
    // pedal lane: paint (left) / erase (right)
    if (y >= gb && y < gb + PED_H) {
      drag = { type: 'pedal', snap: snapshot(), t0: Math.max(0, tOf(x)), t1: Math.max(0, tOf(x)), on: e.button !== 2, orig: tk.pedal.slice() };
      return;
    }
    // velocity lane
    if (y >= gb + PED_H) { drag = { type: 'vel', snap: snapshot() }; velAt(x, y); return; }
    const hit = noteAt(x, y);
    // right click / eraser: delete
    if (e.button === 2 || tool === 'erase') {
      drag = { type: 'erase', snap: snapshot(), gone: new Set() };
      if (hit) { drag.gone.add(hit.n); tk.notes = tk.notes.filter((n) => n !== hit.n); }
      dirtyDraw = true;
      return;
    }
    if (hit) {
      if (!selection.has(hit.n)) { if (!e.shiftKey && !e.ctrlKey) selection.clear(); selection.add(hit.n); }
      else if (e.ctrlKey) { selection.delete(hit.n); dirtyDraw = true; return; }
      const notes = [...selection];
      if (e.altKey) { // alt-drag duplicates
        const copies = notes.map((n) => ({ ...n }));
        tk.notes.push(...copies);
        selection = new Set(copies);
      }
      drag = {
        type: hit.edge === 'body' ? 'move' : hit.edge, snap: snapshot(), x0: x, y0: y,
        anchor: hit.n, start: [...selection].map((n) => ({ n, t: n.t, d: n.d, k: n.k })), lastK: hit.n.k,
      };
      lastLen = hit.n.d; lastVel = hit.n.v;
      if (hit.edge === 'body') audition(hit.n.k, hit.n.v, hit.n.h);
      dirtyDraw = true;
      return;
    }
    if (tool === 'draw' || e.detail === 2) {
      const k = keyAt(y);
      const st = Math.max(0, snap(tOf(x)));
      const n = { k, v: lastVel, t: st, d: lastLen, h: k < 60 ? 0 : 1, hLock: false };
      const snap0 = snapshot();
      tk.notes.push(n);
      selection = new Set([n]);
      audition(k, n.v, n.h);
      drag = { type: 'end', snap: snap0, x0: x, y0: y, anchor: n, start: [{ n, t: n.t, d: n.d, k: n.k }], created: true };
      dirtyDraw = true;
      return;
    }
    if (!e.shiftKey) selection.clear();
    drag = { type: 'band', x0: x, y0: y, x1: x, y1: y, base: new Set(selection) };
    dirtyDraw = true;
  });

  function velAt(x, y) {
    const tk = take();
    const H = size().H;
    const v = Math.max(1, Math.min(127, Math.round(((H - 4 - y) / (VEL_H - 12)) * 127)));
    const tm = tOf(x);
    const tol = 5 / view.pps;
    const targets = (selection.size ? [...selection] : tk.notes).filter((n) => Math.abs(n.t - tm) <= tol);
    for (const n of targets) n.v = v;
    if (targets.length) lastVel = v;
    dirtyDraw = true;
  }

  window.addEventListener('mousemove', (e) => {
    if (store.state.tab !== 'notes') return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const tk = take();
    if (!drag) {
      const hit = x >= 0 && y >= 0 && x <= r.width && y <= r.height ? noteAt(x, y) : null;
      canvas.style.cursor = y < RULER_H ? 'pointer' : hit ? (hit.edge === 'body' ? 'move' : 'ew-resize') : tool === 'draw' ? 'crosshair' : tool === 'erase' ? 'not-allowed' : 'default';
      const nk = x < KEYS_W && y > RULER_H && y < gridBottom() ? keyAt(y) : null;
      if ((hover?.key ?? null) !== nk) { hover = { key: nk }; dirtyDraw = true; }
      return;
    }
    if (!tk) return;
    if (drag.type === 'seek') { app.seekTo(Math.max(0, tOf(x))); return; }
    if (drag.type === 'vel') { velAt(x, y); return; }
    if (drag.type === 'pedal') {
      drag.t1 = Math.max(0, tOf(x));
      tk.pedal = paintPedal(drag.orig, Math.min(drag.t0, drag.t1), Math.max(drag.t0, drag.t1), drag.on);
      dirtyDraw = true;
      return;
    }
    if (drag.type === 'erase') {
      const hit = noteAt(x, y);
      if (hit) { tk.notes = tk.notes.filter((n) => n !== hit.n); drag.gone.add(hit.n); dirtyDraw = true; }
      return;
    }
    if (drag.type === 'band') {
      drag.x1 = x; drag.y1 = y;
      const ta = tOf(Math.min(drag.x0, x)), tb = tOf(Math.max(drag.x0, x));
      const ka = keyAt(Math.max(drag.y0, y)), kb = keyAt(Math.min(drag.y0, y));
      selection = new Set(drag.base);
      for (const n of tk.notes) if (n.k >= ka && n.k <= kb && n.t + n.d >= ta && n.t <= tb) selection.add(n);
      dirtyDraw = true;
      return;
    }
    const dt = (x - drag.x0) / view.pps;
    if (drag.type === 'move') {
      const a = drag.start.find((s) => s.n === drag.anchor);
      let nt = a.t + dt;
      if (division > 0 && !e.altKey) nt = snap(nt);
      const shift = Math.max(-Math.min(...drag.start.map((s) => s.t)), nt - a.t);
      const dk = Math.round((drag.y0 - y) / view.rowH);
      for (const s of drag.start) { s.n.t = s.t + shift; s.n.k = Math.max(21, Math.min(108, s.k + dk)); }
      if (drag.anchor.k !== drag.lastK) { drag.lastK = drag.anchor.k; audition(drag.anchor.k, drag.anchor.v, drag.anchor.h); }
    } else if (drag.type === 'end') {
      for (const s of drag.start) {
        let end = s.t + s.d + dt;
        if (division > 0 && !e.altKey) end = snap(end);
        s.n.d = Math.max(gridStep(s.t) * 0.5, end - s.n.t);
      }
      lastLen = drag.anchor.d;
    } else if (drag.type === 'start') {
      for (const s of drag.start) {
        let st = s.t + dt;
        if (division > 0 && !e.altKey) st = snap(st);
        st = Math.min(st, s.t + s.d - 0.02);
        s.n.t = Math.max(0, st);
        s.n.d = s.t + s.d - s.n.t;
      }
    }
    dirtyDraw = true;
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    dirtyDraw = true;
    const tk = take();
    if (!tk) return;
    if (d.type === 'move' || d.type === 'end' || d.type === 'start') {
      tk.notes.sort((a, b) => a.t - b.t || a.k - b.k);
      const moved = d.start.some((s) => s.n.t !== s.t || s.n.d !== s.d || s.n.k !== s.k);
      if (moved || d.created) commit(d.snap);
    } else if (d.type === 'erase' && d.gone.size) {
      for (const n of d.gone) selection.delete(n);
      commit(d.snap);
    } else if (d.type === 'vel' || d.type === 'pedal') {
      commit(d.snap);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (e.ctrlKey) {
      const at = tOf(x);
      view.pps = Math.max(12, Math.min(1600, view.pps * Math.pow(1.0015, -e.deltaY)));
      view.t0 = at - (x - KEYS_W) / view.pps;
    } else if (e.altKey) {
      view.rowH = Math.max(6, Math.min(30, view.rowH + (e.deltaY < 0 ? 1 : -1)));
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      view.t0 += (e.deltaX || e.deltaY) / view.pps;
      follow = false;
    } else {
      view.kTop = Math.max(30, Math.min(108, view.kTop - Math.sign(e.deltaY) * 3));
    }
    view.t0 = Math.max(-1, view.t0);
    dirtyDraw = true;
  }, { passive: false });

  // editor-only keys
  canvas.addEventListener('keydown', (e) => {
    const tk = take();
    if (!tk) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'a') { selection = new Set(tk.notes); dirtyDraw = true; e.preventDefault(); }
    else if (e.ctrlKey && k === 'c') { clipboard = [...selection].map((n) => ({ ...n })); e.preventDefault(); }
    else if (e.ctrlKey && k === 'x') { clipboard = [...selection].map((n) => ({ ...n })); deleteNotes(selection); e.preventDefault(); }
    else if (e.ctrlKey && k === 'v') { paste(app.position()); e.preventDefault(); }
    else if (!e.ctrlKey && !e.altKey && (k === 'v' || k === 'b' || k === 'e')) { setTool({ v: 'select', b: 'draw', e: 'erase' }[k]); e.preventDefault(); }
    else if (!e.ctrlKey && k === 'q') { quantizeNow(); e.preventDefault(); }
    else if (k === 'backspace') { deleteNotes(selection); e.preventDefault(); }
  });

  function paste(at) {
    if (!clipboard.length) return;
    const tk = take();
    const snap0 = snapshot();
    const t0 = Math.min(...clipboard.map((n) => n.t));
    const copies = clipboard.map((n) => ({ ...n, t: n.t - t0 + at }));
    tk.notes.push(...copies);
    tk.notes.sort((a, b) => a.t - b.t || a.k - b.k);
    selection = new Set(copies);
    commit(snap0);
  }

  function transposeSel(dk) {
    if (!selection.size) return false;
    const snap0 = snapshot();
    for (const n of selection) n.k = Math.max(21, Math.min(108, n.k + dk));
    commit(snap0);
    return true;
  }
  function nudgeSel(dir) {
    if (!selection.size) return false;
    const snap0 = snapshot();
    for (const n of selection) n.t = Math.max(0, n.t + dir * gridStep(n.t));
    take().notes.sort((a, b) => a.t - b.t || a.k - b.k);
    commit(snap0);
    return true;
  }

  // global shortcuts while this page is open
  function hotkey(action) {
    if (sheetMode) return false;
    switch (action) {
      case 'delete': if (!selection.size) return false; deleteNotes(selection); return true;
      case 'duplicate': {
        if (!selection.size) return false;
        const notes = [...selection];
        const end = Math.max(...notes.map((n) => n.t + n.d));
        const start = Math.min(...notes.map((n) => n.t));
        clipboard = notes.map((n) => ({ ...n }));
        paste(start + Math.max(gridStep(start), snap(end) - start));
        return true;
      }
      case 'prev': return transposeSel(+1);
      case 'next': return transposeSel(-1);
      case 'back': return nudgeSel(-1);
      case 'fwd': return nudgeSel(+1);
      default: return false;
    }
  }

  // ---------- toolbar ----------
  function setTool(x) { tool = x; renderToolbar(); }

  function quantizeNow(opts = {}) {
    const tk = take();
    if (!tk) return;
    const snap0 = snapshot();
    const strength = opts.strength ?? (store.state.settings.quantize?.strength ?? 0.6);
    const steady = opts.steady ?? (store.state.settings.quantize?.steady ?? 0);
    const ends = opts.ends ?? (store.state.settings.quantize?.ends ?? true);
    const part = selection.size ? { notes: [...selection], pedal: [] } : tk;
    quantize(part, { beats: beatsOf(tk), division: division || 4, strength, ends, steady: selection.size ? 0 : steady });
    if (!selection.size && steady > 0) tk.beats = steady >= 1 ? null : tk.beats;
    tk.notes.sort((a, b) => a.t - b.t || a.k - b.k);
    commit(snap0);
    toast(t('notes.aligned'));
  }

  function openQuantize(anchor) {
    document.querySelector('.popover')?.remove();
    const q = { strength: 0.6, steady: 0, ends: true, ...(store.state.settings.quantize || {}) };
    const mk = (key, label, ends) => {
      const i = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: q[key] });
      const out = h('output', {}, Math.round(q[key] * 100) + '%');
      paintRange(i);
      i.addEventListener('input', () => { q[key] = +i.value; out.textContent = Math.round(q[key] * 100) + '%'; paintRange(i); });
      return h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('label', {}, label), out), i, h('div', { class: 'ctl-ends' }, h('span', {}, ends[0]), h('span', {}, ends[1])));
    };
    const endsBox = h('input', { type: 'checkbox' });
    endsBox.checked = q.ends;
    endsBox.addEventListener('change', () => { q.ends = endsBox.checked; });
    const pop = h('div', { class: 'popover' },
      h('h3', {}, t('notes.align')),
      h('p', { class: 'muted' }, selection.size ? t('notes.align.sel', { n: selection.size }) : t('notes.align.all')),
      mk('strength', t('notes.align.strength'), [t('notes.align.live'), t('notes.align.exact')]),
      selection.size ? null : mk('steady', t('notes.align.steady'), [t('notes.align.rubato'), t('notes.align.metronome')]),
      h('label', { class: 'check' }, endsBox, t('notes.align.ends')),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn quiet', onclick: () => pop.remove() }, t('common.cancel')),
        h('button', { class: 'btn primary', onclick: async () => { pop.remove(); await app.updateSettings({ quantize: q }); quantizeNow(q); } }, t('notes.align.do'))));
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(window.innerWidth - 360, r.left) + 'px';
    pop.style.top = r.bottom + 8 + 'px';
    document.body.append(pop);
    const off = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); window.removeEventListener('mousedown', off); } };
    setTimeout(() => window.addEventListener('mousedown', off), 0);
  }

  function setHands(hand) {
    const tk = take();
    if (!tk) return;
    const snap0 = snapshot();
    if (hand === 'auto') {
      const targets = selection.size ? [...selection] : tk.notes;
      for (const n of targets) n.hLock = false;
      tk.handsManual = false;
      assignHands(tk.notes);
    } else {
      if (!selection.size) { toast(t('notes.selectFirst')); return; }
      for (const n of selection) { n.h = hand; n.hLock = true; }
    }
    commit(snap0);
  }

  async function detectTempo() {
    const tk = take();
    if (!tk || tk.notes.length < 4) return;
    const snap0 = snapshot();
    const r = trackBeats(tk.notes);
    tk.beats = r.beats; tk.bpm = r.bpm;
    commit(snap0);
    toast(t('notes.tempoFound', { bpm: Math.round(r.bpm) }));
  }

  function setBpm(v) {
    const tk = take();
    if (!tk || !(v > 20 && v < 400)) return;
    const snap0 = snapshot();
    const first = tk.beats?.[0] ?? 0;
    tk.bpm = v;
    tk.beats = steadyBeats(v, first > 0 ? first : 0, tk.duration);
    commit(snap0);
  }

  function renderToolbar() {
    const tk = take();
    const tb = (id, label, ic, key) => h('button', { class: 'tool' + (tool === id ? ' on' : ''), title: `${label} (${key})`, onclick: () => setTool(id) }, ic, h('span', {}, label));
    const grid = h('select', { title: t('notes.grid') }, GRIDS.map(([v, l]) => h('option', { value: v, selected: +v === division }, l.startsWith('notes.') ? t(l) : l)));
    grid.addEventListener('change', () => { division = +grid.value; app.updateSettings({ gridDivision: division }); dirtyDraw = true; });
    const bpm = h('input', { type: 'number', class: 'bpm', min: 20, max: 400, step: 1, value: tk?.bpm ? Math.round(tk.bpm) : 120, title: t('notes.bpm') });
    bpm.addEventListener('change', () => setBpm(+bpm.value));
    const alignBtn = h('button', { class: 'btn', onclick: (e) => openQuantize(e.currentTarget) }, t('notes.align'));
    toolbar.replaceChildren(
      h('div', { class: 'tools' },
        tb('select', t('notes.tool.select'), cursorIcon(), 'V'),
        tb('draw', t('notes.tool.draw'), icon('edit'), 'B'),
        tb('erase', t('notes.tool.erase'), icon('close'), 'E')),
      h('label', { class: 'tb-field' }, t('notes.grid'), grid),
      h('label', { class: 'tb-field' }, bpm, h('span', { class: 'faint' }, t('notes.bpmUnit'))),
      h('button', { class: 'btn quiet', title: t('notes.detect.hint'), onclick: detectTempo }, t('notes.detect')),
      alignBtn,
      h('div', { class: 'tb-hands' },
        h('button', { class: 'hand-btn lh', title: t('notes.toLeft'), onclick: () => setHands(0) }, t('sound.left')),
        h('button', { class: 'hand-btn rh', title: t('notes.toRight'), onclick: () => setHands(1) }, t('sound.right')),
        h('button', { class: 'btn quiet', title: t('notes.autoHands.hint'), onclick: () => setHands('auto') }, t('notes.autoHands'))),
      h('div', { class: 'tb-right' },
        h('button', { class: 'btn quiet', disabled: !app.undoStack.length, title: 'Ctrl+Z', onclick: () => app.undo() }, icon('undo')),
        h('button', { class: 'btn quiet', disabled: !app.redoStack.length, title: 'Ctrl+Y', onclick: () => app.redo() }, icon('redo')),
        h('button', { class: 'btn' + (cmp ? ' primary' : ''), title: t('cmp.hint'), onclick: openCompare }, t('cmp.button')),
        h('button', { class: 'btn' + (sheetMode ? ' primary' : ''), onclick: toggleSheet }, icon('music'), t('notes.sheet'))));
  }

  function cursorIcon() {
    const s = document.createElement('span');
    s.style.display = 'contents';
    s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l12 9-6 1 3 6-2 1-3-6-4 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    return s.firstChild;
  }

  // ---------- compare with written notes ----------
  function openCompare() {
    const tk = take();
    if (!tk) return;
    const back = h('div', { class: 'modal-back' });
    const close = () => { back.remove(); app.hotkeys.suspended = false; };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    const others = store.state.takes.filter((x) => x.id !== tk.id);
    const pick = async (getRef, name) => {
      close();
      try {
        const ref = await getRef();
        if (!ref || !ref.notes.length) return;
        cmp = { result: alignToScore(tk, ref), name: name || ref.name };
        renderCmp();
        renderToolbar();
        dirtyDraw = true;
      } catch (e) { toast(t('err.generic', { e: e.message }), { error: true }); }
    };
    const list = h('div', { class: 'cmp-list' }, others.map((x) => h('button', { class: 'cmp-item', onclick: () => pick(() => window.fm.library.load(x.id), x.name) },
      h('b', {}, x.name), h('span', { class: 'faint' }, t('cmp.src.' + (x.source || 'live'))))));
    back.append(h('div', { class: 'modal', role: 'dialog' },
      h('h2', {}, t('cmp.title')),
      h('p', { class: 'muted' }, t('cmp.body')),
      h('button', { class: 'btn primary', onclick: async () => {
        const p = await window.fm.dialog.open({ properties: ['openFile'], filters: [{ name: 'Notes', extensions: ['mid', 'midi', 'musicxml', 'xml', 'mxl'] }] });
        if (p) pick(() => app.loadFileAsTake(p[0]));
      } }, icon('open'), t('cmp.openFile')),
      others.length ? h('h3', {}, t('cmp.fromLibrary')) : null,
      list,
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn quiet', onclick: close }, t('common.cancel')))));
    document.body.append(back);
    app.hotkeys.suspended = true;
  }

  // used by checks and by other screens
  function compareWith(ref, name) {
    cmp = { result: alignToScore(take(), ref), name: name || ref.name };
    renderCmp(); renderToolbar(); dirtyDraw = true;
    return cmp.result;
  }

  function renderCmp() {
    cmpBar.hidden = !cmp;
    if (!cmp) { cmpBar.replaceChildren(); return; }
    const r = cmp.result;
    cmpBar.replaceChildren(
      h('div', { class: 'cmp-score' }, h('b', { class: 'serif' }, r.accuracy + '%'), h('span', { class: 'muted' }, t('cmp.vs', { name: cmp.name }))),
      h('div', { class: 'cmp-legend' },
        h('span', { class: 'lg ok' }, t('cmp.correct', { n: r.correct })),
        h('span', { class: 'lg wrong' }, t('cmp.wrong', { n: r.wrong })),
        h('span', { class: 'lg missing' }, t('cmp.missing', { n: r.missing })),
        h('span', { class: 'lg extra' }, t('cmp.extra', { n: r.extra }))),
      h('div', { class: 'cmp-actions' },
        h('button', { class: 'btn primary', disabled: !(r.wrong + r.missing + r.extra), onclick: fixAll }, t('cmp.fix')),
        h('button', { class: 'btn quiet', onclick: () => { cmp = null; renderCmp(); renderToolbar(); dirtyDraw = true; } }, t('cmp.close'))));
  }

  function fixAll() {
    const tk = take();
    if (!tk || !cmp) return;
    const snap0 = snapshot();
    const fixed = cmp.result.fixed();
    tk.notes = fixed.notes;
    tk.beats = null;
    tk.handsManual = fixed.handsManual;
    if (!fixed.handsManual) assignHands(tk.notes);
    selection.clear();
    cmp = null;
    renderCmp();
    commit(snap0);
    toast(t('cmp.fixed'));
  }

  // ---------- sheet music view ----------
  let osmd = null;
  async function toggleSheet() {
    sheetMode = !sheetMode;
    sheet.hidden = !sheetMode;
    canvas.hidden = sheetMode;
    renderToolbar();
    if (sheetMode) await renderSheet();
  }
  async function renderSheet() {
    const tk = take();
    sheet.replaceChildren();
    if (!tk) return;
    const xml = writeMusicXML(tk, { bpm: tk.bpm || 100, beats: tk.beats, title: tk.name });
    const OSMD = await loadOsmd();
    const host = h('div', { class: 'sheet-host' });
    sheet.append(host);
    osmd = new OSMD.OpenSheetMusicDisplay(host, { autoResize: true, backend: 'svg', drawTitle: true, drawingParameters: 'default' });
    await osmd.load(xml);
    osmd.render();
  }

  // ---------- page lifecycle ----------
  let lastId = null;
  store.on((s, patch) => {
    if ('take' in patch) {
      const tk = s.take;
      if (tk?.id !== lastId) {
        lastId = tk?.id;
        selection.clear();
        cmp = null;
        renderCmp();
        if (tk) {
          ensureTempo(tk);
          const ks = tk.notes.map((n) => n.k);
          if (ks.length) view.kTop = Math.min(108, Math.max(...ks) + 4);
          view.t0 = -0.25;
        }
      } else if (tk) {
        // after undo/redo note objects are new — keep only what still exists
        const live = new Set(tk.notes);
        selection = new Set([...selection].filter((n) => live.has(n)));
      }
      renderToolbar();
      if (sheetMode) renderSheet();
      dirtyDraw = true;
    }
  });
  new ResizeObserver(() => { dirtyDraw = true; }).observe(canvas);

  function tick() {
    if (store.state.mode === 'playing' && follow) {
      const pos = app.position();
      const W = size().W;
      if (xOf(pos) > W - 60 || xOf(pos) < KEYS_W) view.t0 = pos - 1;
      dirtyDraw = true;
    }
    if (store.state.mode !== 'playing') follow = true;
    if (dirtyDraw || drag || store.state.mode === 'playing') { dirtyDraw = false; draw(); }
  }

  renderToolbar();
  return { tick, hotkey, show: () => { dirtyDraw = true; canvas.focus(); }, renderSheet, toggleSheet, compareWith, fixAll };
}

// ---------- pedal helpers ----------
export function pedalIntervals(pedal) {
  const out = [];
  let down = null;
  for (const p of pedal || []) {
    if (p.v >= 64 && down === null) down = p.t;
    else if (p.v < 64 && down !== null) { out.push([down, p.t]); down = null; }
  }
  if (down !== null) out.push([down, down + 9999]);
  return out;
}

function paintPedal(pedal, a, b, on) {
  let iv = pedalIntervals(pedal);
  if (on) {
    iv.push([a, b]);
    iv.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const r of iv) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 0.01) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    iv = merged;
  } else {
    const out = [];
    for (const [x, y] of iv) {
      if (y <= a || x >= b) out.push([x, y]);
      else { if (x < a) out.push([x, a]); if (y > b) out.push([b, y]); }
    }
    iv = out;
  }
  const ev = [];
  for (const [x, y] of iv) { ev.push({ t: x, v: 127 }); if (y < 9000) ev.push({ t: y, v: 0 }); }
  return ev;
}

function rr(g, x, y, w, hh, r) {
  r = Math.min(r, w / 2, hh / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

let osmdPromise = null;
export function loadOsmd() {
  if (window.opensheetmusicdisplay) return Promise.resolve(window.opensheetmusicdisplay);
  osmdPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/node_modules/opensheetmusicdisplay/build/opensheetmusicdisplay.min.js';
    s.onload = () => resolve(window.opensheetmusicdisplay);
    s.onerror = () => reject(new Error('sheet renderer failed to load'));
    document.head.append(s);
  });
  return osmdPromise;
}
