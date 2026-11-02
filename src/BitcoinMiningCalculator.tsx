import { useEffect, useState } from 'react'
import { bitcoinMiningEstimateConstants, fetchBitcoinMiningNetworkQuote, type BitcoinMiningNetworkQuote } from './bitcoinMiningEstimate'
import { MINER_CATALOG_OBSERVED_AT, oneTimeMinerPlans } from './minerCatalog'
import { formatCatalogPrice } from './paymentQuote'
import { formatUsd } from './poolRevenue'
import { MetricValueSkeleton, Skeleton } from './Skeletons'

function useBitcoinNetworkQuote() {
  const [quote, setQuote] = useState<BitcoinMiningNetworkQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void fetchBitcoinMiningNetworkQuote(controller.signal, revision > 0)
      .then(setQuote)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron consultar los datos de Bitcoin.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision])

  return { quote, loading, error, refresh: () => setRevision((value) => value + 1) }
}

function btc(value: number) {
  return `${value.toLocaleString('es-MX', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`
}

function catalogObservedDate() {
  return new Date(MINER_CATALOG_OBSERVED_AT).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function BitcoinMiningCalculator() {
  const [machineId, setMachineId] = useState(oneTimeMinerPlans[0]?.id ?? '')
  const [machineCount, setMachineCount] = useState('1')
  const [efficiency, setEfficiency] = useState('15')
  const [availability, setAvailability] = useState('100')
  const [electricityRate, setElectricityRate] = useState('')
  const [maintenanceRate, setMaintenanceRate] = useState('')
  const network = useBitcoinNetworkQuote()
  const machine = oneTimeMinerPlans.find((plan) => plan.id === machineId) ?? oneTimeMinerPlans[0]
  const quantity = Math.min(100, Math.max(1, Math.floor(Number(machineCount) || 1)))
  const powerTh = machine.powerTh * quantity
  const wattsPerTh = Math.max(0, Number(efficiency) || 0)
  const uptimePercent = Math.min(100, Math.max(0, Number(availability) || 0))
  const powerCost = machine.price * quantity
  const energyKwhPerDay = powerTh * wattsPerTh / 1000 * 24 * uptimePercent / 100
  const electricityConfigured = electricityRate.trim() !== '' && Number.isFinite(Number(electricityRate)) && Number(electricityRate) >= 0
  const maintenanceConfigured = maintenanceRate.trim() !== '' && Number.isFinite(Number(maintenanceRate)) && Number(maintenanceRate) >= 0
  const costsConfigured = electricityConfigured && maintenanceConfigured
  const electricityUsdPerDay = electricityConfigured ? energyKwhPerDay * Number(electricityRate) : null
  const maintenanceUsdPerDay = maintenanceConfigured ? powerTh * Number(maintenanceRate) * uptimePercent / 100 : null
  const reward = network.quote
    ? powerTh * 1e12 / network.quote.currentHashrateHps
      * network.quote.averageRewardBtcPerBlock
      * bitcoinMiningEstimateConstants.expectedBlocksPerDay
      * uptimePercent / 100
    : null
  const grossUsdPerDay = reward !== null && network.quote ? reward * network.quote.btcUsd : null
  const netUsdPerDay = grossUsdPerDay !== null && costsConfigured
    ? grossUsdPerDay - (electricityUsdPerDay ?? 0) - (maintenanceUsdPerDay ?? 0)
    : null
  const machinePricePerTh = machine.price / machine.powerTh

  return <div className="operator-economics-stack mining-calculator-stack">
    <section className="form-callout operator-assumptions"><span>i</span><p>Estimación teórica SHA‑256: hashrate del modelo ÷ hashrate estimado de la red × recompensa media de los últimos 144 bloques × 144 bloques/día. Incluye subsidio y comisiones observadas en esos bloques; supone la disponibilidad que configures. No incluye comisión de pool, impuestos ni costos no ingresados. No es una promesa de pago.</p></section>

    <section className="content-panel operator-input-panel">
      <div className="panel-toolbar"><div><h2>Elige los mineros del catálogo</h2><p>Modelos de compra única vistos en el configurador el {catalogObservedDate()}. Sus precios son una captura fechada, no una cotización actual.</p></div></div>
      <div className="operator-input-grid">
        <label className="operator-field"><span>Modelo de minero</span><small>Catálogo GoMining observado</small><select value={machine.id} onChange={(event) => setMachineId(event.target.value)}>{oneTimeMinerPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.label} · {plan.powerTh} TH · {formatCatalogPrice(plan.price, plan.currency)}</option>)}</select></label>
        <label className="operator-field"><span>Número de equipos</span><small>1–100 unidades</small><input type="number" min="1" max="100" step="1" value={machineCount} onChange={(event) => setMachineCount(event.target.value)} /></label>
        <div className="operator-result"><span>Hashrate total del escenario</span><strong>{powerTh.toLocaleString('es-MX', { maximumFractionDigits: 2 })} TH/s</strong><small>{machine.powerTh} TH/s × {quantity} {quantity === 1 ? 'equipo' : 'equipos'}</small></div>
        <div className="operator-result"><span>Precio de catálogo de referencia</span><strong>{formatCatalogPrice(powerCost, machine.currency)}</strong><small>Importe de referencia; no se cobra desde esta calculadora</small></div>
        <label className="operator-field"><span>Eficiencia energética</span><small>W/TH · valor inicial observado: 15</small><input type="number" min="0" step="0.1" value={efficiency} onChange={(event) => setEfficiency(event.target.value)} /></label>
        <label className="operator-field"><span>Disponibilidad estimada</span><small>% de tiempo conectado · valor inicial: 100%</small><input type="number" min="0" max="100" step="1" value={availability} onChange={(event) => setAvailability(event.target.value)} /></label>
        <label className="operator-field"><span>Electricidad</span><small>USD/kWh · ingresa tu tarifa real</small><input type="number" min="0" step="any" placeholder="Pendiente" value={electricityRate} onChange={(event) => setElectricityRate(event.target.value)} /></label>
        <label className="operator-field"><span>Mantenimiento</span><small>USD/TH/día · escribe 0 si no aplica</small><input type="number" min="0" step="any" placeholder="Pendiente" value={maintenanceRate} onChange={(event) => setMaintenanceRate(event.target.value)} /></label>
        <div className="operator-result"><span>Precio observado por TH</span><strong>{formatCatalogPrice(machinePricePerTh, machine.currency)}</strong><small>Derivado del catálogo fechado</small></div>
      </div>
    </section>

    <section className="content-panel operator-results-panel">
      <div className="panel-toolbar"><div><h2>Ganancias posibles · Bitcoin</h2><p>{network.quote ? `Datos públicos consultados ${new Date(network.quote.retrievedAt).toLocaleString('es-MX')}` : 'Cargando datos de la red'}</p></div><button className="button button-secondary" type="button" onClick={network.refresh} disabled={network.loading}>{network.loading ? 'Actualizando…' : 'Actualizar datos'}</button></div>
      {network.error && <p className="inline-feedback" role="status">{network.error}{network.quote ? ' Se mantiene visible la última lectura válida.' : ''}</p>}
      {network.quote ? <>
        <div className="operator-results-grid">
          <div className="operator-result bitcoin-network-quote"><span>Hashrate estimado de red</span><strong>{(network.quote.currentHashrateHps / 1e18).toLocaleString('es-MX', { maximumFractionDigits: 3 })} EH/s</strong><small>Lectura pública mempool.space · ventana 3d</small></div>
          <div className="operator-result"><span>Recompensa media por bloque</span><strong>{network.quote.averageRewardBtcPerBlock.toFixed(6)} BTC</strong><small>Promedio de {network.quote.sampledBlockCount} bloques · subsidio y comisiones</small></div>
          <div className="operator-result"><span>Precio de Bitcoin</span><strong>{formatUsd(network.quote.btcUsd)}</strong><small>Fuente pública · {new Date(network.quote.priceTimestamp * 1000).toLocaleString('es-MX')}</small></div>
          <div className="operator-result"><span>BTC bruto posible · día</span><strong>{reward === null ? '—' : btc(reward)}</strong><small>Estimación estadística, no payout de pool</small></div>
          <div className="operator-result"><span>Ingreso bruto posible · día</span><strong>{grossUsdPerDay === null ? '—' : formatUsd(grossUsdPerDay)}</strong><small>Antes de electricidad, pool y otros costos</small></div>
          <div className="operator-result"><span>Ingreso bruto posible · 30 días</span><strong>{grossUsdPerDay === null ? '—' : formatUsd(grossUsdPerDay * 30)}</strong><small>Escenario constante de 30 días</small></div>
          <div className="operator-result"><span>Electricidad estimada · día</span><strong>{electricityUsdPerDay === null ? 'Configura la tarifa' : formatUsd(electricityUsdPerDay)}</strong><small>{energyKwhPerDay.toFixed(2)} kWh/día · a {wattsPerTh} W/TH</small></div>
          <div className="operator-result"><span>Neto estimado · día</span><strong>{netUsdPerDay === null ? 'Configura electricidad y mantenimiento' : formatUsd(netUsdPerDay)}</strong><small>{netUsdPerDay === null ? 'No se asumen costos que no hayas ingresado' : 'Antes de comisión de pool, impuestos y otros cargos'}</small></div>
        </div>
        <p className="demo-disclaimer">Mempool.space entrega una estimación del hashrate de red, recompensas recientes y precio BTC/USD. La dificultad, el precio, las comisiones de bloque y tu tiempo en línea cambian; este cálculo no confirma minado, shares, ingresos ni rentabilidad.</p>
      </> : network.loading ? <div className="operator-results-grid ui-skeleton-operator-results" role="status" aria-label="Cargando datos públicos de Bitcoin">{Array.from({ length: 8 }, (_, index) => <div className="operator-result" key={index}><Skeleton shape="line" width="58%" /><MetricValueSkeleton /><Skeleton shape="line" width="72%" /></div>)}</div> : <div className="empty-state operator-results-empty"><div className="empty-illustration">₿</div><strong>Datos públicos no disponibles</strong><span>El cálculo de ganancias se habilitará cuando se pueda consultar la red y el precio de Bitcoin.</span><button className="button button-secondary" type="button" onClick={network.refresh}>Intentar de nuevo</button></div>}
    </section>
  </div>
}
