import React from 'react';
import { Cpu, Server, ArrowRight } from 'lucide-react';
import type { 
  VisualizationMode, 
  ClientVisualizationContractNode, 
  AdminVisualizationState, 
  Selected3DObject 
} from '../../types/visualization';

interface AccessibleObjectListProps {
  mode: VisualizationMode;
  clientNode: ClientVisualizationContractNode | null;
  adminState: AdminVisualizationState | null;
  onSelectObject: (obj: Selected3DObject) => void;
  isDarkTheme?: boolean;
}

export const AccessibleObjectList: React.FC<AccessibleObjectListProps> = ({
  mode,
  clientNode,
  adminState,
  onSelectObject,
  isDarkTheme = true
}) => {
  return (
    <div className={`p-4 rounded-3xl border transition-all ${
      isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
    }`}>
      <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
        <h4 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-400' : 'text-slate-700'}`}>
          Navegación Accesible por Teclado y Lista de Elementos
        </h4>
        <span className={`text-[10px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Presiona Tab + Enter</span>
      </div>

      <div className="space-y-2">
        {mode === 'CLIENT' && clientNode && (
          <>
            <button
              type="button"
              onClick={() => onSelectObject({
                id: clientNode.contractId,
                type: 'CONTRACT_RACK',
                title: `Contrato: ${clientNode.packageName}`,
                subtitle: `${clientNode.contractedTh} TH/s • ${clientNode.status}`,
                healthStatus: clientNode.status === 'ACTIVE' ? 'OPTIMAL' : 'DEGRADED',
                position: [-3.2, 0, 0],
                rawPayload: clientNode
              })}
              className={`w-full flex items-center justify-between p-3 rounded-2xl focus:ring-2 focus:ring-[#05DF72] transition-all text-left font-mono text-xs cursor-pointer ${
                isDarkTheme ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Cpu className="h-4 w-4 text-[#05DF72]" />
                <div>
                  <span className={`font-bold block ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{clientNode.packageName}</span>
                  <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Rack de Contrato • {clientNode.contractedTh} TH/s</span>
                </div>
              </div>
              <ArrowRight className={`h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
            </button>

            {clientNode.powerModules.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => onSelectObject({
                  id: mod.id,
                  type: 'POWER_MODULE',
                  title: mod.label,
                  subtitle: `${mod.powerTh} TH/s • ${mod.producedPrl} PRL/día`,
                  healthStatus: mod.status,
                  position: [-3.2, 1.5, 0],
                  rawPayload: mod
                })}
                className={`w-full flex items-center justify-between p-2.5 px-3 rounded-2xl focus:ring-2 focus:ring-cyan-400 transition-all text-left font-mono text-xs cursor-pointer ${
                  isDarkTheme ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-[#05DF72]" />
                  <span className={isDarkTheme ? 'text-slate-200' : 'text-slate-800 font-medium'}>{mod.label}</span>
                </div>
                <span className="font-bold text-cyan-500">{mod.powerTh} TH/s</span>
              </button>
            ))}
          </>
        )}

        {mode === 'ADMIN' && adminState && (
          <>
            {adminState.racks.map((rack) => (
              <button
                key={rack.rackId}
                type="button"
                onClick={() => onSelectObject({
                  id: rack.rackId,
                  type: 'SERVER_RACK',
                  title: rack.rackLabel,
                  subtitle: `${rack.totalHashrateTh} TH/s • ${rack.activeGpus} GPUs Activas`,
                  healthStatus: rack.status,
                  position: [0, 0, 0],
                  rawPayload: rack
                })}
                className={`w-full flex items-center justify-between p-3 rounded-2xl focus:ring-2 focus:ring-[#00F0FF] transition-all text-left font-mono text-xs cursor-pointer ${
                  isDarkTheme ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Server className="h-4 w-4 text-cyan-500" />
                  <div>
                    <span className={`font-bold block ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{rack.rackLabel}</span>
                    <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{rack.activeGpus} GPUs Activas • {rack.overallEfficiencyPct}% Eficiencia</span>
                  </div>
                </div>
                <span className="font-bold text-[#05DF72]">{rack.totalHashrateTh} TH/s</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
