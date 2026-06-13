import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function GoalsReminder({ onClose }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load goals from memory/goals.md or localStorage
    const loadGoals = async () => {
      try {
        const stored = localStorage.getItem('jarvis_goals');
        if (stored) {
          setGoals(JSON.parse(stored));
        } else {
          // Default goals if none set
          setGoals([
            { text: 'Dominate your day', done: false },
            { text: 'Build something legendary', done: false },
            { text: 'Don't settle for average', done: false }
          ]);
        }
      } catch (err) {
        console.error('Failed to load goals:', err);
      }
      setLoading(false);
    };
    loadGoals();
  }, []);

  const toggleGoal = (idx) => {
    const updated = [...goals];
    updated[idx].done = !updated[idx].done;
    setGoals(updated);
    localStorage.setItem('jarvis_goals', JSON.stringify(updated));
  };

  if (loading) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/90 backdrop-blur-2xl flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-gradient-to-b from-cyan-950/40 to-black/60 border border-cyan-500/30 rounded-2xl p-8 max-w-md w-full mx-4 shadow-[0_0_80px_rgba(34,211,238,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-mono tracking-wider text-cyan-300">MISSION BRIEF</h2>
            <div className="text-[10px] text-white/40 uppercase tracking-[0.3em] mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Goals */}
        <div className="space-y-3 mb-6">
          {goals.length === 0 ? (
            <div className="text-white/40 text-sm font-mono text-center py-8">
              No goals set. Ask me to "remember my goals" to add them.
            </div>
          ) : (
            goals.map((goal, idx) => (
              <motion.div
                key={idx}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center gap-3 group cursor-pointer"
                onClick={() => toggleGoal(idx)}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  goal.done 
                    ? 'border-emerald-400 bg-emerald-400/20' 
                    : 'border-cyan-400/40 group-hover:border-cyan-400'
                }`}>
                  {goal.done && (
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className={`flex-1 font-mono text-sm transition-all ${
                  goal.done 
                    ? 'text-white/30 line-through' 
                    : 'text-white/90 group-hover:text-cyan-300'
                }`}>
                  {goal.text}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Action button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 font-mono text-sm uppercase tracking-widest transition-all"
        >
          Let's Go →
        </button>

        {/* Stats footer */}
        <div className="mt-6 pt-4 border-t border-white/5 flex justify-between text-[10px] font-mono text-white/30 uppercase tracking-wider">
          <span>{goals.filter(g => g.done).length}/{goals.length} Complete</span>
          <span>No Excuses</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
