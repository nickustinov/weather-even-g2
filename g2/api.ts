import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type {
  AirQuality, City, Pollen, ScreenPref, Screen,
  TempUnit, WindUnit, PrecipUnit, PressureUnit, TimeUnit, UnitPrefs,
  UnitSystem,
  WeatherData, HourlyPoint, DailyPoint,
} from './state'
import { DEFAULT_SCREEN_PREFS, DEFAULT_UNIT_PREFS, SCREENS, getBridge } from './state'
import { appendEventLog } from '../_shared/log'

const CITY_KEY = 'weather:city'        // legacy: single-city storage, migrated
const CITIES_KEY = 'weather:cities'
const ACTIVE_KEY = 'weather:active-city'
const UNIT_KEY = 'weather:unit'        // legacy: 'metric'|'imperial', migrated
const UNIT_PREFS_KEY = 'weather:units'
const SCREENS_KEY = 'weather:screens'

// --- Settings (SDK local storage + memory cache) ---

let cachedCities: City[] = []
let cachedActiveKey: string = ''
let cachedUnitPrefs: UnitPrefs = { ...DEFAULT_UNIT_PREFS }
let cachedScreenPrefs: ScreenPref[] = DEFAULT_SCREEN_PREFS.slice()
const settingsListeners: Array<() => void> = []
const screenPrefsListeners: Array<() => void> = []
const citiesListeners: Array<() => void> = []
const unitPrefsListeners: Array<() => void> = []

// Stable identifier for a city — coordinates uniquely identify a place
// (two cities sharing a name distinguish themselves by lat/lng) and survive
// rename quirks in the geocoder.
export function cityKey(city: City): string {
  return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`
}

export function onSettingsLoaded(cb: () => void): void {
  settingsListeners.push(cb)
}

export async function loadSettings(b: EvenAppBridge): Promise<void> {
  const rawCities = await b.getLocalStorage(CITIES_KEY)
  if (rawCities) {
    try { cachedCities = JSON.parse(rawCities) as City[] } catch { /* ignore */ }
  }
  const rawActive = await b.getLocalStorage(ACTIVE_KEY)
  if (rawActive) cachedActiveKey = rawActive

  // Migrate legacy single-city storage if no multi-city list exists yet.
  if (cachedCities.length === 0) {
    const rawLegacy = await b.getLocalStorage(CITY_KEY)
    if (rawLegacy) {
      try {
        const legacy = JSON.parse(rawLegacy) as City
        cachedCities = [legacy]
        cachedActiveKey = cityKey(legacy)
        await b.setLocalStorage(CITIES_KEY, JSON.stringify(cachedCities))
        await b.setLocalStorage(ACTIVE_KEY, cachedActiveKey)
      } catch { /* ignore */ }
    }
  }

  // Ensure active key references a city in the list; otherwise fall back to
  // the first entry (or stay empty if no cities exist).
  if (cachedCities.length > 0 && !cachedCities.some(c => cityKey(c) === cachedActiveKey)) {
    cachedActiveKey = cityKey(cachedCities[0])
    await b.setLocalStorage(ACTIVE_KEY, cachedActiveKey)
  }

  // Per-variable unit prefs (new format). If absent, fall back to the
  // legacy 'weather:unit' = 'metric'|'imperial' setting and migrate.
  const rawUnits = await b.getLocalStorage(UNIT_PREFS_KEY)
  if (rawUnits) {
    try {
      const parsed = JSON.parse(rawUnits) as Partial<UnitPrefs>
      cachedUnitPrefs = { ...DEFAULT_UNIT_PREFS, ...parsed }
    } catch { /* keep defaults */ }
  } else {
    const rawLegacyUnit = await b.getLocalStorage(UNIT_KEY)
    if (rawLegacyUnit === 'imperial') {
      cachedUnitPrefs = { temp: 'F', wind: 'mph', precip: 'in', pressure: 'inHg', time: '12h' }
      await b.setLocalStorage(UNIT_PREFS_KEY, JSON.stringify(cachedUnitPrefs))
    }
  }

  const rawScreens = await b.getLocalStorage(SCREENS_KEY)
  if (rawScreens) {
    try {
      const parsed = JSON.parse(rawScreens) as ScreenPref[]
      cachedScreenPrefs = mergeScreenPrefs(parsed)
    } catch { /* ignore parse errors, keep defaults */ }
  }

  appendEventLog(`Settings: cities=${cachedCities.length} active=${cachedActiveKey || 'none'} temp=${cachedUnitPrefs.temp}`)
  for (const cb of settingsListeners) cb()
  for (const cb of screenPrefsListeners) cb()
  for (const cb of citiesListeners) cb()
  for (const cb of unitPrefsListeners) cb()
}

// Reconciles persisted prefs with the current SCREENS catalog: keeps any
// stored entry that matches a current screen (preserving order + enabled),
// appends any new screens added in code, and drops removed ones.
function mergeScreenPrefs(stored: ScreenPref[]): ScreenPref[] {
  const catalog = new Set<Screen>(SCREENS)
  const merged: ScreenPref[] = []
  const seen = new Set<Screen>()
  for (const p of stored) {
    if (catalog.has(p.id) && !seen.has(p.id)) {
      merged.push({ id: p.id, enabled: !!p.enabled })
      seen.add(p.id)
    }
  }
  for (const id of SCREENS) {
    if (!seen.has(id)) merged.push({ id, enabled: true })
  }
  return merged
}

export function getScreenPrefs(): ScreenPref[] {
  return cachedScreenPrefs
}

export async function saveScreenPrefs(prefs: ScreenPref[]): Promise<void> {
  cachedScreenPrefs = mergeScreenPrefs(prefs)
  const b = getBridge()
  if (b) await b.setLocalStorage(SCREENS_KEY, JSON.stringify(cachedScreenPrefs))
  for (const cb of screenPrefsListeners) cb()
}

export function onScreenPrefsChanged(cb: () => void): void {
  screenPrefsListeners.push(cb)
}

export function getCities(): City[] {
  return cachedCities
}

export function getActiveCity(): City | null {
  return cachedCities.find(c => cityKey(c) === cachedActiveKey) ?? null
}

// Kept for backwards compatibility — every screen module reads the
// currently active city through this name.
export function getSavedCity(): City | null {
  return getActiveCity()
}

async function persistCities(): Promise<void> {
  const b = getBridge()
  if (!b) return
  await b.setLocalStorage(CITIES_KEY, JSON.stringify(cachedCities))
  await b.setLocalStorage(ACTIVE_KEY, cachedActiveKey)
}

export async function addCity(city: City): Promise<void> {
  const k = cityKey(city)
  if (!cachedCities.some(c => cityKey(c) === k)) {
    cachedCities = [...cachedCities, city]
  }
  cachedActiveKey = k
  await persistCities()
  for (const cb of citiesListeners) cb()
}

export async function removeCity(key: string): Promise<void> {
  const next = cachedCities.filter(c => cityKey(c) !== key)
  cachedCities = next
  if (cachedActiveKey === key) {
    cachedActiveKey = next.length > 0 ? cityKey(next[0]) : ''
  }
  await persistCities()
  for (const cb of citiesListeners) cb()
}

// Replace the saved cities list (used by the browser UI drag reorder).
// Preserves the active key as long as that city is still in the new list.
export async function setCities(cities: City[]): Promise<void> {
  cachedCities = cities
  if (!cities.some(c => cityKey(c) === cachedActiveKey)) {
    cachedActiveKey = cities.length > 0 ? cityKey(cities[0]) : ''
  }
  await persistCities()
  for (const cb of citiesListeners) cb()
}

export async function setActiveCity(key: string): Promise<void> {
  if (!cachedCities.some(c => cityKey(c) === key)) return
  cachedActiveKey = key
  const b = getBridge()
  if (b) await b.setLocalStorage(ACTIVE_KEY, key)
  for (const cb of citiesListeners) cb()
}

export function onCitiesChanged(cb: () => void): void {
  citiesListeners.push(cb)
}

// Legacy name kept for the city-search flow in ui.tsx — adds the city to
// the list and makes it active.
export async function saveCity(city: City): Promise<void> {
  await addCity(city)
}

export function getUnitPrefs(): UnitPrefs {
  return cachedUnitPrefs
}

export function getTempUnit(): TempUnit { return cachedUnitPrefs.temp }
export function getWindUnit(): WindUnit { return cachedUnitPrefs.wind }
export function getPrecipUnit(): PrecipUnit { return cachedUnitPrefs.precip }
export function getPressureUnit(): PressureUnit { return cachedUnitPrefs.pressure }
export function getTimeUnit(): TimeUnit { return cachedUnitPrefs.time }

export async function setUnitPrefs(patch: Partial<UnitPrefs>): Promise<void> {
  cachedUnitPrefs = { ...cachedUnitPrefs, ...patch }
  const b = getBridge()
  if (b) await b.setLocalStorage(UNIT_PREFS_KEY, JSON.stringify(cachedUnitPrefs))
  for (const cb of unitPrefsListeners) cb()
}

export function onUnitPrefsChanged(cb: () => void): void {
  unitPrefsListeners.push(cb)
}

// Legacy helpers kept so screens that still ask for a single unit system
// get a reasonable answer (used only by anything not yet migrated to the
// per-variable API — currently nothing in the codebase).
export function getSavedUnit(): UnitSystem {
  return cachedUnitPrefs.temp === 'F' ? 'imperial' : 'metric'
}

export async function searchCities(query: string): Promise<City[]> {
  if (query.length < 2) return []

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = (await res.json()) as {
    results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>
  }

  return (data.results ?? []).map((r) => ({
    name: r.name,
    admin1: r.admin1 ?? '',
    country: r.country ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
  }))
}

function wmoDescription(code: number): string {
  if (code === 0) return 'clear sky'
  if (code === 1) return 'mainly clear'
  if (code === 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'foggy'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain showers'
  if (code >= 85 && code <= 86) return 'snow showers'
  if (code >= 95) return 'thunderstorm'
  return 'unknown'
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: cachedUnitPrefs.time === '12h',
  })
}

type OpenMeteoForecast = {
  current?: {
    temperature_2m?: number
    relative_humidity_2m?: number
    apparent_temperature?: number
    weather_code?: number
    wind_speed_10m?: number
    wind_direction_10m?: number
    wind_gusts_10m?: number
    surface_pressure?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    weather_code?: number[]
    precipitation_probability?: number[]
    precipitation?: number[]
    wind_speed_10m?: number[]
    wind_direction_10m?: number[]
    wind_gusts_10m?: number[]
    relative_humidity_2m?: number[]
    dew_point_2m?: number[]
    uv_index?: number[]
  }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: number[]
    precipitation_sum?: number[]
    wind_speed_10m_max?: number[]
    uv_index_max?: number[]
    sunshine_duration?: number[]
    sunrise?: string[]
    sunset?: string[]
  }
}

export async function fetchWeather(city: City, prefs: UnitPrefs = DEFAULT_UNIT_PREFS): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,dew_point_2m,uv_index',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunshine_duration,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '10',
    temperature_unit: prefs.temp === 'F' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: prefs.wind, // 'kmh' | 'mph' | 'ms' — matches Open-Meteo's vocab
    precipitation_unit: prefs.precip === 'in' ? 'inch' : 'mm',
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Forecast fetch failed: ${res.status}`)

  const data = (await res.json()) as OpenMeteoForecast
  const current = data.current ?? {}
  const hourly = data.hourly ?? {}
  const daily = data.daily ?? {}

  const now = new Date()
  const hourlyTimes: string[] = hourly.time ?? []
  const startIdx = hourlyTimes.findIndex((t) => new Date(t) >= now)
  const sliceStart = startIdx >= 0 ? startIdx : 0

  const hourlyPoints: HourlyPoint[] = hourlyTimes
    .slice(sliceStart, sliceStart + 24)
    .map((t, i) => {
      const idx = sliceStart + i
      return {
        time: formatTime(t),
        temp: Math.round(hourly.temperature_2m?.[idx] ?? 0),
        wmoCode: hourly.weather_code?.[idx] ?? 0,
        precipProb: hourly.precipitation_probability?.[idx] ?? 0,
        precipMm: hourly.precipitation?.[idx] ?? 0,
        windSpeed: Math.round(hourly.wind_speed_10m?.[idx] ?? 0),
        windDir: Math.round(hourly.wind_direction_10m?.[idx] ?? 0),
        windGust: Math.round(hourly.wind_gusts_10m?.[idx] ?? 0),
        humidity: Math.round(hourly.relative_humidity_2m?.[idx] ?? 0),
        dewPoint: Math.round(hourly.dew_point_2m?.[idx] ?? 0),
        uvIndex: Math.round((hourly.uv_index?.[idx] ?? 0) * 10) / 10,
      }
    })

  const dailyPoints: DailyPoint[] = (daily.time ?? []).map((t, i) => ({
    day: WEEKDAYS[new Date(t + 'T00:00:00').getDay()],
    wmoCode: daily.weather_code?.[i] ?? 0,
    tempMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
    tempMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    precipProb: daily.precipitation_probability_max?.[i] ?? 0,
    precipSum: Math.round((daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
    windMax: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
    uvMax: Math.round((daily.uv_index_max?.[i] ?? 0) * 10) / 10,
    sunshineHours: Math.round((daily.sunshine_duration?.[i] ?? 0) / 3600 * 10) / 10,
  }))

  const sunriseToday = daily.sunrise?.[0] ?? ''
  const sunsetToday = daily.sunset?.[0] ?? ''

  // Air-quality is a separate endpoint that can fail independently; we don't
  // want a flaky AQ response to kill the whole weather refresh.
  const airQuality = await fetchAirQuality(city).catch((err) => {
    appendEventLog(`AQ: fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  })

  return applyTestOverrides({
    city: city.name,
    currentTemp: Math.round(current.temperature_2m ?? 0),
    currentWmoCode: current.weather_code ?? 0,
    currentDescription: wmoDescription(current.weather_code ?? 0),
    feelsLike: Math.round(current.apparent_temperature ?? 0),
    windSpeed: Math.round(current.wind_speed_10m ?? 0),
    windGust: Math.round(current.wind_gusts_10m ?? 0),
    windDirection: Math.round(current.wind_direction_10m ?? 0),
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    pressure: Math.round(current.surface_pressure ?? 0),
    sunrise: sunriseToday ? formatTime(sunriseToday) : '',
    sunset: sunsetToday ? formatTime(sunsetToday) : '',
    hourly: hourlyPoints,
    daily: dailyPoints,
    airQuality,
  })
}

type OpenMeteoAirQuality = {
  current?: {
    european_aqi?: number
    pm2_5?: number
    pm10?: number
    nitrogen_dioxide?: number
    ozone?: number
    sulphur_dioxide?: number
    carbon_monoxide?: number
    alder_pollen?: number | null
    birch_pollen?: number | null
    grass_pollen?: number | null
    mugwort_pollen?: number | null
    olive_pollen?: number | null
    ragweed_pollen?: number | null
  }
}

// CAMS Europe pollen is only reported for European latitudes; outside that
// region the fields come back as null and we let the air screen fall back
// to pollutant data.
function roundPollen(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return Math.round(v * 10) / 10
}

async function fetchAirQuality(city: City): Promise<AirQuality | null> {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: [
      'european_aqi', 'pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone',
      'sulphur_dioxide', 'carbon_monoxide',
      'alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen',
      'olive_pollen', 'ragweed_pollen',
    ].join(','),
    timezone: 'auto',
  })
  const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`)
  if (!res.ok) throw new Error(`Air-quality fetch failed: ${res.status}`)
  const data = (await res.json()) as OpenMeteoAirQuality
  const c = data.current ?? {}
  return {
    euAqi: Math.round(c.european_aqi ?? 0),
    pm2_5: Math.round((c.pm2_5 ?? 0) * 10) / 10,
    pm10: Math.round((c.pm10 ?? 0) * 10) / 10,
    nitrogenDioxide: Math.round((c.nitrogen_dioxide ?? 0) * 10) / 10,
    ozone: Math.round((c.ozone ?? 0) * 10) / 10,
    sulphurDioxide: Math.round((c.sulphur_dioxide ?? 0) * 10) / 10,
    carbonMonoxide: Math.round(c.carbon_monoxide ?? 0),
    pollen: {
      alder: roundPollen(c.alder_pollen),
      birch: roundPollen(c.birch_pollen),
      grass: roundPollen(c.grass_pollen),
      mugwort: roundPollen(c.mugwort_pollen),
      olive: roundPollen(c.olive_pollen),
      ragweed: roundPollen(c.ragweed_pollen),
    },
  }
}

// Pollen category thresholds (grains/m³) per common European pollen networks.
// Returns a label and the "very high" threshold used to scale unicode bars.
export type PollenInfo = { label: string; scaleMax: number }
const POLLEN_SCALES: Record<keyof Pollen, number> = {
  alder: 100,
  birch: 100,
  grass: 200,
  mugwort: 50,
  olive: 200,
  ragweed: 20,
}

export function pollenScaleMax(species: keyof Pollen): number {
  return POLLEN_SCALES[species]
}

export function pollenCategory(species: keyof Pollen, value: number): string {
  const max = POLLEN_SCALES[species]
  if (value < max * 0.1) return 'low'
  if (value < max * 0.3) return 'moderate'
  if (value < max) return 'high'
  return 'very high'
}

// Returns the single most elevated pollen species (as a fraction of its "very
// high" threshold) for the header. Returns null when no pollen data exists.
export function dominantPollen(pollen: Pollen): { species: keyof Pollen; value: number } | null {
  let best: { species: keyof Pollen; value: number; ratio: number } | null = null
  const species: (keyof Pollen)[] = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed']
  for (const s of species) {
    const v = pollen[s]
    if (v === null) continue
    const ratio = v / POLLEN_SCALES[s]
    if (!best || ratio > best.ratio) best = { species: s, value: v, ratio }
  }
  if (!best) return null
  return { species: best.species, value: best.value }
}

export function hasPollenData(pollen: Pollen): boolean {
  return pollen.alder !== null || pollen.birch !== null || pollen.grass !== null ||
    pollen.mugwort !== null || pollen.olive !== null || pollen.ragweed !== null
}

// Human comfort vs. relative humidity %. Dew point is a better physical
// "muggy" gauge, but most users intuit % so we lead with that.
export function humidityComfort(rh: number): string {
  if (rh < 30) return 'dry'
  if (rh < 60) return 'comfortable'
  if (rh < 70) return 'sticky'
  if (rh < 85) return 'muggy'
  return 'oppressive'
}

// WHO UV category bands.
export function uvCategory(uv: number): string {
  if (uv < 3) return 'low'
  if (uv < 6) return 'moderate'
  if (uv < 8) return 'high'
  if (uv < 11) return 'very high'
  return 'extreme'
}

// Short form for tight columns — keep ≤4 chars so the value+category fits in
// the chart's values column.
export function uvCategoryShort(uv: number): string {
  if (uv < 3) return 'low'
  if (uv < 6) return 'mod'
  if (uv < 8) return 'high'
  if (uv < 11) return 'v.hi'
  return 'extr'
}

// EU air-quality index categories (0–100+ scale).
export function aqiCategory(aqi: number): string {
  if (aqi < 20) return 'good'
  if (aqi < 40) return 'fair'
  if (aqi < 60) return 'moderate'
  if (aqi < 80) return 'poor'
  if (aqi < 100) return 'very poor'
  return 'extremely poor'
}

// URL query overrides for visual testing of edge cases without touching code.
// Example: ?temp=105&hi=110&lo=-12&wind=99&humidity=100&pressure=1050&precip=12.5
function applyTestOverrides(w: WeatherData): WeatherData {
  if (typeof window === 'undefined') return w
  const p = new URLSearchParams(window.location.search)
  const num = (key: string): number | undefined => {
    const v = p.get(key)
    if (v === null) return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  const temp = num('temp')
  if (temp !== undefined) w.currentTemp = Math.round(temp)
  const feels = num('feels')
  if (feels !== undefined) w.feelsLike = Math.round(feels)
  const wind = num('wind')
  if (wind !== undefined) w.windSpeed = Math.round(wind)
  const gust = num('gust')
  if (gust !== undefined) w.windGust = Math.round(gust)
  const windDir = num('winddir')
  if (windDir !== undefined) w.windDirection = Math.round(windDir)
  const humidity = num('humidity')
  if (humidity !== undefined) {
    w.humidity = Math.round(humidity)
    // Stamp hourly humidity to the same value so the chart screen can be
    // previewed without crafting a 24-element curve. uv override below does
    // the same trick for the uv index hourly chart.
    w.hourly.forEach(h => { h.humidity = Math.round(humidity) })
  }
  const uv = num('uv')
  if (uv !== undefined) {
    w.hourly.forEach(h => { h.uvIndex = uv })
  }
  const pressure = num('pressure')
  if (pressure !== undefined) w.pressure = Math.round(pressure)
  const precip = num('precip')
  if (precip !== undefined && w.daily[0]) w.daily[0].precipSum = precip
  // hi/lo apply to every daily entry so the forecast screen can be stressed
  // alongside Today. Use today_hi/today_lo to override just day 0.
  const hi = num('hi')
  if (hi !== undefined) w.daily.forEach(d => { d.tempMax = Math.round(hi) })
  const lo = num('lo')
  if (lo !== undefined) w.daily.forEach(d => { d.tempMin = Math.round(lo) })
  const todayHi = num('today_hi')
  if (todayHi !== undefined && w.daily[0]) w.daily[0].tempMax = Math.round(todayHi)
  const todayLo = num('today_lo')
  if (todayLo !== undefined && w.daily[0]) w.daily[0].tempMin = Math.round(todayLo)
  // wmo overrides the current WMO weather code so we can preview each
  // condition icon (0=clear, 2=partly cloudy, 3=overcast, 45=fog, 61=rain,
  // 71=snow, 95=thunderstorm, etc.). Description updates to match.
  const wmo = num('wmo')
  if (wmo !== undefined) {
    w.currentWmoCode = Math.round(wmo)
    w.currentDescription = wmoDescription(w.currentWmoCode)
  }
  // Air quality overrides: aqi sets the headline; pm25/pm10/no2/o3/so2/co
  // populate individual pollutant bars. Synthesises an airQuality object if
  // the live fetch failed.
  const aqi = num('aqi')
  const pm25 = num('pm25')
  const pm10 = num('pm10')
  const no2 = num('no2')
  const o3 = num('o3')
  const so2 = num('so2')
  const co = num('co')
  const alder = num('alder')
  const birch = num('birch')
  const grass = num('grass')
  const mugwort = num('mugwort')
  const olive = num('olive')
  const ragweed = num('ragweed')
  const anyAir = aqi !== undefined || pm25 !== undefined || pm10 !== undefined ||
    no2 !== undefined || o3 !== undefined || so2 !== undefined || co !== undefined
  const anyPollen = alder !== undefined || birch !== undefined || grass !== undefined ||
    mugwort !== undefined || olive !== undefined || ragweed !== undefined
  if (anyAir || anyPollen) {
    const emptyPollen: Pollen = { alder: null, birch: null, grass: null, mugwort: null, olive: null, ragweed: null }
    const base: AirQuality = w.airQuality ?? {
      euAqi: 0, pm2_5: 0, pm10: 0, nitrogenDioxide: 0, ozone: 0, sulphurDioxide: 0, carbonMonoxide: 0,
      pollen: emptyPollen,
    }
    w.airQuality = {
      euAqi: aqi !== undefined ? Math.round(aqi) : base.euAqi,
      pm2_5: pm25 !== undefined ? pm25 : base.pm2_5,
      pm10: pm10 !== undefined ? pm10 : base.pm10,
      nitrogenDioxide: no2 !== undefined ? no2 : base.nitrogenDioxide,
      ozone: o3 !== undefined ? o3 : base.ozone,
      sulphurDioxide: so2 !== undefined ? so2 : base.sulphurDioxide,
      carbonMonoxide: co !== undefined ? Math.round(co) : base.carbonMonoxide,
      pollen: {
        alder:   alder   !== undefined ? alder   : base.pollen.alder,
        birch:   birch   !== undefined ? birch   : base.pollen.birch,
        grass:   grass   !== undefined ? grass   : base.pollen.grass,
        mugwort: mugwort !== undefined ? mugwort : base.pollen.mugwort,
        olive:   olive   !== undefined ? olive   : base.pollen.olive,
        ragweed: ragweed !== undefined ? ragweed : base.pollen.ragweed,
      },
    }
  }
  return w
}
