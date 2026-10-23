/**
 * MinerX API Base URL & Environment Resolver
 *
 * Resolves the appropriate backend API base URL depending on the running environment:
 * - Inside Capacitor (Android APK) where origin is capacitor://localhost or http://localhost
 * - Inside Electron (Windows EXE) where origin is file:// or null
 * - In standard Web Browser (Firebase Hosting or local Vite dev)
 */

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

  // 2. Detect mobile (Capacitor) or desktop (Electron) native environments
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    const protocol = window.location.protocol || '';

    if (
      origin.startsWith('capacitor://') ||
      origin.startsWith('ionic://') ||
      protocol === 'capacitor:' ||
      protocol === 'file:' ||
      origin === 'null'
    ) {
      // In local Electron or mobile native environment, connect to local proxy or user-configured host
      return 'http://localhost:3001';
    }
  }

  // 3. In web browser on Vite dev server or local proxy, use relative path or local port
  return '';
}

/**
 * Builds a complete URL for a given /api endpoint
 */
export function apiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}

/**
 * Wrapper over fetch that injects the environment-aware base URL and auth token.
 * Prevents HTML SPA fallback crashes by returning a graceful JSON response if an API endpoint returns HTML.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
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
    // If an /api endpoint returned HTML (e.g. Vite or static SPA 404 index.html fallback),
    // convert it to a structured JSON response to prevent "Unexpected token < in JSON" crashes.
    if (contentType.includes('text/html') && (endpoint.includes('/api') || url.includes('/api'))) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'OFFLINE_OR_SPA_FALLBACK',
          message: 'Servicio API en segundo plano no disponible o en modo local.',
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
