import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SelectionBrackets3D } from './SelectionBrackets3D';
import type { Selected3DObject } from '../../types/visualization';

interface ProductionCoreProps {
  position?: [number, number, number];
  producedPrl: number;
  usdValue: number;
  isSelected?: boolean;
  onSelect?: (obj: Selected3DObject) => void;
  isPaused?: boolean;
}

export const ProductionCore: React.FC<ProductionCoreProps> = ({
  position = [0, 1.8, 0],
  producedPrl,
  usdValue,
  isSelected = false,
  onSelect,
  isPaused = false
}) => {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const midRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const rayRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (isPaused) return;

    const t = state.clock.getElapsedTime();

    if (outerRingRef.current) {
      outerRingRef.current.rotation.y += delta * 0.45;
      outerRingRef.current.rotation.z = Math.sin(t * 0.5) * 0.2;
    }
    if (midRingRef.current) {
      midRingRef.current.rotation.x -= delta * 0.6;
      midRingRef.current.rotation.y += delta * 0.35;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z += delta * 0.8;
      innerRingRef.current.rotation.x = Math.cos(t * 0.7) * 0.25;
    }
    if (coreRef.current) {
      coreRef.current.rotation.y += delta * 0.3;
      coreRef.current.position.y = Math.sin(t * 1.8) * 0.08;
    }
    if (rayRef.current) {
      rayRef.current.rotation.y -= delta * 0.5;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 3.2 + Math.sin(t * 4) * 1.0;
    }
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    onSelect?.({
      id: 'core-production-main',
      type: 'PRODUCTION_CORE',
      title: 'Núcleo Central de Producción & Emisión PRL',
      subtitle: `${producedPrl.toFixed(4)} PRL generados • $${usdValue.toFixed(2)} USD • Profit Engine Activo`,
      healthStatus: 'OPTIMAL',
      position,
      rawPayload: { producedPrl, usdValue }
    });
  };

  return (
    <group position={position} onClick={handleClick}>
      {/* 0. CORCHETES TÁCTICOS 3D WARETRACK EN SELECCIÓN */}
      <SelectionBrackets3D
        width={2.2}
        height={2.6}
        depth={2.2}
        color="#05DF72"
        visible={isSelected}
        pulse={true}
        position={[0, -0.6, 0]}
      />

      {/* 1. LUZ FOCAL ESMERALDA */}
      <pointLight ref={lightRef} color="#05DF72" distance={10} intensity={3.5} />
      <pointLight color="#00F0FF" distance={6} intensity={1.5} position={[0, 1, 0]} />

      {/* 2. CILINDRO DE PLASMA ENERGÉTICO ESMERALDA */}
      <mesh ref={coreRef}>
        <cylinderGeometry args={[0.65, 0.65, 1.6, 32]} />
        <meshPhysicalMaterial
          color="#05DF72"
          emissive="#05DF72"
          emissiveIntensity={isSelected ? 1.8 : 0.95}
          roughness={0.1}
          metalness={0.2}
          transmission={0.7}
          thickness={0.9}
          transparent={true}
          opacity={0.92}
        />
      </mesh>

      {/* 3. HAZ DE LUZ ASCENDENTE / RAYO LÁSER (Transparente) */}
      <mesh ref={rayRef} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.08, 0.35, 2.4, 16]} />
        <meshBasicMaterial
          color="#00F0FF"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 4. ANILLO EXTERIOR DE TITANIO */}
      <mesh ref={outerRingRef}>
        <torusGeometry args={[1.4, 0.05, 16, 64]} />
        <meshStandardMaterial
          color={isSelected ? '#00F0FF' : '#475569'}
          metalness={0.95}
          roughness={0.15}
          emissive={isSelected ? '#00F0FF' : '#05DF72'}
          emissiveIntensity={isSelected ? 0.9 : 0.25}
        />
      </mesh>

      {/* 5. ANILLO MEDIO CIAN DE TRANSMISIÓN */}
      <mesh ref={midRingRef}>
        <torusGeometry args={[1.15, 0.035, 16, 64]} />
        <meshStandardMaterial
          color="#00F0FF"
          metalness={0.9}
          roughness={0.2}
          emissive="#00F0FF"
          emissiveIntensity={0.65}
        />
      </mesh>

      {/* 6. ANILLO INTERIOR ÁMBAR DE ACELERACIÓN */}
      <mesh ref={innerRingRef}>
        <torusGeometry args={[0.9, 0.025, 16, 64]} />
        <meshStandardMaterial
          color="#F59E0B"
          metalness={0.95}
          roughness={0.15}
          emissive="#F59E0B"
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* 7. PEDESTAL DE CONTENCIÓN MAGNÉTICA ESCALONADO */}
      <mesh position={[0, -0.95, 0]}>
        <cylinderGeometry args={[1.0, 1.3, 0.3, 32]} />
        <meshStandardMaterial color="#0B0F19" metalness={0.95} roughness={0.2} />
      </mesh>
      <mesh position={[0, -1.15, 0]}>
        <cylinderGeometry args={[1.35, 1.6, 0.15, 32]} />
        <meshStandardMaterial color="#060912" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* Anillo LED perimetral en la base */}
      <mesh position={[0, -0.88, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.05, 48]} />
        <meshBasicMaterial color="#05DF72" side={THREE.DoubleSide} />
      </mesh>

      {/* 8. HALO REFLECTIVO EN EL SUELO */}
      <mesh position={[0, -1.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 2.5, 48]} />
        <meshBasicMaterial
          color="#05DF72"
          transparent
          opacity={isSelected ? 0.4 : 0.18}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
