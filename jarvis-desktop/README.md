# Jarvis — Your Personal AI Assistant for macOS

A **menu bar AI assistant** powered by Claude Sonnet 4.5 that actually controls your Mac.

- 🌟 **Animated Jarvis orb** that reacts to listening / thinking / speaking states
- 🎙️ **Voice in & out** — talk to it, hear it reply
- 🧠 **Claude Sonnet 4.5** with tool use (the same brain as E1)
- 🖥️ **Real computer control** — open apps, run shell commands, read/write files, AppleScript
- ⌨️ **Global hotkey**: `⌘ + Shift + Space` from anywhere
- 🪟 **Frosted-glass popup** anchored to your menu bar icon
- 🔒 **Safety confirmations** for destructive actions

---

## Install on your MacBook Air

### Prereqs
- macOS 12+
- [Node.js 18+](https://nodejs.org/) (`brew install node`)
- An Anthropic API key — get one at https://console.anthropic.com/

### Setup
```bash
cd /path/to/jarvis-desktop

# 1. Install dependencies
npm install
# or: yarn install

# 2. Add your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3. Run in dev mode (live reload)
npm start
```

The first time you click the tray icon ✨ in your menu bar, a frosted-glass window will pop down. Try saying:
- "Open Safari"
- "What's in my Downloads folder?"
- "Write a Python script that fetches the weather"
- "What's the current CPU usage?"

### Build a `.dmg` installer
```bash
npm run build
```
The signed-ready installer ends up in `dist-electron/`. Drag `Jarvis.app` to `/Applications/`.

> **First launch on a fresh Mac**: macOS Gatekeeper may block unsigned builds.
> Right-click `Jarvis.app` → Open → Open Anyway.
> Then grant **Accessibility** + **Automation** + **Microphone** permissions in System Settings → Privacy.

---

## Architecture

```
electron/main.js       ← Electron main: tray, window, hotkey, tools, Anthropic SDK
electron/preload.js    ← Secure IPC bridge to renderer
renderer/App.jsx       ← React UI (Orb + transcript + tool log + input)
renderer/Orb.jsx       ← The living Jarvis orb (Framer Motion)
```

### Tools Claude has access to
| Tool          | What it does                                      | Auto-confirms? |
|---------------|---------------------------------------------------|----------------|
| `run_shell`   | Runs zsh commands                                 | Yes (no for `rm/sudo/mv/dd/...`) |
| `read_file`   | Reads any file                                    | Yes            |
| `write_file`  | Writes/overwrites files                           | **Always asks**|
| `open_app`    | `open -a "App Name"`                              | Yes            |
| `applescript` | AppleScript for advanced macOS automation         | **Always asks**|
| `list_dir`    | Lists files in a directory                        | Yes            |

Destructive commands trigger a native macOS confirmation dialog before running.

---

## Customize

- **Change personality**: edit `SYSTEM` constant in `electron/main.js`
- **Change hotkey**: edit `globalShortcut.register('CommandOrControl+Shift+Space', ...)` in `main.js`
- **Switch model**: change `model: 'claude-sonnet-4-5-20250929'` (e.g. to `claude-opus-4-7`)
- **Custom voice**: edit `speak()` in `renderer/App.jsx` to use specific macOS voice

## Troubleshooting

- **Tray icon doesn't appear** → restart, check macOS menu bar isn't full (try hiding other icons)
- **"Missing ANTHROPIC_API_KEY"** → make sure `.env` is in the project root, not inside `electron/`
- **Voice doesn't work** → grant Microphone permission in System Settings → Privacy → Microphone
- **Hotkey doesn't fire** → grant Accessibility permission in System Settings → Privacy → Accessibility

Enjoy your personal Jarvis. 🪐
