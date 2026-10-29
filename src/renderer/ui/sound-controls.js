// Sound sliders shared by the Sound screen and the video studio.
import { h, paintRange } from './dom.js';

const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>';

// "Pick the sound" button: analyses the open take and sets matching sound.
export function autoBtn(app) {
  const b = h('button', { class: 'btn auto-btn', title: t('auto.hint'), onclick: () => app.autoSound() });
  b.innerHTML = SPARK;
  b.append(t('auto.button'));
  return b;
}
import { t } from '../i18n.js';
import { store } from '../store.js';
import { DEFAULT_SOUND, HALLS } from '../audio/engine.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v) => (v > 0 ? '+' : '') + Math.round(v * 100);
const offOr = (fmt) => (v) => (v <= 0.001 ? t('fx.off') : fmt(v));

const SPEC = {
  volume: { min: 0, max: 1.2, step: 0.01, label: 'sound.volume', fmt: pct },
  length: { min: -1, max: 1, step: 0.01, label: 'sound.length', ends: ['sound.length.short', 'sound.length.long'], fmt: signed, center: true },
  release: { min: 0.3, max: 4, step: 0.05, label: 'sound.release', fmt: (v) => `×${v.toFixed(1)}` },
  hallMix: { min: 0, max: 1, step: 0.01, label: 'sound.hallMix', fmt: pct },
  brightness: { min: -1, max: 1, step: 0.01, label: 'sound.brightness', ends: ['sound.brightness.soft', 'sound.brightness.bright'], fmt: signed, center: true },
  sensitivity: { min: -1, max: 1, step: 0.01, label: 'sound.sensitivity', ends: ['sound.sensitivity.even', 'sound.sensitivity.expr'], fmt: signed, center: true },
  leftVolume: { min: 0, max: 1.5, step: 0.01, label: 'sound.left', fmt: pct, cls: 'lh' },
  rightVolume: { min: 0, max: 1.5, step: 0.01, label: 'sound.right', fmt: pct, cls: 'rh' },
  transpose: { min: -12, max: 12, step: 1, label: 'sound.transpose', fmt: (v) => t('sound.semitones', { n: (v > 0 ? '+' : '') + v }), center: true },
  tempo: { min: 0.5, max: 1.5, step: 0.01, label: 'sound.tempo', fmt: pct, center: true },
  noise: { min: 0, max: 1.5, step: 0.01, label: 'sound.noise', fmt: pct },
  reverbSize: { min: 0.4, max: 2.5, step: 0.01, label: 'fx.size', ends: ['fx.size.small', 'fx.size.big'], fmt: (v) => `×${v.toFixed(2)}` },
  reverbPre: { min: 0, max: 150, step: 1, label: 'fx.pre', fmt: (v) => t('fx.ms', { n: Math.round(v) }) },
  reverbTone: { min: -1, max: 1, step: 0.01, label: 'fx.tone', ends: ['fx.tone.dark', 'fx.tone.bright'], fmt: signed, center: true },
  width: { min: 0, max: 2, step: 0.01, label: 'fx.width', ends: ['fx.width.narrow', 'fx.width.wide'], fmt: pct, center: true },
  comp: { min: 0, max: 1, step: 0.01, label: 'fx.comp', ends: ['fx.comp.soft', 'fx.comp.dense'], fmt: offOr(pct) },
  echoMix: { min: 0, max: 0.8, step: 0.01, label: 'fx.echoMix', fmt: offOr(pct) },
  echoTime: { min: 0.06, max: 1.2, step: 0.01, label: 'fx.echoTime', fmt: (v) => t('fx.ms', { n: Math.round(v * 1000) }) },
  pad: { min: 0, max: 1, step: 0.01, label: 'fx.pad', ends: ['fx.pad.none', 'fx.pad.full'], fmt: offOr(pct) },
  shimmer: { min: 0, max: 0.8, step: 0.01, label: 'fx.shimmer', fmt: offOr(pct) },
  echoFeedback: { min: 0, max: 0.85, step: 0.01, label: 'fx.echoFeedback', ends: ['fx.echoFeedback.few', 'fx.echoFeedback.many'], fmt: pct },
};

// One set of controls bound to the engine; stays in sync when the sound changes elsewhere.
export function soundUI(app) {
  const sliders = {};
  const segs = [];

  function slider(key) {
    const sp = SPEC[key];
    const label = t(sp.label);
    const input = h('input', { type: 'range', min: sp.min, max: sp.max, step: sp.step, class: (sp.center ? 'center ' : '') + (sp.cls || ''), 'aria-label': label });
    const out = h('output');
    const update = () => { paintRange(input); out.textContent = sp.fmt ? sp.fmt(+input.value) : ''; };
    input.addEventListener('input', () => { update(); app.setSound({ [key]: +input.value }); });
    input.addEventListener('dblclick', () => { input.value = DEFAULT_SOUND[key]; update(); app.setSound({ [key]: DEFAULT_SOUND[key] }); });
    const el = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-head' }, h('label', {}, label), out),
      input,
      sp.ends ? h('div', { class: 'ctl-ends' }, h('span', {}, t(sp.ends[0])), h('span', {}, t(sp.ends[1]))) : null);
    sliders[key] = { set: (v) => { input.value = v; update(); } };
    sliders[key].set(app.engine.sound[key]);
    return el;
  }

  function halls() {
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('sound.hall') },
      Object.keys(HALLS).map((k) => h('button', { 'data-hall': k, onclick: () => app.setSound({ hall: k }) }, t('hall.' + k))));
    segs.push(seg);
    sync();
    return h('div', { class: 'ctl ctl-hall' }, h('div', { class: 'ctl-head' }, h('label', {}, t('sound.hall'))), seg);
  }

  function sync() {
    const snd = app.engine.sound;
    for (const [k, s] of Object.entries(sliders)) s.set(snd[k]);
    for (const seg of segs) for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.hall === snd.hall));
  }

  const group = (title, ...items) => h('div', { class: 'ctl-group' }, title ? h('h3', { class: 'ctl-title' }, title) : null, ...items);

  store.on((s, patch) => { if ('sound' in patch) sync(); });
  return { slider, halls, group, sync };
}

// Everything under "Effects": afterglow, hall, stereo width, compressor and echo.
export function effectsBlock(ui, app) {
  const time = h('button', { class: 'btn time-btn', title: t('fx.time.hint'), onclick: () => app.timeSound() }, t('fx.time'));
  return [
    ui.group(t('fx.after'), time, ui.slider('pad'), ui.slider('shimmer')),
    ui.group(t('fx.reverb'), ui.halls(), ui.slider('hallMix'), ui.slider('reverbSize'), ui.slider('reverbPre'), ui.slider('reverbTone')),
    ui.group(t('fx.space'), ui.slider('width')),
    ui.group(t('fx.dynamics'), ui.slider('comp')),
    ui.group(t('fx.echo'), ui.slider('echoMix'), ui.slider('echoTime'), ui.slider('echoFeedback')),
  ];
}
