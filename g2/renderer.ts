// Screen dispatcher and navigation.
//
// All actual rendering lives in the per-screen modules under ./screens/ and
// shared primitives are in ./render-shared. This file only owns the
// state.screen → showXxxScreen() dispatch and the screen index nav helpers.

import { state } from './state'
import type { Screen } from './state'
import { getScreenPrefs } from './api'
import { showTodayScreen } from './screens/today'
import { showForecastScreen } from './screens/forecast'
import { showRainScreen } from './screens/rain'
import { showWindScreen } from './screens/wind'
import { showHoursScreen } from './screens/hours'
import { showHumidityScreen } from './screens/humidity'
import { showUvScreen } from './screens/uv'
import { showSunScreen } from './screens/sun'
import { showAirScreen } from './screens/air'
import { showCityPickerScreen } from './screens/cities'
import { showSetupMessage } from './screens/idle'

export { showSetupMessage, showCityPickerScreen }

export async function showScreen(): Promise<void> {
  if (state.modal === 'cities') {
    await showCityPickerScreen()
    return
  }
  if (!state.weather) {
    // No data yet (initial fetch in flight, or fetch failed). Render
    // nothing — the previously-drawn page (if any) stays on the glasses
    // until weather data arrives.
    return
  }

  switch (state.screen) {
    case 'today':
      await showTodayScreen(state.weather)
      break
    case 'forecast':
      await showForecastScreen(state.weather)
      break
    case 'rain':
      await showRainScreen(state.weather)
      break
    case 'wind':
      await showWindScreen(state.weather)
      break
    case 'hours':
      await showHoursScreen(state.weather)
      break
    case 'humidity':
      await showHumidityScreen(state.weather)
      break
    case 'uv':
      await showUvScreen(state.weather)
      break
    case 'sun':
      await showSunScreen(state.weather)
      break
    case 'air':
      await showAirScreen(state.weather)
      break
  }
}

// Effective screen list = user-ordered, only the enabled ones. Always
// includes at least one entry (we enforce that on save) so navigation never
// hits an empty array.
function effectiveScreens(): Screen[] {
  const enabled = getScreenPrefs().filter(p => p.enabled).map(p => p.id)
  return enabled.length > 0 ? enabled : ['today']
}

function snapScreenIndex(list: Screen[]): number {
  const idx = list.indexOf(state.screen)
  return idx >= 0 ? idx : 0
}

export function nextScreen(): void {
  const list = effectiveScreens()
  const cur = snapScreenIndex(list)
  state.screenIndex = (cur + 1) % list.length
  state.screen = list[state.screenIndex]
}

export function prevScreen(): void {
  const list = effectiveScreens()
  const cur = snapScreenIndex(list)
  state.screenIndex = (cur - 1 + list.length) % list.length
  state.screen = list[state.screenIndex]
}

export function firstScreen(): void {
  const list = effectiveScreens()
  state.screenIndex = 0
  state.screen = list[0]
}
