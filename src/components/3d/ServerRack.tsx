import React, { useState } from 'react';
import { PhysicalMiner } from './PhysicalMiner';
import { WorkerIndicator } from './WorkerIndicator';
import { SelectionBrackets3D } from './SelectionBrackets3D';
import type { 
  AdminVisualizationRackNode, 
  Selected3DObject 
} from '../../types/visualization';

interface ServerRackProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  rack: AdminVisualizationRackNode;
  selectedId?: string;
  onSelect?: (obj: Selected3DObject) => void;
  isPaused?: boolean;
}

export const ServerRack: React.FC<ServerRackProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  rack,
  selectedId,
  onSelect,
  isPaused = false
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const isRackSelected = selectedId === rack.rackId;

  const handleRackClick = (e: any) => {
    e.stopPropagation();
    onSelect?.({
      id: rack.rackId,
      type: 'SERVER_RACK',
      title: rack.rackLabel,
      subtitle: `${rack.activeGpus}/${rack.totalGpus} GPUs Activas • ${rack.totalHashrateTh.toFixed(1)} TH/s • Eficiencia: ${rack.overallEfficiencyPct.toFixed(1)}%`,
      healthStatus: rack.status,
      position,
      rawPayload: rack
    });
  };

  const width = 2.05;
  const height = 4.3;
  const depth = 1.35;
  const pillarThick = 0.08;

  const statusColor = rack.status === 'OPTIMAL' ? '#05DF72' : rack.status === 'DEGRADED' ? '#F59E0B' : '#EF4444';

  return (
    <group
      position={position}
      rotation={rotation}
      onPointerOver={(e) => {
        e.stopPropagation();
        setIsHovered(true);
      }}
      onPointerOut={() => setIsHovered(false)}
      onClick={handleRackClick}
    >
      {/* 0. CORCHETES TÁCTICOS 3D WARETRACK EN SELECCIÓN/HOVER */}
      <SelectionBrackets3D
        width={width + 0.25}
        height={height + 0.2}
        depth={depth + 0.25}
        color={isRackSelected ? '#00F0FF' : rack.status === 'OPTIMAL' ? '#05DF72' : '#F59E0B'}
        visible={isRackSelected || isHovered}
        pulse={isRackSelected}
      />

      {/* 1. PEDESTAL INFERIOR REFORZADO */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[width + 0.1, 0.16, depth + 0.1]} />
        <meshStandardMaterial
          color="#060912"
          metalness={0.92}
          roughness={0.2}
        />
      </mesh>

      {/* 2. TECHO / CANOPIA SUPERIOR CON TAPA VENTILADA */}
      <mesh position={[0, height - 0.08, 0]}>
        <boxGeometry args={[width + 0.08, 0.16, depth + 0.08]} />
        <meshStandardMaterial
          color={isRackSelected || isHovered ? '#1E293B' : '#0B0F19'}
          metalness={0.9}
          roughness={0.25}
          emissive={isRackSelected ? '#00F0FF' : '#000000'}
          emissiveIntensity={isRackSelected ? 0.3 : 0}
        />
      </mesh>

      {/* Placa frontal luminosa del rack con nombre */}
      <mesh position={[0, height - 0.08, depth / 2 + 0.05]}>
        <boxGeometry args={[width - 0.4, 0.08, 0.02]} />
        <meshStandardMaterial
          color="#070A12"
          emissive={statusColor}
          emissiveIntensity={0.65}
        />
      </mesh>

      {/* 3. COLUMNAS ESTRUCTURALES DE LAS 4 ESQUINAS (Estructura Abierta) */}
      {/* Esquina Frontal Izquierda */}
      <mesh position={[-width / 2 + pillarThick / 2, height / 2, depth / 2 - pillarThick / 2]}>
        <boxGeometry args={[pillarThick, height - 0.32, pillarThick]} />
        <meshStandardMaterial color="#334155" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* Esquina Frontal Derecha */}
      <mesh position={[width / 2 - pillarThick / 2, height / 2, depth / 2 - pillarThick / 2]}>
        <boxGeometry args={[pillarThick, height - 0.32, pillarThick]} />
        <meshStandardMaterial color="#334155" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* Esquina Posterior Izquierda */}
      <mesh position={[-width / 2 + pillarThick / 2, height / 2, -depth / 2 + pillarThick / 2]}>
        <boxGeometry args={[pillarThick, height - 0.32, pillarThick]} />
        <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Esquina Posterior Derecha */}
      <mesh position={[width / 2 - pillarThick / 2, height / 2, -depth / 2 + pillarThick / 2]}>
        <boxGeometry args={[pillarThick, height - 0.32, pillarThick]} />
        <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* 4. PANEL TRASERO PERFORADO PARA VENTILACIÓN */}
      <mesh position={[0, height / 2, -depth / 2 + 0.02]}>
        <boxGeometry args={[width - 0.16, height - 0.34, 0.02]} />
        <meshStandardMaterial
          color="#070A14"
          metalness={0.9}
          roughness={0.4}
        />
      </mesh>

      {/* 5. PANELES LATERALES DE CRISTAL AHUMADO TRASLÚCIDO */}
      <mesh position={[-width / 2 + 0.02, height / 2, 0]}>
        <boxGeometry args={[0.02, height - 0.34, depth - 0.16]} />
        <meshPhysicalMaterial
          color="#050812"
          transmission={0.65}
          roughness={0.15}
          metalness={0.1}
          transparent={true}
          opacity={0.45}
        />
      </mesh>
      <mesh position={[width / 2 - 0.02, height / 2, 0]}>
        <boxGeometry args={[0.02, height - 0.34, depth - 0.16]} />
        <meshPhysicalMaterial
          color="#050812"
          transmission={0.65}
          roughness={0.15}
          metalness={0.1}
          transparent={true}
          opacity={0.45}
        />
      </mesh>

      {/* 6. PUERTA FRONTAL DE CRISTAL TINTADO (Transparente para ver los mineros activos) */}
      <mesh position={[0, height / 2, depth / 2 + 0.02]}>
        <planeGeometry args={[width - 0.18, height - 0.34]} />
        <meshPhysicalMaterial
          color="#030610"
          transmission={0.88}
          roughness={0.08}
          metalness={0.1}
          transparent={true}
          opacity={0.18}
        />
      </mesh>

      {/* 7. BALIZA DE TELEMETRÍA EN LA CÚSPIDE */}
      <WorkerIndicator
        position={[0, height + 0.12, 0]}
        status={rack.status}
        isPaused={isPaused}
      />

      {/* 8. SERVIDORES BLADE APILADOS DENTRO DEL RACK (Completamente Visibles) */}
      {rack.miners.map((m, idx) => {
        const slotCount = Math.max(1, rack.miners.length);
        const spacing = (height - 0.85) / Math.max(1, slotCount);
        const yPos = 0.42 + idx * spacing;
        const minerPos: [number, number, number] = [0, yPos, 0.06];

        return (
          <PhysicalMiner
            key={m.worker.id || `miner-slot-${idx}`}
            position={minerPos}
            worker={m.worker}
            healthStatus={m.healthStatus}
            fanRpm={m.fanRpm}
            temperatureC={m.temperatureC}
            powerWatts={m.powerWatts}
            slotIndex={m.slotIndex}
            isSelected={selectedId === (m.worker.workerName || m.worker.id)}
            onSelect={onSelect}
            isPaused={isPaused}
          />
        );
      })}

      {/* 9. HALO LUMINOSO DE SUELO FINTECH */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 0.8, depth + 0.8]} />
        <meshBasicMaterial
          color={isRackSelected ? '#00F0FF' : statusColor}
          transparent
          opacity={isRackSelected ? 0.3 : isHovered ? 0.2 : 0.08}
        />
      </mesh>
    </group>
  );
};
