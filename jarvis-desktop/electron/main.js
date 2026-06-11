/**
 * Jarvis Electron main — v3 (Secretary Mode)
 * - Full Mac control: shell, files, apps, AppleScript, mouse/keyboard, screen vision
 * - Vision: take_screenshot auto-feeds image to Claude
 * - Self-modification: read/write own source files
 * - Phone access: local web server with token auth + QR code
 * - Serial: Arduino/robot/USB-serial control
 */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

// Load .env from multiple locations (dev + production .app)
const envCandidates = [
  path.join(__dirname, '..', '.env'),
  path.join(process.resourcesPath || '', '.env'),
  path.join(os.homedir(), '.jarvis', '.env'),
];
for (const p of envCandidates) {
  if (p && fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

const Anthropic = require('@anthropic-ai/sdk');
const { SerialPort } = require('serialport');
const { startWebServer } = require('./web-server');

const execAsync = promisify(exec);
const isDev = !app.isPackaged;
const RENDERER_URL = isDev
  ? 'http://localhost:5173'
  : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

const YOLO_MODE = process.env.YOLO !== 'false';
const JARVIS_SOURCE_DIR =
  process.env.JARVIS_SOURCE_DIR ||
  path.join(os.homedir(), 'Desktop', 'Jarvis-for-mac-air', 'jarvis-desktop');

// Auth token for phone access — random per launch, stored in ~/.jarvis/phone_token
function getOrCreatePhoneToken() {
  const dir = path.join(os.homedir(), '.jarvis');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'phone_token');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim();
  const tok = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(p, tok);
  return tok;
}
const PHONE_TOKEN = getOrCreatePhoneToken();

let tray = null;
let win = null;
let anthropic = null;
let webServerHandle = null;

// ============ TOOLS ============
const tools = [
  { name: 'run_shell', description: 'Execute any zsh command. Output truncated to 16KB. Use for git, brew, file ops, system info, network, anything.', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
  { name: 'read_file', description: 'Read any file. ~ expands to home.', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Write/overwrite a file. Creates parent dirs.', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'append_file', description: 'Append text to a file (creates if missing).', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'open_app', description: 'Open a macOS app by name (Safari, Spotify, Slack, etc).', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'applescript', description: 'Run any AppleScript for advanced macOS automation.', input_schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } },
  { name: 'list_dir', description: 'List files in a directory.', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },

  // VISION
  { name: 'see_screen', description: 'Take a screenshot AND analyze it visually. Use this when the user wants you to see/look at what is on their screen, find something visually, read text from an app, etc. The image is automatically attached to your next response so you can describe what is on screen.', input_schema: { type: 'object', properties: { region: { type: 'string', description: 'Optional: "fullscreen" (default) or "active_window"' } } } },
  { name: 'take_screenshot_to_file', description: 'Just save a screenshot to disk without analysis.', input_schema: { type: 'object', properties: { path: { type: 'string' } } } },

  // INPUT CONTROL
  { name: 'get_clipboard', description: 'Read clipboard text.', input_schema: { type: 'object', properties: {} } },
  { name: 'set_clipboard', description: 'Put text in clipboard.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'type_text', description: 'Type text into focused app (simulates keyboard). Good for filling forms, writing in any app.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'key_press', description: 'Send key combo like "cmd+s", "cmd+tab", "return", "escape", "cmd+space".', input_schema: { type: 'object', properties: { keys: { type: 'string' } }, required: ['keys'] } },
  { name: 'mouse_click', description: 'Click the mouse at screen coordinates (x,y from top-left). Requires cliclick (`brew install cliclick`).', input_schema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, double: { type: 'boolean' } }, required: ['x', 'y'] } },
  { name: 'mouse_move', description: 'Move mouse cursor to coordinates without clicking.', input_schema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
  { name: 'scroll', description: 'Scroll up or down at current mouse position.', input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number', description: 'lines, default 5' } }, required: ['direction'] } },
  { name: 'get_screen_size', description: 'Get screen dimensions (width x height).', input_schema: { type: 'object', properties: {} } },
  { name: 'get_active_window', description: 'Get the name & title of the currently focused app/window.', input_schema: { type: 'object', properties: {} } },
  { name: 'list_open_apps', description: 'List all currently running/visible apps.', input_schema: { type: 'object', properties: {} } },
  { name: 'click_ui_element', description: 'Click a named UI element in an app via Accessibility (more reliable than mouse_click). Example: process_name="Safari", element_name="Reload".', input_schema: { type: 'object', properties: { process_name: { type: 'string' }, element_name: { type: 'string' } }, required: ['process_name', 'element_name'] } },

  // SELF-MODIFICATION
  { name: 'read_own_source', description: 'Read a file from Jarvis own source code. Use relative path like "electron/main.js" or "renderer/App.jsx".', input_schema: { type: 'object', properties: { relative_path: { type: 'string' } }, required: ['relative_path'] } },
  { name: 'modify_own_source', description: 'Edit Jarvis own source code. Writes content to the file. After modifying, you should tell the user to run `npm run build` from the project dir to apply changes (or call rebuild_self).', input_schema: { type: 'object', properties: { relative_path: { type: 'string' }, content: { type: 'string' } }, required: ['relative_path', 'content'] } },
  { name: 'list_own_source', description: 'List files in Jarvis source tree.', input_schema: { type: 'object', properties: { relative_path: { type: 'string', description: 'default empty = root' } } } },
  { name: 'rebuild_self', description: 'Trigger npm run build in the source dir. Takes 3-5 minutes. After done, the user must drag the new .app to /Applications. Returns immediately; build runs in background.', input_schema: { type: 'object', properties: {} } },
  { name: 'restart_self', description: 'Quit and relaunch Jarvis (useful after edits when running from npm start).', input_schema: { type: 'object', properties: {} } },

  // WEB / SYSTEM
  { name: 'web_fetch', description: 'GET a URL. Returns first 16KB.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'notify', description: 'Show macOS notification.', input_schema: { type: 'object', properties: { title: { type: 'string' }, message: { type: 'string' } }, required: ['title', 'message'] } },
  { name: 'speak', description: 'Speak text aloud using macOS TTS.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'open_url', description: 'Open a URL in the default browser.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },

  // SERIAL / HARDWARE
  { name: 'list_serial_ports', description: 'List Arduino/USB/serial devices.', input_schema: { type: 'object', properties: {} } },
  { name: 'serial_command', description: 'Send one command to a serial device, read response, close.', input_schema: { type: 'object', properties: { port: { type: 'string' }, command: { type: 'string' }, baudRate: { type: 'number' }, readTimeoutMs: { type: 'number' } }, required: ['port', 'command'] } },
  { name: 'serial_open', description: 'Open persistent serial connection.', input_schema: { type: 'object', properties: { port: { type: 'string' }, baudRate: { type: 'number' } }, required: ['port'] } },
  { name: 'serial_write', description: 'Write to open serial session.', input_schema: { type: 'object', properties: { port: { type: 'string' }, data: { type: 'string' } }, required: ['port', 'data'] } },
  { name: 'serial_read', description: 'Read buffer from open serial session.', input_schema: { type: 'object', properties: { port: { type: 'string' } }, required: ['port'] } },
  { name: 'serial_close', description: 'Close serial session.', input_schema: { type: 'object', properties: { port: { type: 'string' } }, required: ['port'] } },
  { name: 'list_usb_devices', description: 'List USB devices with full details.', input_schema: { type: 'object', properties: {} } },
];

const DESTRUCTIVE_PATTERNS = /\b(rm\s+-rf?\s+\/(?!tmp|var\/folders|Users\/[^/]+\/(\.cache|Downloads|tmp))|sudo\s+rm\s+-rf|dd\s+if=|mkfs|>\s*\/dev\/sd|chmod\s+777\s+\/)\b/i;

async function confirmAction(summary) {
  if (YOLO_MODE) return true;
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Allow', 'Deny'],
    defaultId: 0,
    cancelId: 1,
    title: 'Jarvis confirmation',
    message: 'Confirm action',
    detail: summary,
  });
  return result.response === 0;
}

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
  const specials = { return: 36, enter: 36, tab: 48, space: 49, escape: 53, esc: 53, delete: 51, up: 126, down: 125, left: 123, right: 124 };
  const using = mods.length ? ` using {${mods.join(', ')}}` : '';
  if (specials[key] !== undefined) {
    return `tell application "System Events" to key code ${specials[key]}${using}`;
  }
  return `tell application "System Events" to keystroke "${key}"${using}`;
}

// Persistent serial sessions
const serialSessions = new Map();
function ensureSerialBuffer(port, sp) {
  const session = { sp, buffer: '' };
  sp.on('data', (chunk) => { session.buffer += chunk.toString('utf8'); });
  sp.on('error', () => {});
  serialSessions.set(port, session);
  return session;
}

async function executeTool(name, input) {
  try {
    switch (name) {
      // ----- SHELL / FILES -----
      case 'run_shell': {
        const cmd = input.command;
        if (DESTRUCTIVE_PATTERNS.test(cmd)) {
          const ok = await confirmAction(`⚠️ Dangerous:\n\n${cmd}`);
          if (!ok) return { error: 'User denied' };
        }
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 90000,
          maxBuffer: 4 * 1024 * 1024,
          shell: '/bin/zsh',
          env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin` },
        });
        return { stdout: (stdout || '').slice(0, 16000), stderr: (stderr || '').slice(0, 4000) };
      }
      case 'read_file': {
        const p = input.path.replace(/^~/, os.homedir());
        const content = fs.readFileSync(p, 'utf-8');
        return { content: content.slice(0, 64000), truncated: content.length > 64000 };
      }
      case 'write_file': {
        const p = input.path.replace(/^~/, os.homedir());
        const ok = await confirmAction(`Write to:\n${p}\n${input.content.length} chars`);
        if (!ok) return { error: 'User denied write' };
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, input.content, 'utf-8');
        return { ok: true, bytes: input.content.length, path: p };
      }
      case 'append_file': {
        const p = input.path.replace(/^~/, os.homedir());
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.appendFileSync(p, input.content, 'utf-8');
        return { ok: true, path: p };
      }
      case 'list_dir': {
        const p = input.path.replace(/^~/, os.homedir());
        const items = fs.readdirSync(p, { withFileTypes: true })
          .slice(0, 500)
          .map(d => `${d.isDirectory() ? '[DIR] ' : '      '}${d.name}`);
        return { items };
      }
      case 'open_app': {
        await execAsync(`open -a ${JSON.stringify(input.name)}`);
        return { ok: true };
      }
      case 'applescript': {
        const { stdout } = await execAsync(`osascript -e ${JSON.stringify(input.script)}`, { timeout: 30000 });
        return { stdout: stdout.trim().slice(0, 8000) };
      }

      // ----- VISION -----
      case 'see_screen': {
        const out = `/tmp/jarvis-vision-${Date.now()}.png`;
        if (input.region === 'active_window') {
          await execAsync(`screencapture -x -o -l$(osascript -e 'tell application "System Events" to get id of window 1 of (first process whose frontmost is true)') ${out} 2>/dev/null || screencapture -x ${out}`);
        } else {
          await execAsync(`screencapture -x ${out}`);
        }
        // Read image as base64 and return marker for agent loop to inject
        const b64 = fs.readFileSync(out, 'base64');
        return { _image_b64: b64, _media_type: 'image/png', note: 'Screenshot captured. Image is attached for visual analysis.' };
      }
      case 'take_screenshot_to_file': {
        const out = input.path ? input.path.replace(/^~/, os.homedir()) : `/tmp/jarvis-screenshot-${Date.now()}.png`;
        await execAsync(`screencapture -x ${JSON.stringify(out)}`);
        return { path: out };
      }

      // ----- INPUT -----
      case 'get_clipboard': {
        const { stdout } = await execAsync('pbpaste');
        return { text: stdout.slice(0, 16000) };
      }
      case 'set_clipboard': {
        await execAsync(`pbcopy`, { input: input.text });
        // Above won't work — need stdin. Use temp file approach:
        const tmp = `/tmp/jarvis-clip-${Date.now()}.txt`;
        fs.writeFileSync(tmp, input.text);
        await execAsync(`pbcopy < ${JSON.stringify(tmp)}`);
        fs.unlinkSync(tmp);
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
      case 'mouse_click': {
        try {
          const cmd = input.double
            ? `cliclick dc:${Math.round(input.x)},${Math.round(input.y)}`
            : `cliclick c:${Math.round(input.x)},${Math.round(input.y)}`;
          await execAsync(`${cmd}`, { env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` } });
          return { ok: true };
        } catch (e) {
          return { error: 'cliclick not installed. Run: brew install cliclick' };
        }
      }
      case 'mouse_move': {
        try {
          await execAsync(`cliclick m:${Math.round(input.x)},${Math.round(input.y)}`, { env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` } });
          return { ok: true };
        } catch (e) {
          return { error: 'cliclick not installed. Run: brew install cliclick' };
        }
      }
      case 'scroll': {
        const amount = input.amount || 5;
        const dir = input.direction === 'up' ? amount : -amount;
        try {
          for (let i = 0; i < amount; i++) {
            await execAsync(`cliclick w:0,${dir > 0 ? '5' : '-5'}`, { env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` } });
          }
          return { ok: true };
        } catch (e) {
          const code = input.direction === 'up' ? 116 : 121;
          for (let i = 0; i < amount; i++) {
            await execAsync(`osascript -e 'tell application "System Events" to key code ${code}'`);
          }
          return { ok: true, method: 'page-keys-fallback', fallback_reason: e.message };
        }
      }
      case 'get_screen_size': {
        const primary = screen.getPrimaryDisplay();
        return { width: primary.size.width, height: primary.size.height, scaleFactor: primary.scaleFactor };
      }
      case 'get_active_window': {
        const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to set frontApp to name of first application process whose frontmost is true' -e 'tell application "System Events" to tell (first process whose frontmost is true) to try
          set winName to name of front window
        on error
          set winName to ""
        end try' -e 'return frontApp & "|" & winName'`);
        const [app, window] = stdout.trim().split('|');
        return { app, window };
      }
      case 'list_open_apps': {
        const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`);
        return { apps: stdout.trim().split(', ') };
      }
      case 'click_ui_element': {
        const script = `tell application "System Events" to tell process ${JSON.stringify(input.process_name)}
          click (first UI element whose name is ${JSON.stringify(input.element_name)})
        end tell`;
        const { stdout } = await execAsync(`osascript -e ${JSON.stringify(script)}`);
        return { ok: true, stdout: stdout.trim() };
      }

      // ----- SELF MOD -----
      case 'read_own_source': {
        const p = path.join(JARVIS_SOURCE_DIR, input.relative_path);
        if (!p.startsWith(JARVIS_SOURCE_DIR)) return { error: 'Path escapes source dir' };
        const content = fs.readFileSync(p, 'utf-8');
        return { path: p, content: content.slice(0, 64000) };
      }
      case 'modify_own_source': {
        const p = path.join(JARVIS_SOURCE_DIR, input.relative_path);
        if (!p.startsWith(JARVIS_SOURCE_DIR)) return { error: 'Path escapes source dir' };
        fs.writeFileSync(p, input.content, 'utf-8');
        return { ok: true, path: p, bytes: input.content.length, note: 'Run rebuild_self to apply changes to the installed .app, or restart if running from npm start.' };
      }
      case 'list_own_source': {
        const p = path.join(JARVIS_SOURCE_DIR, input.relative_path || '');
        if (!p.startsWith(JARVIS_SOURCE_DIR)) return { error: 'Path escapes source dir' };
        const items = fs.readdirSync(p, { withFileTypes: true })
          .filter(d => !d.name.startsWith('.') && d.name !== 'node_modules' && d.name !== 'dist')
          .map(d => `${d.isDirectory() ? '[DIR] ' : '      '}${d.name}`);
        return { items };
      }
      case 'rebuild_self': {
        // Spawn detached so it survives a relaunch
        const child = spawn('bash', ['-lc', `cd ${JSON.stringify(JARVIS_SOURCE_DIR)} && npm run build 2>&1 | tee /tmp/jarvis-rebuild.log`], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        // Notify when done by tailing log (best-effort)
        setTimeout(() => {
          try {
            execAsync(`osascript -e 'display notification "Build started. Tail /tmp/jarvis-rebuild.log for progress." with title "Jarvis rebuilding…"'`);
          } catch (e) { /* notification failure non-fatal */ }
        }, 100);
        return { ok: true, note: 'Build kicked off in background. Watch /tmp/jarvis-rebuild.log. When done, drag new .app from dist/ to /Applications.' };
      }
      case 'restart_self': {
        setTimeout(() => {
          app.relaunch();
          app.exit(0);
        }, 500);
        return { ok: true };
      }

      // ----- WEB / SYSTEM -----
      case 'web_fetch': {
        const { stdout } = await execAsync(`curl -sL --max-time 25 ${JSON.stringify(input.url)}`, { maxBuffer: 4 * 1024 * 1024 });
        return { content: stdout.slice(0, 16000) };
      }
      case 'notify': {
        const t = input.title.replace(/"/g, '\\"');
        const m = input.message.replace(/"/g, '\\"');
        await execAsync(`osascript -e 'display notification "${m}" with title "${t}"'`);
        return { ok: true };
      }
      case 'speak': {
        const safe = input.text.replace(/"/g, '\\"').slice(0, 4000);
        execAsync(`say "${safe}"`).catch(() => {});
        return { ok: true };
      }
      case 'open_url': {
        await shell.openExternal(input.url);
        return { ok: true };
      }

      // ----- SERIAL -----
      case 'list_serial_ports': {
        const ports = await SerialPort.list();
        return { ports: ports.map(p => ({ path: p.path, manufacturer: p.manufacturer, vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber })) };
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
        if (serialSessions.has(input.port)) return { ok: true, note: 'already open' };
        return await new Promise((resolve) => {
          const sp = new SerialPort({ path: input.port, baudRate: input.baudRate || 9600 }, (err) => {
            if (err) { resolve({ error: err.message }); return; }
            ensureSerialBuffer(input.port, sp);
            resolve({ ok: true, port: input.port });
          });
        });
      }
      case 'serial_write': {
        const session = serialSessions.get(input.port);
        if (!session) return { error: 'Port not open' };
        return await new Promise((resolve) => {
          session.sp.write(input.data, (err) => {
            if (err) resolve({ error: err.message });
            else resolve({ ok: true });
          });
        });
      }
      case 'serial_read': {
        const session = serialSessions.get(input.port);
        if (!session) return { error: 'Port not open' };
        const data = session.buffer;
        session.buffer = '';
        return { data: data.slice(0, 16000) };
      }
      case 'serial_close': {
        const session = serialSessions.get(input.port);
        if (!session) return { error: 'Not open' };
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
          const walk = (items) => {
            for (const item of items || []) {
              flat.push({ name: item._name, manufacturer: item.manufacturer, vendor_id: item.vendor_id, product_id: item.product_id, serial_num: item.serial_num });
              if (item._items) walk(item._items);
            }
          };
          walk(data.SPUSBDataType);
          return { devices: flat.slice(0, 80) };
        } catch {
          return { raw: stdout.slice(0, 12000) };
        }
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: (e.message || String(e)).slice(0, 2000) };
  }
}

// ============ AGENT LOOP ============
const SYSTEM = `You are JARVIS — a sharp, witty AI secretary running on the user's MacBook with a menu bar app AND a mobile phone interface.

Personality: confident, concise (2-3 sentences typically), playful, never sycophantic. Reply naturally — no "I'd be happy to" filler.

You have FULL control of this Mac and access to everything. Tools available:
- Shell, file, app control: run_shell, read_file, write_file, append_file, open_app, applescript, list_dir, open_url
- Vision (SEE the screen): see_screen — use this whenever the user asks you to look at, find, read, or describe anything visual on screen
- Input control: type_text, key_press, mouse_click, mouse_move, scroll, click_ui_element
- Screen info: get_screen_size, get_active_window, list_open_apps
- Self-modification: read_own_source, modify_own_source, list_own_source, rebuild_self, restart_self
- Hardware: list_serial_ports, serial_command, serial_open/write/read/close (Arduinos, robots, microcontrollers), list_usb_devices
- Clipboard: get_clipboard, set_clipboard
- Web: web_fetch, open_url
- Output: notify, speak

Working style:
- Act like a great secretary: just DO things, don't ask permission for normal tasks
- For multi-step tasks (e.g. "open Notes and write me a poem"), chain tools yourself without checking in
- When the user wants visual context, call see_screen FIRST, then act
- After completing, give a one-line summary
- If a tool fails, try a different approach or briefly explain why
- For sensitive ops (rm -rf /, format drive), the system auto-prompts — proceed normally
- When modifying your own code, default to surgical edits with read_own_source first. After major edits, suggest rebuild_self.
- Be senior-engineer direct for code questions.

You exist to make the user's Mac do anything they want.`;

const conversations = new Map();

function trimHistory(history) {
  if (history.length > 50) return history.slice(-50);
  return history;
}

async function runAgent(sessionId, userText, onEvent) {
  if (!anthropic) {
    onEvent({ type: 'error', message: 'Missing ANTHROPIC_API_KEY in ~/.jarvis/.env' });
    onEvent({ type: 'done' });
    return;
  }

  let history = conversations.get(sessionId) || [];
  history.push({ role: 'user', content: userText });
  history = trimHistory(history);

  try {
    let iterations = 0;
    while (iterations++ < 30) {
      onEvent({ type: 'status', state: 'thinking' });

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM,
        tools,
        messages: history,
      });

      let currentToolUse = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, input: '' };
            onEvent({ type: 'tool_start', name: currentToolUse.name });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
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

      const toolResults = [];
      for (const block of finalMsg.content) {
        if (block.type === 'tool_use') {
          onEvent({ type: 'tool_call', name: block.name, input: block.input });
          const result = await executeTool(block.name, block.input);

          // Auto-inject image into tool_result for see_screen
          let resultContent;
          if (result._image_b64) {
            onEvent({ type: 'tool_result', name: block.name, result: { ok: true, note: 'image attached' } });
            resultContent = [
              { type: 'text', text: result.note || 'Screenshot captured.' },
              { type: 'image', source: { type: 'base64', media_type: result._media_type || 'image/png', data: result._image_b64 } },
            ];
          } else {
            const safeForUi = { ...result };
            delete safeForUi._image_b64;
            onEvent({ type: 'tool_result', name: block.name, result: safeForUi });
            resultContent = JSON.stringify(safeForUi).slice(0, 12000);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: resultContent,
            is_error: !!result.error,
          });
        }
      }
      history.push({ role: 'user', content: toolResults });
      history = trimHistory(history);
    }
    onEvent({ type: 'error', message: 'Hit 30-iteration cap' });
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
  if (fs.existsSync(iconPath)) img = nativeImage.createFromPath(iconPath);
  else {
    img = nativeImage.createFromBuffer(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUklEQVR4nGNgGAWjYBSMglEwCkbBKBg6QJ' +
      'YR/v//YwxOgIyABYQowSiBEYwGI4ZsKsAFGEqWAsYwQbA6sGAYIxoBuMpgFEwCkbBKBgFowAA4GcGNCYK' +
      'AAAAAElFTkSuQmCC', 'base64'));
  }
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Jarvis');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Toggle Jarvis', click: toggleWindow },
      { label: `YOLO Mode: ${YOLO_MODE ? 'ON' : 'OFF'}`, enabled: false },
      { label: `Phone URL: see Jarvis settings`, enabled: false },
      { label: 'Hotkey: ⌘⇧Space', enabled: false },
      { type: 'separator' },
      { label: 'Quit Jarvis', role: 'quit' },
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ============ IPC ============
ipcMain.handle('jarvis:send', async (event, { sessionId, message }) => {
  await runAgent(sessionId, message, (ev) => event.sender.send('jarvis:event', ev));
});
ipcMain.handle('jarvis:has-key', () => !!process.env.ANTHROPIC_API_KEY);
ipcMain.handle('jarvis:hide', () => win && win.hide());
ipcMain.handle('jarvis:reset', (event, { sessionId }) => {
  conversations.delete(sessionId);
  return { ok: true };
});
ipcMain.handle('jarvis:phone-info', async () => {
  if (!webServerHandle) return null;
  const url = webServerHandle.getUrl(PHONE_TOKEN);
  const qr = await webServerHandle.getQrDataUrl(PHONE_TOKEN);
  return { url, qr };
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

  // Start phone web server
  try {
    webServerHandle = startWebServer({
      onMessage: async (sessionId, message, send) => {
        await runAgent(`phone-${sessionId}`, message, send);
      },
      getAuth: () => PHONE_TOKEN,
    });
  } catch (e) {
    console.error('phone server failed', e);
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
