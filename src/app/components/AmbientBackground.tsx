'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Slowly rotating point-cloud "particle matrix" with a faint wireframe grid,
// rendered in the absolute background of the terminal.
function ParticleMatrix() {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate a stable cloud of particles inside a sphere shell.
  const positions = useMemo(() => {
    const count = 1400;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.04;
      pointsRef.current.rotation.x += delta * 0.012;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        color="#3b82f6"
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function WireGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);

  useFrame((_, delta) => {
    if (gridRef.current) {
      gridRef.current.rotation.z += delta * 0.01;
    }
  });

  // GridHelper drawn far below and tilted, giving a faint glowing floor grid.
  return (
    <gridHelper
      ref={gridRef}
      args={[60, 60, '#0e7490', '#082f49']}
      position={[0, -8, 0]}
      rotation={[Math.PI / 2.2, 0, 0]}
    />
  );
}

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 16], fov: 60 }}
        frameloop="always"
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.6} color="#22d3ee" />
        <ParticleMatrix />
        <WireGrid />
        <fog attach="fog" args={['#050505', 14, 30]} />
      </Canvas>
    </div>
  );
}
