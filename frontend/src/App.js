import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import Orb from "./components/Orb";
import {
  Gear,
  Microphone,
  MicrophoneSlash,
  PaperPlaneTilt,
  Trash,
  Keyboard,
  Sparkle,
  ArrowUpRight,
  X,
} from "@phosphor-icons/react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_LABEL = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export default function App() {
  const [sessionId] = useState(
    () => localStorage.getItem("jarvis_sid") || crypto.randomUUID()
  );
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState("idle"); // idle | listening | thinking | speaking
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const [amplitude] = useState(0);
  const [toolLog, setToolLog] = useState([
    { t: "boot", m: "jarvis.core initialized" },
    { t: "info", m: "claude-sonnet-4-5 online" },
    { t: "info", m: "awaiting user input…" },
  ]);

  const transcriptRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== "undefined" ? window.speechSynthesis : null);

  useEffect(() => {
    localStorage.setItem("jarvis_sid", sessionId);
  }, [sessionId]);

  // Init Web Speech API
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      setMicSupported(true);
      const r = new SR();
      r.continuous = false;
      r.interimResults = false;
      r.lang = "en-US";
      r.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        handleSend(transcript);
      };
      r.onend = () => setState((s) => (s === "listening" ? "idle" : s));
      r.onerror = () => setState("idle");
      recognitionRef.current = r;
    }
  }, []); // eslint-disable-line

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, toolLog]);

  const pushLog = (t, m) =>
    setToolLog((prev) => [...prev.slice(-30), { t, m, ts: Date.now() }]);

  const speak = (text) => {
    if (!voiceEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 0.95;
    const voices = synthRef.current.getVoices();
    const preferred =
      voices.find((v) => /samantha|daniel|karen|alex/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (preferred) u.voice = preferred;
    u.onstart = () => setState("speaking");
    u.onend = () => setState("idle");
    synthRef.current.speak(u);
  };

  const handleSend = useCallback(
    async (text) => {
      const content = (text ?? input).trim();
      if (!content) return;
      setInput("");
      const userMsg = { id: crypto.randomUUID(), role: "user", content };
      setMessages((m) => [...m, userMsg]);
      pushLog("user", `> ${content.slice(0, 80)}`);
      setState("thinking");

      const assistantId = crypto.randomUUID();
      setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);

      try {
        const res = await fetch(`${API}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, message: content }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.type === "delta") {
                full += payload.content;
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId ? { ...msg, content: full } : msg
                  )
                );
              } else if (payload.type === "done") {
                pushLog("ok", "response complete");
                speak(full);
              } else if (payload.type === "error") {
                pushLog("err", payload.message);
              }
            } catch {/* ignore */}
          }
        }
        if (!voiceEnabled) setState("idle");
      } catch (e) {
        pushLog("err", `stream failed: ${e.message}`);
        setState("idle");
      }
    },
    [input, sessionId, voiceEnabled] // eslint-disable-line
  );

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (state === "listening") {
      recognitionRef.current.stop();
      setState("idle");
    } else {
      try {
        recognitionRef.current.start();
        setState("listening");
        pushLog("mic", "listening for voice input…");
      } catch {/* already running */}
    }
  };

  const clearChat = async () => {
    setMessages([]);
    setToolLog([{ t: "info", m: "session cleared" }]);
    try { await axios.delete(`${API}/chat/history/${sessionId}`); } catch {}
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center mesh-bg grain relative">
      {/* Floating menu-bar context badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        web preview · live
      </motion.div>

      {/* Main Jarvis window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="relative w-[420px] h-[640px] bg-[#09090b]/60 backdrop-blur-3xl rounded-[36px] border border-white/[0.08] shadow-[0_0_120px_rgba(0,0,0,0.9),0_0_60px_rgba(56,189,248,0.08)] overflow-hidden flex flex-col"
        data-testid="jarvis-window"
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkle weight="fill" className="text-cyan-300" size={14} />
            <span className="text-[11px] uppercase tracking-[0.3em] font-mono text-white/50">
              JARVIS
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              data-testid="transcript-toggle-btn"
              onClick={() => setShowTranscript((v) => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Transcript"
            >
              <Keyboard weight="duotone" size={16} />
            </button>
            <button
              data-testid="settings-btn"
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Settings"
            >
              <Gear weight="duotone" size={16} />
            </button>
          </div>
        </div>

        {/* Orb area */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <Orb state={state} amplitude={amplitude} />
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-6 text-[11px] uppercase tracking-[0.3em] font-mono"
          >
            {state === "thinking" ? (
              <span className="shimmer-text">{STATUS_LABEL[state]}</span>
            ) : (
              <span className="text-white/40">{STATUS_LABEL[state]}</span>
            )}
          </motion.div>
        </div>

        {/* Transcript panel (overlay) */}
        <AnimatePresence>
          {showTranscript && (
            <motion.div
              data-testid="transcript-panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="absolute inset-x-0 top-14 bottom-32 bg-black/60 backdrop-blur-xl border-t border-white/5 px-6 py-4 overflow-y-auto flex flex-col gap-3 z-20"
              ref={transcriptRef}
            >
              {messages.length === 0 && (
                <div className="text-center text-white/30 text-xs font-mono mt-10">
                  no messages yet · say hi
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "self-end bg-white/10 border border-white/5 text-white text-sm px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]"
                      : "self-start text-white/85 text-sm py-2 max-w-[90%] font-light leading-relaxed"
                  }
                >
                  {m.content || (
                    <span className="text-white/30 italic">…</span>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tool / log feed (when transcript closed) */}
        {!showTranscript && (
          <div
            data-testid="tool-log-feed"
            className="h-28 bg-black/40 border-t border-white/5 px-6 py-3 overflow-y-auto font-mono text-[11px] text-white/50 flex flex-col gap-1"
          >
            {toolLog.slice(-6).map((l, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2"
              >
                <span
                  className={
                    l.t === "err"
                      ? "text-red-400/80"
                      : l.t === "ok"
                      ? "text-emerald-400/80"
                      : l.t === "user"
                      ? "text-cyan-300/70"
                      : "text-white/40"
                  }
                >
                  [{l.t}]
                </span>
                <span className="truncate">{l.m}</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Status bar — input */}
        <div className="h-16 px-4 flex items-center gap-2 bg-white/[0.02] border-t border-white/5 shrink-0">
          <button
            data-testid="mic-toggle-btn"
            onClick={toggleMic}
            disabled={!micSupported}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
              state === "listening"
                ? "bg-cyan-400/20 text-cyan-300 ring-2 ring-cyan-400/40"
                : "text-white/60 hover:text-white hover:bg-white/10"
            } ${!micSupported && "opacity-30 cursor-not-allowed"}`}
            title={micSupported ? "Talk to Jarvis" : "Mic not supported in this browser"}
          >
            {micSupported ? (
              <Microphone weight="duotone" size={18} />
            ) : (
              <MicrophoneSlash weight="duotone" size={18} />
            )}
          </button>

          <input
            data-testid="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Jarvis anything…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none font-light"
          />

          {input.trim() && (
            <button
              data-testid="send-btn"
              onClick={() => handleSend()}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:scale-95 transition-all"
            >
              <PaperPlaneTilt weight="fill" size={14} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Bottom CTA — Get the Mac app */}
      <motion.a
        href="#download"
        onClick={(e) => {
          e.preventDefault();
          setShowSettings(true);
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
        data-testid="get-mac-app-btn"
      >
        <span>install the macOS menu-bar app</span>
        <ArrowUpRight weight="bold" size={12} />
      </motion.a>

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-6"
            onClick={() => setShowSettings(false)}
            data-testid="settings-modal"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[480px] max-h-[80vh] overflow-y-auto bg-[#09090b]/95 backdrop-blur-3xl rounded-3xl border border-white/10 p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-light tracking-tight">Install Jarvis on your Mac</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
                  data-testid="close-settings-btn"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-sm text-white/70 font-light leading-relaxed">
                <p>
                  This preview shows the UI. To get the <span className="text-white">real menu-bar app</span> with
                  computer control & global hotkey on your MacBook Air, run these commands in Terminal:
                </p>

                <pre className="bg-black/60 border border-white/10 rounded-xl p-4 text-xs font-mono text-cyan-200/90 overflow-x-auto">
{`# 1. Clone or download /app/jarvis-desktop folder
cd ~/Downloads/jarvis-desktop

# 2. Install deps
npm install

# 3. Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 4. Run dev
npm start

# 5. Build .dmg installer
npm run build`}
                </pre>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Hotkey</div>
                    <div className="font-mono">⌘ + Shift + Space</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Powered by</div>
                    <div>Claude Sonnet 4.5</div>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white">Voice replies</div>
                      <div className="text-white/40 text-xs">Use your Mac's text-to-speech</div>
                    </div>
                    <button
                      data-testid="voice-toggle-btn"
                      onClick={() => setVoiceEnabled((v) => !v)}
                      className={`w-12 h-6 rounded-full transition-colors ${voiceEnabled ? "bg-cyan-400" : "bg-white/10"}`}
                    >
                      <motion.div
                        animate={{ x: voiceEnabled ? 24 : 2 }}
                        className="w-5 h-5 rounded-full bg-white"
                      />
                    </button>
                  </div>
                </div>

                <button
                  onClick={clearChat}
                  className="flex items-center gap-2 text-red-400/70 hover:text-red-400 text-xs"
                  data-testid="clear-chat-btn"
                >
                  <Trash size={12} /> clear conversation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
