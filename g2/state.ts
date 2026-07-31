import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

// Legacy unit system, kept for migration of old saves.
export type UnitSystem = 'metric' | 'imperial'

export type TempUnit = 'C' | 'F'
export type WindUnit = 'kmh' | 'mph' | 'ms'
export type PrecipUnit = 'mm' | 'in'
export type PressureUnit = 'hPa' | 'inHg' | 'mmHg'
export type TimeUnit = '24h' | '12h'
export type AqiScale = 'eu' | 'us'

export type UnitPrefs = {
  temp: TempUnit
  wind: WindUnit
  precip: PrecipUnit
  pressure: PressureUnit
  time: TimeUnit
  aqi: AqiScale
}

export const DEFAULT_UNIT_PREFS: UnitPrefs = {
  temp: 'C',
  wind: 'kmh',
  precip: 'mm',
  pressure: 'hPa',
  time: '24h',
  aqi: 'eu',
}

export type City = {
  name: string
  admin1: string
  country: string
  latitude: number
  longitude: number
  // Open-Meteo geoname id. Used to re-fetch the city by ID with a different
  // `language` param when the user switches locale — reliable across scripts.
  // Optional: cities saved before id was tracked fall back to name search.
  id?: number
  // Marks the synthesized GPS entry. Saved cities are identified by their
  // coordinates (see cityKey), but this entry's coordinates change every time
  // the device is located, so it carries a fixed identity instead. It is never
  // stored in the saved-cities list — api.ts prepends it on read, which is what
  // makes it impossible to delete or reorder.
  kind?: 'current'
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
  pressure: number
  isDay: boolean
  cloudCover: number
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
  usAqi: number
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
  currentIsDay: boolean
  currentCloudCover: number
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

export const SCREENS = ['today', 'forecast', 'rain', 'wind', 'humidity', 'pressure', 'uv', 'air', 'sun', 'hours'] as const
export type Screen = (typeof SCREENS)[number]

// User preferences for the navigation carousel. Storage layer (api.ts) caches
// these; renderer.ts reads them to derive the effective screen ring.
export type ScreenPref = { id: Screen; enabled: boolean }
export const DEFAULT_SCREEN_PREFS: ScreenPref[] = SCREENS.map(id => ({ id, enabled: true }))

export type State = {
  screen: Screen
  screenIndex: number
  startupRendered: boolean
  weather: WeatherData | null
  // Modal overlay — when non-null events route to the modal handler and
  // the modal renderer draws over the regular screen rotation.
  modal: 'cities' | null
  // Container IDs currently present on the page. Maintained by rebuildPage
  // so that any sendImage call queued from a previous render is dropped
  // instead of targeting a no-longer-existing container.
  activeContainerIds: Set<number>
  // Declared geometry of each image container on the current page. Lets
  // sendImage report the gray4 buffer size the host has to push over BLE,
  // which is the figure transfer time actually tracks — not our PNG size.
  imageContainerDims: Map<number, { w: number; h: number }>
}

export const state: State = {
  screen: 'today',
  screenIndex: 0,
  startupRendered: false,
  weather: null,
  modal: null,
  activeContainerIds: new Set(),
  imageContainerDims: new Map(),
}

let _bridge: EvenAppBridge | null = null

export function getBridge(): EvenAppBridge | null {
  return _bridge
}

export function setBridge(b: EvenAppBridge): void {
  _bridge = b
}
