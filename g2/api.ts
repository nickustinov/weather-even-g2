import { AppLocationAccuracy, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type {
  AirQuality, AqiScale, City, Pollen, ScreenPref, Screen,
  TempUnit, WindUnit, PrecipUnit, PressureUnit, TimeUnit, UnitPrefs,
  UnitSystem,
  WeatherData, HourlyPoint, DailyPoint,
} from './state'
import { DEFAULT_SCREEN_PREFS, DEFAULT_UNIT_PREFS, SCREENS, getBridge } from './state'
import { appendEventLog } from '../_shared/log'
import { detectBrowserLocale, getLocale, setLocaleSync, SUPPORTED_LOCALES, t, tArr, type Locale } from './i18n'

const CITY_KEY = 'weather:city'        // legacy: single-city storage, migrated
const CITIES_KEY = 'weather:cities'
const ACTIVE_KEY = 'weather:active-city'
const CURRENT_LOC_KEY = 'weather:current-location'
const CURRENT_POS_KEY = 'weather:current-position'
const UNIT_KEY = 'weather:unit'        // legacy: 'metric'|'imperial', migrated
const UNIT_PREFS_KEY = 'weather:units'
const SCREENS_KEY = 'weather:screens'
const LOCALE_KEY = 'weather:locale'

// --- Settings (SDK local storage + memory cache) ---

// Fixed identity of the GPS entry. Persisted as the active-city reference, so
// it must never collide with a coordinate key (which always contains a comma).
export const CURRENT_KEY = 'current'

// Last successful fix, persisted so the entry still names a real place when a
// later launch is denied GPS or gets no fix indoors. `updatedAt` is epoch ms.
type StoredLocation = {
  latitude: number
  longitude: number
  name: string
  admin1: string
  country: string
  updatedAt: number
  // Open-Meteo id of the resolved place, when the fix matched one. Lets a
  // locale switch re-fetch the same place by id, exactly as saved cities do.
  id?: number
}

let cachedCities: City[] = []
let cachedActiveKey: string = ''
let cachedLocation: StoredLocation | null = null
// Where the GPS entry sits among the saved cities. It is reorderable like any
// other row, but it is not a member of cachedCities — storing it there would
// make it deletable and freeze it at one set of coordinates — so its position
// is tracked separately and applied when the list is read.
let cachedCurrentPos = 0
// Whether the most recent fix attempt this session succeeded. Drives the
// "showing last known position" hint; deliberately not persisted, since a
// fresh launch has not attempted a fix yet.
let locationIsStale = false
let locatingInFlight: Promise<boolean> | null = null
let cachedUnitPrefs: UnitPrefs = { ...DEFAULT_UNIT_PREFS }
let cachedScreenPrefs: ScreenPref[] = DEFAULT_SCREEN_PREFS.slice()
const settingsListeners: Array<() => void> = []
const screenPrefsListeners: Array<() => void> = []
const citiesListeners: Array<() => void> = []
const unitPrefsListeners: Array<() => void> = []
const localeListeners: Array<() => void> = []

// Stable identifier for a city — coordinates uniquely identify a place
// (two cities sharing a name distinguish themselves by lat/lng) and survive
// rename quirks in the geocoder.
//
// The GPS entry is the exception: its coordinates change on every fix, so a
// coordinate key would make it look like a different city each launch and
// break the stored active-city reference. It gets a fixed key instead.
export function cityKey(city: City): string {
  if (city.kind === 'current') return CURRENT_KEY
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

  const rawPos = await b.getLocalStorage(CURRENT_POS_KEY)
  if (rawPos) {
    const parsed = Number(rawPos)
    if (Number.isInteger(parsed) && parsed >= 0) cachedCurrentPos = parsed
  }

  const rawLocation = await b.getLocalStorage(CURRENT_LOC_KEY)
  if (rawLocation) {
    try {
      const parsed = JSON.parse(rawLocation) as StoredLocation
      // Guard against a truncated or hand-edited record producing a 0,0 fetch.
      if (typeof parsed?.latitude === 'number' && typeof parsed?.longitude === 'number') {
        cachedLocation = parsed
        // Nothing has been attempted yet this session, so the remembered fix
        // is by definition not fresh until refreshCurrentLocation succeeds.
        locationIsStale = true
      }
    } catch { /* ignore */ }
  }

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
  // the first entry (or stay empty if no cities exist). CURRENT_KEY is always
  // a valid reference — the GPS entry cannot be deleted — so it is exempt.
  if (cachedActiveKey !== CURRENT_KEY
    && cachedCities.length > 0 && !cachedCities.some(c => cityKey(c) === cachedActiveKey)) {
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
      cachedUnitPrefs = { temp: 'F', wind: 'mph', precip: 'in', pressure: 'inHg', time: '12h', aqi: 'us' }
      await b.setLocalStorage(UNIT_PREFS_KEY, JSON.stringify(cachedUnitPrefs))
    }
  }

  const rawLocale = await b.getLocalStorage(LOCALE_KEY)
  const stored = rawLocale as Locale | null
  const initial = stored && SUPPORTED_LOCALES.includes(stored) ? stored : detectBrowserLocale()
  setLocaleSync(initial)

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
  // Fire locale listeners too so inline t() calls in browser UI components
  // (section headings, log summary) re-render once the stored locale is
  // applied — setLocaleSync above is silent and only updates the dictionary.
  for (const cb of localeListeners) cb()
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

// ---------------------------------------------------------------------------
// Current location
//
// The GPS entry is synthesized on read rather than stored in cachedCities.
// That is what makes it permanent: removeCity and setCities only ever operate
// on the saved list, so no reorder or delete can reach it, and no guard is
// needed at each of those call sites.
// ---------------------------------------------------------------------------

// Always present, so the entry is pinned at the head of the list even before
// the first ever fix. Without coordinates it is a placeholder: getActiveCity
// refuses to return it, so it can never drive a weather fetch.
export function getCurrentLocationCity(): City {
  if (!cachedLocation) {
    return { kind: 'current', name: '', admin1: '', country: '', latitude: 0, longitude: 0 }
  }
  return {
    kind: 'current',
    name: cachedLocation.name,
    admin1: cachedLocation.admin1,
    country: cachedLocation.country,
    latitude: cachedLocation.latitude,
    longitude: cachedLocation.longitude,
  }
}

export function hasCurrentLocationFix(): boolean {
  return cachedLocation !== null
}

// True when we are showing a remembered position because the latest attempt
// failed, so the UI can mark it rather than implying the fix is fresh.
export function isCurrentLocationStale(): boolean {
  return locationIsStale && cachedLocation !== null
}

export function getCities(): City[] {
  const list = [...cachedCities]
  // Clamped on read: the saved list can shrink between launches, which would
  // otherwise leave the stored position past the end.
  const at = Math.min(Math.max(cachedCurrentPos, 0), list.length)
  list.splice(at, 0, getCurrentLocationCity())
  return list
}

export function getActiveCity(): City | null {
  if (cachedActiveKey === CURRENT_KEY) {
    // Never hand back the placeholder — a 0,0 fetch would report weather in
    // the Atlantic. Fall back to the first saved city until a fix arrives.
    if (cachedLocation) return getCurrentLocationCity()
    return cachedCities[0] ?? null
  }
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
  await b.setLocalStorage(CURRENT_POS_KEY, String(cachedCurrentPos))
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
  // The GPS entry is not in the saved list, so filtering could never drop it —
  // but returning early also stops it clearing the active reference.
  if (key === CURRENT_KEY) return
  const next = cachedCities.filter(c => cityKey(c) !== key)
  cachedCities = next
  if (cachedActiveKey === key) {
    cachedActiveKey = next.length > 0 ? cityKey(next[0]) : ''
  }
  await persistCities()
  for (const cb of citiesListeners) cb()
}

// Replace the city list (used by the browser UI drag reorder). Accepts the
// full displayed list including the GPS entry: its index is recorded as the
// new position and it is then stripped, so it stays reorderable without ever
// being persisted as a saved city.
export async function setCities(cities: City[]): Promise<void> {
  const currentIndex = cities.findIndex(c => c.kind === 'current')
  if (currentIndex >= 0) cachedCurrentPos = currentIndex
  cachedCities = cities.filter(c => c.kind !== 'current')
  if (cachedActiveKey !== CURRENT_KEY && !cachedCities.some(c => cityKey(c) === cachedActiveKey)) {
    cachedActiveKey = cachedCities.length > 0 ? cityKey(cachedCities[0]) : ''
  }
  await persistCities()
  for (const cb of citiesListeners) cb()
}

export async function setActiveCity(key: string): Promise<void> {
  if (key !== CURRENT_KEY && !cachedCities.some(c => cityKey(c) === key)) return
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
export function getAqiScale(): AqiScale { return cachedUnitPrefs.aqi }

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

type GeocodeResult = {
  id?: number
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
  population?: number
}

function geocodeResultToCity(r: GeocodeResult): City {
  return {
    id: r.id,
    name: r.name,
    admin1: r.admin1 ?? '',
    country: r.country ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    population: r.population,
  }
}

// Open-Meteo's geocoder is forward-only, so naming a raw fix needs a separate
// reverse-geocoding service. BigDataCloud's client endpoint is free, needs no
// API key, and sends CORS headers, which the Even WebView enforces. A failure
// here is not fatal — the fix is still usable, it just goes unnamed.
type ReverseGeocodeResult = {
  city?: string
  locality?: string
  principalSubdivision?: string
  countryName?: string
}

// Great-circle distance in km, used to pick the nearest candidate place.
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLon = rad(bLon - aLon)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// A candidate must be a real settlement within this radius of the fix.
const NEAREST_PLACE_MAX_KM = 50

async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<{ name: string; admin1: string; country: string; id?: number }> {
  const empty = { name: '', admin1: '', country: '' }
  const lang = getLocale()
  const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
    + `?latitude=${latitude}&longitude=${longitude}&localityLanguage=${lang}`

  let data: ReverseGeocodeResult
  try {
    const res = await fetch(url)
    if (!res.ok) return empty
    data = (await res.json()) as ReverseGeocodeResult
  } catch {
    return empty
  }

  const country = data.countryName ?? ''
  const fallbackName = data.city || data.locality || data.principalSubdivision || ''

  // Neither BigDataCloud field is reliably "the place you are in": `city` is
  // the municipality (Seixal when you are in Corroios) and `locality` is a
  // sub-city district (City of Westminster for London, Saint-Merri for Paris).
  // Resolving both against Open-Meteo and taking the nearest *populated* place
  // picks correctly in every case tested, and has the added benefit that a
  // GPS-detected place is named identically to one the user searched for,
  // since both then come from the same database.
  const candidates = [...new Set([data.locality, data.city].filter(Boolean))] as string[]
  let best: { city: City; km: number } | null = null

  for (const candidate of candidates) {
    const results = await searchCities(candidate).catch(() => [] as City[])
    for (const place of results) {
      const km = distanceKm(latitude, longitude, place.latitude, place.longitude)
      if (km > NEAREST_PLACE_MAX_KM) continue
      // Population 0 marks parishes and quarters, which can sit fractionally
      // nearer than the city containing them — Saint-Merri beats Paris by
      // 100m otherwise.
      if (!place.population) continue
      if (!best || km < best.km) best = { city: place, km }
    }
  }

  if (best) {
    return {
      name: best.city.name,
      admin1: best.city.admin1,
      country: best.city.country || country,
      id: best.city.id,
    }
  }

  // Nothing populated nearby (mid-ocean, desert, or the geocoder is down):
  // keep BigDataCloud's answer rather than showing an unnamed entry.
  return {
    name: fallbackName,
    admin1: data.principalSubdivision && data.principalSubdivision !== fallbackName
      ? data.principalSubdivision
      : '',
    country,
  }
}

// One-shot fix. Deliberately uses getAppLocation rather than
// startAppLocationUpdates: continuous tracking would keep the GPS radio warm
// and drain the phone battery, and the app only needs a position per launch.
//
// Concurrent callers share one in-flight request — initApp and the first
// foreground-enter can otherwise fire together and request two fixes.
// Resolves true when anything the user would see has changed, so callers can
// skip a pointless weather refetch and repaint when the fix comes back to the
// same place under the same name.
//
// The comparison deliberately includes the resolved name, not just the
// coordinates. The glasses header renders the name captured at fetch time, so
// a name that changes while the position does not — a stored fix resolved by
// older logic, a first successful geocode after failures, a locale switch —
// still has to trigger a repaint or the glasses keep showing the stale name
// while the phone list shows the new one.
function locationSignature(): string {
  if (!cachedLocation) return ''
  return `${cachedLocation.latitude.toFixed(4)},${cachedLocation.longitude.toFixed(4)}|${cachedLocation.name}`
}

export function refreshCurrentLocation(): Promise<boolean> {
  if (locatingInFlight) return locatingInFlight
  locatingInFlight = (async () => {
    const b = getBridge()
    if (!b) return false
    const before = locationSignature()
    try {
      // Medium accuracy is plenty for weather — it resolves to the right
      // locality without demanding a high-precision GPS lock, which is slower
      // and costs more battery.
      const fix = await b.getAppLocation({ accuracy: AppLocationAccuracy.Medium, timeoutMs: 10_000 })
      if (!fix) {
        // Denied, timed out, or no signal. Keep whatever we last knew.
        locationIsStale = true
        appendEventLog(`Location: no fix${cachedLocation ? ' (using last known)' : ''}`)
        return false
      }
      const place = await reverseGeocode(fix.latitude, fix.longitude)
      cachedLocation = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        // Keep the previous name if reverse geocoding failed but we have moved
        // only slightly; an unnamed entry is worse than a marginally stale one.
        name: place.name || cachedLocation?.name || '',
        admin1: place.admin1 || (place.name ? '' : cachedLocation?.admin1 ?? ''),
        country: place.country || (place.name ? '' : cachedLocation?.country ?? ''),
        updatedAt: Date.now(),
        id: place.id,
      }
      locationIsStale = false
      await persistCurrentLocation()
      const after = locationSignature()
      const changed = after !== before
      appendEventLog(
        `Location: ${cachedLocation.name || 'unnamed'} ${fix.latitude.toFixed(3)},${fix.longitude.toFixed(3)}`
        + (changed ? '' : ' (unchanged)'),
      )
      return changed
    } catch (err) {
      locationIsStale = true
      appendEventLog(`Location: failed (${err instanceof Error ? err.message : String(err)})`)
      return false
    } finally {
      for (const cb of citiesListeners) cb()
    }
  })()

  const pending = locatingInFlight
  // Clear the shared slot once settled, guarding against a newer request
  // having already replaced it.
  void pending.finally(() => {
    if (locatingInFlight === pending) locatingInFlight = null
  })
  return pending
}

async function persistCurrentLocation(): Promise<void> {
  const b = getBridge()
  if (!b || !cachedLocation) return
  await b.setLocalStorage(CURRENT_LOC_KEY, JSON.stringify(cachedLocation))
}

export async function searchCities(query: string): Promise<City[]> {
  if (query.length < 2) return []

  const lang = getLocale()
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=${lang}`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = (await res.json()) as { results?: GeocodeResult[] }
  return (data.results ?? []).map(geocodeResultToCity)
}

// Look up a city by its Open-Meteo geoname ID. Used by the locale-switch
// flow to fetch the same place's name in the new language without trusting
// fuzzy name search to round-trip across scripts.
async function fetchCityById(id: number, lang: Locale): Promise<City | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/get?id=${id}&language=${lang}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as GeocodeResult
  if (!data || typeof data.latitude !== 'number') return null
  return geocodeResultToCity(data)
}

// Locale management. Persists to localStorage, fires listeners, and refetches
// saved cities so their names switch to the new language.
export function getActiveLocale(): Locale {
  return getLocale()
}

export function onLocaleChanged(cb: () => void): void {
  localeListeners.push(cb)
}

export async function setActiveLocale(locale: Locale): Promise<void> {
  const changed = setLocaleSync(locale)
  if (!changed) return
  const b = getBridge()
  if (b) await b.setLocalStorage(LOCALE_KEY, locale)
  await relocalizeSavedCities()
  await relocalizeCurrentLocation()
  for (const cb of localeListeners) cb()
  // City list also visually depends on locale (names changed).
  for (const cb of citiesListeners) cb()
}

// The GPS entry's name comes from the reverse geocoder, so a locale switch has
// to re-resolve it too or it keeps the previous language. Re-uses the stored
// coordinates rather than requesting a new fix.
async function relocalizeCurrentLocation(): Promise<void> {
  if (!cachedLocation) return

  // Prefer the by-id path when the fix resolved to an Open-Meteo place: it
  // round-trips across scripts reliably and avoids re-running the whole
  // nearest-place search just to change language.
  if (typeof cachedLocation.id === 'number') {
    const resolved = await fetchCityById(cachedLocation.id, getLocale()).catch(() => null)
    if (resolved) {
      cachedLocation = {
        ...cachedLocation,
        name: resolved.name,
        admin1: resolved.admin1,
        country: resolved.country,
      }
      await persistCurrentLocation()
      return
    }
  }

  const place = await reverseGeocode(cachedLocation.latitude, cachedLocation.longitude)
  if (!place.name) return
  cachedLocation = { ...cachedLocation, name: place.name, admin1: place.admin1, country: place.country, id: place.id }
  await persistCurrentLocation()
}

// Re-resolve each saved city through the geocoder so its name/admin1/country
// switch to the active locale. Prefers Open-Meteo's get-by-id endpoint which
// reliably round-trips across scripts; falls back to name search + coord
// match for legacy cities saved before id was tracked. Keeps the previous
// City record on any failure so the list never loses entries.
async function relocalizeSavedCities(): Promise<void> {
  if (cachedCities.length === 0) return
  const lang = getLocale()
  const next: City[] = []
  for (const city of cachedCities) {
    let resolved: City | null = null
    if (typeof city.id === 'number') {
      resolved = await fetchCityById(city.id, lang).catch(() => null)
    }
    if (!resolved) {
      const results = await searchCities(city.name).catch(() => [])
      resolved = results.find(r => cityKey(r) === cityKey(city)) ?? null
    }
    // Preserve the existing id when the fallback path resolves without one
    // (search hit by name) — otherwise a future locale switch would lose
    // the get-by-id fast path again.
    if (resolved && resolved.id === undefined && city.id !== undefined) {
      resolved.id = city.id
    }
    next.push(resolved ?? city)
  }
  cachedCities = next
  await persistCities()
}

export function wmoDescription(code: number): string {
  if (code === 0) return t('wmo_long.clear')
  if (code === 1) return t('wmo_long.mainly_clear')
  if (code === 2) return t('wmo_long.partly_cloudy')
  if (code === 3) return t('wmo_long.overcast')
  if (code === 45 || code === 48) return t('wmo_long.foggy')
  if (code >= 51 && code <= 57) return t('wmo_long.drizzle')
  if (code >= 61 && code <= 67) return t('wmo_long.rain')
  if (code >= 71 && code <= 77) return t('wmo_long.snow')
  if (code >= 80 && code <= 82) return t('wmo_long.rain_showers')
  if (code >= 85 && code <= 86) return t('wmo_long.snow_showers')
  if (code >= 95) return t('wmo_long.thunderstorm')
  return t('wmo_long.unknown')
}

// Headline-friendly summary that appends cloud-cover percentage to the
// cloud-related WMO codes (1=mainly clear, 2=partly cloudy, 3=overcast)
// where the number adds real signal. Clear (0) and precipitation codes
// stay description-only — appending "0% cloud" to "clear sky" is noise.
export function wmoSummary(code: number, cloudCover: number): string {
  const desc = wmoDescription(code)
  if (code >= 1 && code <= 3) return `${desc} ${cloudCover}%`
  return desc
}

// Always returns 24h "HH:MM"; display-time formatting lives in
// render-shared.ts (displayTime/displayTimeCompact) so internal helpers
// like timeToMinutes can keep parsing a stable canonical shape.
function formatTime(isoString: string): string {
  const d = new Date(isoString)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
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
    is_day?: number
    cloud_cover?: number
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
    surface_pressure?: number[]
    is_day?: number[]
    cloud_cover?: number[]
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
    daylight_duration?: number[]
  }
}

export async function fetchWeather(city: City, prefs: UnitPrefs = DEFAULT_UNIT_PREFS): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,is_day,cloud_cover',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,dew_point_2m,uv_index,surface_pressure,is_day,cloud_cover',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunshine_duration,sunrise,sunset,daylight_duration',
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
        pressure: Math.round(hourly.surface_pressure?.[idx] ?? 0),
        isDay: (hourly.is_day?.[idx] ?? 1) === 1,
        cloudCover: Math.round(hourly.cloud_cover?.[idx] ?? 0),
      }
    })

  const dailyPoints: DailyPoint[] = (daily.time ?? []).map((dateStr, i) => ({
    day: tArr('days_short')[new Date(dateStr + 'T00:00:00').getDay()],
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

  // Open-Meteo gives daylight length directly; deriving it from the two clock
  // strings breaks north of the Arctic circle. Two shapes to handle:
  //   cross-midnight — sunrise 02:20, sunset 00:08 on the FOLLOWING date, so
  //     `sunset - sunrise` is negative (this printed "-3h -12m")
  //   polar day      — sunrise and sunset both 00:00 a day apart, so the same
  //     subtraction yields 0 despite 24h of daylight
  // Verified encodings: Longyearbyen in June reports 00:00 -> 00:00 with
  // 86400s, McMurdo reports 00:00 -> 00:00 with 0s. So the two extremes are
  // distinguishable only by the duration, not by the timestamps.
  const daylightSeconds = daily.daylight_duration?.[0]
  const hasDaylight = typeof daylightSeconds === 'number'
  const daylightMinutes = hasDaylight ? Math.round(daylightSeconds / 60) : 0
  // Gated on the field being present: absent would otherwise read as 0 and
  // report polar night everywhere.
  const polarDay = hasDaylight && daylightMinutes >= 24 * 60 - 1
  const polarNight = hasDaylight && daylightMinutes <= 0

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
    currentIsDay: (current.is_day ?? 1) === 1,
    currentCloudCover: Math.round(current.cloud_cover ?? 0),
    feelsLike: Math.round(current.apparent_temperature ?? 0),
    windSpeed: Math.round(current.wind_speed_10m ?? 0),
    windGust: Math.round(current.wind_gusts_10m ?? 0),
    windDirection: Math.round(current.wind_direction_10m ?? 0),
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    pressure: Math.round(current.surface_pressure ?? 0),
    sunrise: sunriseToday ? formatTime(sunriseToday) : '',
    sunset: sunsetToday ? formatTime(sunsetToday) : '',
    daylightMinutes,
    polarDay,
    polarNight,
    hourly: hourlyPoints,
    daily: dailyPoints,
    airQuality,
  })
}

type OpenMeteoAirQuality = {
  current?: {
    european_aqi?: number
    us_aqi?: number
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
      'european_aqi', 'us_aqi', 'pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone',
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
    usAqi: Math.round(c.us_aqi ?? 0),
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
  if (value < max * 0.1) return t('pollen_category.low')
  if (value < max * 0.3) return t('pollen_category.moderate')
  if (value < max) return t('pollen_category.high')
  return t('pollen_category.very_high')
}

export function pollenSpeciesLabel(species: keyof Pollen): string {
  return t(`pollen_species.${species}`)
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
  if (rh < 30) return t('humidity_comfort.dry')
  if (rh < 60) return t('humidity_comfort.comfortable')
  if (rh < 70) return t('humidity_comfort.sticky')
  if (rh < 85) return t('humidity_comfort.muggy')
  return t('humidity_comfort.oppressive')
}

// WHO UV category bands.
export function uvCategory(uv: number): string {
  if (uv < 3) return t('uv_category.low')
  if (uv < 6) return t('uv_category.moderate')
  if (uv < 8) return t('uv_category.high')
  if (uv < 11) return t('uv_category.very_high')
  return t('uv_category.extreme')
}

// Short form for tight columns — keep ≤4 chars so the value+category fits in
// the chart's values column.
export function uvCategoryShort(uv: number): string {
  if (uv < 3) return t('uv_category_short.low')
  if (uv < 6) return t('uv_category_short.moderate')
  if (uv < 8) return t('uv_category_short.high')
  if (uv < 11) return t('uv_category_short.very_high')
  return t('uv_category_short.extreme')
}

// Air-quality category — switches between EU (0–100+ scale) and US EPA
// (0–500 scale) bands based on the user's chosen AQI scale.
export function aqiCategory(aqi: number): string {
  if (cachedUnitPrefs.aqi === 'us') {
    if (aqi <= 50) return t('us_aqi_category.good')
    if (aqi <= 100) return t('us_aqi_category.moderate')
    if (aqi <= 150) return t('us_aqi_category.unhealthy_sensitive')
    if (aqi <= 200) return t('us_aqi_category.unhealthy')
    if (aqi <= 300) return t('us_aqi_category.very_unhealthy')
    return t('us_aqi_category.hazardous')
  }
  if (aqi < 20) return t('aqi_category.good')
  if (aqi < 40) return t('aqi_category.fair')
  if (aqi < 60) return t('aqi_category.moderate')
  if (aqi < 80) return t('aqi_category.poor')
  if (aqi < 100) return t('aqi_category.very_poor')
  return t('aqi_category.extremely_poor')
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
  // 71=snow, 95=thunderstorm, etc.).
  const wmo = num('wmo')
  if (wmo !== undefined) {
    w.currentWmoCode = Math.round(wmo)
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
      euAqi: 0, usAqi: 0, pm2_5: 0, pm10: 0, nitrogenDioxide: 0, ozone: 0, sulphurDioxide: 0, carbonMonoxide: 0,
      pollen: emptyPollen,
    }
    w.airQuality = {
      euAqi: aqi !== undefined ? Math.round(aqi) : base.euAqi,
      usAqi: aqi !== undefined ? Math.round(aqi) : base.usAqi,
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
