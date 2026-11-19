/**
 * Current weather from the Open-Meteo Forecast API (free, no key).
 * https://open-meteo.com/en/docs
 */
import { WEATHER_CONFIG, WEATHER_STATES, type WeatherState } from '@/config'

export interface CurrentWeather {
  /** WMO weather code. */
  code: number
  temperature: number
  isDay: boolean
  cloudCover: number
  precipitation: number
  /** Local time at the place, as reported (ISO, no zone). */
  time: string
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'weather_code,temperature_2m,is_day,cloud_cover,precipitation',
    timezone: 'auto',
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEATHER_CONFIG.fetchTimeoutSec * 1000)
  try {
    const response = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as {
      current?: { time: string; weather_code: number; temperature_2m: number; is_day: number; cloud_cover: number; precipitation: number }
    }
    const c = data.current
    if (!c || typeof c.weather_code !== 'number') throw new Error('no current weather in response')
    return {
      code: c.weather_code,
      temperature: c.temperature_2m,
      isDay: c.is_day === 1,
      cloudCover: c.cloud_cover,
      precipitation: c.precipitation,
      time: c.time,
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${WEATHER_CONFIG.fetchTimeoutSec} s`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** WMO code → one of the five looks (see `WEATHER_CONFIG.wmoStates`). */
export function stateForCode(code: number): WeatherState {
  return WEATHER_STATES.find((state) => WEATHER_CONFIG.wmoStates[state].includes(code)) ?? 'cloudy'
}
