/**
 * Vast.ai Instance Lifecycle & Telemetry Management Service
 * Complies with MinerX_CALCULADORA_RENTABILIDAD_Y_AUTOMATIZACION_VASTAI.md Section 6 & 8
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GpuInstance, MiningMeasurement } from '../../src/types/vast.js';
import { VastClient } from './vastClient.js';
import { VastOffersService } from './vastOffersService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const INSTANCES_FILE = path.join(DATA_DIR, 'vast_instances.json');
const MEASUREMENTS_FILE = path.join(DATA_DIR, 'vast_measurements.json');

export class VastInstanceService {
  private vastClient: VastClient;

  constructor(client?: VastClient) {
    this.vastClient = client || new VastClient();
    this.ensureDataFiles();
  }

  private ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(INSTANCES_FILE)) {
      fs.writeFileSync(INSTANCES_FILE, JSON.stringify({ instances: [] }, null, 2), 'utf-8');
    }
    if (!fs.existsSync(MEASUREMENTS_FILE)) {
      fs.writeFileSync(MEASUREMENTS_FILE, JSON.stringify({ measurements: [] }, null, 2), 'utf-8');
    }
  }

  public getInstances(): GpuInstance[] {
    try {
      if (fs.existsSync(INSTANCES_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
        return Array.isArray(parsed.instances) ? parsed.instances : [];
      }
    } catch (err) {
      console.error('Error reading instances file:', err);
    }
    return [];
  }

  public saveInstances(instances: GpuInstance[]) {
    try {
      fs.writeFileSync(INSTANCES_FILE, JSON.stringify({ instances }, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving instances file:', err);
    }
  }

  public getMeasurements(instanceId?: string): MiningMeasurement[] {
    try {
      if (fs.existsSync(MEASUREMENTS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(MEASUREMENTS_FILE, 'utf-8'));
        const all: MiningMeasurement[] = Array.isArray(parsed.measurements) ? parsed.measurements : [];
        if (instanceId) {
          return all.filter((m) => m.instanceId === instanceId);
        }
        return all;
      }
    } catch (err) {
      console.error('Error reading measurements file:', err);
    }
    return [];
  }

  public recordMeasurement(measurement: MiningMeasurement) {
    try {
      const all = this.getMeasurements();
      all.push(measurement);
      // Keep last 1000 measurements
      const trimmed = all.slice(-1000);
      fs.writeFileSync(MEASUREMENTS_FILE, JSON.stringify({ measurements: trimmed }, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error recording measurement:', err);
    }
  }

  /**
   * Generates a unique, non-colliding worker name
   */
  public generateUniqueWorkerName(gpuModel: string, seed: string): string {
    const cleanModel = gpuModel.toLowerCase().replace(/[^a-z0-9]/g, '');
    const shortSeed = seed.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6) || Math.random().toString(36).substring(2, 8);
    return `vast-${cleanModel}-${shortSeed}`;
  }

  /**
   * Provisions a new instance from an offer
   */
  public async provisionInstance(params: {
    offerId: string;
    gpuModel: string;
    gpuCount: number;
    gpuMemoryGB: number;
    hourlyComputeCostUSD: number;
    hourlyStorageCostUSD: number;
    poolWallet: string;
    strategyId?: string;
  }): Promise<{ success: boolean; instance?: GpuInstance; error?: string }> {
    const id = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const workerName = this.generateUniqueWorkerName(params.gpuModel, id);
    const minerSessionId = `sess-${Date.now()}`;
    const totalHourly = Number((params.hourlyComputeCostUSD + params.hourlyStorageCostUSD).toFixed(4));

    // Call Vast.ai API via VastClient
    const vastRes = await this.vastClient.createInstance(params.offerId, {
      image: 'kryptex/miner-pearl:latest',
      disk: 32,
      runtype: 'ssh',
      label: workerName,
      env: {
        MINER_WALLET: params.poolWallet,
        WORKER_NAME: workerName,
        POOL_URL: 'stratum+tcp://prl.kryptex.network:7048'
      }
    });

    if (!vastRes.success) {
      return { success: false, error: vastRes.error || 'Error al crear instancia en Vast.ai.' };
    }

    const newInst: GpuInstance = {
      id,
      provider: 'vastai',
      providerOfferId: params.offerId,
      providerInstanceId: vastRes.instanceId ? String(vastRes.instanceId) : undefined,
      strategyId: params.strategyId,
      gpuModel: params.gpuModel,
      gpuCount: params.gpuCount,
      gpuMemoryGB: params.gpuMemoryGB,
      hourlyComputeCostUSD: params.hourlyComputeCostUSD,
      hourlyStorageCostUSD: params.hourlyStorageCostUSD,
      estimatedHourlyCostUSD: totalHourly,
      status: 'PROVISIONING',
      workerName,
      minerSessionId,
      poolWallet: params.poolWallet,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      consecutiveLowWindowsCount: 0
    };

    const instances = this.getInstances();
    instances.push(newInst);
    this.saveInstances(instances);

    return { success: true, instance: newInst };
  }

  /**
   * Stops instance compute and verifies status
   */
  public async stopInstance(
    instanceId: string,
    reason: string = 'User requested or underperforming'
  ): Promise<{ success: boolean; verified: boolean; error?: string }> {
    const instances = this.getInstances();
    const inst = instances.find((i) => i.id === instanceId || i.providerInstanceId === instanceId);
    if (!inst) {
      return { success: false, verified: false, error: 'Instancia no encontrada.' };
    }

    inst.status = 'INSTANCE_STOPPING';
    this.saveInstances(instances);

    let apiSuccess = true;
    if (inst.providerInstanceId) {
      const res = await this.vastClient.stopInstance(inst.providerInstanceId);
      apiSuccess = res.success;
    }

    inst.status = 'MANUAL_REVIEW';
    inst.stoppedAt = new Date().toISOString();
    inst.notes = `Detenida: ${reason}`;
    this.saveInstances(instances);

    // Verify against actual Vast.ai API instances list
    let verified = false;
    try {
      const checkRes = await this.vastClient.listInstances();
      if (checkRes.success) {
        const found = checkRes.instances.find((i) => String(i.id) === inst.providerInstanceId);
        if (!found || found.cur_state === 'stopped' || found.actual_status === 'stopped') {
          verified = true;
        }
      }
    } catch {}

    return { success: apiSuccess, verified };
  }

  /**
   * Permanently deletes instance to stop compute and storage billing
   */
  public async deleteInstance(
    instanceId: string,
    reason: string = 'Terminated'
  ): Promise<{ success: boolean; verified: boolean; error?: string }> {
    const instances = this.getInstances();
    const inst = instances.find((i) => i.id === instanceId || i.providerInstanceId === instanceId);
    if (!inst) {
      return { success: false, verified: false, error: 'Instancia no encontrada.' };
    }

    inst.status = 'TERMINATING';
    this.saveInstances(instances);

    let apiSuccess = true;
    if (inst.providerInstanceId) {
      const res = await this.vastClient.deleteInstance(inst.providerInstanceId);
      apiSuccess = res.success;
    }

    inst.status = 'TERMINATED';
    inst.terminatedAt = new Date().toISOString();
    inst.terminationReason = reason;
    this.saveInstances(instances);

    // Verify instance is gone or marked destroyed
    let verified = false;
    try {
      const checkRes = await this.vastClient.listInstances();
      if (checkRes.success) {
        const found = checkRes.instances.find((i) => String(i.id) === inst.providerInstanceId);
        if (!found || found.actual_status === 'exited' || found.cur_state === 'stopped') {
          verified = true;
        }
      }
    } catch {}

    return { success: apiSuccess, verified };
  }
}
