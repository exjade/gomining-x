import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ProductionFlowProps {
  startPos?: [number, number, number];
  endPos?: [number, number, number];
  startPosition?: [number, number, number];
  endPosition?: [number, number, number];
  isActive?: boolean;
  color?: string;
  isPaused?: boolean;
}

export const ProductionFlow: React.FC<ProductionFlowProps> = ({
  startPos,
  endPos,
  startPosition,
  endPosition,
  isActive = true,
  color = '#05DF72',
  isPaused = false
}) => {
  const p1 = startPos || startPosition || [-2.8, 1.8, 0];
  const p2 = endPos || endPosition || [-0.8, 1.8, 0];

  const pulse1Ref = useRef<THREE.Mesh>(null);
  const pulse2Ref = useRef<THREE.Mesh>(null);

  const startVec = new THREE.Vector3(...p1);
  const endVec = new THREE.Vector3(...p2);
  const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const distance = startVec.distanceTo(endVec);

  useFrame((state) => {
    if (isPaused || !isActive) return;
    const time = state.clock.getElapsedTime();
    const t1 = (time * 1.6) % 1;
    const t2 = (time * 1.6 + 0.5) % 1;

    if (pulse1Ref.current) {
      pulse1Ref.current.position.lerpVectors(startVec, endVec, t1);
    }
    if (pulse2Ref.current) {
      pulse2Ref.current.position.lerpVectors(startVec, endVec, t2);
    }
  });

  return (
    <group>
      {/* Guía de fibra óptica emisiva fija */}
      <mesh position={midPoint}>
        <boxGeometry args={[distance, 0.025, 0.025]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.65}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Pulso 1 de datos en movimiento */}
      <mesh ref={pulse1Ref}>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshBasicMaterial color="#00F0FF" />
      </mesh>

      {/* Pulso 2 de datos desfasado */}
      <mesh ref={pulse2Ref}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
};
