/**
 * Utility for automatic country and IP detection.
 * Used internally in the platform for background registration and profile initialization.
 */

export interface DetectedGeo {
  country: string
  ip: string
}

let cachedGeo: DetectedGeo | null = null

export async function detectUserGeo(forceRefresh = false): Promise<DetectedGeo> {
  if (!forceRefresh && cachedGeo) return cachedGeo

  // 1. Try ipapi.co
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const country = data.country_name || (data.country ? getCountryNameFromCode(data.country) : null)
      const ip = data.ip || ''
      if (country && typeof country === 'string') {
        cachedGeo = { country, ip: ip || '127.0.0.1' }
        return cachedGeo
      }
    }
  } catch {
    // Continue
  }

  // 2. Try api.country.is
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch('https://api.country.is/', { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const code = data.country
      const ip = data.ip || ''
      if (code && typeof code === 'string') {
        const countryName = getCountryNameFromCode(code)
        cachedGeo = { country: countryName, ip: ip || '127.0.0.1' }
        return cachedGeo
      }
    }
  } catch {
    // Continue
  }

  // 3. Try ipwho.is
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch('https://ipwho.is/', { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (data.success !== false && data.country) {
        cachedGeo = { country: data.country, ip: data.ip || '127.0.0.1' }
        return cachedGeo
      }
    }
  } catch {
    // Continue
  }

  return { country: 'United States', ip: '127.0.0.1' }
}

export async function detectUserCountry(forceRefresh = false): Promise<string> {
  const geo = await detectUserGeo(forceRefresh)
  return geo.country
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  MX: 'Mexico',
  ES: 'Spain',
  CO: 'Colombia',
  AR: 'Argentina',
  CL: 'Chile',
  PE: 'Peru',
  BR: 'Brazil',
  CA: 'Canada',
  DE: 'Germany',
  FR: 'France',
  GB: 'United Kingdom',
  IT: 'Italy',
  RU: 'Russia',
  UA: 'Ukraine',
  VE: 'Venezuela',
  EC: 'Ecuador',
  GT: 'Guatemala',
  CR: 'Costa Rica',
  PA: 'Panama',
  DO: 'Dominican Republic',
  UY: 'Uruguay',
  PY: 'Paraguay',
  BO: 'Bolivia',
  SV: 'El Salvador',
  HN: 'Honduras',
  NI: 'Nicaragua',
}

function getCountryNameFromCode(code: string): string {
  const upper = code.toUpperCase().trim()
  return COUNTRY_NAMES[upper] || upper
}
