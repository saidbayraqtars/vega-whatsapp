// Yüzen "Bakiyeyi Gönder" penceresi için köprü. Yalnız pencere boyutunu
// ayarlamak ve kapatmak (gizlemek) için minimal IPC açar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatApi', {
    setSize: (w, h) => ipcRenderer.send('float:size', { w, h }),
    hide: () => ipcRenderer.send('float:hide'),
});
