import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { fetchWeather, getActiveCity, getSavedCity, getUnitPrefs, loadSettings, refreshCurrentLocation } from './api'
import { state, setBridge } from './state'
import { showScreen, showSetupMessage, firstScreen } from './renderer'
import { onEvenHubEvent } from './events'
import { preloadWeatherIcons } from './weather-icons'

export async function refreshWeather(): Promise<void> {
  const city = getSavedCity()
  if (!city) {
    // Redraw the setup message — locale/state may have changed since the
    // last paint, so always repaint rather than returning early.
    appendEventLog('Weather: no city configured, showing setup')
    await showSetupMessage()
    return
  }

  try {
    state.weather = await fetchWeather(city, getUnitPrefs())
    appendEventLog(`Weather: refreshed for ${city.name}`)
  } catch (err) {
    console.error('[weather] refreshWeather failed', err)
    appendEventLog(`Weather: refresh failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  firstScreen()
  await showScreen()
}

let refreshInterval: ReturnType<typeof setInterval> | null = null
let unsubscribeEvents: (() => void) | null = null

// Minimum gap between GPS fixes triggered by foreground-enter. The periodic
// weather refresh deliberately does not relocate — that would be continuous
// tracking by another name.
const LOCATE_THROTTLE_MS = 5 * 60_000
let lastLocateAt = 0

// Guards against a second concurrent initApp (see the comment there).
let initStarted = false

function startRefreshLoop(): void {
  if (refreshInterval) return
  refreshInterval = setInterval(() => {
    void refreshWeather()
  }, 15 * 60_000)
}

function stopRefreshLoop(): void {
  if (!refreshInterval) return
  clearInterval(refreshInterval)
  refreshInterval = null
}

export async function onForegroundEnter(): Promise<void> {
  startRefreshLoop()
  // Returning to the app counts as a launch for location purposes — the user
  // may have moved while it was backgrounded. Throttled so repeatedly flicking
  // in and out does not spin the GPS radio.
  //
  // Deliberately not awaited: getAppLocation can take up to its 10s timeout,
  // and this runs inside the event dispatcher, whose busy guard drops every
  // incoming tap until the handler settles. Awaiting it made the app ignore
  // input for seconds after each foreground enter. Paint with the position we
  // already have, then repaint only if a new fix actually moves us.
  if (Date.now() - lastLocateAt > LOCATE_THROTTLE_MS) {
    lastLocateAt = Date.now()
    void refreshCurrentLocation().then((moved) => {
      if (moved && getActiveCity()?.kind === 'current') void refreshWeather()
    })
  }
  if (getSavedCity()) {
    await refreshWeather()
  } else {
    await showSetupMessage()
  }
}

// FOREGROUND_EXIT (type 5) means the app went to background — the SDK is
// still alive and the user might come back. Per handle-input docs we just
// pause the periodic refresh; full teardown waits for ABNORMAL/SYSTEM
// exit events.
export function onForegroundExit(): void {
  stopRefreshLoop()
}

// Called on ABNORMAL_EXIT (6) or SYSTEM_EXIT (7) — user has confirmed
// exit (or the host force-killed the app). Detach hardware listeners.
export function onAppExit(): void {
  stopRefreshLoop()
  unsubscribeEvents?.()
  unsubscribeEvents = null
  // The page is gone with the app, so the next launch must create it again
  // rather than rebuilding one that no longer exists.
  initStarted = false
  state.startupRendered = false
}

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  // React StrictMode double-invokes the effect that triggers connect in dev,
  // and the click-level guard in src/main.ts does not cover every path in.
  // Without this, two init passes run concurrently and interleave their image
  // sends — which the SDK explicitly forbids, and which showed up as a 263ms
  // outlier on an otherwise ~175ms send. Cleared by onAppExit so a genuine
  // teardown can still re-initialise.
  if (initStarted) {
    appendEventLog('Init: duplicate initApp ignored')
    return
  }
  initStarted = true

  setBridge(appBridge)

  unsubscribeEvents = appBridge.onEvenHubEvent((event) => {
    onEvenHubEvent(event)
  })

  await Promise.all([loadSettings(appBridge), preloadWeatherIcons()])

  // Not awaited: a fix took ~3s on device, and blocking here left the glasses
  // blank for that whole time before the first paint. Render immediately with
  // the last known position and repaint only if the new fix actually moved us
  // — which on a normal relaunch from the same place means no extra work.
  lastLocateAt = Date.now()
  void refreshCurrentLocation().then((moved) => {
    if (moved && getActiveCity()?.kind === 'current') void refreshWeather()
  })

  if (getSavedCity()) {
    appendEventLog('Weather: city found, loading forecast')
    await refreshWeather()
  } else {
    appendEventLog('Weather: no city configured, showing setup message')
    await showSetupMessage()
  }

  startRefreshLoop()
}
