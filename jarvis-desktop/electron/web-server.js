/**
 * Web server for phone access.
 * Exposes Jarvis chat over HTTP on local network (and optionally cloudflared tunnel for internet).
 */
const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');

const PORT = 47823;

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function startWebServer({ onMessage, getAuth }) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Static mobile UI
  app.get('/', (req, res) => {
    const auth = req.query.k;
    if (auth !== getAuth()) {
      res.status(401).send('Unauthorized. Open Jarvis on your Mac and use the QR code or full URL with token.');
      return;
    }
    res.sendFile(path.join(__dirname, 'phone-ui.html'));
  });

  // SSE chat endpoint
  app.post('/chat', async (req, res) => {
    if (req.query.k !== getAuth()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { session_id = 'phone', message } = req.body || {};
    if (!message) { res.status(400).json({ error: 'Missing message' }); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (ev) => {
      try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch (e) { /* client disconnected */ }
    };

    await onMessage(session_id, message, send);
    send({ type: 'closed' });
    res.end();
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[jarvis] phone server on http://${getLocalIp()}:${PORT}`);
  });

  return {
    server,
    getUrl: (token) => `http://${getLocalIp()}:${PORT}/?k=${token}`,
    getQrDataUrl: async (token) => {
      return await QRCode.toDataURL(`http://${getLocalIp()}:${PORT}/?k=${token}`);
    },
  };
}

module.exports = { startWebServer, getLocalIp, PORT };
