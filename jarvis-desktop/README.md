# Jarvis — Your Personal AI Secretary for macOS

A menu bar AI assistant powered by Claude Sonnet 4.5 that **actually controls your Mac**, **sees your screen**, **takes commands from your phone**, and can **modify its own code**.

> Think Jarvis from Iron Man — but real, and yours.

---

## ✨ What it can do

### 🖥️ Full Mac control
- Run any shell command (`run_shell`)
- Read/write any file (`read_file`, `write_file`, `append_file`)
- Open any app (`open_app`)
- Run AppleScript (`applescript`)
- Type, click, scroll (`type_text`, `key_press`, `mouse_click`, `scroll`)
- See & describe your screen with vision (`see_screen`)
- Click named UI elements (`click_ui_element`)

### 📱 Phone access
- Built-in web server with QR code
- Scan the QR with your iPhone camera → instant chat from anywhere on the same Wi-Fi
- Optional: cloudflared tunnel for internet access (text Jarvis from outside your home)

### 🛠️ Self-modification
- `read_own_source` / `modify_own_source` / `list_own_source`
- Jarvis can edit its own code on request
- `rebuild_self` triggers `npm run build` in background
- `restart_self` quits & relaunches

### 🔌 Hardware control
- Arduino, ESP32, robots, microcontrollers (`list_serial_ports`, `serial_command`, `serial_open/write/read/close`)
- Full USB device introspection (`list_usb_devices`)

### 🎙️ Voice
- Talk to it (Web Speech API)
- Hears your replies (macOS TTS)

### ⌨️ Global hotkey
- `⌘ + Shift + Space` from anywhere

---

## Quick install (on your MacBook)

```bash
# Prereqs
brew install node cliclick     # cliclick = mouse control

# Clone (use your own repo URL)
cd ~/Desktop
gh repo clone YOUR_USERNAME/Jarvis-for-mac-air
cd Jarvis-for-mac-air/jarvis-desktop

# Set up your API key once
mkdir -p ~/.jarvis
echo "ANTHROPIC_API_KEY=sk-ant-..." > ~/.jarvis/.env
# (key from https://console.anthropic.com/settings/keys)

# Install + build
npm install
npm run build

# Install the .app
open dist/                     # then drag Jarvis → Applications
```

Right-click `Jarvis.app` in Applications → **Open** → **Open Anyway** (first-time Gatekeeper bypass).

Grant these macOS permissions when prompted:
- ✅ **Accessibility** (type_text, key_press, mouse)
- ✅ **Screen Recording** (see_screen)
- ✅ **Automation** (AppleScript)
- ✅ **Microphone** (voice input)

After granting once on the installed .app, **macOS never asks again**.

---

## Phone access setup

1. Launch Jarvis → press `⌘+Shift+Space`
2. Click the **📱 phone icon** in the top bar
3. Scan the QR code with your iPhone camera
4. Tap the link → bookmark to home screen → chat with Jarvis from your phone

### Internet access (text from anywhere, not just same Wi-Fi)

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:47823
```

You'll get a public `https://*.trycloudflare.com/` URL. Append `?k=YOUR_TOKEN` from the Jarvis phone panel.

---

## Sample commands to try

- *"Take a screenshot and tell me what apps are open"* — vision
- *"Open VSCode and create a new file called todo.md with my 3 priorities"* — multi-app
- *"What devices are plugged in?"* — hardware
- *"Send `M105` to /dev/cu.usbmodem1101 and read temperature"* — robot/printer
- *"Change your system prompt to be more sassy"* — self-modify
- *"Click the Refresh button in Safari"* — UI automation

---

## Modes

### YOLO mode (default ON)
Jarvis just does things — no confirmation prompts. Only catastrophic patterns (`rm -rf /`, `sudo rm`, `dd`, `mkfs`) still confirm.

To disable: `echo "YOLO=false" >> ~/.jarvis/.env` then restart.

### Voice replies
Toggle the ♪ button in the header. Uses macOS system voices.

---

## Files

```
electron/main.js          ← Tray, tools, agent loop, vision
electron/web-server.js    ← Phone HTTP server
electron/phone-ui.html    ← Mobile chat UI
electron/preload.js       ← IPC bridge
renderer/App.jsx          ← Desktop UI (Orb + transcript + tool log + phone panel)
renderer/Orb.jsx          ← Animated Jarvis orb
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Mouse tools say "cliclick not installed" | `brew install cliclick` |
| Vision blocked | System Settings → Privacy → Screen Recording → enable Jarvis |
| Phone QR shows "phone server unavailable" | Restart Jarvis (`pkill -f Jarvis && open /Applications/Jarvis.app`) |
| Doesn't respond | Check `~/.jarvis/.env` has your real `sk-ant-...` key |
| Hotkey ⌘⇧Space ignored | Grant Accessibility permission |

---

Built with ❤️ and Claude Sonnet 4.5.
