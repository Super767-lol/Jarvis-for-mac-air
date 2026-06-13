import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const response = await fetch('http://localhost:3000/api/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setOnline(data.online);
    } catch (error) {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-[9px] uppercase tracking-wider font-mono text-orange-300">
            Offline Mode
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
