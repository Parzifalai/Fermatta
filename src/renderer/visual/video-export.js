// Video export: renders every frame with the same renderer as the preview,
// encodes it with the graphics card (WebCodecs H.264) and adds the piano sound.
import { Muxer, StreamTarget } from '/node_modules/mp4-muxer/build/mp4-muxer.mjs';
import { h, fmtTime } from '../ui/dom.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { toast } from '../ui/toast.js';
import { TilesRenderer } from './tiles-render.js';
import { wavFromBuffer } from '../audio/engine.js';

const fm = window.fm;

export const FORMATS = {
  '9:16': { label: 'vx.vertical', w: 9, h: 16 },
  '16:9': { label: 'vx.horizontal', w: 16, h: 9 },
  '1:1': { label: 'vx.square', w: 1, h: 1 },
};
const QUALITIES = { 1080: '1080p', 1440: '1440p (2K)', 2160: '2160p (4K)' };

export function dims(aspect, short) {
  const f = FORMATS[aspect];
  const even = (x) => Math.round(x / 2) * 2;
  return f.w >= f.h ? { W: even((short * f.w) / f.h), H: short } : { W: short, H: even((short * f.h) / f.w) };
}

function bitrate(W, H, fps) {
  const px = W * H;
  return Math.round(px * fps * 0.11); // ~14 Mbit/s at 1080p30, ~55 at 4K60
}

async function pickCodec(W, H, fps, br) {
  const codecs = ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.4D0034', 'avc1.42003E'];
  for (const accel of ['prefer-hardware', 'no-preference']) {
    for (const codec of codecs) {
      const cfg = { codec, width: W, height: H, bitrate: br, framerate: fps, hardwareAcceleration: accel, avc: { format: 'avc' }, latencyMode: 'quality' };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return r.config;
      } catch { /* try next */ }
    }
  }
  return null;
}

export function openVideoExport(app, { aspect = '9:16' } = {}) {
  const take = store.state.take;
  if (!take) { toast(t('export.pickTake')); return; }
  const s = store.state.settings.videoExport || {};
  let fmt = aspect || s.aspect || '9:16';
  let q = s.quality || 1080;
  let fps = s.fps || 60;
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); app.hotkeys.suspended = false; };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const est = h('p', { class: 'muted' });
  const segOf = (obj, cur, onPick, labelFn) => {
    const el = h('div', { class: 'seg' }, Object.keys(obj).map((k) => h('button', { 'data-v': k, onclick: () => { onPick(k); sync(); } }, labelFn(k))));
    el.dataset.cur = cur;
    return el;
  };
  const fmtSeg = h('div', { class: 'vx-formats' }, Object.entries(FORMATS).map(([k, f]) => h('button', { class: 'vx-format', 'data-v': k, onclick: () => { fmt = k; sync(); } },
    h('i', { style: { aspectRatio: `${f.w} / ${f.h}` } }), h('b', {}, k), h('span', {}, t(f.label)))));
  const qSeg = segOf(QUALITIES, q, (k) => { q = +k; }, (k) => QUALITIES[k]);
  const fSeg = segOf({ 30: 1, 60: 1 }, fps, (k) => { fps = +k; }, (k) => k);
  function sync() {
    for (const b of fmtSeg.children) b.setAttribute('aria-pressed', String(b.dataset.v === fmt));
    for (const b of qSeg.children) b.setAttribute('aria-pressed', String(+b.dataset.v === q));
    for (const b of fSeg.children) b.setAttribute('aria-pressed', String(+b.dataset.v === fps));
    const { W, H } = dims(fmt, q);
    const dur = videoLength(app, take);
    est.textContent = `${W} × ${H}. ` + t('vx.estimate', { d: fmtTime(dur), mb: Math.round((bitrate(W, H, fps) * dur) / 8 / 1048576) + 1 });
  }
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('h2', {}, t('vx.title')),
    h('h3', {}, t('vx.format')), fmtSeg,
    h('h3', {}, t('vx.quality')), qSeg,
    h('h3', {}, t('vx.fps')), fSeg,
    est,
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn quiet', onclick: close }, t('common.cancel')),
      h('button', { class: 'btn primary', onclick: async () => {
        close();
        await app.updateSettings({ videoExport: { aspect: fmt, quality: q, fps } });
        exportVideo(app, { aspect: fmt, short: q, fps });
      } }, t('vx.save'))));
  back.append(modal);
  document.body.append(back);
  app.hotkeys.suspended = true;
  sync();
}

function lead(style) { return style.speed + 0.6; }
function videoLength(app, take) {
  const rate = app.engine.sound.tempo || 1;
  return lead(app.visualStyle()) + take.duration / rate + 3;
}

export async function exportVideo(app, { aspect, short, fps, out }) {
  const take = store.state.take;
  const style = app.visualStyle();
  const safe = take.name.replace(/[\\/:*?"<>|]+/g, '_');
  out ||= await fm.dialog.save({ title: t('vx.title'), defaultPath: `${store.state.settings.exportDir}\\${safe} ${aspect.replace(':', 'x')}.mp4`, filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (!out) return;
  app.stopPlayback();
  const { W, H } = dims(aspect, short);
  const rate = app.engine.sound.tempo || 1;
  const L = lead(style);
  const duration = videoLength(app, take);
  const frames = Math.ceil(duration * fps);
  const withBgVideo = style.bg.type === 'video' && !!style.bg.video;
  let cancelled = false;
  const busy = app.busy(t('vx.title'));
  const cancelBtn = h('button', { class: 'btn quiet', style: { marginTop: '8px' }, onclick: () => { cancelled = true; } }, t('vx.cancel'));
  document.querySelector('.busy-card')?.append(cancelBtn);
  try {
    // 1. sound
    busy.set(0, t('vx.audio'));
    const buf = await app.engine.render(take, { onProgress: (r) => busy.set(r * 0.08, t('vx.audio')) });
    const wav = await fm.fs.tempFile(`${take.id}-video.wav`);
    await fm.fs.writeFile(wav, wavFromBuffer(buf));

    // 2. frames
    const br = bitrate(W, H, fps);
    const config = await pickCodec(W, H, fps, br);
    if (!config) throw new Error(t('vx.unsupported'));
    const renderer = new TilesRenderer();
    renderer.setTake(take);
    renderer.media = app.tilesRenderer?.media || { image: null, video: null };
    renderer.handsDrawer = app.tilesRenderer?.handsDrawer || null;
    const passes = [{ matte: false, file: await fm.fs.tempFile(`${take.id}-color.mp4`) }];
    if (withBgVideo) passes.push({ matte: true, file: await fm.fs.tempFile(`${take.id}-matte.mp4`) });
    const canvas = new OffscreenCanvas(W, H);
    const g = canvas.getContext('2d', { alpha: false });
    const passStyle = withBgVideo ? { ...style, bg: { ...style.bg, type: 'solid', a: '#000000' } } : style;
    const encoders = [];
    for (const pass of passes) {
      const sid = await fm.stream.open(pass.file);
      let chain = Promise.resolve();
      const muxer = new Muxer({
        // fragmented MP4 is written strictly in order, so the position is not needed
        target: new StreamTarget({ onData: (data, _position) => { const copy = data.slice(); chain = chain.then(() => fm.stream.write(sid, copy)); } }),
        video: { codec: 'avc', width: W, height: H, frameRate: fps },
        fastStart: 'fragmented',
        firstTimestampBehavior: 'offset',
      });
      let error = null;
      const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { error = e; } });
      enc.configure(config);
      encoders.push({ pass, sid, muxer, enc, getChain: () => chain, getError: () => error });
    }
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      if (cancelled) throw new Error('cancelled');
      const time = (i / fps - L) * rate;
      for (const e of encoders) {
        renderer.draw(g, W, H, time, passStyle, { matte: e.pass.matte });
        const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        e.enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        if (e.getError()) throw e.getError();
        while (e.enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      }
      if (i % 15 === 0) {
        const el = (performance.now() - t0) / 1000;
        const left = (el / (i + 1)) * (frames - i - 1);
        busy.set(0.08 + (i / frames) * 0.84, `${t('vx.frames', { i: i + 1, n: frames })}, ~${fmtTime(left)}`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    for (const e of encoders) {
      await e.enc.flush();
      e.enc.close();
      e.muxer.finalize();
      await e.getChain();
      await fm.stream.close(e.sid);
    }

    // 3. sound + picture together
    busy.set(0.93, t('vx.mux'));
    const off = fm.media.onProgress((p) => busy.set(0.93 + p.ratio * 0.07, t('vx.mux')));
    await fm.media.mux({
      video: passes[0].file, audio: wav, out, duration, width: W, height: H, audioDelay: L, fps,
      matte: withBgVideo ? passes[1].file : null,
      background: withBgVideo ? style.bg.video : null,
      bgDim: style.bg.dim, bgBlur: style.bg.blur,
    });
    off();
    busy.done();
    toast(t('export.done', { file: out.split(/[\\/]/).pop() }), { action: t('export.show'), onAction: () => fm.shell.reveal(out), ms: 9000 });
  } catch (e) {
    busy.done();
    if (e.message === 'cancelled') toast(t('vx.cancelled'));
    else toast(t('export.failed', { e: e.message }), { error: true, ms: 9000 });
  }
}
