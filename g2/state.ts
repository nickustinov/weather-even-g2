import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

export type UnitSystem = 'metric' | 'imperial'

export type City = {
  name: string
  admin1: string
  country: string
  latitude: number
  longitude: number
}

export type HourlyPoint = {
  time: string
  temp: number
  wmoCode: number
  precipProb: number
  precipMm: number
  windSpeed: number
  windDir: number
  windGust: number
  humidity: number
  dewPoint: number
  uvIndex: number
}

export type DailyPoint = {
  day: string
  wmoCode: number
  tempMax: number
  tempMin: number
  precipProb: number
  precipSum: number
  windMax: number
  uvMax: number
  sunshineHours: number
}

export type Pollen = {
  alder: number | null
  birch: number | null
  grass: number | null
  mugwort: number | null
  olive: number | null
  ragweed: number | null
}

export type AirQuality = {
  euAqi: number
  pm2_5: number
  pm10: number
  nitrogenDioxide: number
  ozone: number
  sulphurDioxide: number
  carbonMonoxide: number
  pollen: Pollen
}

export type WeatherData = {
  city: string
  currentTemp: number
  currentWmoCode: number
  currentDescription: string
  feelsLike: number
  windSpeed: number
  windGust: number
  windDirection: number
  humidity: number
  pressure: number
  sunrise: string
  sunset: string
  hourly: HourlyPoint[]
  daily: DailyPoint[]
  airQuality: AirQuality | null
}

export const SCREENS = ['today', 'forecast', 'rain', 'wind', 'humidity', 'uv', 'air', 'sun', 'hours'] as const
export type Screen = (typeof SCREENS)[number]

export const SCREEN_LABELS: Record<Screen, string> = {
  today: 'Today',
  forecast: '10-day forecast',
  rain: 'Rain',
  wind: 'Wind',
  humidity: 'Humidity',
  uv: 'UV index',
  air: 'Air quality',
  sun: 'Sun & moon',
  hours: 'Next hours',
}

// User preferences for the navigation carousel. Storage layer (api.ts) caches
// these; renderer.ts reads them to derive the effective screen ring.
export type ScreenPref = { id: Screen; enabled: boolean }
export const DEFAULT_SCREEN_PREFS: ScreenPref[] = SCREENS.map(id => ({ id, enabled: true }))

export type State = {
  screen: Screen
  screenIndex: number
  startupRendered: boolean
  weather: WeatherData | null
}

export const state: State = {
  screen: 'today',
  screenIndex: 0,
  startupRendered: false,
  weather: null,
}

let _bridge: EvenAppBridge | null = null

export function getBridge(): EvenAppBridge | null {
  return _bridge
}

export function setBridge(b: EvenAppBridge): void {
  _bridge = b
}
