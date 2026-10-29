// Keyboard shortcuts. Every action can be rebound in Settings.
export const DEFAULT_HOTKEYS = {
  record: 'Space',
  recordAlt: 'KeyR',
  pause: 'KeyP',
  play: 'Enter',
  stop: 'Escape',
  prev: 'ArrowUp',
  next: 'ArrowDown',
  back: 'ArrowLeft',
  fwd: 'ArrowRight',
  delete: 'Delete',
  rename: 'F2',
  duplicate: 'Ctrl+KeyD',
  undo: 'Ctrl+KeyZ',
  redo: 'Ctrl+KeyY',
  export: 'Ctrl+KeyE',
  settings: 'Ctrl+Comma',
};

export function comboOf(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) parts.push(e.code);
  return parts.join('+');
}

const PRETTY = { Space: 'Пробел', Enter: 'Enter', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Delete: 'Delete', Comma: ',', Period: '.', Backspace: 'Backspace' };

export function prettyCombo(c, lang = 'ru') {
  if (!c) return '—';
  return c.split('+').map((p) => {
    if (p === 'Space' && lang === 'en') return 'Space';
    if (PRETTY[p]) return PRETTY[p];
    if (p.startsWith('Key')) return p.slice(3);
    if (p.startsWith('Digit')) return p.slice(5);
    return p;
  }).join(' + ');
}

export class Hotkeys {
  constructor(map, handler) {
    this.map = { ...DEFAULT_HOTKEYS, ...map };
    this.handler = handler;
    this.suspended = false;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  set(map) { this.map = { ...DEFAULT_HOTKEYS, ...map }; }

  onKey(e) {
    if (this.suspended || e.repeat) return;
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type) || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const combo = comboOf(e);
    if (typing && combo !== 'Escape') return;
    // Buttons react to Space/Enter themselves; don't double-fire on them.
    if ((combo === 'Space' || combo === 'Enter') && el && el.tagName === 'BUTTON' && el.closest('.modal')) return;
    for (const [action, c] of Object.entries(this.map)) {
      if (c === combo) {
        const handled = this.handler(action, e);
        if (handled !== false) { e.preventDefault(); if (el && el.tagName === 'BUTTON') el.blur(); }
        return;
      }
    }
  }
}
