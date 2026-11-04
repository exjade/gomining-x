/**
 * MinerX API Base URL & Environment Resolver
 *
 * Resolves the appropriate backend API base URL depending on the running environment:
 * - Inside Capacitor (Android APK) where origin is capacitor://localhost or http://localhost
 * - Inside Electron (Windows EXE) where origin is file:// or null
 * - In standard Web Browser (Firebase Hosting or local Vite dev)
 */

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin || '';
  const protocol = window.location.protocol || '';
  return (
    origin.startsWith('capacitor://') ||
    origin.startsWith('ionic://') ||
    protocol === 'capacitor:' ||
    (typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.())
  );
}

export function isElectronEnv(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin || '';
  const protocol = window.location.protocol || '';
  return origin === 'file:' || protocol === 'file:' || origin === 'null';
}

/**
 * Direct mapping of Kryptex endpoints to public Kryptex pool REST API
 */
export function mapKryptexDirectUrl(endpoint: string): string | null {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // /api/kryptex/pool?coin=prl -> https://pool.kryptex.com/{coin}/api/v1/pool/info
  const poolMatch = clean.match(/^\/api\/kryptex\/pool(?:\?coin=([a-zA-Z0-9_-]+))?/);
  if (poolMatch) {
    const coin = poolMatch[1] || 'prl';
    return `https://pool.kryptex.com/${coin}/api/v1/pool/info`;
  }

  // /api/kryptex/rates -> https://pool.kryptex.com/api/v1/rates
  if (clean.startsWith('/api/kryptex/rates')) {
    return 'https://pool.kryptex.com/api/v1/rates';
  }

  // /api/kryptex/daily-revenue -> https://pool.kryptex.com/api/v2/daily-revenue/PRL
  if (clean.startsWith('/api/kryptex/daily-revenue')) {
    const q = clean.includes('?') ? clean.substring(clean.indexOf('?')) : '';
    return `https://pool.kryptex.com/api/v2/daily-revenue/PRL${q}`;
  }

  // /api/kryptex/workers/:address?coin=prl -> https://pool.kryptex.com/{coin}/api/v3/miner/workers/{address}
  const workersMatch = clean.match(/^\/api\/kryptex\/workers\/([^?]+)(?:\?coin=([a-zA-Z0-9_-]+))?/);
  if (workersMatch) {
    const addr = workersMatch[1].split('?')[0];
    const coin = workersMatch[2] || 'prl';
    return `https://pool.kryptex.com/${coin}/api/v3/miner/workers/${addr}`;
  }

  // /api/kryptex/balance/:address?coin=prl -> https://pool.kryptex.com/{coin}/api/v1/miner/balance/{address}
  const balMatch = clean.match(/^\/api\/kryptex\/balance\/([^?]+)(?:\?coin=([a-zA-Z0-9_-]+))?/);
  if (balMatch) {
    const addr = balMatch[1].split('?')[0];
    const coin = balMatch[2] || 'prl';
    return `https://pool.kryptex.com/${coin}/api/v1/miner/balance/${addr}`;
  }

  // /api/kryptex/payouts/:address?coin=prl -> https://pool.kryptex.com/{coin}/api/v1/miner/payouts/{address}/stats
  const payMatch = clean.match(/^\/api\/kryptex\/payouts\/([^?]+)(?:\?coin=([a-zA-Z0-9_-]+))?/);
  if (payMatch) {
    const addr = payMatch[1].split('?')[0];
    const coin = payMatch[2] || 'prl';
    return `https://pool.kryptex.com/${coin}/api/v1/miner/payouts/${addr}/stats`;
  }

  return null;
}

export function getApiBaseUrl(): string {
  // 1. Check user-configured custom backend URL in App Settings
  try {
    const saved = localStorage.getItem('minerx_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.backendUrl && typeof parsed.backendUrl === 'string' && parsed.backendUrl.trim()) {
        return parsed.backendUrl.trim().replace(/\/+$/, '');
      }
    }
  } catch {}

  // 2. In Electron desktop, if no remote URL configured, point to local server
  if (isElectronEnv()) {
    return 'http://localhost:3001';
  }

  // 3. In Capacitor (Android APK), default to empty string so direct requests or custom proxy are used
  if (isCapacitorNative()) {
    return '';
  }

  // 4. In web browser on Vite dev server or Firebase Hosting, use relative path
  return '';
}

/**
 * Builds a complete URL for a given /api endpoint
 */
export function apiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!base) return cleanEndpoint;
  return `${base}${cleanEndpoint}`;
}

/**
 * Wrapper over fetch that injects the environment-aware base URL and auth token.
 * Prevents HTML SPA fallback crashes by returning a graceful JSON response if an API endpoint returns HTML.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const directKryptex = mapKryptexDirectUrl(endpoint);
  const customBackend = getApiBaseUrl();
  const isCap = isCapacitorNative();

  // If in Capacitor APK without custom backend, route Kryptex calls directly to pool.kryptex.com
  // CapacitorHttp allows native Android HTTPS requests with NO CORS restrictions!
  if (isCap && directKryptex && !customBackend) {
    try {
      const res = await fetch(directKryptex, options);
      if (res.ok) return res;
    } catch (directErr) {
      console.warn('Direct Capacitor Kryptex fetch failed, trying standard fallback:', directErr);
    }
  }

  // In Capacitor APK without backend, handle local config queries gracefully
  if (isCap && !customBackend) {
    if (endpoint === '/api/config' && (!options.method || options.method === 'GET')) {
      try {
        const saladAccounts = JSON.parse(localStorage.getItem('minerx_salad_accounts') || '[]');
        const kryptexAccounts = JSON.parse(localStorage.getItem('minerx_kryptex_accounts') || '[]');
        const kryptexConfig = JSON.parse(localStorage.getItem('minerx_kryptex_config') || '{}');
        const appSettings = JSON.parse(localStorage.getItem('minerx_settings') || '{}');
        return new Response(
          JSON.stringify({
            success: true,
            saladAccounts,
            kryptexAccounts,
            kryptexConfig,
            appSettings,
            isStandalone: true
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch {}
    }

    if (endpoint === '/api/auth/me') {
      const localToken = localStorage.getItem('minerx_auth_token');
      if (localToken) {
        return new Response(
          JSON.stringify({
            success: true,
            user: { id: 'local_user', email: 'admin@minerx.local', role: 'admin' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  const url = apiUrl(endpoint);
  const token = localStorage.getItem('minerx_auth_token');

  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    
    // If an /api endpoint returned HTML or 404 (e.g. Firebase static hosting without Blaze Functions deployed)
    if (
      (response.status === 404 || contentType.includes('text/html')) &&
      (endpoint.includes('/api') || url.includes('/api'))
    ) {
      // If it's a Kryptex request and we are in mobile/native environment, try direct URL
      if (directKryptex && (isCap || isElectronEnv())) {
        try {
          const directRes = await fetch(directKryptex, options);
          if (directRes.ok) return directRes;
        } catch {}
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'BACKEND_NOT_FOUND_OR_BLAZE_REQUIRED',
          message: 'El backend no está desplegado en Firebase (Error 404). Firebase Hosting requiere el Plan Blaze para ejecutar Cloud Functions, o bien configurar la URL de tu servidor backend en Ajustes.',
          status: response.status
        }),
        {
          status: response.status >= 400 ? response.status : 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return response;
  } catch (netErr: any) {
    // Network failure (e.g. server completely down or refused connection)
    // If direct Kryptex URL is available, attempt direct fetch as ultimate fallback
    if (directKryptex) {
      try {
        const directRes = await fetch(directKryptex, options);
        if (directRes.ok) return directRes;
      } catch {}
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'NETWORK_ERROR',
        message: netErr?.message || 'Error de conexión de red.',
        status: 0
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

