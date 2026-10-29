// Audio/video finishing with ffmpeg: MP3, muxing rendered video with sound, probing.
const fsp = require('fs').promises;
const path = require('path');
const ffmpeg = require('./ffmpeg');

async function toMp3(wav, out, meta = {}) {
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const tags = [];
  if (meta.title) tags.push('-metadata', `title=${meta.title}`);
  tags.push('-metadata', 'comment=Fermatta');
  if (out.toLowerCase().endsWith('.wav')) await fsp.copyFile(wav, out);
  else if (out.toLowerCase().endsWith('.flac')) await ffmpeg.run(['-y', '-v', 'error', '-i', wav, ...tags, out]);
  else await ffmpeg.run(['-y', '-v', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '320k', ...tags, out]);
  return out;
}

const timeOf = (s) => {
  const m = /time=(\d+):(\d+):([\d.]+)/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};

// video: H.264 mp4 rendered by the app; audio: wav. Optional background video
// composited under the notes using a rendered matte (white = notes/keyboard).
async function mux({ video, audio, out, matte, background, duration, width, height }, progress) {
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const onStderr = (s) => {
    const t = timeOf(s);
    if (t !== null && duration) progress({ stage: 'mux', ratio: Math.min(1, t / duration) });
  };
  let args;
  if (background && matte) {
    args = ['-y', '-v', 'error', '-stats',
      '-stream_loop', '-1', '-i', background, '-i', video, '-i', matte, '-i', audio,
      '-filter_complex',
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=60[bg];` +
      `[2:v]format=gray,scale=${width}:${height}[m];[1:v][m]alphamerge[fg];[bg][fg]overlay=shortest=1:format=auto[v]`,
      '-map', '[v]', '-map', '3:a', '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', out];
  } else {
    args = ['-y', '-v', 'error', '-stats', '-i', video, '-i', audio,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out];
  }
  await ffmpeg.run(args, { onStderr });
  return out;
}

async function probe(file) {
  // ffmpeg -i without an output exits with an error but prints the stream info.
  const info = await new Promise((resolve) => {
    const { spawn } = require('child_process');
    const p = spawn(ffmpeg.bin, ['-hide_banner', '-i', file], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', () => resolve(err));
  });
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const v = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(info);
  const fps = /([\d.]+) fps/.exec(info);
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0,
    width: v ? +v[1] : 0, height: v ? +v[2] : 0,
    fps: fps ? +fps[1] : 0,
    hasAudio: /Audio:/.test(info),
  };
}

async function extractAudio(file, out) {
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await ffmpeg.run(['-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', out]);
  return out;
}

module.exports = { toMp3, mux, probe, extractAudio };
