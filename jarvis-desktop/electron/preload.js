const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  send: (sessionId, message) => ipcRenderer.invoke('jarvis:send', { sessionId, message }),
  hasKey: () => ipcRenderer.invoke('jarvis:has-key'),
  hide: () => ipcRenderer.invoke('jarvis:hide'),
  reset: ({ sessionId }) => ipcRenderer.invoke('jarvis:reset', { sessionId }),
  phoneInfo: () => ipcRenderer.invoke('jarvis:phone-info'),
  onEvent: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on('jarvis:event', listener);
    return () => ipcRenderer.removeListener('jarvis:event', listener);
  },
});
