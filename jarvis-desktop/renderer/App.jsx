import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Orb from './Orb.jsx';

const STATUS = { idle: 'Ready', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', tool: 'Working…' };

export default function App() {
  const [sessionId] = useState(() => localStorage.getItem('jarvis_sid') || crypto.randomUUID());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [state, setState] = useState('idle');
  const [showTranscript, setShowTranscript] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hasKey, setHasKey] = useState(true);
  const [toolLog, setToolLog] = useState([
    { t: 'boot', m: 'jarvis.core initialized' },
    { t: 'info', m: 'claude-sonnet-4-5 online' },
    { t: 'info', m: 'hotkey: ⌘⇧Space' },
  ]);

  const transcriptRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const watchdogRef = useRef(null);

  const armWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      pushLog('err', 'no response in 60s — reset');
      setState('idle');
    }, 60000);
  };
  const clearWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };

  useEffect(() => { localStorage.setItem('jarvis_sid', sessionId); }, [sessionId]);

  useEffect(() => {
    window.jarvis.hasKey().then(setHasKey);
  }, []);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.continuous = false; r.interimResults = false; r.lang = 'en-US';
      r.onresult = (e) => handleSend(e.results[0][0].transcript);
      r.onend = () => setState((s) => (s === 'listening' ? 'idle' : s));
      r.onerror = () => setState('idle');
      recognitionRef.current = r;
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, toolLog]);

  const pushLog = (t, m) => setToolLog((p) => [...p.slice(-30), { t, m, ts: Date.now() }]);

  const speak = (text) => {
    if (!voiceEnabled || !text) return;
    synthRef.current.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 0.95;
    const voices = synthRef.current.getVoices();
    const pref = voices.find((v) => /samantha|daniel|karen|alex/i.test(v.name)) || voices.find((v) => v.lang.startsWith('en'));
    if (pref) u.voice = pref;
    u.onstart = () => setState('speaking');
    u.onend = () => setState('idle');
    synthRef.current.speak(u);
  };

  useEffect(() => {
    const off = window.jarvis.onEvent((ev) => {
      armWatchdog();
      if (ev.type === 'delta') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last && last.role === 'assistant' && !last.done) {
            return [...m.slice(0, -1), { ...last, content: last.content + ev.content }];
          }
          return [...m, { id: crypto.randomUUID(), role: 'assistant', content: ev.content }];
        });
      } else if (ev.type === 'status') setState(ev.state);
      else if (ev.type === 'tool_start') { setState('tool'); pushLog('tool', `→ ${ev.name}`); }
      else if (ev.type === 'tool_call') pushLog('tool', `${ev.name}(${JSON.stringify(ev.input).slice(0, 80)})`);
      else if (ev.type === 'tool_result') pushLog(ev.result.error ? 'err' : 'ok', `${ev.name} ${ev.result.error ? '✗ ' + ev.result.error.slice(0, 60) : '✓'}`);
      else if (ev.type === 'done') {
        clearWatchdog();
        setMessages((m) => {
          if (!m.length) return m;
          const last = m[m.length - 1];
          if (last.role === 'assistant') speak(last.content);
          return m.map((x, i) => (i === m.length - 1 ? { ...x, done: true } : x));
        });
        pushLog('ok', 'task complete');
        if (!voiceEnabled) setState('idle');
      }
      else if (ev.type === 'error') { clearWatchdog(); pushLog('err', ev.message); setState('idle'); }
    });
    return off;
  }, [voiceEnabled]);

  const handleSend = useCallback((textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    setInput('');
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: text }]);
    pushLog('user', `> ${text.slice(0, 80)}`);
    armWatchdog();
    window.jarvis.send(sessionId, text);
  }, [input, sessionId]);

  const resetConversation = async () => {
    await window.jarvis.reset({ sessionId });
    setMessages([]);
    setToolLog([{ t: 'info', m: 'conversation reset' }]);
    setState('idle');
    clearWatchdog();
  };

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (state === 'listening') { recognitionRef.current.stop(); setState('idle'); }
    else { try { recognitionRef.current.start(); setState('listening'); pushLog('mic', 'listening…'); } catch {} }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center p-2">
      <div className="relative w-full h-full bg-[#09090b]/55 backdrop-blur-3xl rounded-[28px] border border-white/[0.08] shadow-[0_0_120px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.3em] font-mono text-white/50">JARVIS</span>
          </div>
          <div className="flex items-center gap-1" data-no-drag>
            <button onClick={resetConversation} title="Reset conversation"
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 text-xs">↻</button>
            <button onClick={() => setShowTranscript((v) => !v)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 text-xs">⌨</button>
            <button onClick={() => setVoiceEnabled((v) => !v)}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${voiceEnabled ? 'text-cyan-300' : 'text-white/30'} hover:bg-white/10`}>♪</button>
            <button onClick={() => window.jarvis.hide()}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 text-xs">×</button>
          </div>
        </div>

        {!hasKey && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-xs text-red-300">
            Missing <code className="font-mono">ANTHROPIC_API_KEY</code> in .env — see README
          </div>
        )}

        {/* Orb */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <Orb state={state} />
          <div className="absolute bottom-4 text-[10px] uppercase tracking-[0.3em] font-mono">
            {state === 'thinking' || state === 'tool'
              ? <span className="shimmer-text">{STATUS[state]}</span>
              : <span className="text-white/40">{STATUS[state]}</span>}
          </div>
        </div>

        {/* Transcript overlay */}
        <AnimatePresence>
          {showTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="absolute inset-x-0 top-12 bottom-28 bg-black/70 backdrop-blur-xl border-t border-white/5 px-5 py-4 overflow-y-auto flex flex-col gap-2 z-20"
              ref={transcriptRef} data-no-drag
            >
              {messages.length === 0 && <div className="text-center text-white/30 text-xs font-mono mt-8">no messages yet</div>}
              {messages.map((m) => (
                <div key={m.id} className={m.role === 'user'
                  ? 'self-end bg-white/10 border border-white/5 text-white text-sm px-3 py-1.5 rounded-2xl rounded-tr-sm max-w-[80%]'
                  : 'self-start text-white/85 text-sm py-1 max-w-[90%] font-light leading-relaxed whitespace-pre-wrap'
                }>{m.content || <span className="text-white/30 italic">…</span>}</div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tool log */}
        {!showTranscript && (
          <div className="h-24 bg-black/40 border-t border-white/5 px-5 py-2 overflow-y-auto font-mono text-[10px] text-white/50 flex flex-col gap-0.5">
            {toolLog.slice(-6).map((l, i) => (
              <motion.div key={`${l.ts}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                <span className={
                  l.t === 'err' ? 'text-red-400/80'
                  : l.t === 'ok' ? 'text-emerald-400/80'
                  : l.t === 'user' ? 'text-cyan-300/70'
                  : l.t === 'tool' ? 'text-amber-300/80'
                  : 'text-white/40'
                }>[{l.t}]</span>
                <span className="truncate">{l.m}</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="h-14 px-3 flex items-center gap-2 bg-white/[0.02] border-t border-white/5 shrink-0" data-no-drag>
          <button onClick={toggleMic} className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            state === 'listening' ? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/40' : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}>🎤</button>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Jarvis anything…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none font-light"
          />
          {input.trim() && (
            <button onClick={() => handleSend()} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:scale-95">→</button>
          )}
        </div>
      </div>
    </div>
  );
}
