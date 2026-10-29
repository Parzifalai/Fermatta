// Bottom bar: record, play, position, piano and volume.
import { h, icon, fmtTime, paintRange } from './dom.js';
import { t } from '../i18n.js';
import { store } from '../store.js';

export function mountTransport(root, app) {
  const recLabel = h('span');
  const rec = h('button', { class: 'rec', onclick: () => app.toggleRecord() }, h('span', { class: 'disc' }), recLabel);
  const pauseBtn = h('button', { class: 'icon-btn', onclick: () => app.pauseRecord() }, icon('pause'));
  const recGroup = h('div', { class: 'tp-buttons' }, rec, pauseBtn);

  const playIcon = h('span', { style: { display: 'contents' } }, icon('play'));
  const play = h('button', { class: 'icon-btn', onclick: () => app.togglePlay() }, playIcon);
  const stop = h('button', { class: 'icon-btn', onclick: () => app.stopAll() }, icon('stop'));
  const back = h('button', { class: 'icon-btn', onclick: () => app.seekBy(-5) }, icon('back'));
  const fwd = h('button', { class: 'icon-btn', onclick: () => app.seekBy(5) }, icon('fwd'));
  const playGroup = h('div', { class: 'tp-buttons' }, back, play, stop, fwd);

  const cur = h('div', { class: 'tp-time' }, '0:00');
  const total = h('div', { class: 'tp-time total' }, '0:00');
  const seek = h('input', { type: 'range', class: 'tp-seek', min: 0, max: 1000, value: 0, step: 1 });
  let seeking = false;
  seek.addEventListener('input', () => {
    seeking = true;
    paintRange(seek);
    const take = store.state.take;
    if (take) cur.textContent = fmtTime((seek.value / 1000) * take.duration);
  });
  seek.addEventListener('change', () => {
    seeking = false;
    const take = store.state.take;
    if (take) app.seekTo((seek.value / 1000) * take.duration);
  });
  const title = h('div', { class: 'tp-title' });
  const mid = h('div', { class: 'tp-main' }, cur, h('div', {}, seek, title), total);

  const pianoName = h('b');
  const pianoSub = h('span');
  const piano = h('button', { class: 'tp-piano', onclick: () => app.go('sound') }, pianoName, pianoSub);
  const vol = h('input', { type: 'range', class: 'tp-vol', min: 0, max: 120, value: 80 });
  vol.addEventListener('input', () => { paintRange(vol); app.setSound({ volume: vol.value / 100 }); });
  const right = h('div', { class: 'tp-right' }, piano, vol);

  root.append(recGroup, playGroup, mid, right);

  function render() {
    const s = store.state;
    const recording = s.mode === 'recording' || s.mode === 'paused';
    rec.classList.toggle('on', recording);
    rec.classList.toggle('paused', s.mode === 'paused');
    recLabel.textContent = recording ? t('rec.stop') : t('rec.start');
    rec.title = recording ? t('rec.stop') : t('rec.start');
    pauseBtn.disabled = !recording;
    pauseBtn.title = s.mode === 'paused' ? t('rec.resume') : t('rec.pause');
    pauseBtn.replaceChildren(icon(s.mode === 'paused' ? 'play' : 'pause'));
    playIcon.replaceChildren(icon(s.mode === 'playing' ? 'pause' : 'play'));
    play.title = s.mode === 'playing' ? t('play.pause') : t('play.play');
    play.disabled = recording || !s.take;
    stop.title = t('play.stop');
    back.disabled = fwd.disabled = recording || !s.take;
    seek.disabled = recording || !s.take;
    const p = s.pianos.find((x) => x.id === s.settings?.pianoId);
    pianoName.textContent = p ? p.name.split(' — ')[1] || p.name : '—';
    pianoSub.textContent = s.pianoLoading !== null ? `${t('sound.loading')} ${Math.round(s.pianoLoading * 100)}%` : p ? p.piano : t('err.noPiano');
    vol.title = t('sound.volume');
    if (recording) title.textContent = s.mode === 'paused' ? t('rec.paused') : app.recorder.t0 === null ? t('rec.waiting') : t('rec.recording');
    else title.textContent = s.take ? s.take.name : '';
    total.textContent = recording ? '' : fmtTime(s.take?.duration || 0);
  }

  // called every animation frame
  function tick() {
    const s = store.state;
    if (s.mode === 'recording' || s.mode === 'paused') {
      cur.textContent = fmtTime(app.recorder.elapsed());
      return;
    }
    if (seeking) return;
    const pos = app.position();
    const take = s.take;
    cur.textContent = fmtTime(pos);
    seek.value = take && take.duration ? Math.round((pos / take.duration) * 1000) : 0;
    paintRange(seek);
  }

  vol.value = Math.round((store.state.settings?.sound?.volume ?? 0.8) * 100);
  paintRange(vol);
  store.on(render);
  render();
  return { tick, render };
}
