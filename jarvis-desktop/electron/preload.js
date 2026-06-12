const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  send: (sessionId, message) => ipcRenderer.invoke('jarvis:send', { sessionId, message }),
  hasKey: () => ipcRenderer.invoke('jarvis:has-key'),
  hide: () => ipcRenderer.invoke('jarvis:hide'),
  reset: ({ sessionId }) => ipcRenderer.invoke('jarvis:reset', { sessionId }),
  phoneInfo: () => ipcRenderer.invoke('jarvis:phone-info'),
  listPorts: () => ipcRenderer.invoke('jarvis:list-ports'),
  onShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('jarvis:shown', listener);
    return () => ipcRenderer.removeListener('jarvis:shown', listener);
  },
  onDevice: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on('jarvis:device', listener);
    return () => ipcRenderer.removeListener('jarvis:device', listener);
  },
  onSerialData: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on('jarvis:serial-data', listener);
    return () => ipcRenderer.removeListener('jarvis:serial-data', listener);
  },
  onEvent: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on('jarvis:event', listener);
    return () => ipcRenderer.removeListener('jarvis:event', listener);
  },
});
