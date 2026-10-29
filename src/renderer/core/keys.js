// Piano keyboard geometry shared by the keyboard strip, the roll and the tiles.
export const LOW = 21;   // A0
export const HIGH = 108; // C8

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (k) => BLACK.has(((k % 12) + 12) % 12);

// Black keys sit on the boundary between two white keys, nudged sideways
// (fraction of a white key) the way real keyboards stagger them.
const BLACK_SHIFT = { 1: -0.1, 3: 0.1, 6: -0.13, 8: 0, 10: 0.13 };

export function layout(width, lo = LOW, hi = HIGH) {
  let whites = 0;
  for (let k = lo; k <= hi; k++) if (!isBlack(k)) whites++;
  const ww = width / whites;
  const bw = ww * 0.6;
  const keys = new Array(128);
  let x = 0;
  for (let k = lo; k <= hi; k++) {
    if (isBlack(k)) {
      keys[k] = { k, black: true, x: x + ww * BLACK_SHIFT[k % 12] - bw / 2, w: bw };
    } else {
      keys[k] = { k, black: false, x, w: ww };
      x += ww;
    }
  }
  return { keys, ww, bw, lo, hi };
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const keyName = (k) => NAMES[k % 12] + (Math.floor(k / 12) - 1);

export function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex) || [0, 'ff', 'ff', 'ff'];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
