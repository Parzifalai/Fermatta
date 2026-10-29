// "Sound": choose and download pianos; shape the tone.
import { h, icon } from './dom.js';
import { soundUI, effectsBlock } from './sound-controls.js';
import { t, getLang } from '../i18n.js';
import { store } from '../store.js';
import { DEFAULT_SOUND } from '../audio/engine.js';

export function mountSoundPage(root, app) {
  const list = h('div');
  const customBtn = h('button', { class: 'btn quiet', onclick: () => app.addCustomPiano() }, icon('plus'), t('sound.custom'));
  const pianos = h('section', { class: 'pianos glass' }, h('h2', {}, t('sound.pianos')), list, h('div', { style: { marginTop: '14px' } }, customBtn));

  const ui = soundUI(app);
  const reset = h('button', { class: 'btn quiet', onclick: () => app.setSound({ ...DEFAULT_SOUND }) }, icon('restore'), t('sound.reset'));
  const controls = h('section', { class: 'controls glass' },
    h('h2', {}, t('sound.controls')),
    ui.slider('volume'),
    ui.slider('length'),
    ui.slider('release'),
    ui.group('', ui.slider('brightness'), ui.slider('sensitivity')),
    ui.group(t('sound.hands'), h('div', { class: 'ctl-pair' }, ui.slider('leftVolume'), ui.slider('rightVolume'))),
    ui.group('', ui.slider('transpose'), ui.slider('tempo'), ui.slider('noise')),
    h('div', { style: { marginTop: '10px' } }, reset));
  const fx = h('section', { class: 'controls fx glass' }, h('h2', {}, t('fx.title')), ...effectsBlock(ui));

  root.append(h('div', { class: 'sound' }, pianos, controls, fx));

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

  store.on((s, patch) => {
    if ('pianos' in patch || 'progress' in patch || 'settings' in patch) renderList();
  });
  renderList();
  return { renderControls: ui.sync };
}
