/**
 * Jarvis Electron main process — v2 (YOLO + full control + reliability).
 */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const { SerialPort } = require('serialport');

const execAsync = promisify(exec);
const isDev = !app.isPackaged;
const RENDERER_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

// YOLO_MODE = true → no confirmation prompts, Jarvis just does it.
// Set YOLO=false in .env to re-enable safety prompts for destructive ops.
const YOLO_MODE = process.env.YOLO !== 'false';

let tray = null;
let win = null;
let anthropic = null;

// ============ TOOLS ============
const tools = [
  {
    name: 'run_shell',
    description: 'Execute any shell/zsh command on macOS. Use for file ops, system info, network, brew, git, anything. Output truncated to 16KB.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read contents of any file. Use ~ for home dir.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Write/overwrite a file. Creates parent dirs if needed.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'open_app',
    description: 'Open a macOS application by name (e.g. Safari, VSCode, Spotify, Slack).',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'applescript',
    description: 'Run AppleScript for advanced macOS automation: control any app, system events, notifications, dialogs, keystroke simulation, etc.',
    input_schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
  },
  {
    name: 'list_dir',
    description: 'List files in a directory.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the screen. Returns the path to a saved PNG file in /tmp.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_clipboard',
    description: 'Read current clipboard contents (text).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_clipboard',
    description: 'Put text into the system clipboard.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused app (simulates keyboard). Use for filling out forms, writing in any app, etc.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'key_press',
    description: 'Send a key combination to the active app. Examples: "cmd+s", "cmd+tab", "return", "escape", "cmd+space".',
    input_schema: { type: 'object', properties: { keys: { type: 'string' } }, required: ['keys'] },
  },
  {
    name: 'web_fetch',
    description: 'Fetch the contents of a URL (HTTP GET). Returns first 16KB of response text.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'notify',
    description: 'Show a macOS notification with title and message.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string' }, message: { type: 'string' } },
      required: ['title', 'message'],
    },
  },
  {
    name: 'list_serial_ports',
    description: 'List all USB/serial devices connected to the Mac (Arduino, ESP32, robots, 3D printers, microcontrollers, etc). Returns port path, vendor, product info.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'serial_command',
    description: 'Send a one-shot command to a serial device and read the response. Opens the port, writes the command, waits for response, then closes. Use for quick interactions with Arduino/robots.',
    input_schema: {
      type: 'object',
      properties: {
        port: { type: 'string', description: 'Port path like /dev/cu.usbmodem1101' },
        command: { type: 'string', description: 'Data to send (newline auto-appended)' },
        baudRate: { type: 'number', description: 'Baud rate (default 9600)' },
        readTimeoutMs: { type: 'number', description: 'How long to wait for response (default 1500)' },
      },
      required: ['port', 'command'],
    },
  },
  {
    name: 'serial_open',
    description: 'Open a persistent serial connection to a device. Use this when you need an ongoing session (streaming sensor data, multi-step robot control). Returns a session id.',
    input_schema: {
      type: 'object',
      properties: {
        port: { type: 'string' },
        baudRate: { type: 'number' },
      },
      required: ['port'],
    },
  },
  {
    name: 'serial_write',
    description: 'Write data to an already-open serial session.',
    input_schema: {
      type: 'object',
      properties: { port: { type: 'string' }, data: { type: 'string' } },
      required: ['port', 'data'],
    },
  },
  {
    name: 'serial_read',
    description: 'Read all buffered data from an open serial session (since last read or open).',
    input_schema: {
      type: 'object',
      properties: { port: { type: 'string' } },
      required: ['port'],
    },
  },
  {
    name: 'serial_close',
    description: 'Close a persistent serial session.',
    input_schema: {
      type: 'object',
      properties: { port: { type: 'string' } },
      required: ['port'],
    },
  },
  {
    name: 'list_usb_devices',
    description: 'List all USB devices connected to the Mac with full details (vendor, product, serial, current draw).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_bluetooth_devices',
    description: 'List Bluetooth devices (paired + connected).',
    input_schema: { type: 'object', properties: {} },
  },
];

const DESTRUCTIVE_PATTERNS = /\b(rm\s+-rf?\s+\/|sudo\s+rm|dd\s+if=|mkfs|shutdown|reboot|>\s*\/dev\/sd|chmod\s+777\s+\/)\b/i;

// Persistent serial sessions
const serialSessions = new Map(); // port -> { sp, buffer: string }

function ensureSerialBuffer(port, sp) {
  const session = { sp, buffer: '' };
  sp.on('data', (chunk) => { session.buffer += chunk.toString('utf8'); });
  sp.on('error', () => {});
  serialSessions.set(port, session);
  return session;
}

async function confirmAction(summary) {
  if (YOLO_MODE) return true; // no friction
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Allow', 'Deny'],
    defaultId: 0,
    cancelId: 1,
    title: 'Jarvis is about to do this',
    message: 'Confirm action',
    detail: summary,
  });
  return result.response === 0;
}

// Translate "cmd+s" style to AppleScript keystroke
function keysToAppleScript(combo) {
  const parts = combo.toLowerCase().split('+').map(s => s.trim());
  const mods = [];
  let key = null;
  for (const p of parts) {
    if (p === 'cmd' || p === 'command') mods.push('command down');
    else if (p === 'shift') mods.push('shift down');
    else if (p === 'opt' || p === 'option' || p === 'alt') mods.push('option down');
    else if (p === 'ctrl' || p === 'control') mods.push('control down');
    else key = p;
  }
  const specials = { return: 36, enter: 36, tab: 48, space: 49, escape: 53, delete: 51, up: 126, down: 125, left: 123, right: 124 };
  const using = mods.length ? ` using {${mods.join(', ')}}` : '';
  if (specials[key] !== undefined) {
    return `tell application "System Events" to key code ${specials[key]}${using}`;
  }
  return `tell application "System Events" to keystroke "${key}"${using}`;
}

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'run_shell': {
        const cmd = input.command;
        if (DESTRUCTIVE_PATTERNS.test(cmd)) {
          const ok = await confirmAction(`⚠️ Dangerous command:\n\n${cmd}\n\nReally run?`);
          if (!ok) return { error: 'User denied execution' };
        }
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024,
          shell: '/bin/zsh',
          env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin` },
        });
        return { stdout: (stdout || '').slice(0, 16000), stderr: (stderr || '').slice(0, 4000) };
      }
      case 'read_file': {
        const p = input.path.replace(/^~/, process.env.HOME);
        const content = fs.readFileSync(p, 'utf-8');
        return { content: content.slice(0, 32000), truncated: content.length > 32000 };
      }
      case 'write_file': {
        const p = input.path.replace(/^~/, process.env.HOME);
        const ok = await confirmAction(`Write to ${p}\n(${input.content.length} chars)`);
        if (!ok) return { error: 'User denied write' };
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, input.content, 'utf-8');
        return { ok: true, bytes: input.content.length, path: p };
      }
      case 'open_app': {
        await execAsync(`open -a ${JSON.stringify(input.name)}`);
        return { ok: true };
      }
      case 'applescript': {
        const { stdout } = await execAsync(`osascript -e ${JSON.stringify(input.script)}`, { timeout: 30000 });
        return { stdout: stdout.trim().slice(0, 8000) };
      }
      case 'list_dir': {
        const p = input.path.replace(/^~/, process.env.HOME);
        const items = fs.readdirSync(p, { withFileTypes: true })
          .slice(0, 300)
          .map(d => `${d.isDirectory() ? '[DIR] ' : '      '}${d.name}`);
        return { items };
      }
      case 'take_screenshot': {
        const out = `/tmp/jarvis-screenshot-${Date.now()}.png`;
        await execAsync(`screencapture -x ${out}`);
        return { path: out };
      }
      case 'get_clipboard': {
        const { stdout } = await execAsync('pbpaste');
        return { text: stdout.slice(0, 16000) };
      }
      case 'set_clipboard': {
        await execAsync(`echo ${JSON.stringify(input.text)} | pbcopy`);
        return { ok: true };
      }
      case 'type_text': {
        const safe = input.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "${safe}"'`);
        return { ok: true };
      }
      case 'key_press': {
        const script = keysToAppleScript(input.keys);
        await execAsync(`osascript -e ${JSON.stringify(script)}`);
        return { ok: true };
      }
      case 'web_fetch': {
        const { stdout } = await execAsync(`curl -sL --max-time 20 ${JSON.stringify(input.url)}`, {
          maxBuffer: 4 * 1024 * 1024,
        });
        return { content: stdout.slice(0, 16000) };
      }
      case 'notify': {
        const t = input.title.replace(/"/g, '\\"');
        const m = input.message.replace(/"/g, '\\"');
        await execAsync(`osascript -e 'display notification "${m}" with title "${t}"'`);
        return { ok: true };
      }
      case 'list_serial_ports': {
        const ports = await SerialPort.list();
        return {
          ports: ports.map(p => ({
            path: p.path,
            manufacturer: p.manufacturer,
            vendorId: p.vendorId,
            productId: p.productId,
            serialNumber: p.serialNumber,
          })),
        };
      }
      case 'serial_command': {
        const { port, command, baudRate = 9600, readTimeoutMs = 1500 } = input;
        return await new Promise((resolve) => {
          const sp = new SerialPort({ path: port, baudRate }, (err) => {
            if (err) { resolve({ error: err.message }); return; }
            let buf = '';
            sp.on('data', (c) => { buf += c.toString('utf8'); });
            sp.write(command.endsWith('\n') ? command : command + '\n', (werr) => {
              if (werr) { sp.close(() => {}); resolve({ error: werr.message }); return; }
              setTimeout(() => {
                sp.close(() => {});
                resolve({ response: buf.slice(0, 16000) });
              }, readTimeoutMs);
            });
          });
        });
      }
      case 'serial_open': {
        const { port, baudRate = 9600 } = input;
        if (serialSessions.has(port)) return { ok: true, note: 'already open' };
        return await new Promise((resolve) => {
          const sp = new SerialPort({ path: port, baudRate }, (err) => {
            if (err) { resolve({ error: err.message }); return; }
            ensureSerialBuffer(port, sp);
            resolve({ ok: true, port, baudRate });
          });
        });
      }
      case 'serial_write': {
        const session = serialSessions.get(input.port);
        if (!session) return { error: 'Port not open. Call serial_open first.' };
        return await new Promise((resolve) => {
          session.sp.write(input.data, (err) => {
            if (err) resolve({ error: err.message });
            else resolve({ ok: true, bytes: input.data.length });
          });
        });
      }
      case 'serial_read': {
        const session = serialSessions.get(input.port);
        if (!session) return { error: 'Port not open. Call serial_open first.' };
        const data = session.buffer;
        session.buffer = '';
        return { data: data.slice(0, 16000) };
      }
      case 'serial_close': {
        const session = serialSessions.get(input.port);
        if (!session) return { error: 'Port not open' };
        return await new Promise((resolve) => {
          session.sp.close(() => {
            serialSessions.delete(input.port);
            resolve({ ok: true });
          });
        });
      }
      case 'list_usb_devices': {
        const { stdout } = await execAsync('system_profiler SPUSBDataType -json', { maxBuffer: 4 * 1024 * 1024 });
        try {
          const data = JSON.parse(stdout);
          const flat = [];
          const walk = (items, depth = 0) => {
            for (const item of items || []) {
              flat.push({
                name: item._name,
                manufacturer: item.manufacturer,
                vendor_id: item.vendor_id,
                product_id: item.product_id,
                serial_num: item.serial_num,
                speed: item.device_speed || item.host_controller,
              });
              if (item._items) walk(item._items, depth + 1);
            }
          };
          walk(data.SPUSBDataType);
          return { devices: flat.slice(0, 50) };
        } catch {
          return { raw: stdout.slice(0, 12000) };
        }
      }
      case 'list_bluetooth_devices': {
        const { stdout } = await execAsync('system_profiler SPBluetoothDataType -json', { maxBuffer: 4 * 1024 * 1024 });
        return { raw: stdout.slice(0, 12000) };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: (e.message || String(e)).slice(0, 2000) };
  }
}

// ============ AGENT LOOP ============
const SYSTEM = `You are JARVIS — a witty, sharp AI assistant running on the user's MacBook in a menu bar app.

Personality: confident, concise (2-3 sentences), playful, never sycophantic. Reply naturally — no "I'd be happy to" filler.

You have FULL control of this Mac via tools: run_shell, read_file, write_file, open_app, applescript, list_dir, take_screenshot, get_clipboard, set_clipboard, type_text, key_press, web_fetch, notify, list_serial_ports, serial_command, serial_open, serial_write, serial_read, serial_close, list_usb_devices, list_bluetooth_devices.

You can also control HARDWARE connected via USB/serial — Arduinos, robots, ESP32s, 3D printers, microcontrollers. Use list_serial_ports first to find devices, then serial_command for quick one-shots or serial_open/write/read/close for ongoing sessions.

Style:
- Just DO things. Don't ask permission for normal stuff — the user wants speed.
- For multi-step tasks, chain tools yourself without checking in.
- After tools complete, give the user a one-line summary of what happened.
- If something fails, briefly say why and try a different approach.
- For coding: be senior-engineer direct with working examples.
- When user asks you to "remember" something, write it to ~/.jarvis/memory.md (append, with timestamp).`;

const conversations = new Map(); // sessionId -> messages[]

function trimHistory(history) {
  // Keep last 40 messages to avoid context bloat
  if (history.length > 40) return history.slice(-40);
  return history;
}

async function runAgent(sessionId, userText, onEvent) {
  if (!anthropic) {
    onEvent({ type: 'error', message: 'Missing ANTHROPIC_API_KEY in .env file. Add it and restart.' });
    onEvent({ type: 'done' });
    return;
  }

  let history = conversations.get(sessionId) || [];
  history.push({ role: 'user', content: userText });
  history = trimHistory(history);

  try {
    let iterations = 0;
    while (iterations++ < 25) {
      onEvent({ type: 'status', state: 'thinking' });

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM,
        tools,
        messages: history,
      });

      let currentToolUse = null;
      let currentText = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, input: '' };
            onEvent({ type: 'tool_start', name: currentToolUse.name });
          } else if (event.content_block.type === 'text') {
            currentText = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            currentText += event.delta.text;
            onEvent({ type: 'delta', content: event.delta.text });
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try { currentToolUse.input = JSON.parse(currentToolUse.input || '{}'); } catch { currentToolUse.input = {}; }
            currentToolUse = null;
          }
        }
      }

      const finalMsg = await stream.finalMessage();
      history.push({ role: 'assistant', content: finalMsg.content });

      if (finalMsg.stop_reason !== 'tool_use') {
        history = trimHistory(history);
        conversations.set(sessionId, history);
        onEvent({ type: 'done' });
        return;
      }

      // Execute tool calls
      const toolResults = [];
      for (const block of finalMsg.content) {
        if (block.type === 'tool_use') {
          onEvent({ type: 'tool_call', name: block.name, input: block.input });
          const result = await executeTool(block.name, block.input);
          onEvent({ type: 'tool_result', name: block.name, result });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result).slice(0, 12000),
            is_error: !!result.error,
          });
        }
      }
      history.push({ role: 'user', content: toolResults });
      history = trimHistory(history);
    }
    onEvent({ type: 'error', message: 'Hit 25-iteration cap — try a simpler request' });
  } catch (e) {
    console.error('runAgent error', e);
    onEvent({ type: 'error', message: (e.message || String(e)).slice(0, 500) });
  } finally {
    conversations.set(sessionId, trimHistory(history));
    onEvent({ type: 'done' });
  }
}

// ============ WINDOW & TRAY ============
function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 640,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(RENDERER_URL);
  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide();
  });
}

function positionWindow() {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  win.setPosition(
    Math.max(display.workArea.x + 4, Math.min(x, display.workArea.x + display.workArea.width - winBounds.width - 4)),
    y
  );
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else { positionWindow(); win.show(); win.focus(); }
}

function createTray() {
  const iconPath = path.join(__dirname, 'trayIconTemplate.png');
  let img;
  if (fs.existsSync(iconPath)) {
    img = nativeImage.createFromPath(iconPath);
  } else {
    img = nativeImage.createFromBuffer(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUklEQVR4nGNgGAWjYBSMglEwCkbBKBg6QJ' +
      'YR/v//YwxOgIyABYQowSiBEYwGI4ZsKsAFGEqWAsYwQbA6sGAYIxoBuMpgFEwCkbBKBgFowAA4GcGNCYK' +
      'AAAAAElFTkSuQmCC', 'base64'));
  }
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip(`Jarvis ${YOLO_MODE ? '(YOLO)' : ''}`);
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Toggle Jarvis', click: toggleWindow },
      { label: `YOLO Mode: ${YOLO_MODE ? 'ON' : 'OFF'}`, enabled: false },
      { label: 'Hotkey: ⌘⇧Space', enabled: false },
      { type: 'separator' },
      { label: 'Quit Jarvis', role: 'quit' },
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ============ IPC ============
ipcMain.handle('jarvis:send', async (event, { sessionId, message }) => {
  await runAgent(sessionId, message, (ev) => {
    event.sender.send('jarvis:event', ev);
  });
});

ipcMain.handle('jarvis:has-key', () => !!process.env.ANTHROPIC_API_KEY);
ipcMain.handle('jarvis:hide', () => win && win.hide());
ipcMain.handle('jarvis:reset', (event, { sessionId }) => {
  conversations.delete(sessionId);
  return { ok: true };
});

// ============ LIFECYCLE ============
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  createTray();
  createWindow();
  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
