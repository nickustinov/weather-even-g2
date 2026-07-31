// Shared rendering primitives used by every screen.
//
// Split out of renderer.ts so each screen module can pull only what it needs
// and the dispatcher (renderer.ts) stays a thin shell.

import {
  CreateStartUpPageContainer,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
  RebuildPageContainer,
  StartUpPageCreateResult,
  type ImageContainerProperty,
  type ListContainerProperty,
  type TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog, debugLog } from '../_shared/log'
import { getPrecipUnit, getPressureUnit, getTimeUnit, getWindUnit } from './api'
import { t, tArr } from './i18n'
import { canvasToBytes } from './icons'
import { state, getBridge } from './state'
import { drawWeatherIcon } from './weather-icons'
import { autoSizeDotted, drawDotted, measureDotted, type DotTextOpts } from './dot-digits'

// ---------------------------------------------------------------------------
// Page rebuild
// ---------------------------------------------------------------------------

export async function rebuildPage(config: {
  containerTotalNum: number
  textObject?: TextContainerProperty[]
  imageObject?: ImageContainerProperty[]
  listObject?: ListContainerProperty[]
}): Promise<void> {
  const b = getBridge()
  if (!b) return

  // Refresh the active-container set so any sendImage call still in flight
  // from a previous show*Screen() won't try to paint into a container that
  // no longer exists (= simulator warning "container X not found").
  const next = new Set<number>()
  for (const t of config.textObject ?? []) if (t.containerID !== undefined) next.add(t.containerID)
  for (const i of config.imageObject ?? []) if (i.containerID !== undefined) next.add(i.containerID)
  for (const l of config.listObject ?? []) if (l.containerID !== undefined) next.add(l.containerID)
  state.activeContainerIds = next

  const dims = new Map<number, { w: number; h: number }>()
  for (const i of config.imageObject ?? []) {
    if (i.containerID === undefined) continue
    dims.set(i.containerID, { w: i.width ?? 0, h: i.height ?? 0 })
  }
  state.imageContainerDims = dims

  // Both host calls report whether the page was actually built, and both
  // results used to be discarded. A rejected page leaves no containers, so
  // every following sendImage fails with nothing to explain why — which is
  // exactly the shape of "images die after the system exit dialog".
  const started = performance.now()

  if (!state.startupRendered) {
    // Latched regardless of the result: createStartUpPageContainer is one-shot
    // per session, and a second call is rejected with `invalid` after blocking
    // for ~2s — during which the event dispatcher's busy guard discards every
    // input. Retrying a failed startup therefore produces a permanent stall,
    // so the flag records "the one call has been spent", not "it worked".
    const result = await b.createStartUpPageContainer(new CreateStartUpPageContainer(config))
    state.startupRendered = true
    // Startup happens once per session and a failure explains everything that
    // follows, so this one is always logged.
    appendEventLog(`Page startup -> ${String(result)} in ${Math.round(performance.now() - started)}ms`)
    if (result !== StartUpPageCreateResult.success) {
      // Nothing was created; fall through to rebuilds, which is the only
      // remaining route and sometimes recovers.
      state.activeContainerIds = new Set()
    }
    return
  }

  const ok = await b.rebuildPageContainer(new RebuildPageContainer(config))
  const line = `Page rebuild -> ${ok ? 'ok' : 'REJECTED'} in ${Math.round(performance.now() - started)}ms`
  if (ok) debugLog(line)
  else appendEventLog(line)
  if (!ok) {
    // Skip the image sends rather than firing them at containers that were
    // never built; they would fail one by one and bury the real cause.
    state.activeContainerIds = new Set()
  }
}

export async function sendImage(bytes: number[], containerID: number, containerName: string): Promise<void> {
  const b = getBridge()
  if (!b) return
  if (!state.activeContainerIds.has(containerID)) {
    // Page rebuilt between this send being queued and dispatched. Skipping
    // would otherwise produce a "container N not found" warning on the
    // simulator with no visual effect on the glasses.
    return
  }
  // Transfer time tracks the 4-bit greyscale buffer the host expands our PNG
  // into and pushes over BLE (w*h/2 bytes), not the PNG size — so log both.
  // If LZ4 is active on that leg, ms should fall well below what the gray4
  // figure would otherwise cost.
  const d = state.imageContainerDims.get(containerID)
  const gray4 = d ? Math.ceil((d.w * d.h) / 2) : 0
  const started = performance.now()
  const result = await b.updateImageRawData(
    new ImageRawDataUpdate({ containerID, containerName, imageData: bytes }),
  )
  const ms = Math.round(performance.now() - started)
  const line = `Image ${containerName}#${containerID} ${d ? `${d.w}x${d.h}` : '?'}`
    + ` ${bytes.length}B png / ${gray4}B gray4 -> ${String(result)} in ${ms}ms`
  // Successes are one to four lines per screen change — noise in a bug report.
  // Failures always surface, since a missing image is exactly what a user
  // would be reporting.
  if (ImageRawDataUpdateResult.isSuccess(result)) debugLog(line)
  else appendEventLog(line)
}

// Note: replacing the full page rebuild with in-place textContainerUpgrade
// calls on the six same-layout chart screens was measured and rejected.
// textContainerUpgrade costs ~83ms per call against ~165ms for a whole page
// rebuild, so break-even is 2 containers and a chart screen needs 5-6. The
// host's per-call overhead, not the payload, is the floor here.

// ---------------------------------------------------------------------------
// Image rendering helpers
// ---------------------------------------------------------------------------

export async function renderWeatherIconBytes(wmoCode: number, size: number, isDay = true): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  await drawWeatherIcon(ctx, wmoCode, size / 2, size / 2, size, isDay)
  return canvasToBytes(canvas)
}

// `fixedOpts` lets callers force the dotSize so the headline stays the same
// visual size regardless of value. Today omits it (auto-sizes per value);
// rain/wind pass CHART_HEADLINE_OPTS so swiping between them doesn't change
// the dotted-number height.
export function renderDottedNumberBytes(text: string, w: number, h: number, fixedOpts?: DotTextOpts): number[] {
  const opts = fixedOpts ?? autoSizeDotted(text, w - 12, h - 8, 10, 5)
  const m = measureDotted(text, opts)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#999'
  // Left-aligned so the headline lines up visually with subtitles below.
  const x = 4
  const y = Math.floor((h - m.height) / 2)
  drawDotted(ctx, text, x, y, opts)
  return canvasToBytes(canvas)
}

// ---------------------------------------------------------------------------
// Text formatting helpers
// ---------------------------------------------------------------------------

export function wmoShort(code: number): string {
  if (code === 0) return t('wmo_short.clear')
  if (code === 1) return t('wmo_short.mostly_clear')
  if (code === 2) return t('wmo_short.partly_cloudy')
  if (code === 3) return t('wmo_short.overcast')
  if (code === 45 || code === 48) return t('wmo_short.foggy')
  if (code >= 51 && code <= 57) return t('wmo_short.drizzle')
  if (code >= 61 && code <= 67) return t('wmo_short.rain')
  if (code >= 71 && code <= 77) return t('wmo_short.snow')
  if (code >= 80 && code <= 82) return t('wmo_short.showers')
  if (code >= 85 && code <= 86) return t('wmo_short.snow_showers')
  if (code === 95) return t('wmo_short.thunderstorm')
  if (code >= 96) return t('wmo_short.hail_storm')
  return ''
}

export function windLabel(deg: number): string {
  return tArr('wind_dir')[Math.round(deg / 45) % 8]
}

export function speedUnit(): string {
  return t(`unit_value.${getWindUnit()}`)
}

export function precipUnit(): string {
  return t(`unit_value.${getPrecipUnit()}`)
}

// Open-Meteo returns surface pressure in hPa; convert to the user's chosen
// unit for display. Inches of mercury = hPa × 0.02953; millimetres of
// mercury = hPa × 0.75006.
export function formatPressure(hPa: number): string {
  const u = getPressureUnit()
  const label = t(`unit_value.${u}`)
  if (u === 'inHg') return `${(hPa * 0.02953).toFixed(2)} ${label}`
  if (u === 'mmHg') return `${Math.round(hPa * 0.75006)} ${label}`
  return `${hPa} ${label}`
}

// Just the numeric portion in the user's chosen unit — used where the
// pressure screen prints the value alone (column cells, big dotted number)
// and the unit appears separately as a label. inHg is rounded to 1 decimal
// so the 4-char "29.9" fits the big-dotted column at dotSize=2 (a 5-char
// "29.85" would overflow CHART_TOTAL_W=216).
export function formatPressureValue(hPa: number): string {
  const u = getPressureUnit()
  if (u === 'inHg') return (hPa * 0.02953).toFixed(1)
  if (u === 'mmHg') return String(Math.round(hPa * 0.75006))
  return String(hPa)
}

export function pressureUnitLabel(): string {
  return t(`unit_value.${getPressureUnit()}`)
}

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

export function todayDateString(d: Date = new Date()): string {
  return `${tArr('days_short')[d.getDay()]} ${d.getDate()}`
}

export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':')
  if (parts.length !== 2) return 0
  return Number(parts[0]) * 60 + Number(parts[1])
}

// Convert canonical 24h "HH:MM" to user-facing 12h "6:00 am" form. Lowercase
// am/pm with a space matches the rest of the app's lowercase aesthetic.
function to12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  if (!Number.isFinite(h)) return hhmm
  const suffix = h >= 12 ? t('pm') : t('am')
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mStr} ${suffix}`
}

function to12hCompact(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  if (!Number.isFinite(h)) return hhmm
  const suffix = h >= 12 ? t('pm') : t('am')
  const h12 = h % 12 === 0 ? 12 : h % 12
  // No space — "12 pm" overflows the 52px inner times column, "12pm" fits.
  // Open-Meteo hourly readings are always on the hour, so we drop ":00".
  if (mStr === '00') return `${h12}${suffix}`
  return `${h12}:${mStr}${suffix}`
}

// Display a stored 24h "HH:MM" in the user's chosen format. Use compact=true
// for narrow columns (hourly grids, chart tick labels) where "6:00 PM"
// would wrap.
export function displayTime(hhmm: string, compact = false): string {
  if (getTimeUnit() === '24h') return hhmm
  return compact ? to12hCompact(hhmm) : to12h(hhmm)
}

export function formatHm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return t('glasses.minutes', { m })
  return t('glasses.hours_minutes', { h, m })
}

export function dayProgress(sunrise: string, sunset: string): number {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const sunMin = timeToMinutes(sunrise)
  const setMin = timeToMinutes(sunset)
  if (setMin <= sunMin) return 0
  if (nowMin <= sunMin) return 0
  if (nowMin >= setMin) return 1
  return (nowMin - sunMin) / (setMin - sunMin)
}

export function daylightRemaining(sunrise: string, sunset: string): string {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const sunMin = timeToMinutes(sunrise)
  const setMin = timeToMinutes(sunset)
  if (nowMin < sunMin) return formatHm(setMin - sunMin)
  if (nowMin >= setMin) return formatHm(0)
  return formatHm(setMin - nowMin)
}

// ---------------------------------------------------------------------------
// Shared chart layout (rain + wind)
//
// Both screens reuse the exact same container geometry — header, three
// hourly columns (times / bars / values), label stack on the right — so
// swiping between them doesn't shift any element.
// ---------------------------------------------------------------------------

export const CHART_PAD = 8
export const CHART_HEADER_H = 38
export const CHART_BODY_Y = CHART_HEADER_H + 4
export const CHART_BODY_H = 288 - CHART_BODY_Y - CHART_PAD
export const CHART_HOURS_VISIBLE = 8
export const CHART_BAR_CHARS = 8

export const CHART_TIMES_X = CHART_PAD
export const CHART_TIMES_W = 60
export const CHART_BARS_X = CHART_TIMES_X + CHART_TIMES_W + 4
export const CHART_BARS_W = 174
export const CHART_VALUES_X = CHART_BARS_X + CHART_BARS_W + 4
export const CHART_VALUES_W = 90
export const CHART_TOTAL_X = CHART_VALUES_X + CHART_VALUES_W + 12
export const CHART_TOTAL_W = 576 - CHART_TOTAL_X - CHART_PAD

// Dotted glyph at dotSize=2, cellGap=1 renders ~62px tall, centered in a
// 68px container (~3px empty above/below). Labels sit with CHART_LABEL_GAP
// of visual breathing room between the rendered digit edge and the rendered
// label text edge — the image container's black fill paints over any
// container-level overlap, so the gap is measured against the digit pixels.
export const CHART_TOTAL_Y = 120
export const CHART_TOTAL_H = 68
const CHART_LABEL_GAP = 16
export const CHART_LABEL_TOP_H = 36
// digit_top = CHART_TOTAL_Y + 3, text_bottom = TOP_Y + 4 + 27 = TOP_Y + 31
// → TOP_Y = (CHART_TOTAL_Y + 3) - CHART_LABEL_GAP - 31
export const CHART_LABEL_TOP_Y = CHART_TOTAL_Y - 28 - CHART_LABEL_GAP
export const CHART_LABEL_BOT_H = 36
// digit_bot = CHART_TOTAL_Y + CHART_TOTAL_H - 3, text_top = BOT_Y + 4
// → BOT_Y = (CHART_TOTAL_Y + CHART_TOTAL_H - 3) + CHART_LABEL_GAP - 4
// -5 brings the bottom subtitle visually closer to the digit; the top label
// already reads correctly so this asymmetry is intentional.
export const CHART_LABEL_BOT_Y = CHART_TOTAL_Y + CHART_TOTAL_H - 7 + CHART_LABEL_GAP - 5

// Pinned mini-dot size so the headline renders at the same visual size on
// rain and wind. With cellGap=1 the macro cells are visually separated.
// Macro cell = 3*2 + 2*1 = 8, glyph = 6*8 + 5*1 = 53, '100' = 3*53 + 2*2 +
// 2*1 (cellGap is intra-glyph, already counted) = 163px in the 204 area.
export const CHART_HEADLINE_OPTS: DotTextOpts = { dotSize: 2, dotGap: 1, cellGap: 1, charGap: 12 }
