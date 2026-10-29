// Settings window: language, piano input, folders, shortcuts.
import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { store } from '../store.js';
import { DEFAULT_HOTKEYS, prettyCombo, comboOf } from '../hotkeys.js';

export function openSettings(app) {
  const s = store.state.settings;
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); app.hotkeys.suspended = false; };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });

  const toggle = (checked, onChange) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'toggle' }, input, h('span'));
  };

  const lang = h('div', { class: 'seg' },
    ['ru', 'en'].map((l) => h('button', { 'aria-pressed': String(getLang() === l), onclick: () => app.setLanguage(l) }, l === 'ru' ? 'Русский' : 'English')));

  const themeSeg = h('div', { class: 'seg' }, ['aurora', 'stage'].map((th) => h('button', {
    'aria-pressed': String((store.state.settings.theme || 'aurora') === th),
    onclick: async (e) => {
      for (const b of themeSeg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      await app.setTheme(th);
    },
  }, t('theme.' + th))));
  const preroll = h('div', { class: 'seg' }, [1, 2, 3, 5].map((n) => h('button', {
    'aria-pressed': String((store.state.settings.punchPreroll ?? 3) === n),
    onclick: (e) => {
      for (const b of preroll.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      app.updateSettings({ punchPreroll: n });
    },
  }, t('punch.sec', { n }))));
  const inputs = app.midi.inputs();
  const midiSel = h('select', {},
    h('option', { value: '' }, getLang() === 'ru' ? 'Автоматически' : 'Automatic'),
    inputs.map((i) => h('option', { value: i.id, selected: s.midiInput === i.id }, i.name)));
  midiSel.addEventListener('change', () => app.selectMidi(midiSel.value));

  const folderRow = (label, key) => {
    const path = h('div', { class: 'path', title: s[key] }, s[key]);
    return h('div', { class: 'set-row' },
      h('div', {}, h('div', {}, label), path),
      h('button', { class: 'btn', onclick: async () => {
        const dir = await window.fm.dialog.folder(label);
        if (dir) { await app.updateSettings({ [key]: dir }); path.textContent = dir; if (key !== 'exportDir') app.reloadData(); }
      } }, t('settings.change')));
  };

  const hk = h('div');
  let listening = null;
  const renderHotkeys = () => {
    const map = app.hotkeys.map;
    hk.replaceChildren(...Object.keys(DEFAULT_HOTKEYS).map((action) => {
      const btn = h('button', { class: 'hk-key' + (listening === action ? ' listening' : '') }, listening === action ? t('settings.hotkeys.press') : prettyCombo(map[action], getLang()));
      btn.addEventListener('click', () => { listening = action; app.hotkeys.suspended = true; renderHotkeys(); });
      return h('div', { class: 'hk-row' }, h('span', {}, t('hk.' + action)), btn);
    }));
  };
  const onKey = async (e) => {
    if (!listening) { if (e.key === 'Escape') close(); return; }
    e.preventDefault();
    e.stopPropagation();
    const combo = comboOf(e);
    if (/^(Ctrl|Alt|Shift)(\+(Ctrl|Alt|Shift))*$/.test(combo)) return;
    const map = { ...app.hotkeys.map };
    for (const k of Object.keys(map)) if (map[k] === combo) map[k] = '';
    map[listening] = combo;
    listening = null;
    app.hotkeys.set(map);
    await app.updateSettings({ hotkeys: map });
    renderHotkeys();
    setTimeout(() => { app.hotkeys.suspended = true; }, 0);
  };
  back.addEventListener('keydown', onKey, true);
  renderHotkeys();

  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.title'), tabindex: -1 },
    h('h2', {}, t('settings.title')),
    h('div', { class: 'set-row' }, h('div', {}, t('settings.language')), lang),
    h('div', { class: 'set-row' }, h('div', {}, t('settings.theme')), themeSeg),
    h('h3', {}, t('settings.midi')),
    h('div', { class: 'set-row' }, h('div', {}, store.state.midi.ok ? store.state.midi.name : t('midi.none')), midiSel),
    h('div', { class: 'set-row' },
      h('div', {}, h('div', {}, t('settings.monitor')), h('div', { class: 'sub' }, t('settings.monitor.hint'))),
      toggle(s.liveMonitor, (v) => app.updateSettings({ liveMonitor: v }))),
    h('div', { class: 'set-row' }, h('div', {}, t('settings.pedalStart')), toggle(s.pedalStartsRecording, (v) => app.updateSettings({ pedalStartsRecording: v }))),
    h('div', { class: 'set-row' }, h('div', {}, t('punch.preroll')), preroll),
    h('h3', {}, t('settings.folders')),
    folderRow(t('settings.library'), 'libraryDir'),
    folderRow(t('settings.pianosDir'), 'pianosDir'),
    folderRow(t('settings.exportDir'), 'exportDir'),
    h('h3', {}, t('settings.hotkeys')),
    h('div', { class: 'sub faint', style: { marginBottom: '6px', fontSize: '12px' } }, t('settings.hotkeys.hint')),
    hk,
    h('h3', {}, t('settings.about')),
    h('div', { class: 'about' },
      h('p', {}, 'Fermatta 0.1. ', t('about.text')),
      h('ul', {},
        store.state.pianos.filter((p) => p.credit && !p.custom).map((p) => h('li', {}, `${p.credit} (${p.license})`)),
        h('li', {}, 'Piano transcription: Q. Kong et al., ByteDance, 2020 (CC BY 4.0)'),
        h('li', {}, 'Sheet music recognition: Audiveris (AGPL-3.0)'),
        h('li', {}, 'Sheet music display: OpenSheetMusicDisplay (BSD-3)'))),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn quiet', onclick: async () => { app.hotkeys.set({}); await app.updateSettings({ hotkeys: {} }); renderHotkeys(); } }, t('settings.hotkeys.reset')),
      h('button', { class: 'btn primary', onclick: close }, t('settings.close'))));
  back.append(modal);
  document.body.append(back);
  app.hotkeys.suspended = true;
  modal.focus();
}
