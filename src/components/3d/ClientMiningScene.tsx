import React from 'react';
import { DigitalMiningRack } from './DigitalMiningRack';
import { ProductionCore } from './ProductionCore';
import { ProductionFlow } from './ProductionFlow';
import type { 
  ClientVisualizationContractNode, 
  Selected3DObject 
} from '../../types/visualization';

interface ClientMiningSceneProps {
  contract: ClientVisualizationContractNode;
  selectedId?: string;
  onSelect?: (obj: Selected3DObject) => void;
  isPaused?: boolean;
}

export const ClientMiningScene: React.FC<ClientMiningSceneProps> = ({
  contract,
  selectedId,
  onSelect,
  isPaused = false
}) => {
  return (
    <group>
      {/* 1. RACK DIGITAL DEL CONTRATO (Izquierda) */}
      <DigitalMiningRack
        position={[-3.2, 0, 0]}
        contract={contract}
        selectedId={selectedId}
        onSelect={onSelect}
        isPaused={isPaused}
      />

      {/* 2. LÍNEAS DE FLUJO DE PRODUCCIÓN DE FIBRA ÓPTICA (Centro) */}
      <ProductionFlow
        startPos={[-2.2, 1.8, 0]}
        endPos={[-0.8, 1.8, 0]}
        color="#05DF72"
        isPaused={isPaused}
      />
      <ProductionFlow
        startPos={[-2.2, 1.0, 0.2]}
        endPos={[-0.8, 1.2, 0.1]}
        color="#00F0FF"
        isPaused={isPaused}
      />

      {/* 3. NÚCLEO CUÁNTICO DE EMISIÓN DE PRL (Centro/Derecha) */}
      <ProductionCore
        position={[1.5, 1.8, 0]}
        producedPrl={contract.productionCore.accumulatedPrl}
        usdValue={contract.productionCore.accumulatedNetProfitUsd}
        isSelected={selectedId === 'core-production-main'}
        onSelect={onSelect}
        isPaused={isPaused}
      />

      {/* 4. PLATAFORMA ISOMÉTRICA FINTECH (Suelo reflectante) */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[14, 0.1, 10]} />
        <meshStandardMaterial
          color="#080B12"
          roughness={0.4}
          metalness={0.8}
        />
      </mesh>

      {/* Rejilla de coordenadas táctica en el suelo */}
      <gridHelper
        args={[14, 28, '#05DF72', '#1E293B']}
        position={[0, 0.01, 0]}
      />
    </group>
  );
};
