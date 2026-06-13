import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HelmetTrailer({ onComplete }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      onComplete?.();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
        >
          {/* Iron Man Helmet Animation */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              transition: { duration: 1.5, ease: "easeOut" }
            }}
            className="relative"
          >
            {/* Helmet Container */}
            <div className="w-64 h-64 relative">
              {/* Eyes glow effect */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: [0, 1, 0.8, 1],
                  transition: { delay: 1, duration: 1 }
                }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="w-8 h-4 bg-cyan-400 blur-xl absolute left-16 top-28" />
                <div className="w-8 h-4 bg-cyan-400 blur-xl absolute right-16 top-28" />
              </motion.div>

              {/* Helmet outline */}
              <motion.div
                initial={{ pathLength: 0 }}
                animate={{ 
                  pathLength: 1,
                  transition: { duration: 2, ease: "easeInOut" }
                }}
                className="absolute inset-0"
              >
                <svg viewBox="0 0 256 256" className="w-full h-full">
                  <motion.path
                    d="M 128 40 L 160 80 L 180 120 L 180 180 L 160 220 L 128 240 L 96 220 L 76 180 L 76 120 L 96 80 Z"
                    fill="none"
                    stroke="url(#grad1)"
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                  />
                  <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#fbbf24', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#dc2626', stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                </svg>
              </motion.div>

              {/* Faceplate opening animation */}
              <motion.div
                initial={{ rotateX: 0 }}
                animate={{ 
                  rotateX: 45,
                  transition: { delay: 2, duration: 0.8, ease: "easeInOut" }
                }}
                className="absolute inset-x-0 top-0 h-1/2 border border-amber-400/30 rounded-t-full backdrop-blur-sm bg-gradient-to-b from-amber-500/20 to-transparent"
                style={{ transformOrigin: 'bottom center', transformStyle: 'preserve-3d' }}
              />

              {/* JARVIS text appears */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 3, duration: 0.5 }
                }}
                className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
              >
                <div className="text-3xl font-bold tracking-[0.3em] text-cyan-400">
                  JARVIS
                </div>
                <div className="text-xs tracking-[0.2em] text-white/40 mt-2">
                  JUST A RATHER VERY INTELLIGENT SYSTEM
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Particle effects */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: '50vw', 
                  y: '50vh', 
                  opacity: 0,
                  scale: 0
                }}
                animate={{ 
                  x: `${Math.random() * 100}vw`,
                  y: `${Math.random() * 100}vh`,
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                  transition: { 
                    delay: 1 + Math.random() * 2,
                    duration: 2,
                    ease: "easeOut"
                  }
                }}
                className="absolute w-1 h-1 bg-cyan-400 rounded-full"
                style={{ 
                  boxShadow: '0 0 10px 2px rgba(34, 211, 238, 0.8)'
                }}
              />
            ))}
          </div>

          {/* Skip button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            whileHover={{ opacity: 1 }}
            onClick={() => {
              setShow(false);
              onComplete?.();
            }}
            className="absolute bottom-8 right-8 text-xs text-white/40 hover:text-white/80 uppercase tracking-wider"
          >
            Skip (ESC)
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
