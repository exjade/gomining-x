import { useState, useCallback } from 'react';
import type { Selected3DObject } from '../types/visualization';

export function useSceneSelection() {
  const [selectedObject, setSelectedObject] = useState<Selected3DObject | null>(null);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [isFocusing, setIsFocusing] = useState<boolean>(false);

  const selectObject = useCallback((obj: Selected3DObject | null) => {
    setSelectedObject(obj);
    if (obj) {
      setCameraTarget(obj.position);
      setIsFocusing(true);
    } else {
      setCameraTarget(null);
      setIsFocusing(false);
    }
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedObject(null);
    setCameraTarget([0, 0, 0]);
    setIsFocusing(false);
  }, []);

  return {
    selectedObject,
    cameraTarget,
    isFocusing,
    selectObject,
    resetSelection
  };
}
