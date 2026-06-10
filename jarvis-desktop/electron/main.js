/**
 * Jarvis Electron main process.
 * - Menu bar tray icon
 * - Borderless popup window anchored to tray
 * - Global hotkey (Cmd+Shift+Space)
 * - Claude Sonnet 4.5 agent loop with tool use
 * - REAL Mac computer control tools (shell, file, applescript)
 */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');

const execAsync = promisify(exec);
const isDev = !app.isPackaged;
const RENDERER_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

let tray = null;
let win = null;
let anthropic = null;

// ============ TOOLS (the real computer control) ============
const tools = [
  {
    name: 'run_shell',
    description: 'Execute a shell command on the user\'s macOS. Use for safe read-only commands by default; ask user before destructive ops.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        requires_confirmation: { type: 'boolean', description: 'true for destructive ops like rm, mv, sudo' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read contents of a file on the local filesystem.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file on the local filesystem. Always requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'open_app',
    description: 'Open a macOS application by name (e.g. "Safari", "VSCode", "Spotify").',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  },
  {
    name: 'applescript',
    description: 'Execute AppleScript for advanced macOS control (notifications, app automation, system events).',
    input_schema: {
      type: 'object',
      properties: { script: { type: 'string' } },
      required: ['script']
    }
  },
  {
    name: 'list_dir',
    description: 'List files in a directory.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    }
  }
];

const DESTRUCTIVE_PATTERNS = /\b(rm|sudo|mv|dd|mkfs|shutdown|reboot|kill|killall|>\s*\/|chmod\s+777|curl\s+.*\|\s*(sh|bash))\b/i;

async function confirmAction(summary) {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Allow', 'Deny'],
    defaultId: 0,
    cancelId: 1,
    title: 'Jarvis is about to do something on your Mac',
    message: 'Confirm action',
    detail: summary
  });
  return result.response === 0;
}

async function executeTool(name, input) {
  switch (name) {
    case 'run_shell': {
      const cmd = input.command;
      if (DESTRUCTIVE_PATTERNS.test(cmd) || input.requires_confirmation) {
        const ok = await confirmAction(`Run command:\n\n${cmd}`);
        if (!ok) return { error: 'User denied execution' };
      }
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 });
        return { stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 2000) };
      } catch (e) {
        return { error: e.message.slice(0, 2000) };
      }
    }
    case 'read_file': {
      try {
        const expanded = input.path.replace(/^~/, process.env.HOME);
        const content = fs.readFileSync(expanded, 'utf-8');
        return { content: content.slice(0, 16000) };
      } catch (e) { return { error: e.message }; }
    }
    case 'write_file': {
      const ok = await confirmAction(`Write to:\n${input.path}\n\nSize: ${input.content.length} chars`);
      if (!ok) return { error: 'User denied write' };
      try {
        const expanded = input.path.replace(/^~/, process.env.HOME);
        fs.writeFileSync(expanded, input.content, 'utf-8');
        return { ok: true, bytes: input.content.length };
      } catch (e) { return { error: e.message }; }
    }
    case 'open_app': {
      try {
        await execAsync(`open -a "${input.name.replace(/"/g, '')}"`);
        return { ok: true };
      } catch (e) { return { error: e.message }; }
    }
    case 'applescript': {
      const ok = await confirmAction(`Run AppleScript:\n\n${input.script.slice(0, 400)}`);
      if (!ok) return { error: 'User denied' };
      try {
        const { stdout } = await execAsync(`osascript -e ${JSON.stringify(input.script)}`);
        return { stdout: stdout.trim() };
      } catch (e) { return { error: e.message }; }
    }
    case 'list_dir': {
      try {
        const expanded = input.path.replace(/^~/, process.env.HOME);
        const items = fs.readdirSync(expanded);
        return { items: items.slice(0, 200) };
      } catch (e) { return { error: e.message }; }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ============ AGENT LOOP ============
const SYSTEM = `You are JARVIS — a witty, sharp AI assistant running on the user's MacBook in a menu bar app.

Personality: confident, concise (2-3 sentences typically), playful, never sycophantic. Reply naturally — no "I'd be happy to" filler.

You have REAL tools to control this Mac: run_shell, read_file, write_file, open_app, applescript, list_dir.
- For trivial actions (open Safari, check date), just do it.
- For destructive ops (rm, sudo, write, AppleScript with system events), the system will auto-prompt the user for confirmation — proceed and trust the prompt.
- After a tool returns, briefly tell the user what happened.

When asked coding questions, be senior-engineer direct with working examples.`;

const conversations = new Map(); // sessionId -> messages[]

async function runAgent(sessionId, userText, onEvent) {
  if (!anthropic) {
    onEvent({ type: 'error', message: 'ANTHROPIC_API_KEY missing in .env file' });
    return;
  }
  const history = conversations.get(sessionId) || [];
  history.push({ role: 'user', content: userText });

  let iterations = 0;
  while (iterations++ < 8) {
    onEvent({ type: 'status', state: 'thinking' });

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: SYSTEM,
      tools,
      messages: history,
    });

    let assistantBlocks = [];
    let currentText = '';
    let currentToolUse = null;

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
          assistantBlocks.push({ type: 'tool_use', id: currentToolUse.id, name: currentToolUse.name, input: currentToolUse.input });
          currentToolUse = null;
        } else if (currentText) {
          assistantBlocks.push({ type: 'text', text: currentText });
          currentText = '';
        }
      }
    }

    const finalMsg = await stream.finalMessage();
    history.push({ role: 'assistant', content: finalMsg.content });

    if (finalMsg.stop_reason !== 'tool_use') {
      conversations.set(sessionId, history);
      onEvent({ type: 'done' });
      return;
    }

    // Execute all tool calls
    const toolResults = [];
    for (const block of finalMsg.content) {
      if (block.type === 'tool_use') {
        onEvent({ type: 'tool_call', name: block.name, input: block.input });
        const result = await executeTool(block.name, block.input);
        onEvent({ type: 'tool_result', name: block.name, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result).slice(0, 8000)
        });
      }
    }
    history.push({ role: 'user', content: toolResults });
  }
  onEvent({ type: 'error', message: 'Max iterations reached' });
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
  if (win.isVisible()) { win.hide(); }
  else { positionWindow(); win.show(); win.focus(); }
}

function createTray() {
  // Simple template icon — sparkle dot
  const iconPath = path.join(__dirname, 'trayIconTemplate.png');
  let img;
  if (fs.existsSync(iconPath)) {
    img = nativeImage.createFromPath(iconPath);
  } else {
    // 16x16 transparent fallback (template icon)
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
      { label: 'Hotkey: ⌘⇧Space', enabled: false },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
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
app.on('window-all-closed', (e) => e.preventDefault()); // stay running for menu bar
