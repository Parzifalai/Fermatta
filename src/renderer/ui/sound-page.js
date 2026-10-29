// "Sound": choose and download pianos; shape the tone.
import { h, icon } from './dom.js';
import { soundUI, effectsBlock, autoBtn } from './sound-controls.js';
import { t, getLang } from '../i18n.js';
import { store } from '../store.js';
import { DEFAULT_SOUND } from '../audio/engine.js';

export function mountSoundPage(root, app) {
  const list = h('div');
  const customBtn = h('button', { class: 'btn quiet', onclick: () => app.addCustomPiano() }, icon('plus'), t('sound.custom'));
  const vstBox = h('div', { class: 'vst-box' });
  const pianos = h('section', { class: 'pianos glass' }, h('h2', {}, t('sound.pianos')), vstBox, list, h('div', { style: { marginTop: '14px' } }, customBtn));

  // Kontakt (Noire and other libraries) or any VST3 instrument
  async function renderVst() {
    const st = store.state.vst || (await window.fm.vst.status());
    const on = store.state.settings.soundSource === 'vst';
    const name = st.plugin ? st.plugin.split(/[\\/]/).pop().replace(/\.vst3$/i, '') : t('vst.none');
    vstBox.classList.toggle('active', on);
    vstBox.replaceChildren(
      h('div', { class: 'vst-head' },
        h('div', {}, h('div', { class: 'pname' }, name), h('div', { class: 'pdesc' }, t('vst.desc'))),
        on ? h('span', { class: 'muted' }, t('sound.active')) : null),
      h('div', { class: 'vst-actions' },
        h('button', { class: 'btn', disabled: !st.plugin, onclick: () => app.vstChoose().then(renderVst) }, t(st.hasState ? 'vst.change' : 'vst.choose')),
        on
          ? h('button', { class: 'btn quiet', onclick: () => app.useVst(false).then(renderVst) }, t('vst.off'))
          : h('button', { class: 'btn primary', disabled: !st.hasState, title: st.hasState ? '' : t('vst.chooseFirst'), onclick: () => app.useVst(true).then(renderVst) }, t('vst.on')),
        h('button', { class: 'btn quiet', onclick: async () => { if (await window.fm.vst.pick()) { store.set({ vst: await window.fm.vst.status() }); renderVst(); } } }, t('vst.other'))),
      h('div', { class: 'pmeta' }, t(on ? 'vst.noteOn' : 'vst.note')));
  }
  renderVst();

  const ui = soundUI(app);
  const reset = h('button', { class: 'btn quiet', onclick: () => app.setSound({ ...DEFAULT_SOUND }) }, icon('restore'), t('sound.reset'));
  const controls = h('section', { class: 'controls glass' },
    h('div', { class: 'ctl-top' }, h('h2', {}, t('sound.controls')), autoBtn(app)),
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
      const active = s.settings.pianoId === p.id && p.installed && s.settings.soundSource !== 'vst';
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
    if ('settings' in patch || 'vst' in patch) renderVst();
  });
  renderList();
  return { renderControls: ui.sync };
}
