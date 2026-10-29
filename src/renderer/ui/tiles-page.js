// "Tiles": live falling-notes preview and its look (colours, background, effects).
import { h, icon, paintRange } from './dom.js';
import { t, getLang } from '../i18n.js';
import { store } from '../store.js';
import { TilesRenderer, DEFAULT_VISUAL, PALETTES, BACKGROUNDS } from '../visual/tiles-render.js';
import { openVideoExport } from '../visual/video-export.js';

export const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

export function visualOf(settings) {
  const v = settings?.visual || {};
  return { ...DEFAULT_VISUAL, ...v, bg: { ...DEFAULT_VISUAL.bg, ...(v.bg || {}) } };
}

export function mountTilesPage(root, app) {
  const renderer = new TilesRenderer();
  app.tilesRenderer = renderer;
  let aspect = store.state.settings.tilesAspect || '16:9';
  const canvas = h('canvas', { class: 'tiles-canvas' });
  const frame = h('div', { class: 'tiles-frame' }, canvas);
  const stage = h('div', { class: 'tiles-stage' }, frame);
  const aspectSeg = h('div', { class: 'seg' }, Object.keys(ASPECTS).map((a) => h('button', { 'data-a': a, onclick: () => setAspect(a) }, a)));
  const fsBtn = h('button', { class: 'btn quiet', onclick: () => frame.requestFullscreen?.() }, t('tiles.fullscreen'));
  const head = h('div', { class: 'tiles-head' }, aspectSeg, h('span', { class: 'faint tiles-hint' }, t('tiles.hint')), fsBtn);
  const left = h('section', { class: 'tiles-left' }, head, stage);
  const panel = h('section', { class: 'tiles-panel' });
  root.append(h('div', { class: 'tiles' }, left, panel));

  let style = visualOf(store.state.settings);
  const save = () => {
    clearTimeout(save.t);
    save.t = setTimeout(() => app.updateSettings({ visual: style }), 300);
  };
  const setStyle = (patch, rebuild = false) => {
    style = { ...style, ...patch, bg: { ...style.bg, ...(patch.bg || {}) } };
    app.keyboard.setColors({ lh: style.lh, rh: style.rh });
    save();
    if (patch.bg) loadMedia();
    if (rebuild) buildPanel();
    else syncPanel();
  };
  app.visualStyle = () => style;

  function setAspect(a) {
    aspect = a;
    app.updateSettings({ tilesAspect: a });
    syncPanel();
    fit();
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

  // --- control builders ---
  const sec = (title, ...body) => h('div', { class: 'tp-sec' }, h('h3', {}, title), ...body);
  const row = (label, control) => h('div', { class: 'tp-row' }, h('label', {}, label), control);
  const color = (value, onChange) => {
    const i = h('input', { type: 'color', value });
    i.addEventListener('input', () => onChange(i.value));
    return i;
  };
  const range = (key, min, max, step, obj = null) => {
    const i = h('input', { type: 'range', min, max, step, value: obj ? style[obj][key] : style[key] });
    paintRange(i);
    i.addEventListener('input', () => {
      paintRange(i);
      if (obj) setStyle({ [obj]: { [key]: +i.value } }); else setStyle({ [key]: +i.value });
    });
    i.dataset.key = key; if (obj) i.dataset.obj = obj;
    return i;
  };
  const seg = (key, options, obj = null, rebuild = false) => h('div', { class: 'seg', 'data-seg': key, 'data-obj': obj || '' },
    options.map(([v, label]) => h('button', { 'data-v': v, onclick: () => (obj ? setStyle({ [obj]: { [key]: v } }, rebuild) : setStyle({ [key]: v }, rebuild)) }, label)));
  const toggle = (key) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!style[key];
    input.addEventListener('change', () => setStyle({ [key]: input.checked }));
    input.dataset.key = key;
    return h('label', { class: 'toggle' }, input, h('span'));
  };

  function buildPanel() {
    const bg = style.bg;
    const bgControls = [];
    if (bg.type === 'gradient' || bg.type === 'solid') {
      bgControls.push(h('div', { class: 'swatches' }, BACKGROUNDS.map((b) => h('button', {
        class: 'swatch bgsw', title: t('bg.' + b.id), style: { background: `linear-gradient(${b.a}, ${b.b})` },
        onclick: () => setStyle({ bg: { a: b.a, b: b.b } }, true),
      }))));
      bgControls.push(row(t('tiles.bgColors'), h('div', { class: 'pair' }, color(bg.a, (v) => setStyle({ bg: { a: v } })), bg.type === 'gradient' ? color(bg.b, (v) => setStyle({ bg: { b: v } })) : null)));
      if (bg.type === 'gradient') bgControls.push(row(t('tiles.angle'), range('angle', 0, 360, 1, 'bg')));
    } else {
      const file = bg.type === 'image' ? bg.image : bg.video;
      bgControls.push(row(bg.type === 'image' ? t('tiles.image') : t('tiles.video'),
        h('button', { class: 'btn', onclick: async () => {
          const exts = bg.type === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp4', 'mov', 'webm', 'mkv'];
          const p = await window.fm.dialog.open({ properties: ['openFile'], filters: [{ name: bg.type, extensions: exts }] });
          if (p) setStyle({ bg: { [bg.type]: p[0] } }, true);
        } }, icon('folder'), file ? file.split(/[\\/]/).pop().slice(0, 22) : t('tiles.pick'))));
      bgControls.push(row(t('tiles.blur'), range('blur', 0, 1, 0.01, 'bg')));
      bgControls.push(row(t('tiles.dim'), range('dim', 0, 0.9, 0.01, 'bg')));
    }
    panel.replaceChildren(
      sec(t('tiles.colors'),
        h('div', { class: 'swatches' }, PALETTES.map((p) => h('button', {
          class: 'swatch', title: t('pal.' + p.id), style: { background: `linear-gradient(90deg, ${p.lh} 50%, ${p.rh} 50%)` },
          onclick: () => setStyle({ lh: p.lh, rh: p.rh }, true),
        }))),
        h('div', { class: 'tp-hands' },
          h('label', {}, color(style.lh, (v) => setStyle({ lh: v })), t('sound.left')),
          h('label', {}, color(style.rh, (v) => setStyle({ rh: v })), t('sound.right'))),
        row(t('tiles.keyColors'), h('div', { class: 'pair' },
          color(style.keyLh || style.lh, (v) => setStyle({ keyLh: v })),
          color(style.keyRh || style.rh, (v) => setStyle({ keyRh: v })),
          h('button', { class: 'btn quiet', title: t('tiles.sameColors'), onclick: () => setStyle({ keyLh: '', keyRh: '' }, true) }, icon('restore'))))),
      sec(t('tiles.background'),
        seg('type', [['gradient', t('tiles.bg.gradient')], ['solid', t('tiles.bg.solid')], ['image', t('tiles.bg.image')], ['video', t('tiles.bg.video')]], 'bg', true),
        ...bgControls),
      sec(t('tiles.notes'),
        seg('noteStyle', [['soft', t('ns.soft')], ['glass', t('ns.glass')], ['neon', t('ns.neon')], ['pill', t('ns.pill')], ['flat', t('ns.flat')]]),
        row(t('tiles.speed'), range('speed', 1.2, 7, 0.1)),
        row(t('tiles.velocityShade'), toggle('velocityShade')),
        row(t('tiles.noteNames'), toggle('noteNames'))),
      sec(t('tiles.effects'),
        row(t('fx.glow'), range('glow', 0, 1.5, 0.01)),
        row(t('fx.sparks'), range('sparks', 0, 2, 0.01)),
        row(t('fx.beams'), range('beams', 0, 1.5, 0.01)),
        row(t('fx.smoke'), range('smoke', 0, 1.5, 0.01)),
        row(t('tiles.brightness'), range('brightness', 0.4, 1.6, 0.01))),
      sec(t('tiles.keyboard'),
        seg('keyboard', [['classic', t('kb.classic')], ['ebony', t('kb.ebony')]]),
        row(t('tiles.range'), seg('range', [['auto', t('range.auto')], ['full', t('range.full')]])),
        row(t('tiles.guides'), toggle('guides')),
        row(t('tiles.hands'), toggle('hands'))),
      h('div', { class: 'tp-actions' },
        h('button', { class: 'btn primary', onclick: () => openVideoExport(app, { aspect }) }, icon('video'), t('tiles.export')),
        h('button', { class: 'btn quiet', onclick: () => { style = { ...DEFAULT_VISUAL }; setStyle({}, true); } }, icon('restore'), t('sound.reset'))));
    syncPanel();
  }

  function syncPanel() {
    for (const b of aspectSeg.children) b.setAttribute('aria-pressed', String(b.dataset.a === aspect));
    for (const s of panel.querySelectorAll('[data-seg]')) {
      const obj = s.dataset.obj;
      const val = obj ? style[obj][s.dataset.seg] : style[s.dataset.seg];
      for (const b of s.children) b.setAttribute('aria-pressed', String(b.dataset.v === val));
    }
  }

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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (!W || !H) return;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext('2d');
    const pos = take ? app.position() : 0;
    // before playback starts, show the notes about to fall in
    const time = take && store.state.mode !== 'playing' && pos === 0 ? Math.min(0, (take.notes[0]?.t ?? 0) - style.speed * 0.6) : pos;
    renderer.draw(g, W, H, time, style);
    if (!take) {
      g.fillStyle = 'rgba(236,229,211,.7)';
      g.font = `500 ${Math.round(H * 0.035)}px Golos Text`;
      g.textAlign = 'center';
      g.fillText(t('export.pickTake'), W / 2, H * 0.42);
    }
  }

  buildPanel();
  loadMedia();
  return { tick, show: fit };
}
