import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { getBridge, state } from './state'
import { showScreen, nextScreen, prevScreen, showCityPickerScreen } from './renderer'
import { onForegroundEnter, onForegroundExit, onAppExit, refreshWeather } from './app'
import { cityKey, getCities, setActiveCity } from './api'

// Drop incoming events while a previous async handler is still in flight.
// Without this guard, a single physical tap can register twice — once on
// the page that was active when the tap began, and once on the page that
// was just rebuilt by the first event's handler (e.g. opening the city
// picker via tap, then immediately seeing the picker dismiss because the
// same tap landed on the list's "‹ Back" item).
let processing = false

// Per handle-input docs: protobuf strips zero-value fields, so
// listEvent.currentSelectItemIndex for item 0 arrives as undefined.
function readListIndex(event: EvenHubEvent): number {
  const idx = event.listEvent?.currentSelectItemIndex
  return typeof idx === 'number' && idx >= 0 ? idx : 0
}

async function handleCityPickerSelect(event: EvenHubEvent): Promise<void> {
  const idx = readListIndex(event)
  if (idx === 0) {
    // "‹ Back" — dismiss without changing the active city.
    state.modal = null
    await showScreen()
    return
  }
  const cities = getCities()
  const target = cities[idx - 1]
  if (!target) {
    state.modal = null
    await showScreen()
    return
  }
  await setActiveCity(cityKey(target))
  state.modal = null
  // refreshWeather repaints via firstScreen() + showScreen() at the end.
  await refreshWeather()
}

// Returns a Promise iff the event triggered an async page rebuild; the
// caller uses that to gate the `processing` flag.
function dispatch(event: EvenHubEvent): Promise<void> | void {
  // --- Lifecycle (sysEvent, always handled even if not on the active page).
  if (event.sysEvent) {
    const sysType = event.sysEvent.eventType ?? 0
    if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      appendEventLog('Lifecycle: foreground enter')
      return onForegroundEnter()
    }
    if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      appendEventLog('Lifecycle: foreground exit')
      onForegroundExit()
      return
    }
    if (
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT ||
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT
    ) {
      appendEventLog(`Lifecycle: ${sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT ? 'abnormal' : 'system'} exit`)
      onAppExit()
      return
    }
    // Fall through for double-click (3) and click (0) — they're handled
    // by the screen-state dispatch below.
  }

  // --- City picker modal owns the input while it's up.
  if (state.modal === 'cities') {
    // Single tap on the list container fires listEvent (with idx).
    if (event.listEvent) {
      return handleCityPickerSelect(event)
    }
    // Double-tap on a list container still comes via sysEvent (per docs).
    if (event.sysEvent && (event.sysEvent.eventType ?? 0) === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      state.modal = null
      return showScreen()
    }
    return
  }

  // --- Weather screens (text container with isEventCapture=1).
  // Scrolls only fire as textEvent on text containers, with eventType
  // 1 (scroll up) or 2 (scroll down). No click ever fires as textEvent.
  if (event.textEvent) {
    const type = event.textEvent.eventType ?? 0
    if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
      // Swipe up = previous screen.
      prevScreen()
      return showScreen()
    }
    if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      // Swipe down = next screen.
      nextScreen()
      return showScreen()
    }
    return
  }

  // Clicks on text containers route through sysEvent (per handle-input).
  if (event.sysEvent) {
    const type = event.sysEvent.eventType ?? 0
    if (type === OsEventTypeList.CLICK_EVENT) {
      // Tap always opens the city picker: the list is never empty now that
      // the current-location entry is permanent, so the old "at least one
      // saved city" guard could no longer be false. With a single entry it
      // doubles as a "refresh this city" affordance (tap it to re-fetch).
      appendEventLog(`Click: cities=${getCities().length} → open picker`)
      return showCityPickerScreen()
    }
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      // Even Hub submission requirement: double-tap on the root screen
      // invokes the system exit dialog. Don't tear down yet — the user
      // can still cancel; teardown happens in the ABNORMAL/SYSTEM exit
      // handlers above if they confirm.
      void getBridge()?.shutDownPageContainer(1)
      return
    }
  }
}

export function onEvenHubEvent(event: EvenHubEvent): void {
  if (processing) {
    appendEventLog(`Event dropped (busy) screen=${state.screen} modal=${state.modal ?? '-'}`)
    return
  }
  appendEventLog(`Event screen=${state.screen} modal=${state.modal ?? '-'}`)

  const result = dispatch(event)
  if (result instanceof Promise) {
    processing = true
    void result.finally(() => { processing = false })
  }
}
