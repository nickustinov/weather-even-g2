const MAX_LINES = 200

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

export function initLogPanel(): void {
  const btn = document.getElementById('copy-log') as HTMLButtonElement | null
  const el = document.getElementById('event-log')
  if (!btn || !el) return

  btn.addEventListener('click', async () => {
    const text = el.textContent ?? ''
    const original = btn.textContent
    try {
      await navigator.clipboard.writeText(text)
      btn.textContent = 'Copied'
    } catch {
      // The WebView can refuse clipboard access depending on host settings;
      // fall back to selecting the text so a long-press copy still works.
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      btn.textContent = 'Select + copy'
    }
    window.setTimeout(() => { btn.textContent = original }, 1500)
  })
}
