# Jarvis — Personal AI Assistant for macOS

## Original Problem Statement
> "i want to build an ai assistant that lives on my computer i am on a macbook air ... menu bar button → animated Jarvis thing → talk to it ... claude ... actually control my computer ... global hotkey ... act like u and be a general assistant"
> Later: "when i open the app i want it to have this neat iron man animation ... i want to be able to connect robots to my mac and then the assistant control it for example or code it i want this to change my life"

## Architecture
The REAL product lives in `/app/jarvis-desktop` (Electron, macOS arm64).
`/app/frontend` + `/app/backend` were only the early web preview — DEPRECATED, ignore.

### Desktop App (`/app/jarvis-desktop`)
- Electron 33 + Vite + React 18 + Tailwind + Framer Motion
- Menu bar tray + frosted-glass popup, global hotkey `⌘+Shift+Space`
- @anthropic-ai/sdk (user's own key in `~/.jarvis/.env`) with full tool-use agent loop
- Auto-vision: screenshot attached to every message (AUTO_VISION env, default on)
- YOLO mode (no confirmation prompts, default on)
- Phone access: Express server on port 47823 + QR code (token auth)
- Self-modification tools (read/modify own source, rebuild, restart)

### IMPORTANT — Environment notes for agents
- DO NOT run `npm run build`/`npm start` for the Electron app in the Linux container (macOS-only).
- The renderer CAN be dev-tested: `yarn dev:renderer` (vite on :5173); `window.jarvis` mock is auto-installed in browser (renderer/main.jsx).
- Headless WebGL in container is broken/ultra-slow — the intro is intentionally 2D (DOM/CSS/Framer), do not reintroduce three.js.
- User deploys via "Save to GitHub" → `git pull` on Mac → `npm install` → `npm run build`.

## Features Implemented
### 2026-01 (previous sessions)
- ✅ Animated Jarvis orb (idle/listening/thinking/speaking)
- ✅ Claude streaming, tool-use agent loop (30 iterations), 40+ Mac control tools
- ✅ Voice in (Web Speech) / out (SpeechSynthesis)
- ✅ Global hotkey, tray, vibrancy aesthetic, .dmg build script
- ✅ Phone web server + QR (express, qrcode)
- ✅ Auto-vision (screenshot with every message)
- ✅ Self-modification tools

### 2026-06-12 (this session)
- ✅ **Cinematic Iron-Man helmet intro** — AI-generated movie-quality helmet image (renderer/assets/helmet.png, Gemini-generated) animated in 2D: scale-in entrance, eye-glow flicker overlays (positions measured from the asset), light sweep, particles canvas, HUD rings, J.A.R.V.I.S. title reveal, white flash, fade-out. Full (4.5s) on first summon, mini (1.9s) on later summons, click-to-skip. (HelmetIntro.jsx; triggered by `jarvis:shown` IPC on window `show`)
- ✅ **Robot Mode** — device watcher polls SerialPort.list() every 4s; on plug/unplug: macOS notification + UI log + `[System note]` injected into next agent message (acknowledge-only policy enforced in system prompt — Jarvis won't touch the board until asked)
- ✅ **Arduino auto-flash tools** — `detect_boards` (arduino-cli board list w/ serial fallback), `arduino_flash` (writes sketch to ~/.jarvis/sketches/, auto core install, compile + upload, releases held serial port first), `arduino_cli` (raw passthrough). Requires `brew install arduino-cli` on the Mac.
- ✅ **Robot panel UI** (🤖 button) — detected devices list, rescan, live serial monitor (streams via `jarvis:serial-data`)
- ✅ Removed `three` dependency (procedural 3D attempt scrapped in favor of image-based cinematic)

## Verification status
- Renderer tested in container via vite + screenshots: intro plays full → unmounts, robot panel renders, prod build (`yarn build:renderer`) passes.
- USER MUST VERIFY on Mac: DMG build (`npm run build` — earlier `hdiutil detach` ghost-mount issue may need `hdiutil detach /dev/diskN` or Disk Utility eject), phone QR access, cliclick mouse control, arduino-cli flashing with a real board.

## Next Action Items
- User: pull latest, `npm install` (new asset only, no new native deps), `npm run build`
- Confirm DMG mount issue resolved (Issue 1 from previous session)
- Verify phone access + auto-vision on device (Issue 2)
- P1: persistent tunnel (cloudflared) for phone access outside Wi-Fi
- P2: validate cliclick mouse ops

## Backlog / P1-P2
- Voice activity detection (auto-listen)
- Conversation memory across sessions (vector store)
- Plugin system for custom tools
- True SMS (Twilio) if local web UI isn't enough

## File Map
```
/app/jarvis-desktop/
  electron/main.js              Tray + window + agent loop + tools + robot mode + device watcher
  electron/preload.js           IPC bridge (send, onEvent, onShown, onDevice, onSerialData, listPorts)
  electron/web-server.js        Phone access express server (port 47823)
  electron/phone-ui.html        Phone browser UI
  renderer/App.jsx              Desktop UI (orb, transcript, phone panel, robot panel, intro overlay)
  renderer/HelmetIntro.jsx      Cinematic 2D helmet intro (full/mini variants)
  renderer/assets/helmet.png    AI-generated helmet hero image (768x768)
  renderer/Orb.jsx              Animated orb
  renderer/main.jsx             Entry + browser dev mock for window.jarvis
  README.md                     Install + robot mode instructions
```
