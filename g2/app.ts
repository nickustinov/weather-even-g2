import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { fetchWeather, getSavedCity } from './api'
import { state, setBridge } from './state'
import { showScreen, showLoading, firstScreen } from './renderer'
import { onEvenHubEvent, setRefreshWeather } from './events'

export async function refreshWeather(): Promise<void> {
  const city = getSavedCity()
  if (!city) {
    appendEventLog('Weather: no city configured')
    return
  }

  try {
    state.weather = await fetchWeather(city)
    appendEventLog(`Weather: refreshed for ${city.name}`)
  } catch (err) {
    console.error('[weather] refreshWeather failed', err)
    appendEventLog(`Weather: refresh failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  firstScreen()
  await showScreen()
}

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  setBridge(appBridge)
  setRefreshWeather(refreshWeather)

  appBridge.onEvenHubEvent((event) => {
    onEvenHubEvent(event)
  })

  await showLoading()
  await refreshWeather()

  setInterval(() => {
    void refreshWeather()
  }, 15 * 60_000)
}
