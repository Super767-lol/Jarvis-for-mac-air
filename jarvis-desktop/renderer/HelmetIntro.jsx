import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import modelUrl from './assets/ironman.glb?url';

// ─── Math helpers ────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg   = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const lerp  = (a, b, t) => a + (b - a) * t;
const easeOut3  = t => 1 - Math.pow(1 - t, 3);
const easeIn3   = t => t * t * t;
const easeIO3   = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const easeIO5   = t => t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t+2,5)/2;

// ─── Timeline (seconds) ─────────────────────────────────────────────────────
//  0.0  model fades in, slow rotation deceleration
//  1.2  eye glow flicker starts
//  2.0  face-plate begins lifting (morph or rotation)
//  3.0  dramatic camera SMASH-ZOOM into eye level
//  4.2  white flash
//  4.6  JARVIS title fade in
//  5.2  "ALL SYSTEMS ONLINE"
//  6.0  fade to app
const T = {
  spinEnd:    1.8,
  eyeStart:   1.2,
  eyeEnd:     2.2,
  faceStart:  2.0,
  faceEnd:    3.2,
  zoomStart:  2.8,
  zoomEnd:    4.0,
  flashStart: 4.0,
  flashPeak:  4.3,
  flashEnd:   5.0,
  titleIn:    4400,   // ms
  statusIn:   5000,
  end:        6.2,
};

// ─── Glow sprite texture ────────────────────────────────────────────────────
function makeGlowTex(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(128,128,0, 128,128,128);
  gr.addColorStop(0,   `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.3, `rgba(${r},${g},${b},0.6)`);
  gr.addColorStop(0.7, `rgba(${r},${g},${b},0.1)`);
  gr.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(c);
}

// ─── Scanline overlay canvas ─────────────────────────────────────────────────
function ScanlineOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{
      background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,220,255,0.015) 2px, rgba(0,220,255,0.015) 4px)',
      mixBlendMode: 'screen',
    }} />
  );
}

// ─── HUD corner brackets ─────────────────────────────────────────────────────
function HUDBrackets({ visible }) {
  const style = {
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.8s ease',
  };
  const bracketStyle = {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: 'rgba(56,189,248,0.7)',
    borderStyle: 'solid',
  };
  return (
    <div className="absolute inset-4 pointer-events-none" style={style}>
      <div style={{ ...bracketStyle, top: 0, left: 0, borderWidth: '2px 0 0 2px' }} />
      <div style={{ ...bracketStyle, top: 0, right: 0, borderWidth: '2px 2px 0 0' }} />
      <div style={{ ...bracketStyle, bottom: 0, left: 0, borderWidth: '0 0 2px 2px' }} />
      <div style={{ ...bracketStyle, bottom: 0, right: 0, borderWidth: '0 2px 2px 0' }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HelmetIntro({ variant = 'full', onComplete }) {
  const mountRef     = useRef(null);
  const flashRef     = useRef(null);
  const containerRef = useRef(null);
  const doneRef      = useRef(false);

  const [showTitle,   setShowTitle]   = useState(false);
  const [showStatus,  setShowStatus]  = useState(false);
  const [showHUD,     setShowHUD]     = useState(false);
  const [loading,     setLoading]     = useState(true);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth  || 420;
    const H = mount.clientHeight || 640;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled  = true;
    renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Scene / Environment ───────────────────────────────────────────────
    const scene  = new THREE.Scene();
    scene.fog    = new THREE.FogExp2(0x000000, 0.08);
    const pmrem  = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;

    // ── Camera ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 200);
    camera.position.set(0, 0.5, 9.5);
    camera.lookAt(0, 0.5, 0);

    // ── Lights ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x0a1422, 1.2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimGold = new THREE.PointLight(0xffb347, 60, 40);
    rimGold.position.set(-5, 2, 1);
    scene.add(rimGold);

    const rimBlue = new THREE.PointLight(0x4fc3f7, 40, 35);
    rimBlue.position.set(5, -1, 2);
    scene.add(rimBlue);

    const underLight = new THREE.PointLight(0x38bdf8, 20, 20);
    underLight.position.set(0, -4, 3);
    scene.add(underLight);

    // Dynamic eye light (starts off)
    const eyeLight = new THREE.PointLight(0x9befff, 0, 12);
    eyeLight.position.set(0, 1.5, 1.5);
    scene.add(eyeLight);

    // ── Particles ─────────────────────────────────────────────────────────
    const PART_COUNT = 600;
    const pPos   = new Float32Array(PART_COUNT * 3);
    const pSizes = new Float32Array(PART_COUNT);
    for (let i = 0; i < PART_COUNT; i++) {
      const r   = 4 + Math.random() * 8;
      const phi = Math.random() * Math.PI * 2;
      const th  = (Math.random() - 0.5) * Math.PI;
      pPos[i*3]   = r * Math.cos(phi) * Math.cos(th);
      pPos[i*3+1] = r * Math.sin(th) + 0.5;
      pPos[i*3+2] = r * Math.sin(phi) * Math.cos(th);
      pSizes[i]   = 0.015 + Math.random() * 0.04;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('size',     new THREE.BufferAttribute(pSizes, 1));
    const pMat = new THREE.PointsMaterial({
      color: 0x67e8f9, size: 0.025,
      transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ── HUD ring ──────────────────────────────────────────────────────────
    const ringGeo = new THREE.RingGeometry(2.5, 2.54, 120);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.1;
    ring.position.y = -1.6;
    scene.add(ring);

    // Outer ring (slower)
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xffc973, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.03, 120), ring2Mat);
    ring2.rotation.x = Math.PI / 2.1;
    ring2.position.y = -1.6;
    scene.add(ring2);

    // ── Model ─────────────────────────────────────────────────────────────
    const rig        = new THREE.Group();
    scene.add(rig);

    const emissives  = [];   // eye/repulsor mats
    let   reactor    = null; // chest glow sprite
    let   faceplate  = null; // the upper-face group we'll rotate open
    let   modelReady = false;

    const glowCyan = makeGlowTex(140, 240, 255);
    const glowGold = makeGlowTex(255, 200, 100);

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Normalise size: height 3.6, centred, feet near y = -1.8
        const box    = new THREE.Box3().setFromObject(model);
        const size   = box.getSize(new THREE.Vector3());
        const scale  = 3.6 / size.y;
        model.scale.setScalar(scale);
        const box2   = new THREE.Box3().setFromObject(model);
        const centre = box2.getCenter(new THREE.Vector3());
        model.position.x -= centre.x;
        model.position.z -= centre.z;
        model.position.y -= box2.min.y + 1.8;

        // Tag emissive materials (eyes, arc reactor, repulsors)
        model.traverse(o => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            m.envMapIntensity = 1.4;
            const isLight =
              (m.color && m.color.r > 0.7 && m.color.g > 0.7 && m.color.b > 0.7) ||
              /eye|lens|beam|light|glow|repulsor|reactor/i.test(m.name || o.name || '');
            if (isLight) {
              m.emissive          = new THREE.Color(0x86eefc);
              m.emissiveIntensity = 0;
              emissives.push(m);
            }
            // Enable shadows
            o.castShadow    = true;
            o.receiveShadow = true;
          }
        });

        // Arc-reactor chest glow sprite
        reactor = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowCyan, color: 0x8ff3ff,
          transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        reactor.scale.set(0.7, 0.7, 1);
        reactor.position.set(0, 0.72, 0.38);
        rig.add(reactor);

        // Eye glow sprites (two, placed at eye level)
        const eyeL = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowCyan, color: 0xaaf4ff,
          transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        eyeL.scale.set(0.22, 0.22, 1);
        eyeL.position.set(-0.11, 1.48, 0.38);
        rig.add(eyeL);

        const eyeR = eyeL.clone();
        eyeR.position.set( 0.11, 1.48, 0.38);
        rig.add(eyeR);

        rig.add(model);

        // Faceplate: try to find the upper helmet group by bounding box
        // (anything above y=1.3 of the model root)
        // We'll just rotate the whole rig slightly for the "faceplate opening"
        // effect — a subtle upward tilt + bloom flash sells it cinematically
        faceplate = { eyeL, eyeR };

        modelReady = true;
        setLoading(false);
        setShowHUD(true);
      },
      undefined,
      () => { setLoading(false); finish(); }
    );

    // ── Overlay timers ────────────────────────────────────────────────────
    const tTitle  = setTimeout(() => setShowTitle(true),  T.titleIn);
    const tStatus = setTimeout(() => setShowStatus(true), T.statusIn);

    // ── Animation loop ────────────────────────────────────────────────────
    let animT    = 0;
    let lastNow  = performance.now();
    const wallT0 = performance.now();
    let   raf;

    const lookTarget   = new THREE.Vector3();
    const camPos       = new THREE.Vector3();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt  = Math.min((now - lastNow) / 1000, 0.05);
      lastNow   = now;
      if (modelReady) animT += dt;
      const t = animT;

      // ── Phase A: Spin-in deceleration ───────────────────────────────
      const pSpin = easeOut3(seg(t, 0, T.spinEnd));
      rig.rotation.y = Math.PI * 1.5 * (1 - pSpin);

      // Subtle float
      rig.position.y = Math.sin(t * 1.1) * 0.04;

      // ── Phase B: Eye / emissive flicker then lock on ─────────────
      const pEye = seg(t, T.eyeStart, T.eyeEnd);
      let eyeIntensity = 0;
      if (pEye > 0 && pEye < 1) {
        // Flicker
        eyeIntensity = pEye * ((Math.sin(t * 47) * Math.sin(t * 31)) > -0.2 ? 1 : 0.05);
      } else if (pEye >= 1) {
        // Solid
        eyeIntensity = 1 + Math.sin(t * 3.5) * 0.06;
      }
      for (const m of emissives) m.emissiveIntensity = eyeIntensity * 3.0;
      if (reactor) reactor.material.opacity = eyeIntensity * (0.8 + Math.sin(t * 4) * 0.12);
      if (faceplate) {
        faceplate.eyeL.material.opacity = eyeIntensity * 0.9;
        faceplate.eyeR.material.opacity = eyeIntensity * 0.9;
      }
      eyeLight.intensity = eyeIntensity * 12;

      // ── Phase C: Faceplate "opening" — sell it with rim light flare ──
      const pFace = easeIO3(seg(t, T.faceStart, T.faceEnd));
      // Tilt rig head back slightly (approximates faceplate raising)
      rig.rotation.x = -pFace * 0.08;
      // Punch up gold rim light to simulate faceplate edge catching light
      rimGold.intensity = 60 + pFace * 120;
      rimGold.color.setHSL(0.11 - pFace * 0.02, 1, 0.6);

      // ── Phase D: Camera SMASH-ZOOM to eye level ──────────────────
      const pZoom = easeIO5(seg(t, T.zoomStart, T.zoomEnd));
      // Start: wide full-body (z=9.5, lookY=0.5)
      // End:   extreme close face (z=2.4, lookY=1.45)
      camPos.set(
        lerp(0,    0,    pZoom),
        lerp(0.5,  1.35, pZoom),
        lerp(9.5,  2.4,  pZoom),
      );
      lookTarget.set(0, lerp(0.5, 1.48, pZoom), 0);
      camera.position.lerp(camPos, 0.12);
      camera.lookAt(lookTarget);
      // Slight FOV punch
      camera.fov = lerp(38, 22, pZoom);
      camera.updateProjectionMatrix();

      // Rings
      ringMat.opacity  = pSpin * 0.4 * (1 - seg(t, T.zoomEnd, T.flashStart));
      ring2Mat.opacity = pSpin * 0.25 * (1 - seg(t, T.zoomEnd, T.flashStart));
      ring.rotation.z  += 0.008;
      ring2.rotation.z -= 0.004;

      // Particles slow rotation
      particles.rotation.y += 0.001;
      pMat.opacity = 0.55 * (1 - seg(t, T.flashStart, T.flashPeak));

      // ── Phase E: Flash ────────────────────────────────────────────
      const pFlash = seg(t, T.flashStart, T.flashEnd);
      let flashOpacity = 0;
      if (pFlash > 0 && pFlash <= 0.15) {
        flashOpacity = pFlash / 0.15; // ramp up
      } else if (pFlash > 0.15 && pFlash <= 0.35) {
        flashOpacity = 1; // hold white
      } else if (pFlash > 0.35) {
        flashOpacity = 1 - (pFlash - 0.35) / 0.65; // fade out
      }
      if (flashRef.current) flashRef.current.style.opacity = String(flashOpacity);

      // ── Fade out container ───────────────────────────────────────
      const pFade = seg(t, T.flashEnd - 0.3, T.end);
      if (containerRef.current && pFade > 0) {
        containerRef.current.style.opacity = String(1 - easeIn3(pFade));
      }

      renderer.render(scene, camera);

      // Done?
      const wallSec = (performance.now() - wallT0) / 1000;
      if (t >= T.end || wallSec > T.end * 5) {
        finish();
      }
    };

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(tTitle);
      clearTimeout(tStatus);
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line

  return (
    <div
      ref={containerRef}
      data-testid="helmet-intro-canvas"
      data-variant={variant}
      className="absolute inset-0 bg-black cursor-pointer select-none overflow-hidden"
      onClick={finish}
      title="Click to skip"
    >
      {/* Three.js canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Scanlines */}
      <ScanlineOverlay />

      {/* HUD brackets */}
      <HUDBrackets visible={showHUD} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />

      {/* White flash */}
      <div ref={flashRef}
        className="absolute inset-0 bg-white pointer-events-none"
        style={{ opacity: 0 }} />

      {/* JARVIS title */}
      <div className={`absolute inset-x-0 bottom-[12%] flex flex-col items-center gap-3 pointer-events-none
          transition-all duration-700 ${showTitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
        {/* Thin top rule */}
        <div className={`h-px w-32 bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent
            transition-all duration-1000 delay-200 ${showTitle ? 'opacity-100' : 'opacity-0'}`} />

        <div style={{
          fontFamily: '"Courier New", Courier, monospace',
          letterSpacing: '0.65em',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.96)',
          textShadow: '0 0 30px rgba(56,189,248,0.8), 0 0 60px rgba(56,189,248,0.3)',
          paddingLeft: '0.65em', // compensate letter-spacing
        }}>
          J.A.R.V.I.S.
        </div>

        <div className={`transition-all duration-500 delay-300 ${showStatus ? 'opacity-100' : 'opacity-0'}`}
          style={{
            fontFamily: '"Courier New", Courier, monospace',
            letterSpacing: '0.35em',
            fontSize: '0.62rem',
            color: 'rgba(103,232,249,0.85)',
            textShadow: '0 0 12px rgba(56,189,248,0.6)',
          }}>
          ALL SYSTEMS ONLINE
        </div>

        {/* Thin bottom rule */}
        <div className={`h-px w-24 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent
            transition-all duration-1000 delay-400 ${showStatus ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{
            fontFamily: 'monospace',
            fontSize: '0.6rem',
            letterSpacing: '0.4em',
            color: 'rgba(103,232,249,0.5)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            INITIALIZING…
          </div>
        </div>
      )}

      {/* Skip hint */}
      <div className="absolute bottom-3 inset-x-0 text-center pointer-events-none"
        style={{ fontFamily: 'monospace', fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em' }}>
        CLICK TO SKIP
      </div>
    </div>
  );
}
