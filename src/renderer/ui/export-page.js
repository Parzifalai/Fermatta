// "Export": audio, video and sheet music of the opened take.
import { h, icon } from './dom.js';
import { t } from '../i18n.js';
import { store } from '../store.js';

export function mountExportPage(root, app) {
  const body = h('div', { class: 'export-body' });
  root.append(h('div', { class: 'export' }, body));
  const extra = []; // sections added by later modules (video, sheet music)

  function section(title, desc, buttons) {
    return h('section', { class: 'exp-section' },
      h('div', {}, h('h3', {}, title), h('p', { class: 'muted' }, desc)),
      h('div', { class: 'exp-buttons' }, buttons));
  }

  function render() {
    const take = store.state.take;
    body.replaceChildren();
    body.append(h('h2', {}, t('export.title')));
    if (!take) { body.append(h('p', { class: 'muted' }, t('export.pickTake'))); return; }
    body.append(h('div', { class: 'exp-take serif' }, take.name));
    body.append(section(t('export.audio'), t('export.audio.desc'), [
      h('button', { class: 'btn primary', onclick: () => app.exportAudio('mp3') }, icon('music'), t('export.mp3')),
      h('button', { class: 'btn', onclick: () => app.exportAudio('wav') }, t('export.wav')),
      h('button', { class: 'btn', onclick: () => app.exportAudio('flac') }, t('export.flac')),
    ]));
    for (const make of extra) body.append(make(section));
    body.append(section(t('export.sheet'), t('export.sheet.desc'), [
      h('button', { class: 'btn', onclick: () => app.exportMidi() }, t('export.midi')),
      ...(app.sheetExportButtons ? app.sheetExportButtons() : []),
    ]));
  }

  store.on((s, patch) => { if ('take' in patch || 'tab' in patch) render(); });
  render();
  return { render, addSection: (make) => { extra.push(make); render(); } };
}
