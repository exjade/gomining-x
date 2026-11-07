import React from 'react';
import { Activity, Cpu, DollarSign, Bell, Sliders, Package, Share2 } from 'lucide-react';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unresolvedAlertsCount: number;
  totalGpus: number;
  isDarkTheme?: boolean;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  unresolvedAlertsCount,
  totalGpus,
  isDarkTheme = false
}) => {
  const isLight = !isDarkTheme;
  const isAdmin = activeTab.startsWith('admin_');

  interface MobileTabItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const fleetTabs: MobileTabItem[] = [
    { id: 'overview', label: 'Resumen', icon: Activity },
    { id: 'fleet', label: 'GPUs', icon: Cpu, badge: totalGpus },
    { id: 'economics', label: 'ROI & Excel', icon: DollarSign },
    { id: 'alerts', label: 'Alertas', icon: Bell, badge: unresolvedAlertsCount > 0 ? unresolvedAlertsCount : undefined },
  ];

  const adminTabs: MobileTabItem[] = [
    { id: 'admin_overview', label: 'Resumen', icon: Activity },
    { id: 'admin_engine', label: 'Motor', icon: Sliders },
    { id: 'admin_packages', label: 'Paquetes', icon: Package },
    { id: 'admin_referrals', label: 'Referidos', icon: Share2 },
    { id: 'admin_ledger', label: 'Ledger', icon: DollarSign },
  ];

  const tabs = isAdmin ? adminTabs : fleetTabs;

  return (
    <nav className={isAdmin ? 'minerx-admin-mobile-nav is-admin md:hidden' : `minerx-admin-mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-2xl px-2 py-2 pb-safe transition-all ${
      isLight 
        ? 'bg-white/95 border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]' 
        : 'bg-[#06080E]/95 border-white/[0.08] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]'
    }`}>
      <div className={isAdmin ? 'minerx-admin-mobile-nav-items' : 'flex items-center justify-around max-w-md mx-auto'}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={isAdmin ? `minerx-admin-mobile-item ${isActive ? 'is-active' : ''}` : `relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
                isActive 
                ? 'text-[#05DF72]'
                  : isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={isAdmin ? `minerx-admin-mobile-icon ${isActive ? 'is-active' : ''}` : `h-5 w-5 ${
                  isActive 
                    ? 'text-[#05DF72] scale-110 drop-shadow-[0_0_8px_rgba(5,223,114,0.4)]'
                    : isLight ? 'text-slate-400' : 'text-slate-500'
                } transition-all`} />
                {tab.badge !== undefined && (
                  <span
                    className={isAdmin ? `minerx-admin-mobile-badge ${tab.id === 'alerts' && unresolvedAlertsCount > 0 ? 'is-alert' : ''}` : `absolute -top-1.5 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-mono-num font-bold ${
                      tab.id === 'alerts' && unresolvedAlertsCount > 0
                        ? 'bg-rose-500 text-white animate-pulse'
                        : isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/[0.1] text-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={isAdmin ? `minerx-admin-mobile-label ${isActive ? 'is-active' : ''}` : `text-[10px] mt-1 font-medium transition-colors ${
                isActive 
                  ? isLight ? 'font-bold text-slate-950' : 'font-bold text-white' 
                  : isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {tab.label}
              </span>
              {isActive && (
                <span className={isAdmin ? 'minerx-admin-mobile-active-indicator' : 'absolute bottom-0 h-0.5 w-6 rounded-full bg-[#05DF72] shadow-[0_0_8px_#05DF72]'} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
