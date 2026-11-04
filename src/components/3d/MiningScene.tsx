import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { SceneCamera, type CameraAnglePreset } from './SceneCamera';
import { SceneControls } from './SceneControls';
import { ClientMiningScene } from './ClientMiningScene';
import { AdminInfrastructureScene } from './AdminInfrastructureScene';
import { SceneFallback } from '../dashboard3d/SceneFallback';
import type { 
  VisualizationMode, 
  ClientVisualizationContractNode, 
  AdminVisualizationState, 
  Selected3DObject 
} from '../../types/visualization';

interface MiningSceneProps {
  mode: VisualizationMode;
  clientNode: ClientVisualizationContractNode | null;
  adminState: AdminVisualizationState | null;
  selectedObject: Selected3DObject | null;
  cameraTarget: [number, number, number] | null;
  onSelectObject: (obj: Selected3DObject | null) => void;
  isPaused?: boolean;
  forced2D?: boolean;
  isDarkTheme?: boolean;
  cameraPreset?: CameraAnglePreset;
}

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

export const MiningScene: React.FC<MiningSceneProps> = ({
  mode,
  clientNode,
  adminState,
  selectedObject,
  cameraTarget,
  onSelectObject,
  isPaused = false,
  forced2D = false,
  isDarkTheme = true,
  cameraPreset = 'ISO_45'
}) => {
  const hasWebGL = useMemo(() => checkWebGLSupport(), []);

  // Si WebGL falla o el usuario solicita modo 2D táctico:
  if (!hasWebGL || forced2D) {
    return (
      <SceneFallback
        mode={mode}
        clientNode={clientNode}
        adminState={adminState}
        selectedObject={selectedObject}
        onSelectObject={onSelectObject}
        isDarkTheme={isDarkTheme}
      />
    );
  }

  const defaultCamPos: [number, number, number] = mode === 'CLIENT' ? [8.5, 7.5, 11] : [13, 11, 15];

  return (
    <div className="relative w-full h-full min-h-[580px] rounded-3xl overflow-hidden select-none bg-[#070A12] shadow-inner">
      <Canvas
        camera={{ position: defaultCamPos, fov: 40 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance'
        }}
        onPointerMissed={() => onSelectObject(null)}
      >
        {/* Fondo y niebla cinematográfica de estudio de datacenter */}
        <color attach="background" args={['#070A12']} />
        <fog attach="fog" args={['#070A12', 18, 42]} />

        <Suspense fallback={null}>
          {/* Cámara cinematográfica con lerp y aproximación amortiguada */}
          <SceneCamera
            cameraTarget={cameraTarget}
            defaultPosition={defaultCamPos}
            isPaused={isPaused}
            cameraPreset={cameraPreset}
          />

          {/* Controles de órbita para mouse y touch */}
          <SceneControls
            enabled={true}
            target={cameraTarget || [0, 1.5, 0]}
          />

          {/* ILUMINACIÓN DE ESTUDIO INDUSTRIAL FINTECH */}
          {/* Luz ambiental */}
          <ambientLight intensity={0.9} />

          {/* Key Light cenital principal */}
          <directionalLight
            position={[10, 16, 12]}
            intensity={2.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />

          {/* Fill Light fría de contorno cian sobre los metales */}
          <directionalLight
            position={[-12, 8, -6]}
            intensity={1.4}
            color="#00F0FF"
          />

          {/* Rim Light esmeralda rozante en la parte posterior */}
          <directionalLight
            position={[0, 10, -12]}
            intensity={1.2}
            color="#05DF72"
          />

          {/* Luz de suelo inferior suave */}
          <pointLight
            position={[0, 0.5, 0]}
            intensity={1.0}
            color="#00F0FF"
            distance={8}
          />

          {/* Renderizado condicional según modo activo */}
          {mode === 'CLIENT' && clientNode && (
            <ClientMiningScene
              contract={clientNode}
              selectedId={selectedObject?.id}
              onSelect={onSelectObject}
              isPaused={isPaused}
            />
          )}

          {mode === 'ADMIN' && adminState && (
            <AdminInfrastructureScene
              state={adminState}
              selectedId={selectedObject?.id}
              onSelect={onSelectObject}
              isPaused={isPaused}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
};
