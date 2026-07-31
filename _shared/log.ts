const MAX_LINES = 200
const DEBUG_KEY = 'weather:debug-log'

// Verbose tracing is off in normal use. On hardware it adds four to six lines
// per screen change (per-image timings, every dispatched event), which buries
// the handful of entries someone actually needs when reporting a bug.
//
// There is deliberately no UI for this — it is a development aid, not a user
// setting. Enable it from the WebView console for a session with:
//   localStorage.setItem('weather:debug-log', '1')
let debugEnabled = false

try {
  debugEnabled = localStorage.getItem(DEBUG_KEY) === '1'
} catch {
  // Storage can be unavailable in a restricted WebView; default to off.
}

// Newest entries go at the bottom, so the log reads top-to-bottom in the order
// things actually happened — which matters when tracing a render sequence.
export function appendEventLog(text: string): void {
  const el = document.getElementById('event-log')
  if (!el) return

  const time = new Date().toLocaleTimeString()
  const lines = el.textContent ? el.textContent.split('\n') : []
  lines.push(`[${time}] ${text}`)

  // Oldest lines fall off the top now that the newest are at the bottom.
  el.textContent = lines.slice(-MAX_LINES).join('\n')

  // Follow the tail only when the view is already near the bottom, so
  // scrolling back to read an earlier entry isn't yanked away by new output.
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceFromBottom < 40) el.scrollTop = el.scrollHeight
}

/** Per-render and per-event tracing. Suppressed unless debug logging is on. */
export function debugLog(text: string): void {
  if (debugEnabled) appendEventLog(text)
}

async function copyToClipboard(text: string): Promise<boolean> {
  // navigator.clipboard requires a secure context. The app is served over
  // plain http from the dev server and the Even host, so it is usually
  // unavailable — hence the legacy execCommand path, which still works in the
  // WebView and is the only route that actually copies there.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission refused; fall through to the textarea path.
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // Kept on-screen but invisible: display:none or visibility:hidden would
    // make the selection — and therefore the copy — a no-op.
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function initLogPanel(): void {
  const el = document.getElementById('event-log')
  const copyBtn = document.getElementById('copy-log') as HTMLButtonElement | null
  if (!copyBtn || !el) return

  copyBtn.addEventListener('click', async () => {
    const label = copyBtn.textContent
    const ok = await copyToClipboard(el.textContent ?? '')
    copyBtn.textContent = ok ? 'Copied' : 'Copy failed'
    window.setTimeout(() => { copyBtn.textContent = label }, 1500)
  })
}
