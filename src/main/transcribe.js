// Audio → notes with the ByteDance "high-resolution piano transcription" model
// (Kong et al., 2020; ONNX conversion, CC BY 4.0). Post-processing follows the
// authors' RegressionPostProcessor: onsets/offsets come from regression peaks
// with sub-frame precision, so timings are accurate to a few milliseconds.
const fs = require('fs');
const path = require('path');
const ffmpeg = require('./ffmpeg');

const SR = 16000;
const SEG = 160000;          // 10 s
const FPS = 100;
const FRAMES = 1001;         // model frames per segment
const MODEL_URL = 'https://github.com/Vedat-Ozkan/sheet-music-analysis/releases/download/audio-models-1/kong_note_pedal.onnx';
const MODEL_SIZE = 154206824;

let session = null;
let sessionPath = '';

function modelPath(settings) {
  return path.join(path.dirname(settings.get().pianosDir), 'models', 'kong_note_pedal.onnx');
}

function modelReady(settings) {
  const p = modelPath(settings);
  return fs.existsSync(p) && fs.statSync(p).size === MODEL_SIZE;
}

async function downloadModel(settings, progress) {
  const out = modelPath(settings);
  const tmp = out + '.download';
  await require('./pianos').download({ type: 'url', url: MODEL_URL }, tmp, { cancelled: false },
    (p) => progress({ stage: 'model', ratio: p.total ? p.bytes / p.total : 0 }));
  if (fs.statSync(tmp).size !== MODEL_SIZE) throw new Error('model download incomplete');
  fs.renameSync(tmp, out);
}

async function getSession(settings) {
  const ort = require('onnxruntime-node');
  const p = modelPath(settings);
  if (session && sessionPath === p) return { ort, session };
  const opts = { graphOptimizationLevel: 'all' };
  try {
    session = await ort.InferenceSession.create(p, { ...opts, executionProviders: ['dml', 'cpu'] });
  } catch {
    session = await ort.InferenceSession.create(p, { ...opts, executionProviders: ['cpu'] });
  }
  sessionPath = p;
  return { ort, session };
}

async function decode(file) {
  const raw = await ffmpeg.run(['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

// Finds a model output by any of its usual names.
function pick(outputs, names) {
  for (const n of names) if (outputs[n]) return outputs[n];
  const key = Object.keys(outputs).find((k) => names.some((n) => k.includes(n.replace('_output', ''))));
  return key ? outputs[key] : null;
}

async function transcribe(file, settings, progress = () => {}) {
  if (!modelReady(settings)) await downloadModel(settings, progress);
  progress({ stage: 'decode', ratio: 0 });
  const audio = await decode(file);
  const { ort, session: s } = await getSession(settings);
  // pad to whole segments, hop by half a segment
  const padded = new Float32Array(Math.ceil(Math.max(audio.length, 1) / SEG) * SEG);
  padded.set(audio);
  const hop = SEG / 2;
  const nSeg = (padded.length - SEG) / hop + 1;
  const keys = { onset: [], offset: [], frame: [], velocity: [], pOnset: [], pOffset: [], pFrame: [] };
  const inputName = s.inputNames[0];
  for (let i = 0; i < nSeg; i++) {
    const seg = padded.slice(i * hop, i * hop + SEG);
    const out = await s.run({ [inputName]: new ort.Tensor('float32', seg, [1, SEG]) });
    keys.onset.push(pick(out, ['reg_onset_output']).data);
    keys.offset.push(pick(out, ['reg_offset_output']).data);
    keys.frame.push(pick(out, ['frame_output']).data);
    keys.velocity.push(pick(out, ['velocity_output']).data);
    keys.pOffset.push(pick(out, ['reg_pedal_offset_output'])?.data || null);
    keys.pFrame.push(pick(out, ['pedal_frame_output'])?.data || null);
    progress({ stage: 'listen', ratio: (i + 1) / nSeg });
  }
  const total = Math.ceil(audio.length / SR * FPS) + 1;
  const deframe = (list, width) => {
    // keep the middle half of each overlapping segment (first/last keep their edge)
    const out = new Float32Array(total * width);
    let pos = 0;
    list.forEach((data, i) => {
      if (!data) return;
      const usable = FRAMES - 1;
      const a = i === 0 ? 0 : usable / 4;
      const b = i === list.length - 1 ? usable : (usable * 3) / 4;
      for (let f = a; f < b && pos < total; f++, pos++) {
        out.set(data.subarray(f * width, f * width + width), pos * width);
      }
    });
    return out;
  };
  const onset = deframe(keys.onset, 88);
  const offset = deframe(keys.offset, 88);
  const frame = deframe(keys.frame, 88);
  const velocity = deframe(keys.velocity, 88);
  const pOffset = keys.pOffset[0] ? deframe(keys.pOffset, 1) : null;
  const pFrame = keys.pFrame[0] ? deframe(keys.pFrame, 1) : null;
  progress({ stage: 'notes', ratio: 1 });
  return {
    notes: notesFrom(onset, offset, frame, velocity, total),
    pedal: pFrame ? pedalFrom(pFrame, pOffset, total) : [],
    duration: audio.length / SR,
  };
}

// --- RegressionPostProcessor (onset 0.3, offset 0.3, frame 0.1, pedal offset 0.2) ---
function binarize(reg, n, width, k, threshold, neighbour = 2) {
  const bin = new Uint8Array(n);
  const shift = new Float32Array(n);
  const at = (i) => reg[i * width + k];
  for (let i = neighbour; i < n - neighbour; i++) {
    const x = at(i);
    if (x <= threshold) continue;
    let mono = true;
    for (let j = 1; j <= neighbour; j++) if (!(at(i - j) < at(i - j + 1) && at(i + j) < at(i + j - 1))) { mono = false; break; }
    if (!mono) continue;
    bin[i] = 1;
    const a = at(i - 1), c = at(i + 1);
    shift[i] = a > c ? (c - a) / (x - c) / 2 : (c - a) / (x - a) / 2;
  }
  return { bin, shift };
}

function notesFrom(onsetReg, offsetReg, frame, velocity, n) {
  const notes = [];
  for (let k = 0; k < 88; k++) {
    const on = binarize(onsetReg, n, 88, k, 0.3);
    const off = binarize(offsetReg, n, 88, k, 0.3);
    const fr = (i) => frame[i * 88 + k];
    let bgn = null, frameGone = null, offsetAt = null;
    const emit = (fin) => {
      const t = (bgn + on.shift[bgn]) / FPS;
      const e = (fin + off.shift[fin]) / FPS;
      const v = Math.max(1, Math.min(127, Math.round(velocity[bgn * 88 + k] * 128)));
      if (e > t) notes.push({ k: k + 21, v, t: Math.max(0, t), d: Math.max(0.02, e - t), h: 1 });
    };
    for (let i = 0; i < n; i++) {
      if (on.bin[i]) {
        if (bgn !== null) { emit(Math.max(i - 1, 0)); frameGone = offsetAt = null; }
        bgn = i;
      }
      if (bgn !== null && i > bgn) {
        if (fr(i) <= 0.1 && frameGone === null) frameGone = i;
        if (off.bin[i] && offsetAt === null) offsetAt = i;
        if (frameGone !== null) {
          emit(offsetAt !== null && offsetAt - bgn > frameGone - offsetAt ? offsetAt : frameGone);
          bgn = frameGone = offsetAt = null;
        }
        if (bgn !== null && (i - bgn >= 600 || i === n - 1)) { emit(i); bgn = frameGone = offsetAt = null; }
      }
    }
  }
  return notes.sort((a, b) => a.t - b.t || a.k - b.k);
}

function pedalFrom(frame, offsetReg, n) {
  const off = offsetReg ? binarize(offsetReg, n, 1, 0, 0.2) : { bin: new Uint8Array(n), shift: new Float32Array(n) };
  const out = [];
  let bgn = null, gone = null, offAt = null;
  for (let i = 1; i < n; i++) {
    if (frame[i] >= 0.5 && frame[i] > frame[i - 1] && bgn === null) bgn = i;
    if (bgn !== null && i > bgn) {
      if (frame[i] <= 0.5 && gone === null) gone = i;
      if (off.bin[i] && offAt === null) offAt = i;
      let fin = null;
      if (offAt !== null) fin = offAt;
      else if (gone !== null && i - gone >= 10) fin = gone;
      if (fin !== null) {
        out.push({ t: bgn / FPS, v: 127 }, { t: (fin + off.shift[fin]) / FPS, v: 0 });
        bgn = gone = offAt = null;
      }
    }
  }
  if (bgn !== null) out.push({ t: bgn / FPS, v: 127 }, { t: n / FPS, v: 0 });
  return out;
}

module.exports = { transcribe, modelReady };
