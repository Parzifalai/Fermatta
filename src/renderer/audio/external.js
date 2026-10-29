// Renders takes through a VST3 instrument (Kontakt with Noire…) in Fermatta's plugin host.
export function vstSource() {
  return {
    name: 'vst',
    async render(events, seconds, ctx) {
      const r = await window.fm.vst.render(events, seconds);
      const u8 = new Uint8Array(r.data);
      return ctx.decodeAudioData(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    },
  };
}
