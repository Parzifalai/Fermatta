// "Pick the sound": looks at how a take is played (pace, loudness, pedal,
// register, legato) and suggests hall, length and tone that suit it.
import { t } from '../i18n.js';

export function analyze(take) {
  const notes = take.notes.filter((n) => !n.muted);
  if (notes.length < 4) return null;
  const dur = Math.max(1, take.duration);
  // onsets closer than 50 ms count as one chord
  const onsets = [];
  for (const n of [...notes].sort((a, b) => a.t - b.t)) if (!onsets.length || n.t - onsets[onsets.length - 1] > 0.05) onsets.push(n.t);
  const density = onsets.length / dur;
  const vels = notes.map((n) => n.v);
  const meanVel = vels.reduce((a, b) => a + b, 0) / vels.length;
  const velStd = Math.sqrt(vels.reduce((a, v) => a + (v - meanVel) ** 2, 0) / vels.length);
  const meanPitch = notes.reduce((a, n) => a + n.k, 0) / notes.length;
  let pedalTime = 0, down = null;
  for (const p of take.pedal || []) {
    if (p.v >= 64 && down === null) down = p.t;
    else if (p.v < 64 && down !== null) { pedalTime += p.t - down; down = null; }
  }
  if (down !== null) pedalTime += dur - down;
  const ioi = onsets.length > 1 ? (onsets[onsets.length - 1] - onsets[0]) / (onsets.length - 1) : 1;
  const meanDur = notes.reduce((a, n) => a + n.d, 0) / notes.length;
  return { density, meanVel, velStd, meanPitch, pedal: pedalTime / dur, legato: meanDur / Math.max(0.05, ioi) };
}

export function suggestSound(take) {
  const f = analyze(take);
  if (!f) return null;
  const calm = (f.density < 3.5 && f.meanVel < 78) || (f.meanVel < 62 && f.density < 5.5);
  const energetic = f.density > 7 || f.meanVel > 92;
  const mood = calm ? 'calm' : energetic ? 'energetic' : 'moderate';
  const s = {};
  const why = [];

  if (calm) {
    s.hall = f.density < 1.8 && f.pedal > 0.5 ? 'cathedral' : 'concert';
    s.hallMix = 0.36; s.reverbSize = 1.2; s.width = 1.25;
  } else if (energetic) {
    s.hall = 'studio'; s.hallMix = 0.18; s.reverbSize = 0.9; s.width = 1.05;
  } else {
    s.hall = 'hall'; s.hallMix = 0.27; s.reverbSize = 1; s.width = 1.15;
  }
  why.push(t('auto.hall.' + mood, { hall: t('hall.' + s.hall).toLowerCase() }));

  // sustain: calm music without much pedal gets longer notes; busy music shorter
  s.length = calm ? (f.pedal < 0.3 ? 0.3 : 0.15) : energetic ? -0.15 : 0;
  if (s.length > 0) why.push(t('auto.longer'));
  else if (s.length < 0) why.push(t('auto.shorter'));
  s.release = f.legato > 0.9 ? 1.2 : f.legato < 0.5 ? 0.8 : 1;

  // tone: soft playing and high melodies get warmer, loud or low playing brighter
  let br = 0;
  if (f.meanVel < 60) br -= 0.15;
  if (energetic) br += 0.15;
  if (f.meanPitch > 72) br -= 0.1;
  if (f.meanPitch < 52) br += 0.1;
  s.brightness = Math.round(br * 100) / 100;
  if (br < 0) why.push(t('auto.warmer'));
  else if (br > 0) why.push(t('auto.brighter'));

  // dynamics: flat playing gets more expression, very uneven playing is evened out
  s.sensitivity = f.velStd < 10 ? 0.35 : f.velStd > 22 ? -0.2 : 0;
  s.comp = f.velStd > 22 ? 0.3 : energetic ? 0.12 : 0;
  if (s.sensitivity > 0) why.push(t('auto.expressive'));
  if (s.comp > 0.2) why.push(t('auto.even'));
  s.echoMix = 0;
  return { sound: s, mood, features: f, text: `${t('auto.mood.' + mood)}: ${why.join(', ')}` };
}
