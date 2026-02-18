import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppActions, SetStatus } from '../_shared/app-types'
import { appendEventLog } from '../_shared/log'
import { initApp, refreshWeather } from './app'
import { initUI } from './ui'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Even bridge not detected within ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer))
  })
}

export function createWeatherActions(setStatus: SetStatus): AppActions {
  initUI()
  let connected = false

  return {
    async connect() {
      setStatus('Weather: connecting to Even bridge...')
      appendEventLog('Weather: connect requested')

      try {
        const bridge = await withTimeout(waitForEvenAppBridge(), 6000)
        await initApp(bridge)
        connected = true
        setStatus('Weather: connected. DblTap=daily view.')
        appendEventLog('Weather: connected to bridge')
      } catch (err) {
        console.error('[weather] connect failed', err)
        setStatus('Weather: bridge not found. Running in mock mode.')
        appendEventLog('Weather: connection failed')
      }
    },

    async action() {
      if (!connected) {
        setStatus('Weather: not connected')
        appendEventLog('Weather: action blocked (not connected)')
        return
      }

      await refreshWeather()
      setStatus('Weather: forecast refreshed')
      appendEventLog('Weather: manual refresh via action button')
    },
  }
}
