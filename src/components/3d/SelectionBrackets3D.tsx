import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SelectionBrackets3DProps {
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  visible?: boolean;
  pulse?: boolean;
  position?: [number, number, number];
}

/**
 * Builds authentic WareTrack-style 3D corner reticle brackets.
 * Delineates the 8 bounding corners of any physical rack, miner, or core
 * with high-precision line segments, volumetric tint, and a floor contact ring.
 */
function createBracketGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const pts: number[] = [];
  // Length of the corner bracket edge (proportional to volume)
  const e = Math.min(w, h, d) * 0.22 + 0.18;

  for (const x of [-w / 2, w / 2]) {
    for (const y of [0, h]) {
      for (const z of [-d / 2, d / 2]) {
        const sx = x < 0 ? 1 : -1;
        const sy = y === 0 ? 1 : -1;
        const sz = z < 0 ? 1 : -1;

        // X-axis arm
        pts.push(x, y, z, x + sx * e, y, z);
        // Y-axis arm
        pts.push(x, y, z, x, y + sy * e, z);
        // Z-axis arm
        pts.push(x, y, z, x, y, z + sz * e);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geometry;
}

export const SelectionBrackets3D: React.FC<SelectionBrackets3DProps> = ({
  width = 2.2,
  height = 4.4,
  depth = 1.45,
  color = '#00F0FF',
  visible = true,
  pulse = true,
  position = [0, 0, 0]
}) => {
  const linesRef = useRef<THREE.LineSegments>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowPlaneRef = useRef<THREE.Mesh>(null);

  const bracketGeometry = useMemo(() => {
    return createBracketGeometry(width, height, depth);
  }, [width, height, depth]);

  useFrame((state) => {
    if (!visible) return;
    const t = state.clock.getElapsedTime();

    if (pulse && linesRef.current) {
      const material = linesRef.current.material as THREE.LineBasicMaterial;
      if (material) {
        material.opacity = 0.75 + Math.sin(t * 4) * 0.22;
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += 0.015;
      const s = 1.0 + Math.sin(t * 3) * 0.05;
      ringRef.current.scale.set(s, s, 1);
    }

    if (glowPlaneRef.current) {
      const mat = glowPlaneRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = 0.12 + Math.sin(t * 3) * 0.06;
      }
    }
  });

  if (!visible) return null;

  return (
    <group position={position}>
      {/* 1. RETÍCULAS DE ESQUINAS VECTORIALES (WARETRACK BRACKETS) */}
      <lineSegments ref={linesRef} geometry={bracketGeometry}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.92}
          linewidth={2}
          depthWrite={false}
        />
      </lineSegments>

      {/* 2. VOLUMEN DE LUZ INTERIOR TRASLÚCIDO */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width * 0.98, height * 0.98, depth * 0.98]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 3. HALO Y PLANO DE CONTACTO EN EL SUELO */}
      <mesh ref={glowPlaneRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 1.2, depth + 1.2]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* 4. ANILLO TÁCTICO GIRATORIO DE ANCLAJE */}
      <mesh ref={ringRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.min(width, depth) * 0.55, Math.min(width, depth) * 0.62, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.65}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
