import React, { useState } from 'react';
import { 
  Plus, 
  Eye, 
  Play, 
  Pause, 
  X
} from 'lucide-react';
import { PromotionService } from '../../services/admin/promotionService';
import type { PromotionItem } from '../../types/admin';

interface PromotionsManagerViewProps {
  isDarkTheme?: boolean;
}

export const PromotionsManagerView: React.FC<PromotionsManagerViewProps> = ({
  isDarkTheme = true
}) => {
  const promoService = PromotionService.getInstance();
  const [promotions, setPromotions] = useState<PromotionItem[]>(promoService.getPromotions());
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    title: '',
    badge: 'OFERTA LIMITADA',
    description: '',
    discountPct: 10,
    bonusTh: 5,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  });

  const handleToggle = (id: string) => {
    promoService.togglePromotionActive(id);
    setPromotions(promoService.getPromotions());
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    promoService.savePromotion({
      title: formData.title,
      badge: formData.badge,
      description: formData.description,
      discountPct: formData.discountPct,
      bonusTh: formData.bonusTh,
      active: true,
      startDate: new Date(formData.startDate).toISOString(),
      endDate: new Date(formData.endDate).toISOString()
    });

    setPromotions(promoService.getPromotions());
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            Constructor de Promociones y Campañas
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Crea promociones y bonos que se publican automáticamente en el feed y dashboard de los usuarios.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#05DF72] text-slate-950 font-mono text-xs font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
        >
          <Plus className="h-4 w-4" />
          Crear Promoción
        </button>
      </div>

      {/* PROMOTIONS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {promotions.map((p) => (
          <div
            key={p.id}
            className={`p-6 rounded-3xl border flex flex-col justify-between transition-all ${
              isDarkTheme
                ? 'bg-[#0E1320]/80 border-white/[0.08] backdrop-blur-xl text-white shadow-lg'
                : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
                  {p.badge}
                </span>
                <span className={`text-[11px] font-mono flex items-center gap-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                  <Eye className="h-3.5 w-3.5" />
                  {p.clicksCount} clics · {p.conversionsCount} ventas
                </span>
              </div>

              <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{p.title}</h3>
              <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>{p.description}</p>

              <div className={`my-4 p-3.5 rounded-2xl border flex items-center justify-between font-mono text-xs ${
                isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <span className={`text-[10px] block font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>DESCUENTO</span>
                  <span className="font-bold text-[#05DF72]">{p.discountPct}% OFF</span>
                </div>
                {p.bonusTh && p.bonusTh > 0 && (
                  <div>
                    <span className={`text-[10px] block font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>BONO TH</span>
                    <span className="font-bold text-cyan-500">+{p.bonusTh} TH/s</span>
                  </div>
                )}
                <div>
                  <span className={`text-[10px] block font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>VIGENCIA</span>
                  <span className={`font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>{new Date(p.endDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className={`pt-3 border-t flex items-center justify-between ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
              <span className={`text-[11px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                Estado: <strong className={p.active ? 'text-emerald-500' : 'text-amber-500'}>{p.active ? 'PUBLICADA' : 'PAUSADA'}</strong>
              </span>

              <button
                onClick={() => handleToggle(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                  p.active
                    ? 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                    : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                }`}
              >
                {p.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {p.active ? 'Pausar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE PROMOTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl ${
              isDarkTheme ? 'bg-[#0E1320] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Nueva Campaña Promocional</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 font-mono text-xs">
              <div>
                <label className={`block mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>Título de la Promoción</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ej: Promo Black Friday Minero"
                  className={`w-full px-3.5 py-2.5 rounded-2xl border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>Insignia / Badge</label>
                  <input
                    type="text"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    className={`w-full px-3.5 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={formData.discountPct}
                    onChange={(e) => setFormData({ ...formData, discountPct: parseInt(e.target.value) || 0 })}
                    className={`w-full px-3.5 py-2 rounded-xl border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>Descripción</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detalles visibles en la tarjeta del cliente..."
                  className={`w-full px-3.5 py-2.5 rounded-2xl border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  }`}
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    isDarkTheme ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#05DF72] text-slate-950 font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-sm"
                >
                  Publicar Promoción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
