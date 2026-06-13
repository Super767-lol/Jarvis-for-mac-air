import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Constants ───────────────────────────────────────────────────────────────
const SESSION_DURATION_MS = 15 * 60 * 1000;  // 15 minutes
const UPDATE_INTERVAL_MS  =  5 * 60 * 1000;  //  5 minutes
const SEARCH_QUERIES = [
  'MLS Next Pro U15 academy scout contact email 2024 2025',
  'MLS academy director of scouting U15 youth contact',
  'US Soccer development academy U15 scout recruitment contact',
  'LA Galaxy academy U15 scout tryout contact',
  'NYCFC youth academy U15 scout contact email',
  'Atlanta United academy U15 scouting staff contact',
  'Portland Timbers U15 academy scout recruitment',
  'Seattle Sounders youth U15 academy scouting contact',
  'Toronto FC academy U15 scout tryout contact information',
  'Inter Miami CF youth U15 academy scout contact',
];

// ─── Utility ─────────────────────────────────────────────────────────────────
function formatTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function IdleMode({ onUpdate, onComplete }) {
  const [active,        setActive]        = useState(false);
  const [sessionTimeMs, setSessionTimeMs] = useState(SESSION_DURATION_MS);
  const [nextUpdateMs,  setNextUpdateMs]  = useState(UPDATE_INTERVAL_MS);
  const [results,       setResults]       = useState([]);
  const [currentQuery,  setCurrentQuery]  = useState('');
  const [searching,     setSearching]     = useState(false);
  const [updateCount,   setUpdateCount]   = useState(0);
  const [sessionDone,   setSessionDone]   = useState(false);

  const sessionTimerRef = useRef(null);
  const updateTimerRef  = useRef(null);
  const tickRef         = useRef(null);
  const queryIndexRef   = useRef(0);

  // ── Trigger a search via the Jarvis agent ──────────────────────────────
  const runSearch = useCallback(async () => {
    if (!active) return;
    const query = SEARCH_QUERIES[queryIndexRef.current % SEARCH_QUERIES.length];
    queryIndexRef.current += 1;
    setCurrentQuery(query);
    setSearching(true);

    const prompt = `[IDLE MODE SEARCH ${queryIndexRef.current}/${SEARCH_QUERIES.length}]
You are running an automated background search. Do NOT chat — just search and report.

Task: Find contact information for scouts or academy directors at MLS pro soccer academies for U15 youth players.
Search query: "${query}"

Use web_fetch or run_shell with curl to search. Collect:
- Name and title of scout/director
- Club/academy name
- Email or contact method
- Any tryout or recruitment info

Return results as a concise list. If no direct contacts found, note what you found and the best next step.
Mark this as: UPDATE #${queryIndexRef.current} | ${formatTimestamp()}`;

    try {
      onUpdate?.(prompt, (result) => {
        setResults(prev => [{
          id:        Date.now(),
          updateNum: queryIndexRef.current,
          query,
          result,
          timestamp: formatTimestamp(),
        }, ...prev].slice(0, 20));
        setSearching(false);
        setUpdateCount(c => c + 1);
        setNextUpdateMs(UPDATE_INTERVAL_MS);
      });
    } catch (e) {
      setResults(prev => [{
        id:        Date.now(),
        updateNum: queryIndexRef.current,
        query,
        result:    `Error: ${e.message}`,
        timestamp: formatTimestamp(),
        error:     true,
      }, ...prev].slice(0, 20));
      setSearching(false);
    }
  }, [active, onUpdate]);

  // ── Start session ──────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    setActive(true);
    setSessionDone(false);
    setSessionTimeMs(SESSION_DURATION_MS);
    setNextUpdateMs(UPDATE_INTERVAL_MS);
    setResults([]);
    setUpdateCount(0);
    queryIndexRef.current = 0;
  }, []);

  // ── Stop session ───────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    setActive(false);
    clearInterval(sessionTimerRef.current);
    clearInterval(updateTimerRef.current);
    clearInterval(tickRef.current);
    setSearching(false);
  }, []);

  // ── Session lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    // Run first search immediately
    runSearch();

    // Tick every second for countdown
    tickRef.current = setInterval(() => {
      setSessionTimeMs(prev => {
        if (prev <= 1000) return 0;
        return prev - 1000;
      });
      setNextUpdateMs(prev => {
        if (prev <= 1000) return UPDATE_INTERVAL_MS;
        return prev - 1000;
      });
    }, 1000);

    // Periodic search updates
    updateTimerRef.current = setInterval(() => {
      runSearch();
    }, UPDATE_INTERVAL_MS);

    // Session end
    sessionTimerRef.current = setTimeout(() => {
      setActive(false);
      setSessionDone(true);
      clearInterval(tickRef.current);
      clearInterval(updateTimerRef.current);
      onComplete?.();
    }, SESSION_DURATION_MS);

    return () => {
      clearInterval(tickRef.current);
      clearInterval(updateTimerRef.current);
      clearTimeout(sessionTimerRef.current);
    };
  }, [active]); // eslint-disable-line

  // ── Progress bar width ─────────────────────────────────────────────────
  const sessionPct    = ((SESSION_DURATION_MS - sessionTimeMs) / SESSION_DURATION_MS) * 100;
  const nextUpdatePct = ((UPDATE_INTERVAL_MS  - nextUpdateMs)  / UPDATE_INTERVAL_MS)  * 100;

  return (
    <div className="flex flex-col h-full text-white font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : sessionDone ? 'bg-amber-400' : 'bg-white/20'}`} />
          <span className="text-[10px] tracking-[0.3em] uppercase text-white/60">
            {active ? 'IDLE SCAN ACTIVE' : sessionDone ? 'SESSION COMPLETE' : 'IDLE MODE'}
          </span>
        </div>
        {active && (
          <button
            onClick={stopSession}
            className="text-[9px] tracking-[0.2em] text-red-400/70 hover:text-red-300 uppercase"
          >
            STOP
          </button>
        )}
      </div>

      {/* Mission brief */}
      <div className="px-4 py-2 border-b border-white/5 bg-black/20">
        <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Mission</div>
        <div className="text-[10px] text-cyan-300/80 leading-relaxed">
          Scanning for U15 MLS pro soccer academy scout contacts
        </div>
      </div>

      {/* Timers */}
      {active && (
        <div className="px-4 py-3 border-b border-white/5 space-y-2.5">
          {/* Session */}
          <div>
            <div className="flex justify-between text-[9px] text-white/40 mb-1">
              <span>SESSION</span>
              <span className={sessionTimeMs < 60000 ? 'text-amber-400' : 'text-white/40'}>
                {formatTime(sessionTimeMs)} remaining
              </span>
            </div>
            <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-400/70 rounded-full"
                style={{ width: `${sessionPct}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Next update */}
          <div>
            <div className="flex justify-between text-[9px] text-white/40 mb-1">
              <span>NEXT SCAN</span>
              <span className={searching ? 'text-cyan-400 animate-pulse' : 'text-white/40'}>
                {searching ? 'SCANNING…' : formatTime(nextUpdateMs)}
              </span>
            </div>
            <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${searching ? 'bg-cyan-400' : 'bg-cyan-400/40'}`}
                style={{ width: searching ? '100%' : `${nextUpdatePct}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Update count */}
          <div className="text-[9px] text-white/30">
            {updateCount} scan{updateCount !== 1 ? 's' : ''} completed · {SEARCH_QUERIES.length} total queries
          </div>
        </div>
      )}

      {/* Current query */}
      {searching && currentQuery && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 py-2 bg-cyan-400/5 border-b border-cyan-400/10"
        >
          <div className="text-[9px] text-cyan-400/60 uppercase tracking-widest mb-0.5">Searching</div>
          <div className="text-[10px] text-white/60 leading-relaxed truncate">{currentQuery}</div>
        </motion.div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <AnimatePresence>
          {results.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg p-3 border text-[10px] leading-relaxed ${
                r.error
                  ? 'bg-red-400/5 border-red-400/20'
                  : 'bg-white/[0.03] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-cyan-400/70 uppercase tracking-widest">
                  Update #{r.updateNum}
                </span>
                <span className="text-[9px] text-white/30">{r.timestamp}</span>
              </div>
              <div className="text-[9px] text-white/30 mb-1.5 truncate">⟵ {r.query}</div>
              <div className="text-white/70 whitespace-pre-wrap">{r.result}</div>
            </motion.div>
          ))}
        </AnimatePresence>

        {results.length === 0 && !active && !sessionDone && (
          <div className="text-center py-6 text-white/25 text-[10px] tracking-widest">
            START SESSION TO BEGIN SCANNING
          </div>
        )}

        {sessionDone && results.length > 0 && (
          <div className="text-center py-3 text-amber-400/60 text-[10px] tracking-widest border-t border-white/5 mt-2">
            SESSION COMPLETE · {updateCount} SCANS · {results.length} RESULTS COLLECTED
          </div>
        )}
      </div>

      {/* Start / restart button */}
      {!active && (
        <div className="p-3 border-t border-white/5">
          <button
            onClick={startSession}
            className={`w-full py-2.5 rounded-lg text-[10px] tracking-[0.3em] uppercase font-mono
              transition-all duration-200 border
              ${sessionDone
                ? 'border-amber-400/30 text-amber-300/80 hover:bg-amber-400/10'
                : 'border-cyan-400/30 text-cyan-300/80 hover:bg-cyan-400/10'
              }`}
          >
            {sessionDone ? '↺ NEW SESSION' : '▶ START 15-MIN SCAN'}
          </button>
          <div className="text-center mt-1.5 text-[9px] text-white/20 tracking-widest">
            5 SCANS · 15 MIN · AUTO-STOP
          </div>
        </div>
      )}
    </div>
  );
}
