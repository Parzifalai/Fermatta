// Fermatta piano sampler. Runs inside an AudioWorklet, both live and offline
// (export), so what you hear is exactly what gets saved.
//
// Sample memory: one SharedArrayBuffer of 16-bit stereo frames (the "pack").
// Events arrive with a context time and are applied sample-accurately.

const DB = (db) => Math.pow(10, db / 20);
const MAX_VOICES = 192;

class PianoSampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pcm = null;
    this.regions = [];
    this.byKey = [];
    this.releaseByKey = [];
    this.ccRegions = [];
    this.voices = [];
    this.queue = [];
    this.cc = new Float32Array(128);
    this.held = new Uint8Array(128);
    this.heldSince = new Float64Array(128);
    this.heldVel = new Uint8Array(128);
    this.heldHand = new Uint8Array(128);
    this.seq = new Uint32Array(128);
    this.ratio = 1;
    this.params = { length: 0, release: 1, brightness: 0, sensitivity: 0, transpose: 0, hands: [1, 1], resonance: 0.5, noise: 1 };
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (m.type === 'init') {
      this.pcm = new Int16Array(m.sab);
      this.meta = m.meta;
      this.ratio = m.meta.sampleRate / sampleRate;
      this.defaultCC = m.meta.cc || {};
      for (const [k, v] of Object.entries(this.defaultCC)) this.cc[k] = v;
      this.index(m.meta.regions);
      this.port.postMessage({ type: 'ready' });
    } else if (m.type === 'events') {
      for (const ev of m.events) this.queue.push(ev);
      this.queue.sort((a, b) => a.t - b.t);
    } else if (m.type === 'clear') {
      this.queue.length = 0;
    } else if (m.type === 'stop') {
      this.queue.length = 0;
      for (const v of this.voices) this.fastFade(v);
      this.held.fill(0);
      this.cc[64] = 0;
      for (const [k, v] of Object.entries(this.defaultCC || {})) this.cc[k] = v;
    } else if (m.type === 'ping') {
      this.port.postMessage({ type: 'pong', id: m.id });
    } else if (m.type === 'params') {
      Object.assign(this.params, m.params);
    }
  }

  index(regions) {
    this.regions = regions;
    this.byKey = Array.from({ length: 128 }, () => []);
    this.releaseByKey = Array.from({ length: 128 }, () => []);
    this.ccRegions = [];
    regions.forEach((r, i) => {
      if (r.onCC && Object.keys(r.onCC).length) { this.ccRegions.push(i); return; }
      const list = r.trigger === 'release' || r.trigger === 'release_key' ? this.releaseByKey : r.trigger === 'attack' || r.trigger === 'first' || r.trigger === 'legato' ? this.byKey : null;
      if (!list) return;
      for (let k = Math.max(0, r.lokey); k <= Math.min(127, r.hikey); k++) list[k].push(i);
    });
  }

  condOk(r) {
    for (const cc in r.cond) {
      const [lo, hi] = r.cond[cc];
      const v = this.cc[cc];
      if (v < lo || v > hi) return false;
    }
    return true;
  }

  velGain(r, vel) {
    let curve;
    if (r.velcurve.length) {
      const pts = r.velcurve;
      curve = pts[pts.length - 1][1];
      let prev = [0, 0];
      for (const p of pts) {
        if (vel <= p[0]) { curve = prev[1] + (p[1] - prev[1]) * ((vel - prev[0]) / Math.max(1, p[0] - prev[0])); break; }
        prev = p;
      }
    } else {
      curve = (vel / 127) * (vel / 127);
    }
    let g = 1 + (curve - 1) * (r.veltrack / 100);
    // velocity crossfades
    if (r.xfinHi > r.xfinLo && vel < r.xfinHi) g *= Math.sqrt(Math.max(0, (vel - r.xfinLo) / (r.xfinHi - r.xfinLo)));
    if (r.xfoutHi > r.xfoutLo && vel > r.xfoutLo) g *= Math.sqrt(Math.max(0, (r.xfoutHi - vel) / (r.xfoutHi - r.xfoutLo)));
    return Math.max(0, g);
  }

  startVoice(ri, key, vel, gainVel, hand, extraGain, isRelease) {
    const r = this.regions[ri];
    const s = this.meta.samples[r.s];
    if (!s) return;
    const semis = (key - r.center) * (r.keytrack / 100) + r.tune / 100;
    let g = DB(r.volume + r.ampKeytrack * (key - r.ampKeycenter)) * this.velGain(r, gainVel) * extraGain;
    if (g < 1e-5) return;
    const pan = Math.max(-1, Math.min(1, r.pan / 100));
    const v = {
      r, key, hand, vel,
      base: s.offset * 2, len: s.frames,
      pos: Math.min(r.offset, s.frames - 1),
      step: Math.pow(2, semis / 12) * this.ratio,
      gl: g * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2,
      gr: g * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2,
      env: r.attack > 0 ? 0 : 1,
      attackInc: r.attack > 0 ? 1 / (r.attack * sampleRate) : 0,
      stage: r.attack > 0 ? 0 : 1, // 0 attack, 1 sustain, 2 release, 3 fast
      relMul: 1,
      boost: 1,
      age: 0,
      delay: Math.round(r.delay * sampleRate),
      release: isRelease,
      loopStart: -1,
    };
    // round robin / exclusive groups
    if (r.group) for (const o of this.voices) if (o.r.offBy === r.group && o.stage < 3) this.fastFade(o);
    if (this.voices.length >= MAX_VOICES) this.steal();
    // a re-struck string replaces its old vibration (note_polyphony), otherwise
    // keep at most three ringing copies of one key
    if (!isRelease) {
      const same = this.voices.filter((o) => o.key === key && !o.release && o.stage < 3 && o.r === r);
      const limit = r.notePolyphony > 0 ? r.notePolyphony : 3;
      for (let i = 0; i <= same.length - limit; i++) this.softFade(same[i]);
    }
    this.voices.push(v);
  }

  steal() {
    let worst = null;
    for (const v of this.voices) {
      const loud = v.env * v.boost * Math.max(v.gl, v.gr) * (v.stage >= 2 ? 0.25 : 1);
      if (!worst || loud < worst.l) worst = { v, l: loud };
    }
    if (worst) this.voices.splice(this.voices.indexOf(worst.v), 1);
  }

  softFade(v) {
    v.stage = 3;
    v.relMul = Math.exp(Math.log(0.001) / (0.12 * sampleRate));
  }

  fastFade(v) {
    v.stage = 3;
    v.relMul = Math.exp(Math.log(0.001) / (0.04 * sampleRate));
  }

  release(v) {
    if (v.stage >= 2) return;
    v.stage = 2;
    const t = Math.max(0.03, v.r.release * this.params.release * (1 + Math.max(0, this.params.length) * 1.5));
    v.relMul = Math.exp(Math.log(0.001) / (t * sampleRate));
  }

  noteOn(key, vel, hand) {
    const p = this.params;
    const k = key + (p.transpose | 0);
    if (k < 0 || k > 127 || vel <= 0) return;
    const gamma = Math.pow(2, -p.sensitivity);
    const gv = Math.max(1, Math.min(127, Math.round(127 * Math.pow(vel / 127, gamma))));
    const sv = Math.max(1, Math.min(127, Math.round(gv + p.brightness * 24)));
    this.held[key] = 1;
    this.heldSince[key] = currentTime;
    this.heldVel[key] = gv;
    this.heldHand[key] = hand === 0 ? 0 : 1;
    const hg = p.hands[hand === 0 ? 0 : 1];
    const cands = this.byKey[k].filter((i) => {
      const r = this.regions[i];
      return sv >= r.lovel && sv <= r.hivel && this.condOk(r);
    });
    // round robins: pick by seq position, random ranges via lorand/hirand
    const rnd = Math.random();
    const seqN = this.seq[k]++;
    for (const i of cands) {
      const r = this.regions[i];
      if (r.seqLength > 1 && ((seqN % r.seqLength) + 1) !== r.seqPosition) continue;
      if (rnd < r.lorand || rnd >= r.hirand) continue;
      this.startVoice(i, k, gv, gv, hand, hg, false);
    }
  }

  noteOff(key) {
    this.held[key] = 0;
    if (this.cc[64] >= 64) return; // pedal keeps it ringing
    this.damp(key);
  }

  damp(key) {
    const k = key + (this.params.transpose | 0);
    let had = false;
    for (const v of this.voices) if (v.key === k && !v.release && v.stage < 2) { this.release(v); had = true; }
    if (!had || this.params.noise <= 0) return;
    // release ("damper") samples, quieter the longer the note was held
    const held = currentTime - this.heldSince[key];
    const vel = this.heldVel[key] || 64;
    for (const i of this.releaseByKey[k]) {
      const r = this.regions[i];
      if (vel < r.lovel || vel > r.hivel || !this.condOk(r)) continue;
      const hand = this.heldHand[key];
      const g = DB(-r.rtDecay * held) * this.params.noise * this.params.hands[hand];
      this.startVoice(i, k, vel, vel, hand, g, true);
    }
  }

  control(cc, value) {
    const old = this.cc[cc];
    this.cc[cc] = value;
    for (const i of this.ccRegions) {
      const r = this.regions[i];
      const range = r.onCC[cc];
      if (!range) continue;
      const inNow = value >= range[0] && value <= range[1];
      const inOld = old >= range[0] && old <= range[1];
      if (inNow && !inOld && this.params.noise > 0 && this.condOk(r)) this.startVoice(i, r.center, 100, 100, 1, 0.8 * this.params.noise, true);
    }
    if (cc === 64 && value < 64 && old >= 64) {
      for (let k = 0; k < 128; k++) if (!this.held[k]) this.damp(k);
    }
  }

  apply(ev) {
    if (ev.kind === 'on') this.noteOn(ev.key, ev.vel, ev.hand);
    else if (ev.kind === 'off') this.noteOff(ev.key);
    else if (ev.kind === 'cc') this.control(ev.cc, ev.value);
  }

  render(outL, outR, from, to) {
    const pcm = this.pcm;
    const p = this.params;
    const len = p.length;
    // "Length": shorten with extra decay, lengthen with slow gain compensation
    // plus a crossfaded loop of the tail so a held note can ring forever.
    const extraDecay = len < 0 ? DB(len * 14 / sampleRate) : 1;
    const growth = len > 0 ? DB(len * 5 / sampleRate) : 1;
    const maxBoost = len > 0 ? DB(len * 24) : 1;
    for (let vi = this.voices.length - 1; vi >= 0; vi--) {
      const v = this.voices[vi];
      let dead = false;
      const base = v.base;
      const sustaining = !v.release && v.stage < 2;
      for (let i = from; i < to; i++) {
        if (v.delay > 0) { v.delay--; continue; }
        let pos = v.pos;
        if (pos >= v.len - 3) {
          if (len > 0.05 && sustaining && v.len > sampleRate) {
            // loop the last ~0.6 s of the recording
            const loopLen = Math.min(v.len * 0.25, sampleRate * 0.6);
            pos = v.pos = v.len - 3 - loopLen;
            v.loopStart = pos;
          } else { dead = true; break; }
        }
        const ip = pos | 0;
        const f = pos - ip;
        const o = base + ip * 2;
        // 4-point Hermite interpolation per channel
        const l0 = pcm[o - 2 >= base ? o - 2 : o], l1 = pcm[o], l2 = pcm[o + 2], l3 = pcm[o + 4];
        const r0 = pcm[o - 1 >= base ? o - 1 : o + 1], r1 = pcm[o + 1], r2 = pcm[o + 3], r3 = pcm[o + 5];
        const sl = ((((0.5 * (l3 - l0) + 1.5 * (l1 - l2)) * f + (l0 - 2.5 * l1 + 2 * l2 - 0.5 * l3)) * f + 0.5 * (l2 - l0)) * f + l1) * (1 / 32768);
        const sr = ((((0.5 * (r3 - r0) + 1.5 * (r1 - r2)) * f + (r0 - 2.5 * r1 + 2 * r2 - 0.5 * r3)) * f + 0.5 * (r2 - r0)) * f + r1) * (1 / 32768);
        // envelope
        if (v.stage === 0) { v.env += v.attackInc; if (v.env >= 1) { v.env = 1; v.stage = 1; } }
        else if (v.stage >= 2) { v.env *= v.relMul; if (v.env < 0.0005) { dead = true; break; } }
        if (sustaining) {
          if (len < 0) v.env *= extraDecay;
          else if (len > 0 && v.boost < maxBoost) v.boost *= growth;
        }
        // loop crossfade: blend the start of the loop in gently
        let xf = 1;
        if (v.loopStart >= 0) {
          const into = pos - v.loopStart;
          const fadeLen = sampleRate * 0.15;
          if (into < fadeLen) xf = 0.7 + 0.3 * (into / fadeLen);
        }
        const g = v.env * v.boost * xf;
        outL[i] += sl * v.gl * g;
        outR[i] += sr * v.gr * g;
        v.pos = pos + v.step;
      }
      v.age += to - from;
      if (dead) this.voices.splice(vi, 1);
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    if (!this.pcm) return true;
    const n = L.length;
    const startFrame = currentFrame;
    let cursor = 0;
    while (this.queue.length) {
      const ev = this.queue[0];
      const at = Math.round(ev.t * sampleRate) - startFrame;
      if (at >= n) break;
      const idx = Math.max(cursor, Math.min(n, at));
      if (idx > cursor) { this.render(L, R, cursor, idx); cursor = idx; }
      this.queue.shift();
      this.apply(ev);
    }
    if (cursor < n) this.render(L, R, cursor, n);
    return true;
  }
}

registerProcessor('fermatta-piano', PianoSampler);
