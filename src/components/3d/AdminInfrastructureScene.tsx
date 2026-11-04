import React from 'react';
import { ServerRack } from './ServerRack';
import { ProductionCore } from './ProductionCore';
import { ProductionFlow } from './ProductionFlow';
import type { 
  AdminVisualizationState, 
  Selected3DObject 
} from '../../types/visualization';

interface AdminInfrastructureSceneProps {
  state: AdminVisualizationState;
  selectedId?: string;
  onSelect?: (obj: Selected3DObject) => void;
  isPaused?: boolean;
}

export const AdminInfrastructureScene: React.FC<AdminInfrastructureSceneProps> = ({
  state,
  selectedId,
  onSelect,
  isPaused = false
}) => {
  const rackCount = state.racks.length;

  // Disposición en semicírculo panorámico (Anfiteatro de Control)
  // Permite ver la cara frontal de todos los racks y el núcleo central sin obstrucciones
  const getRackTransform = (index: number, total: number): { position: [number, number, number], rotation: [number, number, number] } => {
    if (total <= 1) {
      return { position: [-3.2, 0, -1.0], rotation: [0, 0.3, 0] };
    }
    if (total === 2) {
      return index === 0
        ? { position: [-3.8, 0, -1.2], rotation: [0, 0.38, 0] }
        : { position: [3.8, 0, -1.2], rotation: [0, -0.38, 0] };
    }
    // 3 o más racks: arco continuo
    const arcAngle = Math.PI * 0.55; // 100 grados de curvatura
    const startAngle = -arcAngle / 2;
    const step = arcAngle / Math.max(1, total - 1);
    const angle = startAngle + index * step;
    const radius = 5.4;

    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius + 2.0;
    const rotY = -angle * 0.85;

    return {
      position: [Number(x.toFixed(2)), 0, Number(z.toFixed(2))],
      rotation: [0, Number(rotY.toFixed(2)), 0]
    };
  };

  const corePos: [number, number, number] = [0, 1.8, 0.2];

  return (
    <group>
      {/* 1. RACKS DE SERVIDORES GPU EN ARCO PANORÁMICO */}
      {state.racks.map((rack, idx) => {
        const { position, rotation } = getRackTransform(idx, rackCount);

        return (
          <group key={rack.rackId}>
            <ServerRack
              position={position}
              rotation={rotation}
              rack={rack}
              selectedId={selectedId}
              onSelect={onSelect}
              isPaused={isPaused}
            />

            {/* Cableado óptico de telemetría hacia el núcleo central */}
            <ProductionFlow
              startPosition={[position[0], 0.2, position[2]]}
              endPosition={[corePos[0], 0.3, corePos[2]]}
              isActive={rack.status === 'OPTIMAL'}
              isPaused={isPaused}
              color={rack.status === 'OPTIMAL' ? '#00F0FF' : '#F59E0B'}
            />
          </group>
        );
      })}

      {/* 2. ESTACIÓN CENTRAL HOLOGRÁFICA: MINERX PROFIT ENGINE */}
      <ProductionCore
        position={corePos}
        producedPrl={state.summary.dailyGrossRevenueUSD / (state.profitEngineMetrics.prlPriceUsd || 1.47)}
        usdValue={state.summary.dailyGrossRevenueUSD}
        isSelected={selectedId === 'core-profit-engine-admin'}
        onSelect={(obj) => {
          onSelect?.({
            ...obj,
            id: 'core-profit-engine-admin',
            type: 'PROFIT_CORE',
            title: 'MinerX Profit Engine Central',
            subtitle: `Tasa: ${state.profitEngineMetrics.baseRatePrlHour} PRL/TH/h • Spot: $${state.profitEngineMetrics.prlPriceUsd.toFixed(2)} USD • ${state.profitEngineMetrics.engineStatus}`,
            healthStatus: state.profitEngineMetrics.engineStatus === 'ACTIVE' ? 'OPTIMAL' : 'DEGRADED',
            position: corePos,
            rawPayload: state.profitEngineMetrics
          });
        }}
        isPaused={isPaused}
      />

      {/* 3. PLATAFORMA DE DATACENTER DE TITANIO Y RESINA OSCURA */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <cylinderGeometry args={[8.8, 9.2, 0.12, 48]} />
        <meshStandardMaterial
          color="#060912"
          roughness={0.25}
          metalness={0.88}
        />
      </mesh>

      {/* Anillo de borde perimetral iluminado en la plataforma */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[8.4, 8.55, 64]} />
        <meshBasicMaterial color="#00F0FF" />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 4.28, 48]} />
        <meshBasicMaterial color="#05DF72" />
      </mesh>

      {/* Rejilla de alta precisión en el suelo del datacenter */}
      <gridHelper
        args={[18, 36, '#00F0FF', '#151D2F']}
        position={[0, 0.01, 0]}
      />
    </group>
  );
};
