/**
 * BITMAIN ANTMINER S9 — PURE DATA AND MOTION MODEL
 *
 * Drives both the isometric Anatomy illustration and its external telemetry panel.
 * Every displayed number, temperature, RPM, and exploded mechanical offset
 * derives from this single source of truth.
 */

export type AntminerPose = 'ASSEMBLED' | 'EXPLODED' | 'FAN_CUTAWAY' | 'CONTROL_TOP';

export type AntminerSubassembly = 
  | 'CHASSIS'
  | 'FAN_FRONT'
  | 'FAN_REAR'
  | 'CONTROL_BOARD'
  | 'HASHBOARD_0'
  | 'HASHBOARD_1'
  | 'HASHBOARD_2'
  | 'PCIE_POWER'
  | 'RIBBON_CABLES';

export interface HashboardTelemetry {
  chainIndex: number;
  id: string;
  name: string;
  chipCount: number;
  expectedChips: number;
  hashrateTh: number;
  temperaturePcbC: number;
  temperatureChipC: number;
  status: 'OPTIMAL' | 'DEGRADED' | 'FAULT';
  pcieVoltages: [number, number, number];
}

export interface AntminerS9Telemetry {
  minerId: string;
  workerId: string;
  hardwareModel: string;
  firmwareVersion: string;
  operationalStatus: 'MINING' | 'WARMUP' | 'DEGRADED' | 'OFFLINE';
  hashrateCurrentTh: number;
  hashrateAverage24hTh: number;
  idealHashrateTh: number;
  acceptedShares: number;
  rejectedShares: number;
  staleShares: number;
  rejectionRatePct: number;
  uptimeSeconds: number;
  intakeTempC: number;
  exhaustTempC: number;
  fanFrontRpm: number;
  fanRearRpm: number;
  fanDutyCyclePct: number;
  powerWatts: number;
  efficiencyJperTh: number;
  poolUrl: string;
  poolUser: string;
  lastHeartbeat: string;
  hashboards: [HashboardTelemetry, HashboardTelemetry, HashboardTelemetry];
}

export interface ExplodedOffsets {
  chassis: [number, number, number];
  fanFront: [number, number, number];
  fanRear: [number, number, number];
  controlTop: [number, number, number];
  hashboard0: [number, number, number];
  hashboard1: [number, number, number];
  hashboard2: [number, number, number];
  ribbonCables: [number, number, number];
  pciePower: [number, number, number];
}

export const BASE_TELEMETRY: AntminerS9Telemetry = {
  minerId: 'S9-BM1387-B14-082',
  workerId: 'kryptex_rig_082',
  hardwareModel: 'Bitmain Antminer S9 (16nm FinFET BM1387)',
  firmwareVersion: 'Braiins OS+ v21.09-minerx-lts',
  operationalStatus: 'MINING',
  hashrateCurrentTh: 13.52,
  hashrateAverage24hTh: 13.48,
  idealHashrateTh: 13.50,
  acceptedShares: 48920,
  rejectedShares: 142,
  staleShares: 38,
  rejectionRatePct: 0.29,
  uptimeSeconds: 846320, // ~9.8 days
  intakeTempC: 38.5,
  exhaustTempC: 72.8,
  fanFrontRpm: 4320,
  fanRearRpm: 4180,
  fanDutyCyclePct: 72,
  powerWatts: 1323,
  efficiencyJperTh: 97.85,
  poolUrl: 'stratum+tcp://pearl.kryptex.network:7777',
  poolUser: 'prl1ppx7m92v4.rig082',
  lastHeartbeat: 'Hace 4 segundos',
  hashboards: [
    {
      chainIndex: 0,
      id: 'chain-0-left',
      name: 'Hashboard 1 (Cadena Izq.)',
      chipCount: 63,
      expectedChips: 63,
      hashrateTh: 4.51,
      temperaturePcbC: 62.4,
      temperatureChipC: 76.8,
      status: 'OPTIMAL',
      pcieVoltages: [12.08, 12.05, 12.06]
    },
    {
      chainIndex: 1,
      id: 'chain-1-center',
      name: 'Hashboard 2 (Cadena Central)',
      chipCount: 63,
      expectedChips: 63,
      hashrateTh: 4.50,
      temperaturePcbC: 64.1,
      temperatureChipC: 78.5,
      status: 'OPTIMAL',
      pcieVoltages: [12.04, 12.02, 12.03]
    },
    {
      chainIndex: 2,
      id: 'chain-2-right',
      name: 'Hashboard 3 (Cadena Der.)',
      chipCount: 63,
      expectedChips: 63,
      hashrateTh: 4.51,
      temperaturePcbC: 61.8,
      temperatureChipC: 75.9,
      status: 'OPTIMAL',
      pcieVoltages: [12.09, 12.07, 12.08]
    }
  ]
};

/**
 * Calculates mechanical 3D translation vectors based on the selected pose.
 * Values are in isometric world coordinates (dx along length, dy across width, dz vertical).
 */
export function getExplodedOffsets(pose: AntminerPose, factor = 1.0): ExplodedOffsets {
  if (pose === 'ASSEMBLED') {
    return {
      chassis: [0, 0, 0],
      fanFront: [0, 0, 0],
      fanRear: [0, 0, 0],
      controlTop: [0, 0, 0],
      hashboard0: [0, 0, 0],
      hashboard1: [0, 0, 0],
      hashboard2: [0, 0, 0],
      ribbonCables: [0, 0, 0],
      pciePower: [0, 0, 0]
    };
  }

  if (pose === 'EXPLODED') {
    const f = factor;
    return {
      chassis: [0, 0, 0],
      fanFront: [-110 * f, 0, 0],        // Moves forward along -X length
      fanRear: [110 * f, 0, 0],          // Moves rearward along +X length
      controlTop: [0, 0, 85 * f],        // Lifts vertically along +Z
      hashboard0: [-15 * f, -45 * f, 45 * f], // Slides up & out to the left
      hashboard1: [0, 0, 65 * f],             // Slides straight up in center
      hashboard2: [15 * f, 45 * f, 45 * f],   // Slides up & out to the right
      ribbonCables: [0, 0, 48 * f],
      pciePower: [0, 0, 75 * f]
    };
  }

  if (pose === 'FAN_CUTAWAY') {
    const f = factor;
    return {
      chassis: [0, 0, 0],
      fanFront: [-140 * f, 0, 0],        // Pulled far away to see tunnel interior
      fanRear: [40 * f, 0, 0],
      controlTop: [0, 0, 0],
      hashboard0: [0, 0, 0],
      hashboard1: [0, 0, 0],
      hashboard2: [0, 0, 0],
      ribbonCables: [0, 0, 0],
      pciePower: [0, 0, 0]
    };
  }

  // CONTROL_TOP focus
  return {
    chassis: [0, 0, 0],
    fanFront: [0, 0, 0],
    fanRear: [0, 0, 0],
    controlTop: [0, 0, 95 * factor],     // High elevation for control board inspection
    hashboard0: [0, 0, 0],
    hashboard1: [0, 0, 0],
    hashboard2: [0, 0, 0],
    ribbonCables: [0, 0, 50 * factor],
    pciePower: [0, 0, 0]
  };
}

/**
 * Returns a human-friendly readout text for the Anatomy card corner
 */
export function formatReadout(
  telemetry: AntminerS9Telemetry, 
  activeSubassembly: AntminerSubassembly | null,
  pose: AntminerPose
): string {
  if (activeSubassembly === 'HASHBOARD_0') {
    const b = telemetry.hashboards[0];
    return `CADENA 1 · ${b.hashrateTh.toFixed(2)} TH/s · ${b.chipCount}/${b.expectedChips} CHIPS · ${b.temperatureChipC.toFixed(1)}°C`;
  }
  if (activeSubassembly === 'HASHBOARD_1') {
    const b = telemetry.hashboards[1];
    return `CADENA 2 · ${b.hashrateTh.toFixed(2)} TH/s · ${b.chipCount}/${b.expectedChips} CHIPS · ${b.temperatureChipC.toFixed(1)}°C`;
  }
  if (activeSubassembly === 'HASHBOARD_2') {
    const b = telemetry.hashboards[2];
    return `CADENA 3 · ${b.hashrateTh.toFixed(2)} TH/s · ${b.chipCount}/${b.expectedChips} CHIPS · ${b.temperatureChipC.toFixed(1)}°C`;
  }
  if (activeSubassembly === 'FAN_FRONT') {
    return `VENTILADOR ADMISIÓN · 120mm PWM · ${telemetry.fanFrontRpm.toLocaleString()} RPM · ${telemetry.fanDutyCyclePct}%`;
  }
  if (activeSubassembly === 'FAN_REAR') {
    return `VENTILADOR EXTRACCIÓN · 120mm PWM · ${telemetry.fanRearRpm.toLocaleString()} RPM · Escape ${telemetry.exhaustTempC.toFixed(1)}°C`;
  }
  if (activeSubassembly === 'CONTROL_BOARD') {
    return `PLACA CONTROL XILINX ZYNQ · RJ45 GbE · 3x CABEZALES IDC · ${telemetry.firmwareVersion}`;
  }
  if (activeSubassembly === 'PCIE_POWER') {
    return `ALIMENTACIÓN 12V · 10x CONECTORES PCIE 6-PIN · ${telemetry.powerWatts}W (${telemetry.efficiencyJperTh.toFixed(1)} J/TH)`;
  }
  if (activeSubassembly === 'RIBBON_CABLES') {
    return `BUS DE DATOS · 3x CABLES PLANOS 18-PIN · COMUNICACIÓN SPI / I2C CON CHIPS BM1387`;
  }

  // Default global readout
  const poseLabel = pose === 'EXPLODED' ? 'MODO EXPLOSIONADO' : 'OPERACIÓN NORMAL';
  return `${poseLabel} · ${telemetry.hashrateCurrentTh.toFixed(2)} TH/s · 189 CHIPS BM1387 · ${telemetry.intakeTempC.toFixed(1)}°C / ${telemetry.exhaustTempC.toFixed(1)}°C · ${telemetry.powerWatts}W`;
}
