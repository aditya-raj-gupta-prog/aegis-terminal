'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Rotating, rippling wireframe topography. The peaks/valleys of the lattice are
// driven by layered sine waves over time to mimic market volatility and the
// depth of liquidity pools. A global pointer listener adds subtle parallax so
// the scene feels interactive without intercepting clicks on the HUD above it.
function TopoMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.PlaneGeometry>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const SEG = 96;
  const SIZE = 60;

  // Snapshot the flat base grid once so each frame's displacement is computed
  // from the original lattice rather than accumulating drift.
  const base = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    const arr = Float32Array.from(g.attributes.position.array as Float32Array);
    g.dispose();
    return arr;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((state) => {
    const geom = geomRef.current;
    const mesh = meshRef.current;
    if (!geom || !mesh) return;

    const t = state.clock.elapsedTime;
    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = base[i];
      const y = base[i + 1];
      pos[i + 2] =
        Math.sin(x * 0.25 + t * 0.7) * 1.6 +
        Math.cos(y * 0.3 + t * 0.5) * 1.2 +
        Math.sin((x + y) * 0.15 + t * 0.9) * 0.8;
    }
    geom.attributes.position.needsUpdate = true;

    // Slow continuous spin + eased pointer parallax.
    mesh.rotation.z += 0.0006;
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, -Math.PI / 2.3 + pointer.current.y * 0.12, 0.04);
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, pointer.current.x * 0.12, 0.04);
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2.3, 0, 0]} position={[0, -6, 0]}>
      <planeGeometry ref={geomRef} args={[SIZE, SIZE, SEG, SEG]} />
      <meshBasicMaterial
        color="#0e9bb8"
        wireframe
        transparent
        opacity={0.32}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        camera={{ position: [0, 7, 18], fov: 60 }}
        frameloop="always"
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.6} color="#22d3ee" />
        <TopoMesh />
        <fog attach="fog" args={['#050505', 18, 44]} />
      </Canvas>
    </div>
  );
}
