// App state with change notifications.
export const store = {
  state: {
    tab: 'takes',
    settings: null,
    takes: [],
    trash: [],
    showTrash: false,
    take: null,          // the opened take (full data)
    mode: 'idle',        // idle | recording | paused | playing
    pianos: [],
    pianoLoading: null,  // 0..1 while a piano loads into memory
    progress: {},        // install progress per piano id
    midi: { ok: false, name: '' },
    pedal: 0,
  },
  listeners: new Set(),
  set(patch) {
    Object.assign(this.state, patch);
    for (const cb of this.listeners) cb(this.state, patch);
  },
  on(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  },
};
