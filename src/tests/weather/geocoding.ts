/**
 * Hometown lookup with the Open-Meteo Geocoding API (free, no key).
 * https://open-meteo.com/en/docs/geocoding-api
 */

export interface Place {
  /** Short name stored on the session, e.g. "Ljubljana". */
  name: string
  /** Shown in the list to tell places apart, e.g. "Ljubljana, Slovenia". */
  label: string
  lat: number
  lon: number
}

interface GeoResult {
  id: number
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${ENDPOINT}?${new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' })}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`)
  const data = (await response.json()) as { results?: GeoResult[] }
  return (data.results ?? []).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }))
}
