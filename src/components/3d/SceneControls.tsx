import React, { useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface SceneControlsProps {
  enabled?: boolean;
  target?: [number, number, number];
}

export const SceneControls: React.FC<SceneControlsProps> = ({
  enabled = true,
  target = [0, 0, 0]
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={enabled}
      target={target}
      enableDamping={true}
      dampingFactor={0.05}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      panSpeed={0.6}
      minDistance={4}
      maxDistance={40}
      maxPolarAngle={Math.PI / 2 - 0.05} // No pasar por debajo del suelo
      minPolarAngle={0.1}
      makeDefault
    />
  );
};
