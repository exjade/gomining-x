import type { PromotionItem } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';

const STORAGE_PROMOTIONS_KEY = 'minerx_admin_promotions_v2';

export const INITIAL_PROMOTIONS: PromotionItem[] = [
  {
    id: 'promo-halving-bonus',
    title: 'Bono Halving +10% Potencia Extra',
    badge: 'OFERTA LIMITADA',
    description: 'Adquiere cualquier paquete de minería superior a 96 TH/s y recibe un 10% adicional de TH/s asignados sin costo.',
    discountPct: 15,
    bonusTh: 10,
    targetPackageId: 'pkg-miner-4',
    active: true,
    startDate: '2026-11-01T00:00:00Z',
    endDate: '2026-11-30T23:59:59Z',
    clicksCount: 342,
    conversionsCount: 28
  },
  {
    id: 'promo-zero-fee',
    title: 'Cero Comisión Operativa PearlHash',
    badge: 'TARIFA 0%',
    description: 'Durante los primeros 30 días de tu contrato Enterprise, tu comisión por mantenimiento queda bonificada al 0%.',
    discountPct: 0,
    targetPackageId: 'pkg-miner-5',
    active: true,
    startDate: '2026-10-15T00:00:00Z',
    endDate: '2026-12-15T23:59:59Z',
    clicksCount: 512,
    conversionsCount: 46
  }
];

export class PromotionService {
  private static instance: PromotionService;
  private audit = AdminAuditService.getInstance();

  private constructor() {}

  public static getInstance(): PromotionService {
    if (!PromotionService.instance) {
      PromotionService.instance = new PromotionService();
    }
    return PromotionService.instance;
  }

  public getPromotions(): PromotionItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_PROMOTIONS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_PROMOTIONS;
  }

  public savePromotion(promo: Omit<PromotionItem, 'id' | 'clicksCount' | 'conversionsCount'> & { id?: string }): PromotionItem {
    const list = this.getPromotions();
    let saved: PromotionItem;

    if (promo.id) {
      const idx = list.findIndex(p => p.id === promo.id);
      const existing = list[idx];
      saved = { ...existing, ...promo } as PromotionItem;
      list[idx] = saved;
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MARKETING_ADMIN', 'MARKETING', 'UPDATE_PROMOTION', saved.id, { promo: saved });
    } else {
      saved = {
        ...promo,
        id: `promo-${Date.now()}`,
        clicksCount: 0,
        conversionsCount: 0
      };
      list.unshift(saved);
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MARKETING_ADMIN', 'MARKETING', 'CREATE_PROMOTION', saved.id, { promo: saved });
    }

    localStorage.setItem(STORAGE_PROMOTIONS_KEY, JSON.stringify(list));
    return saved;
  }

  public togglePromotionActive(promoId: string): void {
    const list = this.getPromotions();
    const promo = list.find(p => p.id === promoId);
    if (promo) {
      promo.active = !promo.active;
      localStorage.setItem(STORAGE_PROMOTIONS_KEY, JSON.stringify(list));
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MARKETING_ADMIN', 'MARKETING', 'TOGGLE_PROMOTION_ACTIVE', promoId, { active: promo.active });
    }
  }
}
