// "Sound": choose and download pianos; shape the tone.
import { h, icon, paintRange } from './dom.js';
import { t, getLang } from '../i18n.js';
import { store } from '../store.js';
import { DEFAULT_SOUND, HALLS } from '../audio/engine.js';

function slider({ key, min, max, step, label, ends, fmt, center = false, cls = '' }, app) {
  const input = h('input', { type: 'range', min, max, step, class: (center ? 'center ' : '') + cls, 'aria-label': label });
  const out = h('output');
  const update = () => {
    paintRange(input);
    out.textContent = fmt ? fmt(+input.value) : '';
  };
  input.addEventListener('input', () => { update(); app.setSound({ [key]: +input.value }); });
  input.addEventListener('dblclick', () => { input.value = DEFAULT_SOUND[key]; update(); app.setSound({ [key]: DEFAULT_SOUND[key] }); });
  const el = h('div', { class: 'ctl' },
    h('div', { class: 'ctl-head' }, h('label', {}, label), out),
    input,
    ends ? h('div', { class: 'ctl-ends' }, h('span', {}, ends[0]), h('span', {}, ends[1])) : null);
  return { el, set: (v) => { input.value = v; update(); } };
}

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v) => (v > 0 ? '+' : '') + Math.round(v * 100);

export function mountSoundPage(root, app) {
  const list = h('div');
  const customBtn = h('button', { class: 'btn quiet', onclick: () => app.addCustomPiano() }, icon('plus'), t('sound.custom'));
  const pianos = h('section', { class: 'pianos glass' }, h('h2', {}, t('sound.pianos')), list, h('div', { style: { marginTop: '14px' } }, customBtn));

  const sliders = {
    volume: slider({ key: 'volume', min: 0, max: 1.2, step: 0.01, label: t('sound.volume'), fmt: pct }, app),
    length: slider({ key: 'length', min: -1, max: 1, step: 0.01, label: t('sound.length'), ends: [t('sound.length.short'), t('sound.length.long')], fmt: signed, center: true }, app),
    release: slider({ key: 'release', min: 0.3, max: 4, step: 0.05, label: t('sound.release'), fmt: (v) => `×${v.toFixed(1)}` }, app),
    hallMix: slider({ key: 'hallMix', min: 0, max: 1, step: 0.01, label: t('sound.hallMix'), fmt: pct }, app),
    brightness: slider({ key: 'brightness', min: -1, max: 1, step: 0.01, label: t('sound.brightness'), ends: [t('sound.brightness.soft'), t('sound.brightness.bright')], fmt: signed, center: true }, app),
    sensitivity: slider({ key: 'sensitivity', min: -1, max: 1, step: 0.01, label: t('sound.sensitivity'), ends: [t('sound.sensitivity.even'), t('sound.sensitivity.expr')], fmt: signed, center: true }, app),
    leftVolume: slider({ key: 'leftVolume', min: 0, max: 1.5, step: 0.01, label: t('sound.left'), fmt: pct, cls: 'lh' }, app),
    rightVolume: slider({ key: 'rightVolume', min: 0, max: 1.5, step: 0.01, label: t('sound.right'), fmt: pct, cls: 'rh' }, app),
    transpose: slider({ key: 'transpose', min: -12, max: 12, step: 1, label: t('sound.transpose'), fmt: (v) => t('sound.semitones', { n: (v > 0 ? '+' : '') + v }), center: true }, app),
    tempo: slider({ key: 'tempo', min: 0.5, max: 1.5, step: 0.01, label: t('sound.tempo'), fmt: pct, center: true }, app),
    noise: slider({ key: 'noise', min: 0, max: 1.5, step: 0.01, label: t('sound.noise'), fmt: pct }, app),
  };
  const halls = h('div', { class: 'seg', role: 'group', 'aria-label': t('sound.hall') },
    Object.keys(HALLS).map((k) => h('button', { 'data-hall': k, onclick: () => app.setSound({ hall: k }) }, t('hall.' + k))));
  const reset = h('button', { class: 'btn quiet', onclick: () => app.setSound({ ...DEFAULT_SOUND }) }, icon('restore'), t('sound.reset'));

  const controls = h('section', { class: 'controls glass' },
    h('h2', {}, t('sound.controls')),
    sliders.volume.el,
    sliders.length.el,
    sliders.release.el,
    h('div', { class: 'ctl ctl-group' }, h('div', { class: 'ctl-head' }, h('label', {}, t('sound.hall'))), halls),
    sliders.hallMix.el,
    h('div', { class: 'ctl-group' }, sliders.brightness.el, sliders.sensitivity.el),
    h('div', { class: 'ctl-group' },
      h('div', { class: 'ctl-head', style: { paddingTop: '12px' } }, h('label', {}, t('sound.hands'))),
      h('div', { class: 'ctl-pair' }, sliders.leftVolume.el, sliders.rightVolume.el)),
    h('div', { class: 'ctl-group' }, sliders.transpose.el, sliders.tempo.el, sliders.noise.el),
    h('div', { style: { marginTop: '10px' } }, reset));

  root.append(h('div', { class: 'sound' }, pianos, controls));

  function stageLabel(p) {
    const pr = store.state.progress[p.id];
    if (!pr) return t('sound.installing');
    if (pr.stage === 'download') return pr.total ? `${t('sound.installing')} ${Math.round(pr.bytes / 1048576)} / ${Math.round(pr.total / 1048576)} МБ` : `${t('sound.installing')} ${Math.round(pr.bytes / 1048576)} МБ`;
    if (pr.stage === 'unpack') return t('sound.unpack');
    if (pr.stage === 'convert') return `${t('sound.convert')} ${pr.done} / ${pr.total}`;
    return '';
  }
  function ratio(p) {
    const pr = store.state.progress[p.id];
    if (!pr) return 0;
    if (pr.stage === 'download') return pr.total ? (pr.bytes / pr.total) * 0.8 : 0.3;
    if (pr.stage === 'unpack') return 0.82;
    if (pr.stage === 'convert') return 0.84 + (pr.done / pr.total) * 0.16;
    return 1;
  }

  function renderList() {
    const s = store.state;
    const lang = getLang();
    list.replaceChildren(...s.pianos.map((p) => {
      const active = s.settings.pianoId === p.id && p.installed;
      const busy = p.installing || (s.progress[p.id] && !['done', 'error', 'cancelled'].includes(s.progress[p.id].stage));
      let act;
      if (busy) {
        act = h('div', { class: 'pact' },
          h('div', { class: 'progress' }, h('i', { style: { width: Math.round(ratio(p) * 100) + '%' } })),
          h('div', { class: 'progress-label num' }, stageLabel(p)),
          h('button', { class: 'btn quiet', onclick: () => app.cancelInstall(p.id) }, t('sound.cancel')));
      } else if (p.installed) {
        act = h('div', { class: 'pact' },
          active ? h('span', { class: 'muted' }, t('sound.active')) : h('button', { class: 'btn primary', onclick: () => app.usePiano(p.id) }, t('sound.use')),
          h('button', { class: 'btn quiet', onclick: () => app.removePiano(p.id) }, t('sound.remove')));
      } else {
        act = h('div', { class: 'pact' }, h('button', { class: 'btn', onclick: () => app.installPiano(p.id) }, icon('download'), t('sound.install')));
      }
      return h('div', { class: 'piano-row' + (active ? ' active' : '') },
        h('div', { class: 'pname' }, p.name),
        act,
        h('div', { class: 'pdesc' }, p.character?.[lang] || p.character?.ru || ''),
        h('div', { class: 'pmeta' }, [p.sizeMB ? t('sound.size', { mb: p.sizeMB }) : '', p.license ? t('sound.license', { l: p.license }) : ''].filter(Boolean).join(', ')));
    }));
  }

  function renderControls() {
    const snd = app.engine.sound;
    for (const [k, s] of Object.entries(sliders)) s.set(snd[k]);
    for (const b of halls.children) b.setAttribute('aria-pressed', String(b.dataset.hall === snd.hall));
  }

  store.on((s, patch) => {
    if ('pianos' in patch || 'progress' in patch || 'settings' in patch) renderList();
    if ('sound' in patch) renderControls();
  });
  renderList();
  renderControls();
  return { renderControls };
}
