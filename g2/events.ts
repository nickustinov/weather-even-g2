import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { appendEventLog, debugLog } from '../_shared/log'
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

// Set the moment shutDownPageContainer(1) is requested, cleared when the user
// answers. While it is set, the foreground events mean something different —
// see the dispatch comment.
let exitDialogPending = false

// The firmware emits duplicate sys events for one physical transition, ~50-100ms
// apart. Deduping them matters most around the exit dialogue, where acting on
// the second copy would rebuild the page twice or re-arm the wrong branch.
const SYS_DEDUP_MS = 600
let lastSysType: number | null = null
let lastSysAt = 0

function isDuplicateSysEvent(sysType: number): boolean {
  const now = Date.now()
  const duplicate = sysType === lastSysType && now - lastSysAt < SYS_DEDUP_MS
  lastSysType = sysType
  lastSysAt = now
  return duplicate
}

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

    // Lifecycle events only — clicks and double-clicks also arrive as sysEvent
    // and are legitimately repeatable.
    const isLifecycle = sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT
      || sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT
      || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
      || sysType === OsEventTypeList.SYSTEM_EXIT_EVENT
    if (isLifecycle && isDuplicateSysEvent(sysType)) {
      debugLog(`Lifecycle: duplicate sys event ${sysType} ignored`)
      return
    }

    // The exit dialogue inverts the meaning of the foreground events, so they
    // have to be interpreted differently while one is up. After
    // shutDownPageContainer(1) the host fires:
    //   FOREGROUND_ENTER when the dialogue APPEARS, at which point it has
    //     already cleared the page host-side — this is the cue to rebuild.
    //   FOREGROUND_EXIT  when the user answers "No" — cancelled, keep running.
    //   SYSTEM_EXIT      when the user answers "Yes" — really exiting.
    // Treating that FOREGROUND_EXIT as a background is what left the periodic
    // refresh stopped after cancelling.
    if (exitDialogPending) {
      if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        // Do NOT rebuild here. Rebuilding while the dialogue is up recreates
        // the image containers as empty placeholders, and the sends that would
        // refill them fail behind the modal — so the images are wiped rather
        // than restored. Wait until the user is actually looking at the app.
        appendEventLog('Lifecycle: exit dialogue shown')
        return
      }
      if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        // "No" — the app is visible again. This, not the dialogue appearing,
        // is the moment to put the page back.
        //
        // Repaint with a rebuild. Recreating the page via
        // createStartUpPageContainer was tried as a way to reset the wedged
        // image channel and is not available: the host rejects the second call
        // with `invalid` after blocking for ~2s, during which the busy guard
        // discards every input event.
        appendEventLog('Lifecycle: exit dialogue cancelled, repainting')
        exitDialogPending = false
        return showScreen()
      }
    }

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
      exitDialogPending = false
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
      debugLog(`Click: cities=${getCities().length} → open picker`)
      return showCityPickerScreen()
    }
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      // Even Hub submission requirement: double-tap on the root screen
      // invokes the system exit dialog. Don't tear down yet — the user
      // can still cancel; teardown happens in the ABNORMAL/SYSTEM exit
      // handlers above if they confirm.
      // Armed synchronously: the host's FOREGROUND_ENTER for the dialogue
      // arrives ~100ms later and must be read as "page cleared", not "resumed".
      exitDialogPending = true
      void getBridge()?.shutDownPageContainer(1)
      return
    }
  }
}

export function onEvenHubEvent(event: EvenHubEvent): void {
  // Event kind is included because a dropped-input problem is indistinguishable
  // from a dispatch bug without it.
  const kind = event.textEvent ? `text:${event.textEvent.eventType ?? 0}`
    : event.listEvent ? `list:${event.listEvent.eventType ?? 0}`
    : event.sysEvent ? `sys:${event.sysEvent.eventType ?? 0}`
    : 'other'
  if (processing) {
    debugLog(`Event ${kind} DROPPED (busy) screen=${state.screen}`)
    return
  }
  debugLog(`Event ${kind} screen=${state.screen} modal=${state.modal ?? '-'}`)

  const result = dispatch(event)
  if (result instanceof Promise) {
    processing = true
    void result.finally(() => { processing = false })
  }
}
