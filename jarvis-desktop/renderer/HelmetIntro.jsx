import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import helmetUrl from './assets/helmet.png';

// Phase timings (ms) per variant
const TIMINGS = {
  full: { eyesAt: 1500, titleAt: 1900, sweepAt: 2300, statusAt: 2700, flashAt: 3500, end: 4500 },
  mini: { eyesAt: 420, titleAt: 550, sweepAt: 780, statusAt: 900, flashAt: 1400, end: 1900 },
};

// Eye positions as % of the helmet image box (measured from generated asset)
const EYES = { top: '51%', left: '27.5%', right: '28%', width: '19%', height: '7.5%' };

const CSS = `
@keyframes jarvis-ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes jarvis-ring-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes jarvis-eye-flicker {
  0% { opacity: 0; } 15% { opacity: 0.9; } 25% { opacity: 0.1; } 40% { opacity: 1; }
  52% { opacity: 0.25; } 70% { opacity: 1; } 82% { opacity: 0.7; } 100% { opacity: 1; }
}
@keyframes jarvis-eye-pulse { from { filter: blur(5px) brightness(1); } to { filter: blur(7px) brightness(1.45); } }
@keyframes jarvis-sweep { from { transform: translateX(-160%) skewX(-18deg); } to { transform: translateX(320%) skewX(-18deg); } }
@keyframes jarvis-float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
@keyframes jarvis-reactor { from { opacity: 0.35; transform: scale(0.96); } to { opacity: 0.7; transform: scale(1.05); } }
`;

function Particles() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.offsetWidth);
    const h = (canvas.height = canvas.offsetHeight);
    const dots = Array.from({ length: 70 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.4 + Math.random() * 1.4,
      s: 0.15 + Math.random() * 0.5,
      c: Math.random() > 0.75 ? '255,201,115' : '103,232,249',
      a: 0.15 + Math.random() * 0.5,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.y -= d.s;
        if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.c},${d.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />;
}

export default function HelmetIntro({ variant = 'full', onComplete }) {
  const T = TIMINGS[variant] || TIMINGS.full;
  const [eyesOn, setEyesOn] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [title, setTitle] = useState(false);
  const [status, setStatus] = useState(false);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete && onComplete();
  }, [onComplete]);

  useEffect(() => {
    const timers = [
      setTimeout(() => setEyesOn(true), T.eyesAt),
      setTimeout(() => setTitle(true), T.titleAt),
      setTimeout(() => setSweep(true), T.sweepAt),
      setTimeout(() => setStatus(true), T.statusAt),
      setTimeout(() => setFlash(true), T.flashAt),
      setTimeout(finish, T.end),
    ];
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line

  const entrance = variant === 'full'
    ? { initial: { scale: 0.22, opacity: 0, rotate: -10, y: 50 }, animate: { scale: 1, opacity: 1, rotate: 0, y: 0 }, transition: { duration: 1.25, ease: [0.16, 1, 0.3, 1] } }
    : { initial: { scale: 0.75, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.35, ease: 'easeOut' } };

  return (
    <motion.div
      data-testid="helmet-intro-canvas"
      data-variant={variant}
      className="absolute inset-0 bg-black cursor-pointer select-none overflow-hidden"
      onClick={finish}
      title="Click to skip"
      animate={{ opacity: flash ? 0 : 1 }}
      transition={{ duration: flash ? (T.end - T.flashAt) / 1000 : 0.2, ease: 'easeIn', delay: flash ? 0.25 : 0 }}
    >
      <style>{CSS}</style>
      <Particles />

      {/* Ambient glow behind helmet */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.10) 0%, rgba(155,21,21,0.07) 45%, transparent 70%)' }} />

      {/* HUD rings */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-dashed border-cyan-400/30 pointer-events-none"
        style={{ animation: 'jarvis-ring-spin 14s linear infinite' }} />
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[395px] h-[395px] rounded-full border border-indigo-400/20 pointer-events-none"
        style={{ animation: 'jarvis-ring-spin-rev 22s linear infinite', borderStyle: 'dotted' }} />

      {/* Helmet */}
      <motion.div
        className="absolute left-1/2 top-[41%] pointer-events-none"
        style={{ x: '-50%', y: '-50%', width: '70%', maxWidth: 310 }}
        initial={entrance.initial}
        animate={entrance.animate}
        transition={entrance.transition}
      >
        <div className="relative w-full" style={{ animation: 'jarvis-float 5s ease-in-out infinite' }}>
          <img src={helmetUrl} alt="" className="w-full h-auto block rounded-2xl"
            style={{ maskImage: 'radial-gradient(circle at 50% 50%, black 60%, transparent 88%)', WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 60%, transparent 88%)' }} />

          {/* Eye glows */}
          {eyesOn && (
            <>
              <div className="absolute pointer-events-none" data-testid="intro-eye-left"
                style={{ top: EYES.top, left: EYES.left, width: EYES.width, height: EYES.height, borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(220,252,255,0.95) 0%, rgba(103,232,249,0.55) 45%, transparent 75%)',
                  animation: 'jarvis-eye-flicker 0.65s ease-out forwards, jarvis-eye-pulse 1.6s ease-in-out 0.65s infinite alternate' }} />
              <div className="absolute pointer-events-none" data-testid="intro-eye-right"
                style={{ top: EYES.top, right: EYES.right, width: EYES.width, height: EYES.height, borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(220,252,255,0.95) 0%, rgba(103,232,249,0.55) 45%, transparent 75%)',
                  animation: 'jarvis-eye-flicker 0.65s ease-out forwards, jarvis-eye-pulse 1.6s ease-in-out 0.65s infinite alternate' }} />
            </>
          )}

          {/* Light sweep */}
          {sweep && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl"
              style={{ maskImage: 'radial-gradient(circle at 50% 48%, black 55%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle at 50% 48%, black 55%, transparent 78%)' }}>
              <div className="absolute top-0 bottom-0 w-[34%]"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent)', mixBlendMode: 'screen',
                  animation: `jarvis-sweep ${variant === 'full' ? 0.95 : 0.6}s ease-in-out forwards` }} />
            </div>
          )}
        </div>

        {/* Reactor glow under helmet */}
        <div className="absolute left-1/2 -bottom-7 -translate-x-1/2 w-[55%] h-9 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(103,232,249,0.5) 0%, transparent 70%)', filter: 'blur(6px)',
            animation: 'jarvis-reactor 1.8s ease-in-out infinite alternate' }} />
      </motion.div>

      {/* Vignette to blend image edges into black */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 42%, transparent 42%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.95) 85%)' }} />

      {/* Title */}
      <div className="absolute inset-x-0 bottom-[9%] flex flex-col items-center gap-2.5 pointer-events-none">
        <motion.div className="text-white/95 font-mono text-xl pl-2"
          initial={{ opacity: 0, letterSpacing: '0.2em', y: 10 }}
          animate={title ? { opacity: 1, letterSpacing: '0.55em', y: 0 } : {}}
          transition={{ duration: 0.9, ease: 'easeOut' }}>
          J.A.R.V.I.S.
        </motion.div>
        <motion.div className="text-cyan-300/85 font-mono text-[10px] tracking-[0.35em]"
          initial={{ opacity: 0 }} animate={status ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
          ALL SYSTEMS ONLINE
        </motion.div>
      </div>

      {/* Flash */}
      {flash && (
        <motion.div className="absolute inset-0 bg-white pointer-events-none"
          initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0] }} transition={{ duration: 0.55, times: [0, 0.35, 1] }} />
      )}

      <div className="absolute bottom-3 inset-x-0 text-center text-[9px] font-mono text-white/25 pointer-events-none">click to skip</div>
    </motion.div>
  );
}
