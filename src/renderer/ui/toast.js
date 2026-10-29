import { h } from './dom.js';

// Short message at the bottom; optional action button (e.g. "Undo").
export function toast(text, { action, onAction, error = false, ms = 4200 } = {}) {
  const stack = document.getElementById('toasts');
  const el = h('div', { class: 'toast' + (error ? ' error' : ''), role: error ? 'alert' : 'status' }, text);
  if (action) {
    el.append(h('button', { onclick: () => { onAction?.(); el.remove(); } }, action));
  }
  stack.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
