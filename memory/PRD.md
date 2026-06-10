# Jarvis — Personal AI Assistant for macOS

## Original Problem Statement
> "i want to build an ai assistant that lives on my computer i am on a macbook air ... menu bar button → animated Jarvis thing → talk to it ... claude ... actually control my computer ... global hotkey ... act like u and be a general assistant"

## Architecture
Two deliverables in one repo:

### 1. Web Preview (`/app/frontend` + `/app/backend`)
Live, demo-able in the Emergent preview URL. Showcases the exact UI of the desktop app.
- **Frontend**: React + Tailwind + Framer Motion + Phosphor Icons + Web Speech API
- **Backend**: FastAPI + emergentintegrations + Claude Sonnet 4.5 streaming via SSE
- **Storage**: MongoDB (sessions + message history)

### 2. Desktop App (`/app/jarvis-desktop`)
The REAL macOS menu bar app the user installs locally.
- Electron 33 + Vite + React 18
- Menu bar tray (`Tray`) + frosted-glass popup window
- Global hotkey `⌘+Shift+Space` via `globalShortcut`
- @anthropic-ai/sdk with full **tool-use loop** (multi-iteration)
- Tools: `run_shell`, `read_file`, `write_file`, `open_app`, `applescript`, `list_dir`
- Safety: native confirmation dialogs for destructive ops (`rm`, `sudo`, write, AppleScript)
- macOS-specific: `LSUIElement` (no Dock icon), vibrancy, template tray icon

## Core Personality (System Prompt)
Confident, sharp, concise (2-3 sentences), playful, not sycophantic — modeled after E1.

## Features Implemented (2026-01)
- ✅ Animated Jarvis orb (4 states: idle, listening, thinking, speaking) — Framer Motion, pure CSS gradients
- ✅ Real-time Claude streaming with SSE (web) + ipc events (desktop)
- ✅ Voice input via Web Speech API (browser-native, free)
- ✅ Voice output via SpeechSynthesis API (uses macOS system voices)
- ✅ Persistent chat history per session (MongoDB)
- ✅ Tool execution feed (live log)
- ✅ Transcript overlay (toggleable)
- ✅ Settings modal with install instructions
- ✅ Tool-use agent loop in Electron main process
- ✅ Destructive-action confirmation prompts
- ✅ Global hotkey + tray icon
- ✅ Frosted glass / vibrancy macOS aesthetic
- ✅ Build script for `.dmg` installer (`yarn build`)

## Next Action Items
- Test with testing_agent_v3 (web preview)
- Optional: ship a code-signed notarized build (requires Apple Developer cert from user)

## Backlog / P1
- Voice activity detection (auto-listen on long press)
- Conversation memory across sessions (vector store)
- Plugin system for custom tools
- Image generation (Nano Banana)
- Screen-capture tool (vision input)

## File Map
```
/app/backend/server.py          FastAPI chat streaming
/app/backend/.env               EMERGENT_LLM_KEY, MONGO_URL
/app/frontend/src/App.js        Web preview UI
/app/frontend/src/components/Orb.jsx  Animated orb
/app/jarvis-desktop/
  electron/main.js              Tray + window + agent loop + tools
  electron/preload.js           IPC bridge
  renderer/App.jsx              Desktop UI
  renderer/Orb.jsx              Animated orb (desktop variant)
  README.md                     Install instructions
```
