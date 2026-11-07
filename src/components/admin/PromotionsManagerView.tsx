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
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
            Constructor de Promociones y Campañas
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
            Crea promociones y bonos que se publican automáticamente en el feed y dashboard de los usuarios.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 admin-radius-control admin-bg-primary admin-text-primary font-mono text-xs font-semibold active:scale-[0.97] cursor-pointer"
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
            className={`admin-card p-6 admin-radius-card border flex flex-col justify-between ${
              isDarkTheme
                ? ' admin-bg-surface admin-border admin-text-primary'
                : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="admin-badge px-2.5 py-0.5 admin-radius-control text-xs font-mono font-semibold admin-bg-success admin-text-success border admin-border">
                  {p.badge}
                </span>
                <span className={`text-xs font-mono flex items-center gap-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
                  <Eye className="h-3.5 w-3.5" />
                  {p.clicksCount} clics · {p.conversionsCount} ventas
                </span>
              </div>

              <h3 className={`text-lg font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{p.title}</h3>
              <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>{p.description}</p>

              <div className={`admin-card my-4 p-3.5 admin-radius-card border flex items-center justify-between font-mono text-xs ${
                isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
              }`}>
                <div>
                  <span className={`text-xs block font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>DESCUENTO</span>
                  <span className="font-semibold admin-text-success">{p.discountPct}% OFF</span>
                </div>
                {p.bonusTh && p.bonusTh > 0 && (
                  <div>
                    <span className={`text-xs block font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>BONO TH</span>
                    <span className="font-semibold admin-text-accent">+{p.bonusTh} TH/s</span>
                  </div>
                )}
                <div>
                  <span className={`text-xs block font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>VIGENCIA</span>
                  <span className={`font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>{new Date(p.endDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className={`pt-3 border-t flex items-center justify-between ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
              <span className={`text-xs font-mono ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
                Estado: <strong className={p.active ? 'admin-text-success' : 'admin-text-warning'}>{p.active ? 'PUBLICADA' : 'PAUSADA'}</strong>
              </span>

              <button
                onClick={() => handleToggle(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer ${
                  p.active
                    ? ' admin-border-warning admin-text-warning'
                    : ' admin-border-success admin-text-success'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div
            className={`admin-card w-full max-w-lg p-6 admin-radius-card border ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
              <h3 className={`text-lg font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>Nueva Campaña Promocional</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-1.5 admin-radius-control border cursor-pointer ${
                  isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-secondary'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 font-mono text-xs">
              <div>
                <label className={`block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>Título de la Promoción</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ej: Promo Black Friday Minero"
                  className={`w-full px-3.5 py-2.5 admin-radius-card border ${
                    isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>Insignia / Badge</label>
                  <input
                    type="text"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    className={`w-full px-3.5 py-2 admin-radius-card border ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={formData.discountPct}
                    onChange={(e) => setFormData({ ...formData, discountPct: parseInt(e.target.value) || 0 })}
                    className={`w-full px-3.5 py-2 admin-radius-card border ${
                      isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>Descripción</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detalles visibles en la tarjeta del cliente..."
                  className={`w-full px-3.5 py-2.5 admin-radius-card border ${
                    isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2 admin-radius-control border text-xs font-mono cursor-pointer ${
                    isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-primary'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 admin-radius-control admin-bg-primary admin-text-primary font-semibold active:scale-[0.97] cursor-pointer"
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
