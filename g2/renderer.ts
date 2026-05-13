// Screen dispatcher and navigation.
//
// All actual rendering lives in the per-screen modules under ./screens/ and
// shared primitives are in ./render-shared. This file only owns the
// state.screen → showXxxScreen() dispatch and the screen index nav helpers.

import { state, SCREENS } from './state'
import { showTodayScreen } from './screens/today'
import { showForecastScreen } from './screens/forecast'
import { showRainScreen } from './screens/rain'
import { showWindScreen } from './screens/wind'
import { showHoursScreen } from './screens/hours'
import { showSunScreen } from './screens/sun'
import { showAirScreen } from './screens/air'
import { showLoading, showSetupMessage } from './screens/idle'

export { showLoading, showSetupMessage }

export async function showScreen(): Promise<void> {
  if (!state.weather) {
    await showLoading()
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
    case 'sun':
      await showSunScreen(state.weather)
      break
    case 'air':
      await showAirScreen(state.weather)
      break
  }
}

export function nextScreen(): void {
  state.screenIndex = (state.screenIndex + 1) % SCREENS.length
  state.screen = SCREENS[state.screenIndex]
}

export function prevScreen(): void {
  state.screenIndex = (state.screenIndex - 1 + SCREENS.length) % SCREENS.length
  state.screen = SCREENS[state.screenIndex]
}

export function firstScreen(): void {
  state.screenIndex = 0
  state.screen = SCREENS[0]
}
