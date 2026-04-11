import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { fetchWeather, getSavedCity, getSavedUnit, loadSettings } from './api'
import { state, setBridge } from './state'
import { showScreen, showLoading, firstScreen } from './renderer'
import { onEvenHubEvent } from './events'

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

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  setBridge(appBridge)

  appBridge.onEvenHubEvent((event) => {
    onEvenHubEvent(event)
  })

  await loadSettings(appBridge)

  if (getSavedCity()) {
    appendEventLog('Weather: city found, auto-connecting')
    await showLoading()
    await refreshWeather()
  }

  if (!refreshInterval) {
    refreshInterval = setInterval(() => {
      void refreshWeather()
    }, 15 * 60_000)
  }
}
