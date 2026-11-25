import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color } from 'three';
import { clone as clonarSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import gsap from 'gsap';

const MODELO = '/models/phoenix.glb';
const usarMeshopt = (l) => l.setMeshoptDecoder(MeshoptDecoder);
const cssCor = (n, p) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || p;

/* estado mutável compartilhado entre GSAP e o laço de render (nunca vira estado React) */
const novoCtl = () => ({ alvo: [0, 0], olhar: [0, 0], voo: 0, susto: 0, ativo: false });

function Fenix({ ctl, reduzido, onPronto }) {
  const { scene } = useLoader(GLTFLoader, MODELO, usarMeshopt);
  const g = useRef(null);
  const modelo = useMemo(() => {
    const m = clonarSkinned(scene); /* clone comum não recria o esqueleto: o modelo ficaria sem responder à escala/posição */
    m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material = o.material.clone(); o.material.emissive = new Color('#ff5a00'); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = 0.55; } } });
    return m;
  }, [scene]);

  useFrame((s, dtReal) => {
    const dt = Math.min(dtReal, 0.05), t = s.clock.elapsedTime;
    ctl.olhar[0] += (ctl.alvo[0] - ctl.olhar[0]) * Math.min(1, dt * 3);
    ctl.olhar[1] += (ctl.alvo[1] - ctl.olhar[1]) * Math.min(1, dt * 3);
    const r = g.current;
    const flutua = reduzido ? 0 : Math.sin(t * 1.3) * 0.025;
    r.position.set(ctl.voo * 0.6, flutua - 0.2 + ctl.voo * 1.6, ctl.voo * 1.4);
    r.rotation.set(-0.08 + ctl.olhar[1] * 0.12 - ctl.voo * 0.5, -0.45 + ctl.olhar[0] * 0.5 + Math.sin(t * 0.5) * 0.05 + ctl.voo * 0.9, Math.sin(ctl.susto * 40) * 0.05 * (1 - ctl.susto));
    const k = 1.3 * (1 + ctl.voo * 0.6);
    r.scale.setScalar(k);
  });
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(onPronto)); return () => cancelAnimationFrame(id); }, [onPronto]);
  return <group ref={g}><primitive object={modelo} /></group>;
}

/* brasas subindo: pontos aditivos, leves (GPU), cor vinda do tema */
function Brasas({ ctl, reduzido }) {
  const n = reduzido ? 40 : 140;
  const pts = useRef(null);
  const { geo, dados } = useMemo(() => {
    const pos = new Float32Array(n * 3), dd = [];
    for (let i = 0; i < n; i++) { dd.push({ x: (Math.random() - 0.5) * 2.2, y: Math.random() * 2.4 - 1.1, z: (Math.random() - 0.5) * 1.2, v: 0.12 + Math.random() * 0.35, f: Math.random() * 6 }); }
    const ge = new BufferGeometry(); ge.setAttribute('position', new BufferAttribute(pos, 3));
    return { geo: ge, dados: dd };
  }, [n]);
  useFrame((s, dtReal) => {
    const dt = Math.min(dtReal, 0.05), t = s.clock.elapsedTime, a = geo.attributes.position.array;
    dados.forEach((d, i) => {
      if (!reduzido) d.y += d.v * dt * (1 + ctl.voo * 6);
      if (d.y > 1.4) { d.y = -1.1; d.x = (Math.random() - 0.5) * 2.2; }
      a[i * 3] = d.x + Math.sin(t * 0.8 + d.f) * 0.08; a[i * 3 + 1] = d.y; a[i * 3 + 2] = d.z;
    });
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={pts} geometry={geo} frustumCulled={false}>
      <pointsMaterial color={cssCor('--ac-hi', '#ff8a3d')} size={0.028} sizeAttenuation transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
}

function Luzes() {
  return (
    <>
      <hemisphereLight args={['#ffe9d6', '#1a0a00', 0.8]} />
      <directionalLight position={[2.5, 3, 4]} intensity={2.2} color="#fff1e2" />
      <directionalLight position={[-4, 1.5, -2]} intensity={6} color="#ff6a00" />
      <pointLight position={[0, -0.4, 1.8]} intensity={3} distance={6} color="#ff7a1a" />
    </>
  );
}

function Controle({ ctl, apiRef, palco }) {
  useEffect(() => {
    let tl = null;
    apiRef.current = {
      voar() {
        return new Promise((resolve) => {
          ctl.ativo = true;
          tl = gsap.timeline({ onComplete: () => { ctl.ativo = false; resolve(true); } });
          tl.to(ctl, { voo: 1, duration: 1.1, ease: 'power3.in' }, 0).to(palco.current, { opacity: 0, duration: 0.35, ease: 'power1.in' }, 0.8);
        });
      },
      reagir() { gsap.fromTo(ctl, { susto: 0 }, { susto: 1, duration: 0.7, ease: 'none' }); },
    };
    return () => { tl?.kill(); apiRef.current = null; };
  }, [ctl, apiRef, palco]);
  return null;
}

function Enquadre() {
  const camera = useThree((s) => s.camera), w = useThree((s) => s.size.width);
  useEffect(() => { camera.zoom = w < 520 ? 1.25 : 1; camera.updateProjectionMatrix(); }, [camera, w]);
  return null;
}

export default function PhoenixScene({ reduzido, apiRef, palco, onPronto, onFalha }) {
  const ctl = useRef(null);
  if (!ctl.current) ctl.current = novoCtl();
  useEffect(() => {
    if (reduzido) return undefined;
    const mover = (e) => { ctl.current.alvo[0] = (e.clientX / window.innerWidth - 0.5) * 2; ctl.current.alvo[1] = (e.clientY / window.innerHeight - 0.5) * 2; };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => window.removeEventListener('pointermove', mover);
  }, [reduzido]);
  return (
    <Canvas aria-hidden="true" dpr={[1, 1.5]} camera={{ position: [0, 0.05, 4.6], fov: 26 }} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }} style={{ pointerEvents: 'none' }}
      onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFalha?.(); }); }}>
      <Enquadre /><Luzes />
      <Fenix ctl={ctl.current} reduzido={reduzido} onPronto={onPronto} />
      <Brasas ctl={ctl.current} reduzido={reduzido} />
      <Controle ctl={ctl.current} apiRef={apiRef} palco={palco} />
    </Canvas>
  );
}
useLoader.preload(GLTFLoader, MODELO, usarMeshopt);
