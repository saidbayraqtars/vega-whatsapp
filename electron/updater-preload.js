// Güncelleme penceresi köprüsü — main.js ile küçük IPC.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vegaUpdater', {
    onState: (cb) => ipcRenderer.on('updater:state', (_e, state) => cb(state)),
    install: () => ipcRenderer.send('updater:install'),
    later: () => ipcRenderer.send('updater:later'),
});
