// "Tiles": the video studio — a live falling-notes preview and every part of its look.
import { h, icon, paintRange } from './dom.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { DEFAULT_VISUAL, PALETTES, BACKGROUNDS, PRESETS, applyPreset, keyboardHeight, demoTake } from '../visual/tiles-render.js';
import { TilesComposer, renderThumb } from '../visual/gl-composer.js';
import { openVideoExport } from '../visual/video-export.js';
import { soundUI, effectsBlock, autoBtn } from './sound-controls.js';

export const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };
const TABS = ['bg', 'notes', 'keys', 'fx', 'camera', 'sound'];

export function visualOf(settings) {
  const v = settings?.visual || {};
  return { ...DEFAULT_VISUAL, ...v, bg: { ...DEFAULT_VISUAL.bg, ...(v.bg || {}) } };
}

export function mountTilesPage(root, app) {
  let aspect = store.state.settings.tilesAspect || '16:9';
  let tab = store.state.settings.studioTab || 'bg';
  const canvas = h('canvas', { class: 'tiles-canvas' });
  const handle = h('div', { class: 'hit-handle', title: t('studio.drag'), role: 'separator', 'aria-orientation': 'horizontal' }, h('i'));
  const emptyNote = h('div', { class: 'tiles-empty' }, t('export.pickTake'));
  const frame = h('div', { class: 'tiles-frame' }, canvas, handle, emptyNote);
  const composer = new TilesComposer(canvas);
  const renderer = composer.renderer;
  app.tilesRenderer = renderer;
  const stage = h('div', { class: 'tiles-stage' }, frame);
  const aspectSeg = h('div', { class: 'seg' }, Object.keys(ASPECTS).map((a) => h('button', { 'data-a': a, onclick: () => setAspect(a) }, a)));
  const fsBtn = h('button', { class: 'btn quiet', onclick: () => frame.requestFullscreen?.() }, t('tiles.fullscreen'));
  const wideBtn = h('button', { class: 'btn quiet', onclick: () => toggleWide() });
  const head = h('div', { class: 'tiles-head' }, aspectSeg, h('span', { class: 'faint tiles-hint' }, t('tiles.hint')), wideBtn, fsBtn);
  const left = h('section', { class: 'tiles-left glass' }, head, stage);
  const presetsEl = h('div', { class: 'presets' });
  const tabsEl = h('div', { class: 'studio-tabs', role: 'tablist' });
  const body = h('div', { class: 'studio-body' });
  const exportBtn = h('button', { class: 'btn primary', onclick: () => openVideoExport(app, { aspect }) }, icon('video'), t('tiles.export'));
  const panel = h('section', { class: 'tiles-panel glass' }, presetsEl, tabsEl, body, h('div', { class: 'tp-actions' }, exportBtn));
  const grid = h('div', { class: 'tiles' }, left, panel);
  root.append(grid);

  let style = visualOf(store.state.settings);
  const save = () => {
    clearTimeout(save.t);
    save.t = setTimeout(() => app.updateSettings({ visual: style }), 300);
  };
  const setStyle = (patch, rebuild = false) => {
    style = { ...style, ...patch, bg: { ...style.bg, ...(patch.bg || {}) } };
    if (!('preset' in patch)) style.preset = '';
    app.keyboard.setColors({ lh: style.lh, rh: style.rh });
    save();
    if (patch.bg) loadMedia();
    if (rebuild) buildBody();
    else syncPanel();
    if ('preset' in patch) syncPresets();
  };
  app.visualStyle = () => style;
  app.setVisual = (patch) => setStyle(patch, true);

  function setAspect(a) {
    aspect = a;
    app.updateSettings({ tilesAspect: a });
    syncPanel();
    fit();
  }

  function toggleWide() {
    grid.classList.toggle('wide');
    renderWide();
    requestAnimationFrame(fit);
  }
  function renderWide() {
    const wide = grid.classList.contains('wide');
    wideBtn.replaceChildren(t(wide ? 'studio.showPanel' : 'studio.hidePanel'));
  }

  // --- media for image/video backgrounds ---
  let mediaKey = '';
  function loadMedia() {
    const bg = style.bg;
    const key = `${bg.type}|${bg.image}|${bg.video}`;
    if (key === mediaKey) return;
    mediaKey = key;
    if (renderer.media.video) { renderer.media.video.pause(); renderer.media.video.src = ''; }
    renderer.media = { image: null, video: null };
    if (bg.type === 'image' && bg.image) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { renderer.media.image = img; };
      img.src = 'fm://file/' + encodeURIComponent(bg.image);
    } else if (bg.type === 'video' && bg.video) {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true; v.loop = true; v.playsInline = true;
      v.src = 'fm://file/' + encodeURIComponent(bg.video);
      v.oncanplay = () => { renderer.media.video = v; v.play().catch(() => {}); };
    }
  }

  // --- ready-made looks, each with a small live picture ---
  const demo = demoTake();
  const thumbs = [];
  function buildPresets() {
    presetsEl.replaceChildren(...PRESETS.map((p) => {
      const c = h('canvas');
      const b = h('button', { class: 'preset', 'data-id': p.id, onclick: () => { style = applyPreset(style, p.id); setStyle({ preset: p.id }, true); } },
        c, h('span', {}, t('preset.' + p.id)));
      thumbs.push({ c, id: p.id });
      return b;
    }));
    requestAnimationFrame(drawThumbs);
  }
  function drawThumbs() {
    for (const { c, id } of thumbs) {
      c.width = 320; c.height = 180;
      renderThumb(c, demo, { ...applyPreset(DEFAULT_VISUAL, id), range: 'auto', speed: 2.6, keyHeight: 0.2 }, 4.35);
    }
  }
  function syncPresets() {
    for (const b of presetsEl.children) b.setAttribute('aria-pressed', String(b.dataset.id === style.preset));
  }

  // --- control builders ---
  const sec = (title, ...items) => h('div', { class: 'tp-sec' }, title ? h('h3', {}, title) : null, ...items);
  const row = (label, control) => h('div', { class: 'tp-row' }, h('label', {}, label), control);
  const color = (value, onChange) => {
    const i = h('input', { type: 'color', value: /^#[\da-f]{6}$/i.test(value) ? value : '#ffffff' });
    i.addEventListener('input', () => onChange(i.value));
    return i;
  };
  const range = (key, min, max, step, obj = null, fmt = null) => {
    const i = h('input', { type: 'range', min, max, step, value: obj ? style[obj][key] : style[key] });
    const out = h('output', { class: 'num' });
    const show = () => { paintRange(i); out.textContent = fmt ? fmt(+i.value) : ''; };
    show();
    i.addEventListener('input', () => {
      show();
      if (obj) setStyle({ [obj]: { [key]: +i.value } }); else setStyle({ [key]: +i.value });
    });
    i.dataset.key = key; if (obj) i.dataset.obj = obj;
    i.refresh = show;
    return fmt ? h('div', { class: 'range-out' }, i, out) : i;
  };
  const seg = (key, options, obj = null, rebuild = false) => h('div', { class: 'seg', 'data-seg': key, 'data-obj': obj || '' },
    options.map(([v, label]) => h('button', { 'data-v': v, onclick: () => (obj ? setStyle({ [obj]: { [key]: v } }, rebuild) : setStyle({ [key]: v }, rebuild)) }, label)));
  const toggle = (key) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!style[key];
    input.addEventListener('change', () => setStyle({ [key]: input.checked }));
    return h('label', { class: 'toggle' }, input, h('span'));
  };
  const colorRow = (label, key, slider) => row(label, h('div', { class: 'pair grow' }, color(style[key], (v) => setStyle({ [key]: v })), slider || null));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const sec1 = (v) => t('studio.sec', { n: v.toFixed(1) });

  const ui = soundUI(app);

  const TAB_BODY = {
    bg: () => {
      const bg = style.bg;
      const items = [seg('type', [['gradient', t('tiles.bg.gradient')], ['solid', t('tiles.bg.solid')], ['image', t('tiles.bg.image')], ['video', t('tiles.bg.video')]], 'bg', true)];
      if (bg.type === 'gradient' || bg.type === 'solid') {
        items.push(h('div', { class: 'swatches' }, BACKGROUNDS.map((b) => h('button', {
          class: 'swatch bgsw', title: t('bg.' + b.id), style: { background: `linear-gradient(${b.a}, ${b.b})` },
          onclick: () => setStyle({ bg: { a: b.a, b: b.b } }, true),
        }))));
        items.push(row(t('tiles.bgColors'), h('div', { class: 'pair' }, color(bg.a, (v) => setStyle({ bg: { a: v } })), bg.type === 'gradient' ? color(bg.b, (v) => setStyle({ bg: { b: v } })) : null)));
        if (bg.type === 'gradient') items.push(row(t('tiles.angle'), range('angle', 0, 360, 1, 'bg')));
      } else {
        const file = bg.type === 'image' ? bg.image : bg.video;
        items.push(row(bg.type === 'image' ? t('tiles.image') : t('tiles.video'),
          h('button', { class: 'btn', onclick: async () => {
            const exts = bg.type === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp4', 'mov', 'webm', 'mkv'];
            const p = await window.fm.dialog.open({ properties: ['openFile'], filters: [{ name: bg.type, extensions: exts }] });
            if (p) setStyle({ bg: { [bg.type]: p[0] } }, true);
          } }, icon('folder'), file ? file.split(/[\\/]/).pop().slice(0, 22) : t('tiles.pick'))));
        items.push(row(t('tiles.blur'), range('blur', 0, 1, 0.01, 'bg')));
        items.push(row(t('tiles.dim'), range('dim', 0, 0.9, 0.01, 'bg')));
      }
      return [
        sec(t('tiles.background'), ...items),
        sec(t('studio.light'),
          row(t('studio.vignette'), range('vignette', 0, 1, 0.01)),
          row(t('tiles.brightness'), range('brightness', 0.4, 1.6, 0.01))),
      ];
    },
    notes: () => [
      sec(t('studio.noteShape'),
        seg('noteStyle', [['capsule', t('ns.capsule')], ['neon', t('ns.neon')], ['liquid', t('ns.liquid')], ['soft', t('ns.soft')], ['glass', t('ns.glass')], ['pill', t('ns.pill')], ['flat', t('ns.flat')]], null, true),
        row(t('studio.opacity'), range('opacity', 0.15, 1, 0.01, null, pct)),
        style.noteStyle === 'liquid' ? row(t('studio.refract'), range('refract', 0, 1.6, 0.01)) : null,
        row(t('studio.noteWidth'), range('noteWidth', 0.4, 1, 0.01)),
        row(t('studio.core'), range('core', 0, 1.2, 0.01))),
      sec(t('tiles.colors'),
        h('div', { class: 'swatches' }, PALETTES.map((p) => h('button', {
          class: 'swatch', title: t('pal.' + p.id), style: { background: `linear-gradient(90deg, ${p.lh} 50%, ${p.rh} 50%)` },
          onclick: () => setStyle({ lh: p.lh, rh: p.rh }, true),
        }))),
        h('div', { class: 'tp-hands' },
          h('label', {}, color(style.lh, (v) => setStyle({ lh: v })), t('sound.left')),
          h('label', {}, color(style.rh, (v) => setStyle({ rh: v })), t('sound.right'))),
        colorRow(t('studio.heat'), 'heatColor', range('heat', 0, 1, 0.01))),
      sec('',
        row(t('tiles.velocityShade'), toggle('velocityShade')),
        row(t('tiles.noteNames'), toggle('noteNames'))),
    ],
    keys: () => [
      sec(t('tiles.keyboard'),
        seg('keyboard', [['white', t('kb.white')], ['classic', t('kb.classic')], ['ebony', t('kb.ebony')]]),
        row(t('tiles.keyColors'), h('div', { class: 'pair' },
          color(style.keyLh || style.lh, (v) => setStyle({ keyLh: v })),
          color(style.keyRh || style.rh, (v) => setStyle({ keyRh: v })),
          h('button', { class: 'btn quiet', title: t('tiles.sameColors'), onclick: () => setStyle({ keyLh: '', keyRh: '' }, true) }, icon('restore')))),
        row(t('studio.keyGlow'), range('keyGlow', 0, 1.5, 0.01)),
        row(t('tiles.range'), seg('range', [['auto', t('range.auto')], ['full', t('range.full')]]))),
      sec(t('studio.line'),
        seg('line', [['fire', t('line.fire')], ['laser', t('line.laser')], ['felt', t('line.felt')], ['none', t('line.none')]]),
        colorRow(t('studio.lineColor'), 'lineColor', range('lineGlow', 0, 1.6, 0.01))),
    ],
    fx: () => [
      sec(t('studio.light'),
        row(t('fx.glow'), range('glow', 0, 1.8, 0.01)),
        row(t('fx.flare'), range('flare', 0, 1.6, 0.01)),
        row(t('fx.beams'), range('beams', 0, 1.5, 0.01))),
      sec(t('studio.particles'),
        colorRow(t('fx.embers'), 'emberColor', range('embers', 0, 2, 0.01)),
        colorRow(t('fx.sparks'), 'sparkColor', range('sparks', 0, 2, 0.01)),
        row(t('fx.dust'), range('dust', 0, 2, 0.01))),
      sec(t('fx.smoke'),
        colorRow(t('studio.amount'), 'smokeColor', range('smoke', 0, 1.5, 0.01))),
    ],
    camera: () => [
      sec(t('studio.view'),
        row(t('studio.ahead'), range('speed', 1, 12, 0.1, null, sec1)),
        row(t('studio.tilt'), range('tilt', 0, 1, 0.01, null, pct)),
        row(t('studio.fog'), range('fog', 0, 1, 0.01, null, pct)),
        row(t('studio.keyHeight'), range('keyHeight', 0.05, 0.45, 0.005, null, pct)),
        h('p', { class: 'faint tp-note' }, t('studio.dragHint'))),
      sec(t('tiles.background'), row(t('tiles.guides'), toggle('guides'))),
    ],
    sound: () => [
      h('div', { class: 'tp-sound' }, autoBtn(app), ui.slider('volume'), ...effectsBlock(ui, app)),
    ],
  };

  function buildTabs() {
    tabsEl.replaceChildren(...TABS.map((id) => h('button', { role: 'tab', 'data-tab': id, onclick: () => { tab = id; app.updateSettings({ studioTab: id }); buildBody(); } }, t('studio.tab.' + id))));
  }

  function buildBody() {
    for (const b of tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    body.replaceChildren(...(TAB_BODY[tab] || TAB_BODY.bg)());
    syncPanel();
    syncPresets();
  }

  function syncPanel() {
    for (const b of aspectSeg.children) b.setAttribute('aria-pressed', String(b.dataset.a === aspect));
    for (const s of body.querySelectorAll('[data-seg]')) {
      const obj = s.dataset.obj;
      const val = obj ? style[obj][s.dataset.seg] : style[s.dataset.seg];
      for (const b of s.children) b.setAttribute('aria-pressed', String(b.dataset.v === val));
    }
    for (const i of body.querySelectorAll('input[type=range][data-key]')) {
      const v = i.dataset.obj ? style[i.dataset.obj][i.dataset.key] : style[i.dataset.key];
      if (document.activeElement !== i && +i.value !== v) { i.value = v; i.refresh?.(); }
    }
  }

  // --- drag the line between the notes and the keyboard ---
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('drag');
    const r = frame.getBoundingClientRect();
    const portrait = r.height > r.width * 1.2;
    const move = (ev) => {
      const frac = (ev.clientY - r.top) / r.height;
      const kh = Math.max(0.05, Math.min(0.45, (1 - frac) / (portrait ? 0.6 : 1)));
      setStyle({ keyHeight: Math.round(kh * 1000) / 1000 });
    };
    const up = () => {
      handle.classList.remove('drag');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });

  // --- preview sizing ---
  function fit() {
    const r = stage.getBoundingClientRect();
    const a = ASPECTS[aspect];
    let w = r.width - 8, hgt = w / a;
    if (hgt > r.height - 8) { hgt = r.height - 8; w = hgt * a; }
    frame.style.width = Math.max(10, Math.floor(w)) + 'px';
    frame.style.height = Math.max(10, Math.floor(hgt)) + 'px';
  }
  new ResizeObserver(fit).observe(stage);

  function tick() {
    const take = store.state.take;
    if (renderer.take !== take) renderer.setTake(take);
    emptyNote.hidden = !!take;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (!W || !H) return;
    const pos = take ? app.position() : 0;
    // before playback starts, show the notes about to fall in
    const time = take && store.state.mode !== 'playing' && pos === 0 ? Math.min(0, (take.notes[0]?.t ?? 0) - style.speed * 0.6) : pos;
    composer.render(W, H, time, style);
    handle.style.top = `${(1 - keyboardHeight(W, H, style.keyHeight) / H) * 100}%`;
  }

  buildPresets();
  buildTabs();
  buildBody();
  renderWide();
  loadMedia();
  return { tick, show: fit };
}
