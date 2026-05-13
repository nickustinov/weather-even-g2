import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { getBridge, state } from './state'
import { showScreen, nextScreen, prevScreen } from './renderer'
import { onForegroundEnter, onAppExit } from './app'

// Scroll cooldown to prevent duplicate actions from rapid swipes
const SCROLL_COOLDOWN_MS = 300
let lastScrollTime = 0

function scrollThrottled(): boolean {
  const now = Date.now()
  if (now - lastScrollTime < SCROLL_COOLDOWN_MS) return true
  lastScrollTime = now
  return false
}

// ---------------------------------------------------------------------------
// Event normalisation
// ---------------------------------------------------------------------------

export function resolveEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  const raw =
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType

  if (typeof raw === 'number') {
    switch (raw) {
      case 0: return OsEventTypeList.CLICK_EVENT
      case 1: return OsEventTypeList.SCROLL_TOP_EVENT
      case 2: return OsEventTypeList.SCROLL_BOTTOM_EVENT
      case 3: return OsEventTypeList.DOUBLE_CLICK_EVENT
      case 4: return OsEventTypeList.FOREGROUND_ENTER_EVENT
      case 5: return OsEventTypeList.FOREGROUND_EXIT_EVENT
      case 6: return OsEventTypeList.ABNORMAL_EXIT_EVENT
      case 7: return OsEventTypeList.SYSTEM_EXIT_EVENT
      default: return undefined
    }
  }

  // Protobuf omits zero values, so eventType=0 (CLICK_EVENT) arrives as undefined.
  // Treat any container event with no eventType as a single click.
  if (event.listEvent || event.textEvent || event.sysEvent) return OsEventTypeList.CLICK_EVENT

  return undefined
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function onEvenHubEvent(event: EvenHubEvent): void {
  const eventType = resolveEventType(event)
  appendEventLog(`Event: type=${String(eventType)} screen=${state.screen}`)

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      // Tap does nothing – scroll to navigate
      break

    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (!scrollThrottled()) {
        prevScreen()
        void showScreen()
      }
      break

    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (!scrollThrottled()) {
        nextScreen()
        void showScreen()
      }
      break

    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      // Weather has no back stack – every screen is "root"-level,
      // reached by horizontal swipe. Double-tap is conventionally the
      // exit gesture, so invoke the host exit dialogue from anywhere.
      // This also satisfies the Even Hub submission requirement.
      void getBridge()?.shutDownPageContainer(1)
      break

    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      void onForegroundEnter()
      break

    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
    case OsEventTypeList.SYSTEM_EXIT_EVENT:
      onAppExit()
      break
  }
}
