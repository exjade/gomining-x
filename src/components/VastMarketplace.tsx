import React, { useState, useEffect } from 'react';
import {
  Server,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi,
  ShieldCheck,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { apiFetch } from '../utils/apiConfig';
import type { OfferScoreDetails } from '../types/vast';

interface VastMarketplaceProps {
  onSimulateOffer?: (offerDetails: OfferScoreDetails) => void;
}

export const VastMarketplace: React.FC<VastMarketplaceProps> = ({ onSimulateOffer }) => {
  const [offers, setOffers] = useState<OfferScoreDetails[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [filterGpu, setFilterGpu] = useState<string>('RTX 4090');
  const [maxPrice, setMaxPrice] = useState<string>('0.50');
  const [datacenterOnly, setDatacenterOnly] = useState<boolean>(false);

  const fetchOffers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const queryParams = new URLSearchParams();
      if (filterGpu && filterGpu !== 'ALL') queryParams.set('gpuModel', filterGpu);
      if (maxPrice) queryParams.set('maxPrice', maxPrice);
      if (datacenterOnly) queryParams.set('datacenterOnly', 'true');

      const res = await apiFetch(`/api/vast/offers?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.error || 'Error cargando ofertas de Vast.ai.');
      }
    } catch (err: any) {
      setErrorMessage(`Fallo de conexión: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
  }, [filterGpu]);

  return (
    <div className="space-y-5">
      {/* 1. Header & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0E121C]/80 border border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold font-rajdhani text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-cyan-400" />
              <span>Mercado de Ofertas GPU Vast.ai</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              API Oficial v0
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Ofertas filtradas, normalizadas y puntuadas según idoneidad para minería PearlHash (PRL).
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#06080E] border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-400">GPU:</span>
            <select
              value={filterGpu}
              onChange={(e) => setFilterGpu(e.target.value)}
              className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas las GPUs</option>
              <option value="RTX 4090">RTX 4090 (24GB)</option>
              <option value="RTX 5090">RTX 5090 (32GB)</option>
              <option value="RTX 3090">RTX 3090 (24GB)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#06080E] border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-400">Máx $/h:</span>
            <input
              type="number"
              step="0.05"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-14 bg-transparent text-white font-mono focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setDatacenterOnly(!datacenterOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all border ${
              datacenterOnly
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                : 'bg-[#06080E] text-slate-400 border-white/[0.1] hover:text-white'
            }`}
          >
            Tier Datacenter
          </button>

          <button
            type="button"
            onClick={fetchOffers}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Buscar</span>
          </button>
        </div>
      </div>

      {/* Error notification if any */}
      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. Offers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offers.length === 0 && !isLoading ? (
          <div className="col-span-full p-8 text-center rounded-2xl border border-dashed border-white/10 text-slate-400 text-xs">
            No se encontraron ofertas que coincidan con los filtros seleccionados. Intenta aumentar el precio máximo o elegir otro modelo.
          </div>
        ) : (
          offers.map((item) => {
            const { offer } = item;
            const badgeColor =
              item.qualificationBadge === 'EXCELLENT'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : item.qualificationBadge === 'GOOD'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : item.qualificationBadge === 'MARGINAL'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

            return (
              <div
                key={offer.id}
                className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5 space-y-4 hover:border-cyan-500/40 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Top Bar: Model & Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base font-rajdhani">
                          {offer.gpuModel} x{offer.gpuCount}
                        </span>
                        {offer.datacenter && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            DC
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Oferta #{offer.id} • Host #{offer.hostId || 'N/A'}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${badgeColor}`}>
                      {item.qualificationBadge}
                    </span>
                  </div>

                  {/* Specs Pill Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 pt-1 border-t border-white/[0.04]">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="h-3 w-3 text-cyan-400" />
                      <span>{offer.gpuMemoryGB} GB VRAM</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="h-3 w-3 text-emerald-400" />
                      <span>{offer.diskSpaceGB} GB NVMe</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Wifi className="h-3 w-3 text-amber-400" />
                      <span>{Math.round(offer.inetDownMbps)} Mbps</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3 w-3 text-purple-400" />
                      <span>{(offer.reliabilityScore * 100).toFixed(1)}% Rel.</span>
                    </div>
                  </div>

                  {/* Cost & Estimated Net */}
                  <div className="p-3 rounded-xl bg-[#06080E] border border-white/[0.06] space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Costo Total:</span>
                      <span className="font-bold text-white">${offer.totalHourlyCostUSD.toFixed(3)}/h</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>(Cómputo: ${offer.hourlyComputeCostUSD.toFixed(2)} + Disco: ${offer.hourlyStorageCostUSD.toFixed(3)})</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                      <span className="text-slate-400 text-[11px]">Neto Estimado:</span>
                      <span className={`font-bold ${item.estimatedNetHourlyUSD >= 0 ? 'text-[#05F292]' : 'text-rose-400'}`}>
                        {item.estimatedNetHourlyUSD >= 0 ? '+' : ''}${item.estimatedNetHourlyUSD.toFixed(3)}/h ({item.marginPct}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action: Simulate */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onSimulateOffer && onSimulateOffer(item)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer"
                  >
                    <span>Simular en Calculadora</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
