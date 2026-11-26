// Live 3D preview for 3D Assets products: drag to orbit, or use the rotation slider.
// Loaded lazily (three.js is a separate chunk) only on 3D product pages.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RENDER } from './scenes.js';


const BASE_W = 720;
const toDeg = (r) => Math.round((((r * 180) / Math.PI) + 540) % 360 - 180);

function dispose(scene) {
  scene?.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose());
  });
  scene?.environment?.dispose();
}

export default function Viewer3D({ id, variant = 0, fallback }) {
  const box = useRef(null);
  const api = useRef(null);
  const [angle, setAngle] = useState(0);
  const [auto, setAuto] = useState(true);
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'viewer3d-canvas';
    el.appendChild(renderer.domElement);

    const ctx = { renderer, style: {} };
    RENDER[id](ctx, variant);
    const { scene, camera, target } = ctx;
    const baseZoom = camera.zoom;
    renderer.toneMappingExposure = ctx.exposure ?? 1;
    el.style.background = ctx.style.background || '';

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    if (id !== 'p36') controls.maxPolarAngle = Math.PI / 2 - 0.08;
    if (ctx.ortho) { controls.minZoom = baseZoom * 0.6; controls.maxZoom = baseZoom * 2.2; } else {
      const d = camera.position.distanceTo(target);
      controls.minDistance = d * 0.55; controls.maxDistance = d * 1.6;
    }
    controls.update();

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      if (ctx.ortho) {
        Object.assign(camera, { left: -BASE_W / 2, right: BASE_W / 2, top: (BASE_W * h) / w / 2, bottom: -(BASE_W * h) / w / 2 });
      } else camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    let lastAngle = 0;
    renderer.setAnimationLoop(() => {
      if (!visible) return;
      controls.update();
      renderer.render(scene, camera);
      const a = toDeg(controls.getAzimuthalAngle());
      if (a !== lastAngle) { lastAngle = a; setAngle(a); }
    });
    const onStart = () => { setTouched(true); setAuto(false); controls.autoRotate = false; };
    controls.addEventListener('start', onStart);

    api.current = {
      setAngle(deg) {
        controls.autoRotate = false;
        // Drop any drag inertia first, so the model lands exactly on the slider value.
        controls.enableDamping = false; controls.update(); controls.enableDamping = true;
        const offset = camera.position.clone().sub(controls.target);
        const s = new THREE.Spherical().setFromVector3(offset);
        s.theta = (deg * Math.PI) / 180;
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
        controls.update();
      },
      setAuto(on) { controls.autoRotate = on; },
    };

    return () => {
      api.current = null;
      controls.removeEventListener('start', onStart);
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [id, variant]);

  if (failed) return fallback;

  return (
    <div className="viewer3d" ref={box}>
      {!touched && <span className="viewer3d-hint">Drag to rotate</span>}
      <div className="viewer3d-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button" className={'viewer3d-auto' + (auto ? ' on' : '')} aria-pressed={auto}
          onClick={() => { const on = !auto; setAuto(on); api.current?.setAuto(on); }}
          aria-label={auto ? 'Stop auto-rotate' : 'Start auto-rotate'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
        </button>
        <input
          type="range" min={-180} max={180} step={1} value={angle} aria-label="Rotate model"
          onChange={(e) => { setTouched(true); setAuto(false); setAngle(Number(e.target.value)); api.current?.setAngle(Number(e.target.value)); }}
        />
        <span className="viewer3d-deg">{angle}°</span>
      </div>
    </div>
  );
}
