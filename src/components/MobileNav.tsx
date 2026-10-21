import React from 'react';
import { Activity, Cpu, DollarSign, Layers, Bell } from 'lucide-react';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unresolvedAlertsCount: number;
  totalGpus: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  unresolvedAlertsCount,
  totalGpus
}) => {
  const tabs = [
    { id: 'overview', label: 'Resumen', icon: Activity },
    { id: 'fleet', label: 'GPUs', icon: Cpu, badge: totalGpus },
    { id: 'economics', label: 'ROI & Excel', icon: DollarSign },
    { id: 'apis', label: 'APIs & Bot', icon: Layers },
    { id: 'alerts', label: 'Alertas', icon: Bell, badge: unresolvedAlertsCount > 0 ? unresolvedAlertsCount : undefined },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#06080E]/95 backdrop-blur-2xl px-2 py-2 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-[#05F292]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? 'text-[#05F292] scale-110 drop-shadow-[0_0_8px_rgba(5,242,146,0.6)]' : 'text-slate-400'} transition-all`} />
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-mono-num font-bold ${
                      tab.id === 'alerts' && unresolvedAlertsCount > 0
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-white/[0.1] text-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${isActive ? 'font-bold text-white' : 'text-slate-400'}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-[#05F292] shadow-[0_0_8px_#05F292]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
