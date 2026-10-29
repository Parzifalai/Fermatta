// Bundled ffmpeg binary (works both in development and inside the installed app).
const { spawn } = require('child_process');

const bin = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

// Runs ffmpeg and collects stdout as one Buffer. onStderr gets progress lines.
function run(args, { onStderr, input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => {
      const s = d.toString();
      err = (err + s).slice(-4000);
      if (onStderr) onStderr(s);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.trim().split('\n').pop()}`))));
    if (input) p.stdin.end(input);
  });
}

module.exports = { bin, run };
