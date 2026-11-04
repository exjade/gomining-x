import React, { useState } from 'react';
import { SelectionBrackets3D } from './SelectionBrackets3D';
import type { 
  ClientVisualizationContractNode, 
  PowerModuleVisualItem, 
  Selected3DObject 
} from '../../types/visualization';

interface DigitalMiningRackProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  contract: ClientVisualizationContractNode;
  selectedId?: string;
  onSelect?: (obj: Selected3DObject) => void;
  isPaused?: boolean;
}

export const DigitalMiningRack: React.FC<DigitalMiningRackProps> = ({
  position = [-3.8, 0, 0],
  rotation = [0, 0, 0],
  contract,
  selectedId,
  onSelect
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const isRackSelected = selectedId === contract.contractId;

  const handleRackClick = (e: any) => {
    e.stopPropagation();
    onSelect?.({
      id: contract.contractId,
      type: 'CONTRACT_RACK',
      title: `Contrato: ${contract.packageName}`,
      subtitle: `${contract.contractedTh} TH/s Contratados • Estado: ${contract.status}`,
      healthStatus: contract.status === 'ACTIVE' ? 'OPTIMAL' : 'DEGRADED',
      position,
      rawPayload: contract
    });
  };

  const handleModuleClick = (e: any, mod: PowerModuleVisualItem, modPos: [number, number, number]) => {
    e.stopPropagation();
    onSelect?.({
      id: mod.id,
      type: 'POWER_MODULE',
      title: `Módulo de Potencia: ${mod.label}`,
      subtitle: `${mod.powerTh} TH/s Asignados • Rendimiento: ${mod.producedPrl} PRL/día`,
      healthStatus: mod.status,
      position: [position[0] + modPos[0], position[1] + modPos[1], position[2] + modPos[2]],
      rawPayload: mod
    });
  };

  // Dimensiones del rack
  const rackWidth = 2.1;
  const rackHeight = 4.1;
  const rackDepth = 1.35;
  const pillarThick = 0.08;

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
      {/* 0. CORCHETES TÁCTICOS 3D WARETRACK */}
      <SelectionBrackets3D
        width={rackWidth + 0.25}
        height={rackHeight + 0.2}
        depth={rackDepth + 0.25}
        color={isRackSelected ? '#00F0FF' : '#05DF72'}
        visible={isRackSelected || isHovered}
        pulse={isRackSelected}
      />

      {/* 1. BASE INFERIOR REFORZADA */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[rackWidth + 0.1, 0.16, rackDepth + 0.1]} />
        <meshStandardMaterial
          color="#060912"
          metalness={0.92}
          roughness={0.2}
        />
      </mesh>

      {/* 2. TECHO / CANOPIA SUPERIOR */}
      <mesh position={[0, rackHeight - 0.08, 0]}>
        <boxGeometry args={[rackWidth + 0.08, 0.16, rackDepth + 0.08]} />
        <meshStandardMaterial
          color={isRackSelected || isHovered ? '#1E293B' : '#0B0F19'}
          metalness={0.9}
          roughness={0.25}
          emissive={isRackSelected ? '#05DF72' : '#000000'}
          emissiveIntensity={isRackSelected ? 0.3 : 0}
        />
      </mesh>

      {/* Placa frontal luminosa con nombre del contrato */}
      <mesh position={[0, rackHeight - 0.08, rackDepth / 2 + 0.05]}>
        <boxGeometry args={[rackWidth - 0.4, 0.08, 0.02]} />
        <meshStandardMaterial
          color="#070A12"
          emissive="#05DF72"
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* 3. COLUMNAS ESTRUCTURALES EN LAS 4 ESQUINAS */}
      <mesh position={[-rackWidth / 2 + pillarThick / 2, rackHeight / 2, rackDepth / 2 - pillarThick / 2]}>
        <boxGeometry args={[pillarThick, rackHeight - 0.32, pillarThick]} />
        <meshStandardMaterial color="#334155" metalness={0.95} roughness={0.15} />
      </mesh>
      <mesh position={[rackWidth / 2 - pillarThick / 2, rackHeight / 2, rackDepth / 2 - pillarThick / 2]}>
        <boxGeometry args={[pillarThick, rackHeight - 0.32, pillarThick]} />
        <meshStandardMaterial color="#334155" metalness={0.95} roughness={0.15} />
      </mesh>
      <mesh position={[-rackWidth / 2 + pillarThick / 2, rackHeight / 2, -rackDepth / 2 + pillarThick / 2]}>
        <boxGeometry args={[pillarThick, rackHeight - 0.32, pillarThick]} />
        <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[rackWidth / 2 - pillarThick / 2, rackHeight / 2, -rackDepth / 2 + pillarThick / 2]}>
        <boxGeometry args={[pillarThick, rackHeight - 0.32, pillarThick]} />
        <meshStandardMaterial color="#1E293B" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* 4. PANEL POSTERIOR */}
      <mesh position={[0, rackHeight / 2, -rackDepth / 2 + 0.02]}>
        <boxGeometry args={[rackWidth - 0.16, rackHeight - 0.34, 0.02]} />
        <meshStandardMaterial color="#070A14" metalness={0.9} roughness={0.4} />
      </mesh>

      {/* 5. LATERALES DE CRISTAL ESMERALDA TRASLÚCIDO */}
      <mesh position={[-rackWidth / 2 + 0.02, rackHeight / 2, 0]}>
        <boxGeometry args={[0.02, rackHeight - 0.34, rackDepth - 0.16]} />
        <meshPhysicalMaterial
          color="#041812"
          transmission={0.7}
          roughness={0.12}
          metalness={0.1}
          transparent={true}
          opacity={0.5}
        />
      </mesh>
      <mesh position={[rackWidth / 2 - 0.02, rackHeight / 2, 0]}>
        <boxGeometry args={[0.02, rackHeight - 0.34, rackDepth - 0.16]} />
        <meshPhysicalMaterial
          color="#041812"
          transmission={0.7}
          roughness={0.12}
          metalness={0.1}
          transparent={true}
          opacity={0.5}
        />
      </mesh>

      {/* 6. PUERTA FRONTAL DE CRISTAL TINTADO ULTRA TRANSPARENTE */}
      <mesh position={[0, rackHeight / 2, rackDepth / 2 + 0.02]}>
        <planeGeometry args={[rackWidth - 0.18, rackHeight - 0.34]} />
        <meshPhysicalMaterial
          color="#030610"
          transmission={0.9}
          roughness={0.06}
          metalness={0.1}
          transparent={true}
          opacity={0.15}
        />
      </mesh>

      {/* 7. MÓDULOS DE POTENCIA (BLADES) APILADOS Y VISIBLES */}
      {contract.powerModules.map((mod, idx) => {
        const total = contract.powerModules.length;
        const spacing = (rackHeight - 0.85) / Math.max(1, total);
        const yPos = 0.45 + idx * spacing;
        const isModSelected = selectedId === mod.id;

        return (
          <group
            key={mod.id}
            position={[0, yPos, 0.06]}
            onClick={(e) => handleModuleClick(e, mod, [0, yPos, 0.06])}
          >
            {/* Chasis del blade modular */}
            <mesh>
              <boxGeometry args={[rackWidth - 0.28, 0.38, rackDepth - 0.25]} />
              <meshStandardMaterial
                color={isModSelected ? '#1E293B' : '#0B0F19'}
                metalness={0.9}
                roughness={0.2}
                emissive={isModSelected ? '#05DF72' : '#000000'}
                emissiveIntensity={isModSelected ? 0.35 : 0}
              />
            </mesh>

            {/* Placa frontal del módulo con haz de luz esmeralda */}
            <mesh position={[0, 0, (rackDepth - 0.25) / 2 + 0.015]}>
              <boxGeometry args={[rackWidth - 0.32, 0.32, 0.02]} />
              <meshStandardMaterial color="#060913" metalness={0.95} roughness={0.3} />
            </mesh>

            {/* Ranura LED indicadora de hashrate */}
            <mesh position={[-0.4, 0, (rackDepth - 0.25) / 2 + 0.03]}>
              <boxGeometry args={[0.5, 0.04, 0.01]} />
              <meshBasicMaterial color="#05DF72" />
            </mesh>

            {/* Indicador de potencia cian */}
            <mesh position={[0.4, 0, (rackDepth - 0.25) / 2 + 0.03]}>
              <boxGeometry args={[0.3, 0.04, 0.01]} />
              <meshBasicMaterial color="#00F0FF" />
            </mesh>
          </group>
        );
      })}

      {/* 8. HALO LUMINOSO DE SUELO */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[rackWidth + 0.8, rackDepth + 0.8]} />
        <meshBasicMaterial
          color="#05DF72"
          transparent
          opacity={isRackSelected ? 0.3 : isHovered ? 0.2 : 0.08}
        />
      </mesh>
    </group>
  );
};
