// Audio engine: loads a piano pack, builds the sound chain (tone, hall, volume)
// and plays takes live or renders them offline for export.
import { makeImpulse, HALLS } from './reverb.js';

const RATE = 48000;
const WORKLET = new URL('./sampler-worklet.js', import.meta.url).href;

export const DEFAULT_SOUND = {
  volume: 0.8,      // 0..1.2
  length: 0,        // -1 shorter .. +1 endless
  release: 1,       // damper speed multiplier
  hall: 'hall',     // key of HALLS
  hallMix: 0.28,    // 0..1
  brightness: 0,    // -1 soft .. +1 bright (sound)
  sensitivity: 0,   // -1 even .. +1 expressive
  transpose: 0,     // semitones
  tempo: 1,         // playback speed
  leftVolume: 1,
  rightVolume: 1,
  noise: 1,         // hammer / damper / pedal noises
  reverbSize: 1,    // multiplies the hall's decay time
  reverbPre: 0,     // extra pre-delay, ms
  reverbTone: 0,    // -1 dark .. +1 bright tail
  width: 1,         // 0 mono .. 2 extra wide
  comp: 0,          // compressor amount, 0 = off
  echoMix: 0,       // ping-pong echo level, 0 = off
  echoTime: 0.36,   // seconds between repeats
  echoFeedback: 0.35,
  pad: 0,           // soft string-like layer that keeps chords ringing
  shimmer: 0,       // octave-up glistening reverb tail
};

// "Like in Time": huge soft hall, shimmer, a bowed pad and a slow echo.
export const TIME_SOUND = {
  hall: 'cinema', hallMix: 0.42, reverbSize: 1.1, reverbPre: 30, reverbTone: -0.3,
  shimmer: 0.32, pad: 0.38, echoMix: 0.14, echoTime: 0.5, echoFeedback: 0.38,
  width: 1.45, length: 0.4, brightness: -0.2, comp: 0.2,
};

// Builds the same chain inside any (live or offline) context:
// piano → tone → compressor → (dry + hall + echo) → stereo width → volume → limiter
// Without a pack the chain has no piano and plays ready-made audio (Kontakt) fed into chain.input.
async function buildChain(ctx, pack, sound) {
  let node = null;
  await ctx.audioWorklet.addModule(WORKLET);
  if (pack) {
    node = new AudioWorkletNode(ctx, 'fermatta-piano', { numberOfInputs: 0, outputChannelCount: [2] });
    const ready = waitFor(node.port, 'ready');
    node.port.postMessage({ type: 'init', sab: pack.sab, meta: pack.meta });
    await ready;
  }
  const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 220;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf'; high.frequency.value = 3200;
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 8; comp.attack.value = 0.012; comp.release.value = 0.25;
  const makeup = gain();
  const bus = gain();
  const dry = gain();
  // two convolvers so a new hall fades in without a click
  const convs = [0, 1].map(() => ({ conv: ctx.createConvolver(), out: gain(0) }));
  const wet = gain();
  // ping-pong echo: left repeat, then right, then left…
  const echoSend = gain(0);
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass'; echoTone.frequency.value = 4200;
  const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
  const fbL = gain(0), fbR = gain(0);
  const echoMerge = ctx.createChannelMerger(2);
  // stereo width: L' = aL + bR, R' = bL + aR
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const wLL = gain(1), wRL = gain(0), wLR = gain(0), wRR = gain(1);
  // shimmer: pitch the sound up an octave into a long hall that feeds back on itself
  const shimSend = gain(0);
  const shimHp = ctx.createBiquadFilter();
  shimHp.type = 'highpass'; shimHp.frequency.value = 350;
  const shimPitch = new AudioWorkletNode(ctx, 'fermatta-shimmer', { numberOfInputs: 1, outputChannelCount: [2] });
  const shimConv = ctx.createConvolver();
  const shimLp = ctx.createBiquadFilter();
  shimLp.type = 'lowpass'; shimLp.frequency.value = 7000;
  const shimFb = gain(0);
  const shimDelay = ctx.createDelay(1);
  shimDelay.delayTime.value = 0.08;
  const shimOut = gain(0);
  const master = gain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.12;

  if (node) node.connect(low);
  low.connect(high).connect(comp).connect(makeup);
  makeup.connect(dry).connect(bus);
  for (const c of convs) { makeup.connect(c.conv).connect(c.out).connect(wet); }
  wet.connect(bus);
  makeup.connect(echoSend).connect(echoTone).connect(dl);
  dl.connect(fbL).connect(dr);
  dr.connect(fbR).connect(dl);
  dl.connect(echoMerge, 0, 0);
  dr.connect(echoMerge, 0, 1);
  echoMerge.connect(bus);
  makeup.connect(shimSend).connect(shimHp).connect(shimPitch).connect(shimConv).connect(shimLp).connect(shimOut).connect(bus);
  shimLp.connect(shimFb).connect(shimDelay).connect(shimPitch);
  shimConv.buffer = makeImpulse(ctx, 'cinema', { size: 0.8, tone: -0.2 });
  bus.connect(split);
  split.connect(wLL, 0).connect(merge, 0, 0);
  split.connect(wRL, 1).connect(merge, 0, 0);
  split.connect(wLR, 0).connect(merge, 0, 1);
  split.connect(wRR, 1).connect(merge, 0, 1);
  merge.connect(master).connect(limiter).connect(ctx.destination);
  const chain = {
    ctx, node, input: low, low, high, comp, makeup, dry, convs, active: 0, irKey: null, wet,
    echoSend, dl, dr, fbL, fbR, wLL, wRL, wLR, wRR, master, shimSend, shimFb, shimOut,
    offline: typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext,
  };
  applySound(chain, sound);
  return chain;
}

function hallOptions(s) {
  return { size: s.reverbSize ?? 1, pre: (s.reverbPre ?? 0) / 1000, tone: s.reverbTone ?? 0 };
}

// Loads a new hall impulse into the idle convolver and cross-fades to it.
function setHall(chain, s) {
  const o = hallOptions(s);
  const key = `${s.hall}|${o.size.toFixed(2)}|${o.pre.toFixed(3)}|${o.tone.toFixed(2)}`;
  if (chain.irKey === key) return;
  chain.irKey = key;
  const load = () => {
    if (chain.irKey !== key) return;
    const t = chain.ctx.currentTime;
    const first = !chain.hasHall;
    const idx = first ? chain.active : 1 - chain.active;
    const c = chain.convs[idx];
    c.conv.buffer = makeImpulse(chain.ctx, s.hall, o);
    if (!first) chain.convs[chain.active].out.gain.setTargetAtTime(0, t, 0.08);
    chain.active = idx;
    chain.hasHall = true;
    if (chain.offline) c.out.gain.value = 1; else c.out.gain.setTargetAtTime(1, t, 0.08);
  };
  // while a slider is being dragged, rebuild the hall only once it settles
  if (chain.offline || !chain.hasHall) { load(); return; }
  clearTimeout(chain.irTimer);
  chain.irTimer = setTimeout(load, 140);
}

function applySound(chain, s) {
  const { ctx } = chain;
  const t = ctx.currentTime;
  const set = (p, v) => (chain.offline ? (p.value = v) : p.setTargetAtTime(v, t, 0.02));
  set(chain.master.gain, s.volume);
  // brightness also shifts which velocity layer is used (see worklet)
  set(chain.high.gain, s.brightness * 6);
  set(chain.low.gain, -s.brightness * 2.5);
  // compressor: lower threshold and higher ratio as the amount grows, with make-up gain
  const c = s.comp || 0;
  const thr = -c * 30, ratio = 1 + c * 5;
  set(chain.comp.threshold, thr);
  set(chain.comp.ratio, ratio);
  set(chain.makeup.gain, Math.pow(10, (-thr * (1 - 1 / ratio) * 0.45) / 20));
  setHall(chain, s);
  const mix = s.hall === 'none' ? 0 : s.hallMix;
  set(chain.dry.gain, 1 - mix * 0.45);
  set(chain.wet.gain, mix * 1.1);
  const em = s.echoMix || 0;
  set(chain.echoSend.gain, em);
  set(chain.dl.delayTime, s.echoTime ?? 0.36);
  set(chain.dr.delayTime, s.echoTime ?? 0.36);
  set(chain.fbL.gain, em > 0 ? (s.echoFeedback ?? 0.35) : 0);
  set(chain.fbR.gain, em > 0 ? (s.echoFeedback ?? 0.35) : 0);
  const sh = s.shimmer || 0;
  set(chain.shimSend.gain, sh * 0.8);
  set(chain.shimFb.gain, sh * 0.55);
  set(chain.shimOut.gain, sh * 1.2);
  const w = s.width ?? 1;
  const a = (1 + w) / 2, b = (1 - w) / 2;
  set(chain.wLL.gain, a); set(chain.wRR.gain, a);
  set(chain.wRL.gain, b); set(chain.wLR.gain, b);
  chain.node?.port.postMessage({
    type: 'params',
    params: {
      length: s.length, release: s.release, brightness: s.brightness, sensitivity: s.sensitivity,
      transpose: s.transpose, hands: [s.leftVolume, s.rightVolume], noise: s.noise, pad: s.pad || 0,
    },
  });
}

function waitFor(port, type) {
  return new Promise((resolve) => {
    const h = (e) => { if (e.data.type === type) { port.removeEventListener('message', h); resolve(e.data); } };
    port.addEventListener('message', h);
    port.start();
  });
}

async function sync(port) {
  const id = Math.random();
  const p = waitFor(port, 'pong');
  port.postMessage({ type: 'ping', id });
  await p;
}

// Notes + pedal of a take → timed sampler events (seconds from the take start).
export function takeEvents(take, { from = 0, to = Infinity, rate = 1 } = {}) {
  const ev = [];
  for (const n of take.notes) {
    if (n.t < from || n.t > to || n.muted) continue;
    ev.push({ t: (n.t - from) / rate, kind: 'on', key: n.k, vel: n.v, hand: n.h ?? 1 });
    ev.push({ t: (n.t + Math.max(0.01, n.d) - from) / rate, kind: 'off', key: n.k });
  }
  let pedalAtStart = 0;
  for (const p of take.pedal || []) {
    if (p.t < from) { pedalAtStart = p.v; continue; }
    if (p.t > to) break;
    ev.push({ t: (p.t - from) / rate, kind: 'cc', cc: 64, value: p.v });
  }
  ev.unshift({ t: 0, kind: 'cc', cc: 64, value: pedalAtStart });
  // offs before ons at the same instant so repeated notes re-strike
  ev.sort((a, b) => a.t - b.t || (a.kind === 'off' ? -1 : 1));
  return ev;
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.chain = null;
    this.pack = null;
    this.pianoId = null;
    this.sound = { ...DEFAULT_SOUND };
    this.playing = null; // { take, from, t0, rate }
    this.listeners = new Set();
  }

  on(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit(e) { for (const cb of this.listeners) cb(e); }

  async ensureContext() {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  // Streams the pack file straight into shared memory (no double copy).
  async loadPiano(id, onProgress = () => {}) {
    if (this.pianoId === id && this.chain) return;
    if (!crossOriginIsolated) throw new Error('Shared memory is unavailable (window is not isolated)');
    await this.ensureContext();
    this.stop();
    const meta = await (await fetch(`fm://pianos/${id}/pack.json`)).json();
    const bytes = meta.totalFrames * 4;
    const sab = new SharedArrayBuffer(bytes);
    const view = new Uint8Array(sab);
    const res = await fetch(`fm://pianos/${id}/pack.bin`);
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      view.set(value.subarray(0, Math.min(value.length, bytes - got)), got);
      got += value.length;
      onProgress(Math.min(1, got / bytes));
    }
    if (this.chain) this.chain.node.disconnect();
    this.pack = { sab, meta };
    this.pianoId = id;
    this.chain = await buildChain(this.ctx, this.pack, this.sound);
    this.emit({ type: 'piano', id });
  }

  setSound(patch) {
    this.sound = { ...this.sound, ...patch };
    if (this.chain) applySound(this.chain, this.sound);
    if (this.xchain) applySound(this.xchain, this.sound);
  }

  // Another instrument (Kontakt…) renders whole takes; the engine plays the
  // result through the same tone, hall and effects. source.render(events, seconds) → AudioBuffer.
  setExternal(source) {
    this.stop();
    this.external = source;
    this.xcache = null;
  }

  // Events in the plugin host format, with transpose and hand volumes applied.
  externalEvents(take, { from = 0, to = Infinity, rate = 1 } = {}) {
    const s = this.sound;
    const ev = takeEvents(take, { from, to, rate });
    return ev.map((e) => {
      if (e.kind === 'cc') return [e.t, 'cc', e.cc, e.value];
      const key = Math.max(0, Math.min(127, e.key + (s.transpose || 0)));
      if (e.kind === 'off') return [e.t, 'off', key, 0];
      const hv = e.hand === 0 ? s.leftVolume : s.rightVolume;
      return [e.t, 'on', key, Math.round(Math.max(1, Math.min(127, e.vel * Math.pow(hv ?? 1, 0.5))))];
    });
  }

  externalKey(take, rate = this.sound.tempo || 1) {
    const s = this.sound;
    return `${take.id}|${take.modified || take.created}|${rate}|${s.transpose}|${s.leftVolume}|${s.rightVolume}`;
  }

  externalReady(take) { return this.xcache?.key === this.externalKey(take); }

  async externalBuffer(take, rate) {
    const key = this.externalKey(take, rate);
    if (this.xcache?.key === key) return this.xcache.buffer;
    const events = this.externalEvents(take, { rate });
    const seconds = take.duration / rate + 4;
    const buffer = await this.external.render(events, seconds, this.ctx);
    this.xcache = { key, buffer };
    return buffer;
  }

  // ---- live input ----
  live(ev) {
    if (!this.chain) return;
    this.chain.node.port.postMessage({ type: 'events', events: [{ ...ev, t: 0 }] });
  }

  // ---- transport ----
  // `to` plays only up to that moment and lifts the pedal there (used by punch-in).
  play(take, from = 0, { to = Infinity } = {}) {
    if (this.external) return this.playExternal(take, from, to);
    if (!this.chain) return;
    this.stop(false);
    const rate = this.sound.tempo || 1;
    const t0 = this.ctx.currentTime + 0.06;
    const ev = takeEvents(take, { from, to, rate });
    if (Number.isFinite(to)) ev.push({ t: (to - from) / rate, kind: 'cc', cc: 64, value: 0 });
    const events = ev.map((e) => ({ ...e, t: e.t + t0 }));
    this.chain.node.port.postMessage({ type: 'events', events });
    this.playing = { take, from, t0, rate };
    this.emit({ type: 'play' });
  }

  async playExternal(take, from, to) {
    this.stop(false);
    const rate = this.sound.tempo || 1;
    const buffer = await this.externalBuffer(take, rate);
    if (!this.xchain) this.xchain = await buildChain(this.ctx, null, this.sound);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.xchain.input);
    const t0 = this.ctx.currentTime + 0.06;
    const offset = from / rate;
    src.start(t0, offset, Number.isFinite(to) ? Math.max(0, (to - from) / rate + 0.6) : undefined);
    this.source = src;
    this.playing = { take, from, t0, rate };
    this.emit({ type: 'play' });
  }

  stop(emit = true) {
    if (this.source) { try { this.source.stop(); } catch { /* not started */ } this.source = null; }
    if (this.chain) this.chain.node.port.postMessage({ type: 'stop' });
    const was = this.playing;
    this.playing = null;
    if (emit && was) this.emit({ type: 'stop' });
  }

  // Current position in take seconds, compensating for output latency.
  position() {
    const p = this.playing;
    if (!p) return null;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return p.from + Math.max(0, this.ctx.currentTime - p.t0 - lat) * p.rate;
  }

  // ---- export ----
  async render(take, { from = 0, to, tail = 4, onProgress } = {}) {
    if (!this.pack && !this.external) throw new Error('no piano');
    const rate = this.sound.tempo || 1;
    const end = to ?? take.duration;
    const seconds = (end - from) / rate + tail;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    if (this.external) {
      await this.ensureContext();
      const buffer = await this.externalBuffer(take, rate);
      const chain = await buildChain(ctx, null, this.sound);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(chain.input);
      src.start(0, from / rate);
      return ctx.startRendering();
    }
    const chain = await buildChain(ctx, this.pack, this.sound);
    chain.node.port.postMessage({ type: 'events', events: takeEvents(take, { from, to: end, rate }) });
    await sync(chain.node.port);
    if (onProgress) {
      // OfflineAudioContext can suspend at checkpoints to report progress.
      const step = Math.max(1, seconds / 40);
      for (let t = step; t < seconds; t += step) {
        ctx.suspend(t).then(() => { onProgress(t / seconds); ctx.resume(); });
      }
    }
    return ctx.startRendering();
  }
}

// AudioBuffer → 32-bit float WAV
export function wavFromBuffer(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new ArrayBuffer(44 + n * ch * 4);
  const dv = new DataView(out);
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 4, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * ch * 4, true);
  dv.setUint16(32, ch * 4, true); dv.setUint16(34, 32, true);
  w(36, 'data'); dv.setUint32(40, n * ch * 4, true);
  const f = new Float32Array(out, 44);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) f[i * ch + c] = chans[c][i];
  return out;
}

export { HALLS };
