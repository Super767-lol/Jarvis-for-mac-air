import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Browser/dev preview mock — the real bridge is injected by Electron's preload.js
if (!window.jarvis) {
  window.jarvis = {
    send: async () => {},
    hasKey: async () => true,
    hide: async () => {},
    reset: async () => ({ ok: true }),
    phoneInfo: async () => null,
    listPorts: async () => [],
    onEvent: () => () => {},
    onShown: (cb) => { const t = setTimeout(cb, 400); return () => clearTimeout(t); },
    onDevice: () => () => {},
    onSerialData: () => () => {},
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
