import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { fetchWeather, getSavedCity, getUnitPrefs, loadSettings } from './api'
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
}

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  setBridge(appBridge)

  unsubscribeEvents = appBridge.onEvenHubEvent((event) => {
    onEvenHubEvent(event)
  })

  await Promise.all([loadSettings(appBridge), preloadWeatherIcons()])

  if (getSavedCity()) {
    appendEventLog('Weather: city found, loading forecast')
    await refreshWeather()
  } else {
    appendEventLog('Weather: no city configured, showing setup message')
    await showSetupMessage()
  }

  startRefreshLoop()
}
