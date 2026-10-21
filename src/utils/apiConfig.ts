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
      // Connect directly to live Firebase Cloud URL
      return 'https://minerx-telemetry-cloud.web.app';
    }
  }

  // 3. In web browser on Firebase Hosting or Vite dev server, use relative path
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
 * Wrapper over fetch that injects the environment-aware base URL and auth token
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = apiUrl(endpoint);
  const token = localStorage.getItem('minerx_auth_token');

  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
