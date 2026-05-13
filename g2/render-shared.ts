// Shared rendering primitives used by every screen.
//
// Split out of renderer.ts so each screen module can pull only what it needs
// and the dispatcher (renderer.ts) stays a thin shell.

import {
  CreateStartUpPageContainer,
  ImageRawDataUpdate,
  RebuildPageContainer,
  type ImageContainerProperty,
  type TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { getSavedUnit } from './api'
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
}): Promise<void> {
  const b = getBridge()
  if (!b) return
  if (!state.startupRendered) {
    await b.createStartUpPageContainer(new CreateStartUpPageContainer(config))
    state.startupRendered = true
    return
  }
  await b.rebuildPageContainer(new RebuildPageContainer(config))
}

export async function sendImage(bytes: number[], containerID: number, containerName: string): Promise<void> {
  const b = getBridge()
  if (!b) return
  const result = await b.updateImageRawData(
    new ImageRawDataUpdate({ containerID, containerName, imageData: bytes }),
  )
  appendEventLog(`Image: ${String(result)}`)
}

// ---------------------------------------------------------------------------
// Image rendering helpers
// ---------------------------------------------------------------------------

export async function renderWeatherIconBytes(wmoCode: number, size: number): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  await drawWeatherIcon(ctx, wmoCode, size / 2, size / 2, size)
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
  if (code === 0) return 'clear'
  if (code === 1) return 'mostly clear'
  if (code === 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'foggy'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 85 && code <= 86) return 'snow showers'
  if (code === 95) return 'thunderstorm'
  if (code >= 96) return 'hail storm'
  return ''
}

export function windLabel(deg: number): string {
  const d = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  return d[Math.round(deg / 45) % 8]
}

export function speedUnit(): string {
  return getSavedUnit() === 'imperial' ? 'mph' : 'km/h'
}

export function precipUnit(): string {
  return getSavedUnit() === 'imperial' ? 'in' : 'mm'
}

export function formatPressure(hPa: number): string {
  if (getSavedUnit() === 'imperial') {
    return `${(hPa * 0.02953).toFixed(2)} inHg`
  }
  return `${hPa} hPa`
}

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

export const DAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function todayDateString(d: Date = new Date()): string {
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`
}

export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':')
  if (parts.length !== 2) return 0
  return Number(parts[0]) * 60 + Number(parts[1])
}

export function formatHm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
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
  if (nowMin >= setMin) return '0m'
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

// Top label nudged 6px down, bottom label nudged 14px up (closer to number)
// since the dotted glyph is much narrower than its container and the bottom
// has more visible empty space.
export const CHART_LABEL_TOP_Y = 56
export const CHART_LABEL_TOP_H = 36
export const CHART_TOTAL_Y = 90
export const CHART_TOTAL_H = 120
export const CHART_LABEL_BOT_Y = CHART_TOTAL_Y + CHART_TOTAL_H - 14
export const CHART_LABEL_BOT_H = 36

// Pinned mini-dot size so the headline renders at the same visual size on
// rain and wind. With cellGap=1 the macro cells are visually separated.
// Macro cell = 3*2 + 2*1 = 8, glyph = 6*8 + 5*1 = 53, '100' = 3*53 + 2*2 +
// 2*1 (cellGap is intra-glyph, already counted) = 163px in the 204 area.
export const CHART_HEADLINE_OPTS: DotTextOpts = { dotSize: 2, dotGap: 1, cellGap: 1, charGap: 12 }
