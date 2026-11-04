import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MergedGPUWorker } from '../../types/minerx';
import type { VisualHealthStatus, Selected3DObject } from '../../types/visualization';

interface PhysicalMinerProps {
  position?: [number, number, number];
  worker: MergedGPUWorker;
  healthStatus: VisualHealthStatus;
  fanRpm: number;
  temperatureC: number;
  powerWatts: number;
  slotIndex: number;
  isSelected?: boolean;
  onSelect?: (obj: Selected3DObject) => void;
  isPaused?: boolean;
}

export const PhysicalMiner: React.FC<PhysicalMinerProps> = ({
  position = [0, 0, 0],
  worker,
  healthStatus,
  fanRpm,
  temperatureC,
  powerWatts,
  slotIndex,
  isSelected = false,
  onSelect,
  isPaused = false
}) => {
  const fan1Ref = useRef<THREE.Group>(null);
  const fan2Ref = useRef<THREE.Group>(null);

  const isMining = worker.isMining !== false;
  const spinSpeed = isMining ? Math.max(12, fanRpm / 300) : 0;

  useFrame((_, delta) => {
    if (isPaused || !isMining) return;
    if (fan1Ref.current) fan1Ref.current.rotation.z += delta * spinSpeed;
    if (fan2Ref.current) fan2Ref.current.rotation.z += delta * spinSpeed;
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    onSelect?.({
      id: worker.workerName || worker.machineId || `slot-${slotIndex}`,
      type: 'PHYSICAL_MINER',
      title: `Miner: ${worker.workerName || worker.gpuModel}`,
      subtitle: `${worker.gpuModel} • ${((worker.currentHashrateTHs || 0)).toFixed(1)} TH/s • ${temperatureC.toFixed(1)}°C • ${powerWatts}W`,
      healthStatus,
      position: position,
      rawPayload: { worker, fanRpm, temperatureC, powerWatts, slotIndex }
    });
  };

  const getLedColor = () => {
    switch (healthStatus) {
      case 'OPTIMAL': return '#05DF72';
      case 'DEGRADED': return '#F59E0B';
      case 'CRITICAL': return '#EF4444';
      default: return '#64748B';
    }
  };

  const width = 1.72;
  const height = 0.36;
  const depth = 1.05;
  const ledColor = getLedColor();

  return (
    <group position={position} onClick={handleClick}>
      {/* 1. CHASIS DEL SERVIDOR BLADE (Titanio Oscuro Anodizado) */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={isSelected ? '#1E293B' : '#0B0F19'}
          metalness={0.92}
          roughness={0.2}
          emissive={isSelected ? '#00F0FF' : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0}
        />
      </mesh>

      {/* 2. PLACA FRONTAL BISELADA CON RANURAS DE VENTILACIÓN */}
      <mesh position={[0, 0, depth / 2 + 0.015]}>
        <boxGeometry args={[width - 0.06, height - 0.06, 0.025]} />
        <meshStandardMaterial color="#070A12" metalness={0.95} roughness={0.25} />
      </mesh>

      {/* 3. MANIJAS METÁLICAS DE EXTRACCIÓN (Rack Handles) */}
      <mesh position={[-width / 2 + 0.08, 0, depth / 2 + 0.04]}>
        <boxGeometry args={[0.03, height - 0.12, 0.04]} />
        <meshStandardMaterial color="#64748B" metalness={0.95} roughness={0.15} />
      </mesh>
      <mesh position={[width / 2 - 0.08, 0, depth / 2 + 0.04]}>
        <boxGeometry args={[0.03, height - 0.12, 0.04]} />
        <meshStandardMaterial color="#64748B" metalness={0.95} roughness={0.15} />
      </mesh>

      {/* 4. TURBINA DE ADMISIÓN 1 (Izquierda) */}
      <group position={[-0.45, 0, depth / 2 + 0.03]} ref={fan1Ref}>
        <mesh>
          <ringGeometry args={[0.05, 0.13, 24]} />
          <meshBasicMaterial color="#1E293B" />
        </mesh>
        {/* Aspas en aspas en cruz */}
        <mesh rotation={[0, 0, 0]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#00F0FF" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#00F0FF" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#94A3B8" />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#94A3B8" />
        </mesh>
      </group>

      {/* 5. TURBINA DE ADMISIÓN 2 (Derecha) */}
      <group position={[0.45, 0, depth / 2 + 0.03]} ref={fan2Ref}>
        <mesh>
          <ringGeometry args={[0.05, 0.13, 24]} />
          <meshBasicMaterial color="#1E293B" />
        </mesh>
        <mesh rotation={[0, 0, 0]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#00F0FF" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#00F0FF" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#94A3B8" />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.24, 0.025, 0.005]} />
          <meshBasicMaterial color="#94A3B8" />
        </mesh>
      </group>

      {/* 6. MATRIZ DE ESTADO LED CENTRAL (Actividad, Potencia, Red) */}
      <mesh position={[0, height / 2 - 0.08, depth / 2 + 0.03]}>
        <boxGeometry args={[0.24, 0.03, 0.01]} />
        <meshBasicMaterial color={ledColor} />
      </mesh>

      {/* Puertos de telemetría de fibra óptica (Cian) */}
      <mesh position={[-0.1, -height / 2 + 0.08, depth / 2 + 0.03]}>
        <boxGeometry args={[0.05, 0.03, 0.01]} />
        <meshBasicMaterial color="#00F0FF" />
      </mesh>
      <mesh position={[0, -height / 2 + 0.08, depth / 2 + 0.03]}>
        <boxGeometry args={[0.05, 0.03, 0.01]} />
        <meshBasicMaterial color="#05DF72" />
      </mesh>
      <mesh position={[0.1, -height / 2 + 0.08, depth / 2 + 0.03]}>
        <boxGeometry args={[0.05, 0.03, 0.01]} />
        <meshBasicMaterial color="#38BDF8" />
      </mesh>
    </group>
  );
};
