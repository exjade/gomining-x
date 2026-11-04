import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualHealthStatus } from '../../types/visualization';

interface WorkerIndicatorProps {
  position?: [number, number, number];
  status?: VisualHealthStatus;
  label?: string;
  isPaused?: boolean;
}

export const WorkerIndicator: React.FC<WorkerIndicatorProps> = ({
  position = [0, 4.0, 0],
  status = 'OPTIMAL',
  isPaused = false
}) => {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  const getColor = () => {
    switch (status) {
      case 'OPTIMAL': return '#05DF72';
      case 'DEGRADED': return '#F59E0B';
      case 'CRITICAL': return '#EF4444';
      default: return '#64748B';
    }
  };

  useFrame((state) => {
    if (isPaused) return;
    const t = state.clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.z += 0.02;
      const s = 1 + Math.sin(t * 3) * 0.12;
      ringRef.current.scale.set(s, s, 1);
    }
    if (coreRef.current) {
      coreRef.current.position.y = Math.sin(t * 2) * 0.03;
    }
  });

  const color = getColor();

  return (
    <group position={position}>
      {/* 1. Base mount on top of rack */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.06, 16]} />
        <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* 2. Micro plasma core */}
      <mesh ref={coreRef} position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* 3. Horizontal pulsing halo ring */}
      <mesh ref={ringRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.18, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 4. Subtle vertical beacon glow */}
      <pointLight color={color} distance={2.5} intensity={1.2} />
    </group>
  );
};
