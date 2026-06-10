import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Orb({ state = 'idle' }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
      <motion.div
        className="absolute inset-0 rounded-full blur-3xl"
        animate={{
          background:
            state === 'thinking'
              ? 'radial-gradient(circle, rgba(129,140,248,0.6) 0%, transparent 70%)'
              : state === 'speaking'
              ? 'radial-gradient(circle, rgba(56,189,248,0.65) 0%, transparent 70%)'
              : state === 'listening'
              ? 'radial-gradient(circle, rgba(167,243,208,0.5) 0%, transparent 70%)'
              : state === 'tool'
              ? 'radial-gradient(circle, rgba(251,191,36,0.55) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(56,189,248,0.3) 0%, transparent 70%)',
          opacity: state === 'idle' ? [0.4, 0.65, 0.4] : 0.9,
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <AnimatePresence>
        {state === 'listening' &&
          [0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-cyan-300/40"
              style={{ width: 200, height: 200 }}
              initial={{ scale: 0.9, opacity: 0.7 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
            />
          ))}
      </AnimatePresence>
      {state === 'thinking' && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 220, height: 220,
            background: 'conic-gradient(from 0deg, transparent 0%, #38bdf8 25%, transparent 50%, #818cf8 75%, transparent 100%)',
            mask: 'radial-gradient(circle, transparent 60%, black 62%, black 100%)',
            WebkitMask: 'radial-gradient(circle, transparent 60%, black 62%, black 100%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <motion.div
        className="relative rounded-full overflow-hidden"
        style={{
          width: 160, height: 160,
          background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #bae6fd 25%, #38bdf8 60%, #0c4a6e 100%)',
          boxShadow: '0 0 60px rgba(56,189,248,0.6), inset 0 0 40px rgba(255,255,255,0.3), inset 0 -20px 40px rgba(8,47,73,0.7)',
        }}
        animate={{
          scale: state === 'speaking' ? [1, 1.06, 0.97, 1.04, 1]
            : state === 'thinking' ? [1, 1.02, 1]
            : state === 'tool' ? [1, 1.05, 1]
            : [0.97, 1.02, 0.97],
        }}
        transition={{ duration: state === 'speaking' ? 0.6 : state === 'thinking' ? 1.5 : 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle at 70% 70%, rgba(129,140,248,0.4) 0%, transparent 40%)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute rounded-full bg-white/60 blur-md" style={{ width: 40, height: 30, top: 25, left: 35 }} />
      </motion.div>
      <div className="absolute rounded-full border border-white/10" style={{ width: 260, height: 260 }} />
    </div>
  );
}
