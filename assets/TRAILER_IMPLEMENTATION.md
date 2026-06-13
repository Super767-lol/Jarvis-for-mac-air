# JARVIS Trailer Implementation Guide

## Iron Man Helmet Opening Sequence

### Implementation Plan

**When JARVIS launches**, show a **5-second cinematic intro**:
1. Black screen fades in
2. Iron Man helmet materializes with particles
3. Eyes glow blue (arc reactor style)
4. Faceplate opens with mechanical sound
5. Fade to main JARVIS interface

---

## Frontend Integration

### File: `jarvis-desktop/renderer/HelmetIntro.jsx`

```jsx
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
            {/* Helmet SVG or 3D Model */}
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

              {/* Faceplate opening animation */}
              <motion.div
                initial={{ rotateX: 0 }}
                animate={{ 
                  rotateX: 45,
                  transition: { delay: 2, duration: 0.8, ease: "easeInOut" }
                }}
                className="absolute inset-x-0 top-0 h-1/2 border border-amber-400/30 rounded-t-full"
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
                className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center"
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
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(20)].map((_, i) => (
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
                  scale: [0, 1, 0],
                  transition: { 
                    delay: 1 + Math.random() * 2,
                    duration: 2,
                    ease: "easeOut"
                  }
                }}
                className="absolute w-1 h-1 bg-cyan-400 rounded-full"
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

## Integration with Main App

### Update `App.jsx`:

```jsx
import HelmetTrailer from './HelmetTrailer.jsx';

// In your App component:
const [showTrailer, setShowTrailer] = useState(() => {
  const shown = localStorage.getItem('jarvis_trailer_shown');
  return !shown; // Only show on first launch
});

return (
  <>
    {showTrailer && (
      <HelmetTrailer 
        onComplete={() => {
          setShowTrailer(false);
          localStorage.setItem('jarvis_trailer_shown', 'true');
        }} 
      />
    )}
    {/* Rest of your app */}
  </>
);
```

---

## Audio Assets (Optional)

Add to `jarvis-desktop/public/audio/`:
- `helmet_open.mp3` - Mechanical servo sounds
- `jarvis_boot.mp3` - "Systems online" voice line
- `arc_reactor_hum.mp3` - Low frequency hum

Play with Web Audio API during trailer.

---

## 3D Asset Alternative

If you want actual 3D helmet model:
1. Download Iron Man helmet GLB/GLTF from Sketchfab
2. Use `@react-three/fiber` + `@react-three/drei`
3. Render with Three.js in the trailer component

```bash
npm install three @react-three/fiber @react-three/drei
```

---

## Production Notes

- Only show trailer on **first app launch**
- Store flag in localStorage: `jarvis_trailer_shown`
- Add skip button (ESC key) for returning users
- Preload assets to avoid loading flicker
- Total duration: 5 seconds
