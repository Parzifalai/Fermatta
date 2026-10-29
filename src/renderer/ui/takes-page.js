// "Takes": list of recordings on the left, the opened take on the right.
import { h, icon, fmtTime } from './dom.js';
import { t, plural, getLang } from '../i18n.js';
import { store } from '../store.js';
import { drawRoll } from '../core/roll.js';

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  const ru = getLang() === 'ru';
  if (diff === 0) return ru ? 'Сегодня' : 'Today';
  if (diff === 1) return ru ? 'Вчера' : 'Yesterday';
  return d.toLocaleDateString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const notesWord = (n) => `${n} ${plural(n, getLang() === 'ru' ? ['нота', 'ноты', 'нот'] : ['note', 'notes'])}`;

export function mountTakesPage(root, app) {
  const search = h('input', { type: 'search', placeholder: t('takes.search') });
  const openBtn = h('button', { class: 'btn', title: t('take.import'), onclick: () => app.importFile() }, icon('open'));
  const tools = h('div', { class: 'takes-tools' }, search, openBtn);
  const scroll = h('div', { class: 'takes-scroll', role: 'listbox' });
  const trashBtn = h('button', { class: 'btn quiet', onclick: () => app.toggleTrash() });
  const count = h('span', { class: 'faint' });
  const foot = h('div', { class: 'list-foot' }, count, trashBtn);
  const list = h('section', { class: 'takes-list glass' }, tools, scroll, foot);
  const detail = h('section', { class: 'take-detail glass' });
  root.append(h('div', { class: 'takes' }, list, detail));
  search.addEventListener('input', renderList);

  let rollCanvas = null;
  let titleInput = null;

  function renderList() {
    const s = store.state;
    const q = search.value.trim().toLowerCase();
    const items = (s.showTrash ? s.trash : s.takes).filter((x) => !q || x.name.toLowerCase().includes(q));
    scroll.replaceChildren();
    let lastDay = '';
    if (s.mode === 'recording' || s.mode === 'paused') {
      scroll.append(h('div', { class: 'take-row recording', 'aria-selected': 'false' },
        h('div', { class: 'name' }, t('rec.recording')), h('div', { class: 'dur num' }, '●'),
        h('div', { class: 'meta' }, s.mode === 'paused' ? t('rec.paused') : app.recorder.t0 === null ? t('rec.waiting') : '')));
    }
    for (const it of items) {
      const day = dayLabel(it.created);
      if (day !== lastDay) { scroll.append(h('div', { class: 'day-label' }, day)); lastDay = day; }
      const time = new Date(it.created).toLocaleTimeString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      const row = h('div', {
        class: 'take-row', role: 'option', tabindex: 0,
        'aria-selected': String(s.take?.id === it.id),
        onclick: () => app.openTake(it.id),
        ondblclick: () => { app.openTake(it.id).then(() => app.togglePlay()); },
      },
      h('div', { class: 'name' }, it.name),
      h('div', { class: 'dur num' }, fmtTime(it.duration)),
      h('div', { class: 'meta' }, h('span', {}, time), h('span', {}, notesWord(it.noteCount))),
      h('div', { class: 'sky', 'aria-hidden': 'true' }, it.preview.map((v) => h('i', { style: { height: Math.max(4, v * 100) + '%' } }))));
      scroll.append(row);
    }
    if (!items.length && s.showTrash) scroll.append(h('div', { class: 'day-label' }, t('takes.trashEmpty')));
    trashBtn.textContent = s.showTrash ? t('takes.back') : `${t('takes.trash')}${s.trash.length ? ` (${s.trash.length})` : ''}`;
    count.textContent = '';
  }

  function renderDetail() {
    const s = store.state;
    detail.replaceChildren();
    rollCanvas = null;
    titleInput = null;
    const take = s.take;
    if (!take) {
      const noPiano = !s.pianos.some((p) => p.installed);
      detail.append(h('div', { class: 'empty' },
        h('h2', {}, t('takes.empty.title')),
        h('p', {}, t('takes.empty.body')),
        h('div', { class: 'take-actions' },
          h('button', { class: 'btn primary', onclick: () => app.toggleRecord() }, t('rec.start'), h('span', { class: 'kbd' }, getLang() === 'ru' ? 'Пробел' : 'Space')),
          noPiano ? h('button', { class: 'btn', onclick: () => app.go('sound') }, icon('download'), t('sound.install')) : null),
        h('div', { class: 'hint' }, s.midi.ok ? s.midi.name : t('midi.hint'))));
      return;
    }
    const inTrash = s.showTrash && s.trash.some((x) => x.id === take.id);
    titleInput = h('input', { class: 'take-title', value: take.name, spellcheck: 'false', 'aria-label': t('take.rename') });
    titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') titleInput.blur(); });
    titleInput.addEventListener('change', () => app.renameTake(titleInput.value));
    const date = new Date(take.created).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const left = take.notes.filter((n) => n.h === 0).length;
    const colors = app.handColors();
    const ru = getLang() === 'ru';
    const facts = h('div', { class: 'take-facts' },
      h('span', {}, date),
      h('span', {}, h('b', { class: 'num' }, fmtTime(take.duration))),
      h('span', {}, notesWord(take.notes.length)),
      h('span', {}, h('i', { style: { background: colors.lh, boxShadow: `0 0 8px ${colors.lh}` } }), `${ru ? 'левая' : 'left'} ${left}`),
      h('span', {}, h('i', { style: { background: colors.rh, boxShadow: `0 0 8px ${colors.rh}` } }), `${ru ? 'правая' : 'right'} ${take.notes.length - left}`),
      take.bpm ? h('span', {}, `${ru ? 'темп' : 'tempo'} ${Math.round(take.bpm)}`) : null);
    rollCanvas = h('canvas');
    rollCanvas.addEventListener('click', (e) => {
      const r = rollCanvas.getBoundingClientRect();
      app.seekTo(((e.clientX - r.left) / r.width) * take.duration, true);
    });
    const actions = inTrash
      ? h('div', { class: 'take-actions' },
        h('button', { class: 'btn', onclick: () => app.restoreTake(take.id) }, icon('restore'), t('take.restore')),
        h('button', { class: 'btn danger', onclick: () => app.purgeTake(take.id) }, icon('trash'), t('take.purge')))
      : h('div', { class: 'take-actions' },
        h('button', { class: 'btn primary', onclick: () => app.togglePlay() }, icon(s.mode === 'playing' ? 'pause' : 'play'), s.mode === 'playing' ? t('play.pause') : t('play.play'), h('span', { class: 'kbd' }, 'Enter')),
        h('button', { class: 'btn', onclick: () => app.go('tiles') }, icon('video'), t('nav.tiles')),
        h('button', { class: 'btn', onclick: () => app.go('export') }, icon('download'), t('take.export')),
        h('button', { class: 'btn quiet', onclick: () => app.duplicateTake() }, icon('copy'), t('take.duplicate')),
        h('button', { class: 'btn quiet danger', onclick: () => app.trashTake(take.id) }, icon('trash'), t('take.delete')));
    detail.append(titleInput, facts, h('div', { class: 'roll-wrap' }, rollCanvas), actions);
    requestAnimationFrame(() => tick());
  }

  let lastKey = '';
  function render(state, patch = {}) {
    if (!patch || 'takes' in patch || 'trash' in patch || 'showTrash' in patch || 'take' in patch || 'mode' in patch) renderList();
    const key = `${state.take?.id}|${state.take?.modified}|${state.mode === 'playing'}|${state.showTrash}|${state.pianos.some((p) => p.installed)}|${state.midi.ok}`;
    if (key !== lastKey) { lastKey = key; renderDetail(); }
  }

  function tick() {
    if (rollCanvas && store.state.take) {
      drawRoll(rollCanvas, store.state.take, { pos: app.position(), colors: app.handColors() });
    }
  }

  function focusRename() { titleInput?.focus(); titleInput?.select(); }

  store.on(render);
  render(store.state);
  return { tick, focusRename };
}
