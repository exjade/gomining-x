import { useState, useEffect, useCallback } from 'react';
import { MiningVisualizationService } from '../services/miningVisualizationService';
import type { 
  ClientVisualizationContractNode, 
  AdminVisualizationState 
} from '../types/visualization';
import type { MergedGPUWorker, FleetSummary } from '../types/minerx';

export function useMiningVisualization(
  summary?: FleetSummary,
  workers: MergedGPUWorker[] = [],
  unresolvedAlertsCount = 0,
  activeContractId?: string
) {
  const service = MiningVisualizationService.getInstance();
  
  const [clientNode, setClientNode] = useState<ClientVisualizationContractNode | null>(() => 
    service.getClientContractVisualState(activeContractId)
  );

  const [adminState, setAdminState] = useState<AdminVisualizationState | null>(() => 
    summary ? service.getAdminInfrastructureVisualState(summary, workers, unresolvedAlertsCount) : null
  );

  const refreshData = useCallback(() => {
    setClientNode(service.getClientContractVisualState(activeContractId));
    if (summary) {
      setAdminState(service.getAdminInfrastructureVisualState(summary, workers, unresolvedAlertsCount));
    }
  }, [summary, workers, unresolvedAlertsCount, activeContractId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return {
    clientNode,
    adminState,
    refreshData
  };
}
