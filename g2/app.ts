import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { fetchWeather, getSavedCity, getSavedUnit, loadSettings } from './api'
import { state, setBridge } from './state'
import { showScreen, showLoading, showSetupMessage, firstScreen } from './renderer'
import { onEvenHubEvent } from './events'
import { preloadWeatherIcons } from './weather-icons'

export async function refreshWeather(): Promise<void> {
  const city = getSavedCity()
  if (!city) {
    appendEventLog('Weather: no city configured')
    return
  }

  try {
    state.weather = await fetchWeather(city, getSavedUnit())
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
  appendEventLog('Lifecycle: foreground enter')
  startRefreshLoop()
  if (getSavedCity()) {
    await refreshWeather()
  } else {
    await showSetupMessage()
  }
}

export function onAppExit(): void {
  appendEventLog('Lifecycle: app exit – cleaning up')
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
    await showLoading()
    await refreshWeather()
  } else {
    appendEventLog('Weather: no city configured, showing setup message')
    await showSetupMessage()
  }

  startRefreshLoop()
}
