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
};

// Builds the same chain inside any (live or offline) context.
async function buildChain(ctx, pack, sound) {
  await ctx.audioWorklet.addModule(WORKLET);
  const node = new AudioWorkletNode(ctx, 'fermatta-piano', { numberOfInputs: 0, outputChannelCount: [2] });
  const ready = waitFor(node.port, 'ready');
  node.port.postMessage({ type: 'init', sab: pack.sab, meta: pack.meta });
  await ready;
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 220;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf'; high.frequency.value = 3200;
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const conv = ctx.createConvolver();
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.12;
  node.connect(low).connect(high);
  high.connect(dry).connect(master);
  high.connect(conv).connect(wet).connect(master);
  master.connect(limiter).connect(ctx.destination);
  const chain = { ctx, node, low, high, dry, wet, conv, master, hall: null };
  applySound(chain, sound);
  return chain;
}

function applySound(chain, s) {
  const { ctx } = chain;
  const t = ctx.currentTime;
  chain.master.gain.setTargetAtTime(s.volume, t, 0.02);
  // brightness also shifts which velocity layer is used (see worklet)
  chain.high.gain.setTargetAtTime(s.brightness * 6, t, 0.02);
  chain.low.gain.setTargetAtTime(-s.brightness * 2.5, t, 0.02);
  if (chain.hall !== s.hall) {
    chain.hall = s.hall;
    chain.conv.buffer = makeImpulse(ctx, s.hall);
  }
  const mix = s.hall === 'none' ? 0 : s.hallMix;
  chain.dry.gain.setTargetAtTime(1 - mix * 0.45, t, 0.02);
  chain.wet.gain.setTargetAtTime(mix * 1.1, t, 0.02);
  chain.node.port.postMessage({
    type: 'params',
    params: {
      length: s.length, release: s.release, brightness: s.brightness, sensitivity: s.sensitivity,
      transpose: s.transpose, hands: [s.leftVolume, s.rightVolume], noise: s.noise,
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
  }

  // ---- live input ----
  live(ev) {
    if (!this.chain) return;
    this.chain.node.port.postMessage({ type: 'events', events: [{ ...ev, t: 0 }] });
  }

  // ---- transport ----
  play(take, from = 0) {
    if (!this.chain) return;
    this.stop(false);
    const rate = this.sound.tempo || 1;
    const t0 = this.ctx.currentTime + 0.06;
    const events = takeEvents(take, { from, rate }).map((e) => ({ ...e, t: e.t + t0 }));
    this.chain.node.port.postMessage({ type: 'events', events });
    this.playing = { take, from, t0, rate };
    this.emit({ type: 'play' });
  }

  stop(emit = true) {
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
    if (!this.pack) throw new Error('no piano');
    const rate = this.sound.tempo || 1;
    const end = to ?? take.duration;
    const seconds = (end - from) / rate + tail;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
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
