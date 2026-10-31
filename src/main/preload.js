// Bridge between the UI and the main process. Only these calls are exposed.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => {
  const h = (_e, p) => cb(p);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('fm', {
  settings: { get: call('settings:get'), set: call('settings:set') },
  library: {
    list: call('library:list'), save: call('library:save'), load: call('library:load'),
    trash: call('library:trash'), restore: call('library:restore'), trashList: call('library:trashList'), purge: call('library:purge'),
  },
  pianos: {
    catalog: call('pianos:catalog'), install: call('pianos:install'), cancel: call('pianos:cancel'),
    remove: call('pianos:remove'), addCustom: call('pianos:addCustom'), onProgress: on('pianos:progress'),
  },
  dialog: { open: call('dialog:open'), save: call('dialog:save'), folder: call('dialog:folder') },
  fs: { readFile: call('fs:readFile'), writeFile: call('fs:writeFile'), tempFile: call('fs:tempFile') },
  stream: { open: call('stream:open'), write: call('stream:write'), close: call('stream:close') },
  shell: { reveal: call('shell:reveal'), open: call('shell:open') },
  media: {
    mp3: call('media:mp3'), mux: call('media:mux'), probe: call('media:probe'),
    extractAudio: call('media:extractAudio'), onProgress: on('media:progress'),
  },
  sheet: { pdf: call('sheet:pdf') },
  omr: { recognize: call('omr:recognize'), onProgress: on('omr:progress') },
  notation: { status: call('notation:status'), analyze: call('notation:analyze'), engrave: call('notation:engrave'), onProgress: on('notation:progress') },
  vst: { status: call('vst:status'), setup: call('vst:setup'), load: call('vst:load'), editor: call('vst:editor'), render: call('vst:render'), pick: call('vst:pick'), onProgress: on('vst:progress') },
  transcribe: { file: call('transcribe:file'), ready: call('transcribe:ready'), onProgress: on('transcribe:progress') },
  pathOf: (file) => webUtils.getPathForFile(file),
});
