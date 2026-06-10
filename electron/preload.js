// Web arayüzüne güvenli Electron köprüsü. window.vegaDesktop ile erişilir.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vegaDesktop', {
    isElectron: true,
    savePin: (pin) => ipcRenderer.invoke('pin:save', pin),
    hasPin: () => ipcRenderer.invoke('pin:has'),
    clearPin: () => ipcRenderer.invoke('pin:clear'),
    getAutoStart: () => ipcRenderer.invoke('autostart:get'),
    setAutoStart: (on) => ipcRenderer.invoke('autostart:set', on),
});
