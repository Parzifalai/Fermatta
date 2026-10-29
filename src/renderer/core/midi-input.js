// MIDI keyboard input (Web MIDI). Emits note and pedal events with timestamps.

export class MidiInput {
  constructor() {
    this.access = null;
    this.input = null;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.wanted = '';
  }

  on(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  onStatus(cb) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); }

  async init(wanted = '') {
    this.wanted = wanted;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.status({ ok: false, error: e.message });
      return;
    }
    this.access.onstatechange = () => this.pick();
    this.pick();
  }

  inputs() {
    return this.access ? [...this.access.inputs.values()].map((i) => ({ id: i.id, name: i.name, state: i.state })) : [];
  }

  select(id) {
    this.wanted = id;
    this.pick();
  }

  // Prefers the chosen device, otherwise the first keyboard-looking input.
  pick() {
    const list = this.access ? [...this.access.inputs.values()].filter((i) => i.state === 'connected') : [];
    let next = list.find((i) => i.id === this.wanted)
      || list.find((i) => /piano|yamaha|digital|keyboard|clavinova|p-\d/i.test(i.name))
      || list[0] || null;
    if (next !== this.input) {
      if (this.input) this.input.onmidimessage = null;
      this.input = next;
      if (next) next.onmidimessage = (m) => this.handle(m);
    }
    this.status({ ok: !!next, name: next ? next.name : '', inputs: this.inputs() });
  }

  status(s) {
    this.lastStatus = s;
    for (const cb of this.statusListeners) cb(s);
  }

  handle(m) {
    const [st, a, b] = m.data;
    const type = st & 0xf0;
    const time = m.timeStamp; // performance.now() clock, ms
    let ev = null;
    if (type === 0x90 && b > 0) ev = { kind: 'on', key: a, vel: b };
    else if (type === 0x80 || (type === 0x90 && b === 0)) ev = { kind: 'off', key: a };
    else if (type === 0xb0) ev = { kind: 'cc', cc: a, value: b };
    if (!ev) return; // P-45 also sends active sensing (0xFE) — ignored
    ev.time = time;
    for (const cb of this.listeners) cb(ev);
  }
}
