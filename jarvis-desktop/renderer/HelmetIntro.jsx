import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import modelUrl from './assets/ironman.glb?url';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Keyframe timings (seconds) per variant
const TIMINGS = {
  full: { spinEnd: 1.6, eyesStart: 1.4, eyesEnd: 2.2, zoomStart: 2.2, zoomEnd: 3.5, flashStart: 3.6, end: 4.5, titleAt: 1800, statusAt: 2700 },
  mini: { spinEnd: 0.5, eyesStart: 0.35, eyesEnd: 0.75, zoomStart: 0.7, zoomEnd: 1.4, flashStart: 1.45, end: 1.9, titleAt: 350, statusAt: 750 },
};

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(200,252,255,1)');
  g.addColorStop(0.35, 'rgba(110,220,255,0.5)');
  g.addColorStop(1, 'rgba(0,140,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export default function HelmetIntro({ variant = 'full', onComplete }) {
  const mountRef = useRef(null);
  const flashRef = useRef(null);
  const containerRef = useRef(null);
  const doneRef = useRef(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [loading, setLoading] = useState(true);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete && onComplete();
  }, [onComplete]);

  useEffect(() => {
    const T = TIMINGS[variant] || TIMINGS.full;
    const mount = mountRef.current;
    const w = mount.clientWidth || 420;
    const h = mount.clientHeight || 640;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);

    // ---- Lights ----
    scene.add(new THREE.AmbientLight(0x334455, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rimGold = new THREE.PointLight(0xffc973, 30, 30);
    rimGold.position.set(-4, 1.5, 2.5);
    scene.add(rimGold);
    const underCyan = new THREE.PointLight(0x38bdf8, 25, 25);
    underCyan.position.set(0, -3, 3);
    scene.add(underCyan);
    const eyeLight = new THREE.PointLight(0x9befff, 0, 10);
    scene.add(eyeLight);

    // ---- Particles ----
    const pCount = 350;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const r = 3 + Math.random() * 5;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      pPos[i * 3] = r * Math.cos(a) * Math.cos(b);
      pPos[i * 3 + 1] = r * Math.sin(b) + 0.5;
      pPos[i * 3 + 2] = r * Math.sin(a) * Math.cos(b);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x67e8f9, size: 0.03, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(particles);

    // ---- HUD rings ----
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.33, 90), ringMat);
    ring1.rotation.x = Math.PI / 2.15;
    ring1.position.y = -1.55;
    scene.add(ring1);

    // ---- Model rig ----
    const rig = new THREE.Group();
    scene.add(rig);
    const glowTex = makeGlowTexture();
    const emissives = []; // materials to flare (eyes/repulsors)
    let reactor = null;

    let modelReady = false;
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        // Normalize: height 3.2, feet at y=-1.6, centered
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 3.2 / size.y;
        model.scale.setScalar(scale);
        const box2 = new THREE.Box3().setFromObject(model);
        const center = box2.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box2.min.y + 1.6;

        model.traverse((o) => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              m.envMapIntensity = 1.1;
              const c = m.color;
              const isLight = c && c.r > 0.75 && c.g > 0.75 && c.b > 0.75;
              if (isLight || /lambert|white|light|eye|beam/i.test(m.name || '')) {
                m.emissive = new THREE.Color(0x86eefc);
                m.emissiveIntensity = 0;
                emissives.push(m);
              }
            }
          }
        });

        // Arc reactor glow sprite on the chest
        reactor = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8ff3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        reactor.scale.set(0.55, 0.55, 1);
        reactor.position.set(0, 0.78, 0.34);
        rig.add(reactor);

        rig.add(model);
        modelReady = true;
        setLoading(false);
      },
      undefined,
      () => { setLoading(false); finish(); } // model failed — don't block the app
    );

    // ---- Text overlay timers ----
    const t1 = setTimeout(() => setShowTitle(true), T.titleAt);
    const t2 = setTimeout(() => setShowStatus(true), T.statusAt);

    // ---- Animation loop (clamped delta accumulation — hitch-proof) ----
    const fixedT = parseFloat(new URLSearchParams(window.location.search).get('introT') || '');
    let animT = 0;
    let lastNow = performance.now();
    const wallStart = lastNow;
    let raf;
    const lookTarget = new THREE.Vector3();

    const animate = () => {
      const now = performance.now();
      const dt = Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;
      if (modelReady) animT += dt; // timeline starts once the model is in
      const t = Number.isFinite(fixedT) ? fixedT : animT;

      // Phase A — spin in
      const pA = easeOutCubic(seg(t, 0, T.spinEnd));
      rig.rotation.y = (variant === 'full' ? Math.PI * 1.6 : 0.5) * (1 - pA);
      rig.position.y = Math.sin(t * 1.3) * 0.03;

      // Phase B — eyes / repulsors / reactor flare
      const pB = seg(t, T.eyesStart, T.eyesEnd);
      const flicker = pB >= 1 ? 1 : pB <= 0 ? 0 : ((Math.sin(t * 43) + Math.sin(t * 29) > 0.2) ? pB : 0.08);
      for (const m of emissives) m.emissiveIntensity = flicker * 2.6;
      if (reactor) reactor.material.opacity = flicker * (0.75 + Math.sin(t * 5) * 0.15);
      eyeLight.intensity = flicker * 8;
      eyeLight.position.set(0, 1.45, 1.2);

      // Phase C — camera: wide full-body → chest/head close-up
      const pC = easeInOutCubic(seg(t, T.zoomStart, T.zoomEnd));
      if (variant === 'full') {
        camera.position.set(0, 0.4 + 0.75 * pC, 8.5 - 0.9 * easeOutCubic(seg(t, 0, T.spinEnd)) - 3.4 * pC);
        lookTarget.set(0, 0.1 + 1.05 * pC, 0);
      } else {
        camera.position.set(0, 0.9 + 0.25 * pC, 5.2 - 1.2 * pC);
        lookTarget.set(0, 0.7 + 0.45 * pC, 0);
      }
      camera.lookAt(lookTarget);

      // Rings + particles
      ringMat.opacity = pA * 0.35;
      ring1.rotation.z += 0.01;
      particles.rotation.y += 0.0015;

      // Phase D — flash & fade
      const pD = seg(t, T.flashStart, T.end);
      if (flashRef.current) flashRef.current.style.opacity = String(Math.sin(pD * Math.PI) * 0.75);
      if (containerRef.current && pD > 0.4) containerRef.current.style.opacity = String(1 - seg(pD, 0.4, 1));

      renderer.render(scene, camera);
      const wallExceeded = (now - wallStart) / 1000 > T.end * 4;
      if (!Number.isFinite(fixedT) && (t >= T.end || wallExceeded)) { finish(); return; }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [variant]); // eslint-disable-line

  return (
    <div
      ref={containerRef}
      data-testid="helmet-intro-canvas"
      data-variant={variant}
      className="absolute inset-0 bg-black cursor-pointer select-none overflow-hidden"
      onClick={finish}
      title="Click to skip"
    >
      <div ref={mountRef} className="absolute inset-0" />
      {/* Flash overlay */}
      <div ref={flashRef} className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />
      {/* Loading hint (only before model is ready) */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-cyan-300/60 font-mono text-[10px] tracking-[0.4em] animate-pulse">INITIALIZING…</div>
        </div>
      )}
      {/* Title overlay */}
      <div className={`absolute inset-x-0 bottom-[9%] flex flex-col items-center gap-2.5 pointer-events-none transition-opacity duration-700 ${showTitle ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-white/95 font-mono tracking-[0.55em] text-xl pl-2">J.A.R.V.I.S.</div>
        <div className={`text-cyan-300/85 font-mono text-[10px] tracking-[0.35em] transition-opacity duration-500 ${showStatus ? 'opacity-100' : 'opacity-0'}`}>
          ALL SYSTEMS ONLINE
        </div>
      </div>
      <div className="absolute bottom-3 inset-x-0 text-center text-[9px] font-mono text-white/25 pointer-events-none">click to skip</div>
    </div>
  );
}
