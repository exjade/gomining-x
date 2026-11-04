import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type CameraAnglePreset = 'ISO_45' | 'TOP_DOWN' | 'FOCUS' | 'ORBIT';

interface SceneCameraProps {
  cameraTarget: [number, number, number] | null;
  defaultPosition?: [number, number, number];
  isPaused?: boolean;
  cameraPreset?: CameraAnglePreset;
}

export const SceneCamera: React.FC<SceneCameraProps> = ({
  cameraTarget,
  defaultPosition = [14, 12, 16],
  isPaused = false,
  cameraPreset = 'ISO_45'
}) => {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(0, 0, 0));
  const desiredCamPos = useRef(new THREE.Vector3(...defaultPosition));
  const orbitAngle = useRef<number>(0);

  useEffect(() => {
    if (cameraPreset === 'TOP_DOWN') {
      targetVec.current.set(0, 0, 0);
      desiredCamPos.current.set(0, 24, 3.5);
    } else if (cameraPreset === 'FOCUS' && cameraTarget) {
      targetVec.current.set(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
      desiredCamPos.current.set(
        cameraTarget[0] + 4.2,
        cameraTarget[1] + 3.2,
        cameraTarget[2] + 4.8
      );
    } else if (cameraTarget) {
      targetVec.current.set(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
      desiredCamPos.current.set(
        cameraTarget[0] + 5.2,
        cameraTarget[1] + 4.0,
        cameraTarget[2] + 6.2
      );
    } else {
      targetVec.current.set(0, 1.2, 0);
      desiredCamPos.current.set(...defaultPosition);
    }
  }, [cameraTarget, defaultPosition, cameraPreset]);

  useFrame((_, delta) => {
    if (isPaused) return;

    if (cameraPreset === 'ORBIT') {
      orbitAngle.current += delta * 0.25;
      const radius = 18;
      desiredCamPos.current.set(
        Math.sin(orbitAngle.current) * radius,
        11,
        Math.cos(orbitAngle.current) * radius
      );
      targetVec.current.set(0, 1.2, 0);
    }

    const factor = Math.min(delta * 4.5, 0.12);
    camera.position.lerp(desiredCamPos.current, factor);
    camera.lookAt(targetVec.current);
  });

  return null;
};
