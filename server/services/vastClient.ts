/**
 * Vast.ai Official REST API Client
 * Base URL: https://console.vast.ai/api/v0
 *
 * Implements official endpoints per Vast.ai API Documentation:
 * - GET /api/v0/users/current/
 * - GET /api/v0/bundles/
 * - PUT /api/v0/asks/{ask_id}/
 * - GET /api/v0/instances/
 * - PUT /api/v0/instances/{instance_id}/
 * - DELETE /api/v0/instances/{instance_id}/
 *
 * Security: Sanitizes all errors and logs. Never leaks API keys.
 */

export interface VastAccountInfo {
  id: number;
  email: string;
  balance: number; // USD Credit
  keyId?: number;
}

export interface VastApiRawBundle {
  id: number;
  machine_id?: number;
  host_id?: number;
  gpu_name: string;
  num_gpus: number;
  gpu_ram: number; // in MB
  cpu_ram: number; // in MB
  cpu_cores?: number;
  disk_space: number; // in GB
  dph_total: number; // USD per hour total
  dph_base?: number; // USD per hour compute
  storage_cost?: number; // $/GB/month
  inet_down?: number; // Mbps
  inet_up?: number; // Mbps
  reliability2?: number; // 0 to 1
  geolocation?: string;
  datacenter?: boolean;
  rentable?: boolean;
  [key: string]: any;
}

export interface VastInstanceRaw {
  id: number;
  machine_id: number;
  actual_status: string; // 'running', 'stopped', 'loading', 'exited'
  cur_state: string; // 'running', 'stopped'
  intended_status?: string;
  gpu_name: string;
  num_gpus: number;
  gpu_ram: number;
  dph_total: number;
  dph_base?: number;
  storage_cost?: number;
  disk_space?: number;
  image_runtype?: string;
  image_args?: string[];
  label?: string;
  ssh_host?: string;
  ssh_port?: number;
  start_date?: number;
  duration?: number;
  [key: string]: any;
}

export class VastClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private isMockMode: boolean;

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
    mockMode?: boolean;
  }) {
    this.apiKey = (options?.apiKey || process.env.VAST_API_KEY || '').trim();
    this.baseUrl = (options?.baseUrl || 'https://console.vast.ai/api/v0').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs || 15000;
    this.isMockMode = options?.mockMode || false;
  }

  public setApiKey(key: string) {
    this.apiKey = key.trim();
  }

  public getMaskedKey(): string {
    if (!this.apiKey) return 'No configurada';
    if (this.apiKey.length <= 8) return '****';
    return `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`;
  }

  public hasKey(): boolean {
    return !!this.apiKey;
  }

  public setMockMode(enabled: boolean) {
    this.isMockMode = enabled;
  }

  /**
   * Safe fetch with authentication, timeouts, and sanitized errors
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      customKey?: string;
    } = {}
  ): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
    const keyToUse = options.customKey || this.apiKey;
    const method = options.method || 'GET';
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    if (keyToUse) {
      headers['Authorization'] = `Bearer ${keyToUse}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeout);

      let data: any = null;
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        let errMsg = data?.msg || data?.error || response.statusText || `HTTP ${response.status}`;
        if (response.status === 401) {
          errMsg = 'Autenticación fallida con Vast.ai: API Key inválida o revocada.';
        } else if (response.status === 403) {
          errMsg = 'Acceso denegado: Tu API key no tiene permisos suficientes en Vast.ai.';
        } else if (response.status === 429) {
          errMsg = 'Rate limit de Vast.ai alcanzado. Por favor espera unos momentos.';
        }
        return { ok: false, status: response.status, data, error: errMsg };
      }

      return { ok: true, status: response.status, data };
    } catch (err: any) {
      clearTimeout(timeout);
      let sanitized = err.name === 'AbortError' ? 'Timeout de conexión con Vast.ai' : err.message;
      // Ensure no API key leak
      if (keyToUse) {
        sanitized = sanitized.replace(new RegExp(keyToUse, 'g'), '[REDACTED_API_KEY]');
      }
      return { ok: false, status: 0, data: null as any, error: sanitized };
    }
  }

  /**
   * 1. Test Account & Balance (GET /api/v0/users/current/)
   */
  public async testAccount(
    customKey?: string
  ): Promise<{ success: boolean; user?: VastAccountInfo; message: string }> {
    if (this.isMockMode) {
      return {
        success: true,
        user: { id: 99999, email: 'mock_miner@minerx.local', balance: 50.0 },
        message: 'Conexión verificada exitosamente (Modo Simulación Mock).'
      };
    }

    const key = customKey || this.apiKey;
    if (!key) {
      return { success: false, message: 'Falta la API Key de Vast.ai.' };
    }

    const res = await this.request<any>('/users/current/', { customKey: key });
    if (!res.ok) {
      return { success: false, message: res.error || 'Error verificando cuenta Vast.ai.' };
    }

    const user: VastAccountInfo = {
      id: res.data.id || 0,
      email: res.data.email || 'user@vast.ai',
      balance: typeof res.data.balance === 'number' ? res.data.balance : parseFloat(res.data.balance) || 0,
      keyId: res.data.key_id
    };

    return {
      success: true,
      user,
      message: `Conexión exitosa con Vast.ai (Saldo: $${user.balance.toFixed(2)} USD).`
    };
  }

  /**
   * 2. Search Available GPU Offers (GET /api/v0/bundles/)
   */
  public async searchOffers(filter?: {
    gpuName?: string;
    maxDph?: number;
    minGpus?: number;
    rentableOnly?: boolean;
    query?: any;
  }): Promise<{ success: boolean; offers: VastApiRawBundle[]; error?: string }> {
    if (this.isMockMode) {
      return { success: true, offers: this.getMockOffers(filter?.gpuName) };
    }

    let qObj: any = { rentable: { eq: true } };
    if (filter?.gpuName) {
      qObj.gpu_name = { eq: filter.gpuName };
    }
    if (filter?.maxDph) {
      qObj.dph_total = { lte: filter.maxDph };
    }
    if (filter?.minGpus) {
      qObj.num_gpus = { gte: filter.minGpus };
    }
    if (filter?.query) {
      qObj = { ...qObj, ...filter.query };
    }

    const endpoint = `/bundles/?q=${encodeURIComponent(JSON.stringify(qObj))}`;
    const res = await this.request<{ offers?: VastApiRawBundle[] } | VastApiRawBundle[]>(endpoint);

    if (!res.ok) {
      return { success: false, offers: [], error: res.error };
    }

    const offers = Array.isArray(res.data)
      ? res.data
      : (res.data as any)?.offers || [];

    return { success: true, offers };
  }

  /**
   * 3. List Current User Instances (GET /api/v0/instances/)
   */
  public async listInstances(): Promise<{
    success: boolean;
    instances: VastInstanceRaw[];
    error?: string;
  }> {
    if (this.isMockMode) {
      return { success: true, instances: [] };
    }

    const res = await this.request<{ instances?: VastInstanceRaw[] } | VastInstanceRaw[]>(
      '/instances/'
    );

    if (!res.ok) {
      return { success: false, instances: [], error: res.error };
    }

    const instances = Array.isArray(res.data)
      ? res.data
      : (res.data as any)?.instances || [];

    return { success: true, instances };
  }

  /**
   * 4. Rent / Create Instance from Offer (PUT /api/v0/asks/{ask_id}/)
   */
  public async createInstance(
    askId: number | string,
    payload: {
      image: string;
      disk?: number; // GB
      runtype?: 'ssh' | 'jupyter' | 'args';
      args?: string[];
      env?: Record<string, string>;
      label?: string;
    }
  ): Promise<{ success: boolean; instanceId?: number; contractId?: number; error?: string }> {
    if (this.isMockMode) {
      const mockId = Math.floor(100000 + Math.random() * 900000);
      return { success: true, instanceId: mockId, contractId: mockId };
    }

    const body = {
      image: payload.image || 'ubuntu:22.04',
      disk: payload.disk || 32,
      runtype: payload.runtype || 'ssh',
      args: payload.args,
      env: payload.env,
      label: payload.label
    };

    const res = await this.request<any>(`/asks/${askId}/`, {
      method: 'PUT',
      body
    });

    if (!res.ok) {
      return { success: false, error: res.error || 'Fallo creando instancia en Vast.ai.' };
    }

    const contractId = res.data?.new_contract || res.data?.id;
    return {
      success: true,
      instanceId: contractId,
      contractId
    };
  }

  /**
   * 5. Stop Instance (PUT /api/v0/instances/{id}/ with state: 'stopped')
   */
  public async stopInstance(
    instanceId: number | string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isMockMode) {
      return { success: true };
    }

    const res = await this.request<any>(`/instances/${instanceId}/`, {
      method: 'PUT',
      body: { state: 'stopped' }
    });

    if (!res.ok) {
      return { success: false, error: res.error || 'Error al detener instancia.' };
    }

    return { success: true };
  }

  /**
   * 6. Start Instance (PUT /api/v0/instances/{id}/ with state: 'running')
   */
  public async startInstance(
    instanceId: number | string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isMockMode) {
      return { success: true };
    }

    const res = await this.request<any>(`/instances/${instanceId}/`, {
      method: 'PUT',
      body: { state: 'running' }
    });

    if (!res.ok) {
      return { success: false, error: res.error || 'Error al iniciar instancia.' };
    }

    return { success: true };
  }

  /**
   * 7. Destroy Instance permanently (DELETE /api/v0/instances/{id}/)
   */
  public async deleteInstance(
    instanceId: number | string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isMockMode) {
      return { success: true };
    }

    const res = await this.request<any>(`/instances/${instanceId}/`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      return { success: false, error: res.error || 'Error al eliminar instancia en Vast.ai.' };
    }

    return { success: true };
  }

  /**
   * Realistic Mock Offers Generator for offline/safe testing
   */
  public getMockOffers(filterGpu?: string): VastApiRawBundle[] {
    const list: VastApiRawBundle[] = [
      {
        id: 70101,
        machine_id: 1204,
        host_id: 88,
        gpu_name: 'RTX 4090',
        num_gpus: 1,
        gpu_ram: 24576,
        cpu_ram: 65536,
        cpu_cores: 16,
        disk_space: 128,
        dph_total: 0.285,
        dph_base: 0.260,
        storage_cost: 0.15, // $/GB/month
        inet_down: 850.5,
        inet_up: 420.2,
        reliability2: 0.985,
        geolocation: 'US, Ohio (Tier 3 Datacenter)',
        datacenter: true,
        rentable: true
      },
      {
        id: 70102,
        machine_id: 1205,
        host_id: 92,
        gpu_name: 'RTX 4090',
        num_gpus: 2,
        gpu_ram: 24576,
        cpu_ram: 131072,
        cpu_cores: 32,
        disk_space: 256,
        dph_total: 0.540,
        dph_base: 0.500,
        storage_cost: 0.15,
        inet_down: 1200.0,
        inet_up: 980.0,
        reliability2: 0.992,
        geolocation: 'EU, Germany (Frankfurt)',
        datacenter: true,
        rentable: true
      },
      {
        id: 70103,
        machine_id: 1410,
        host_id: 110,
        gpu_name: 'RTX 5090',
        num_gpus: 1,
        gpu_ram: 32768,
        cpu_ram: 65536,
        cpu_cores: 24,
        disk_space: 200,
        dph_total: 0.420,
        dph_base: 0.390,
        storage_cost: 0.20,
        inet_down: 1000.0,
        inet_up: 500.0,
        reliability2: 0.965,
        geolocation: 'US, Texas (Dallas DC)',
        datacenter: true,
        rentable: true
      },
      {
        id: 70104,
        machine_id: 1180,
        host_id: 65,
        gpu_name: 'RTX 3090',
        num_gpus: 1,
        gpu_ram: 24576,
        cpu_ram: 32768,
        cpu_cores: 12,
        disk_space: 100,
        dph_total: 0.145,
        dph_base: 0.130,
        storage_cost: 0.10,
        inet_down: 450.0,
        inet_up: 200.0,
        reliability2: 0.940,
        geolocation: 'CA, Montreal',
        datacenter: false,
        rentable: true
      }
    ];

    if (filterGpu) {
      const cleanFilter = filterGpu.toLowerCase().replace(/[^a-z0-9]/g, '');
      return list.filter((o) =>
        o.gpu_name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanFilter)
      );
    }

    return list;
  }
}
