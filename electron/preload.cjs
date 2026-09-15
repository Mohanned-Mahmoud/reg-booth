const { contextBridge, ipcRenderer, webFrame } = require('electron');

function sendSilentPrint(config) {
  console.log('[ARTECH Electron Preload] Sending silent-print IPC to main process');
  ipcRenderer.send('silent-print', config);
}

// 1. Expose secure printer and station config APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  silentPrint: sendSilentPrint,
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getStationConfig: () => ipcRenderer.invoke('get-station-config'),
  saveStationConfig: (config) => ipcRenderer.invoke('save-station-config', config),
  testPrint: (config) => ipcRenderer.invoke('test-print', config),
  isElectron: true,
  platform: process.platform,
});

// 2. Override window.print in the webpage's main world context
webFrame.executeJavaScript(`
  (function() {
    window.print = function() {
      console.log('[ARTECH Electron] Intercepted window.print() -> Routing to silent background printer');
      if (window.electronAPI && typeof window.electronAPI.silentPrint === 'function') {
        window.electronAPI.silentPrint();
      } else {
        console.warn('[ARTECH Electron] electronAPI.silentPrint not available, fallback required');
      }
    };
    console.log('[ARTECH Electron] Silent print override active on window.print()');
  })();
`);
