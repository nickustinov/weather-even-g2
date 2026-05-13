import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '../layout'
import { canvasToBytes } from '../icons'
import { state } from '../state'
import type { WeatherData } from '../state'
import { drawWeatherIcon } from '../weather-icons'
import { rebuildPage, sendImage } from '../render-shared'

const FORECAST_DAYS = 10

// y=2 matches Today/Rain/Wind header start so swiping between screens
// doesn't jump the top-left corner.
const FORECAST_BODY_Y = 2
const FORECAST_BODY_H = DISPLAY_HEIGHT
const FORECAST_COL_PAD = 4

// 27px is the firmware font's line height — verified against
// @evenrealities/pretext. Any other value here makes the icon strip drift
// relative to text rows.
const FORECAST_ROW_H = 27
const FORECAST_ICON_STRIP_W = 30
const FORECAST_ICON_DIAMETER = 24
const FORECAST_STRIP1_ROWS = 5
const FORECAST_STRIP1_Y = FORECAST_BODY_Y + FORECAST_COL_PAD + 1
const FORECAST_STRIP1_H = FORECAST_ROW_H * FORECAST_STRIP1_ROWS
const FORECAST_STRIP2_ROWS = FORECAST_DAYS - FORECAST_STRIP1_ROWS
const FORECAST_STRIP2_Y = FORECAST_STRIP1_Y + FORECAST_STRIP1_H
const FORECAST_STRIP2_H = FORECAST_ROW_H * FORECAST_STRIP2_ROWS

// Row order matches iOS Weather: day → icon → lo + range bar + hi (one
// container per row using ━/─ Unicode chars). Bar uses U+2501 and U+2500 —
// both supported by the firmware font (verified in even-g2-notes).
const FORECAST_X_GUTTER = 8
const DAY_COL_X = FORECAST_X_GUTTER
const DAY_COL_W = 76
const FORECAST_ICON_X = DAY_COL_X + DAY_COL_W + 18
const TEMPS_COL_X = FORECAST_ICON_X + FORECAST_ICON_STRIP_W + 48
const TEMPS_COL_W = DISPLAY_WIDTH - TEMPS_COL_X - FORECAST_X_GUTTER
// 13 chars × 20px = 260; plus '105° ' (52px) and ' 105°' (52px) the worst
// 3-char row fits in the 380px content area. 15 chars only fits 2-char temps.
const FORECAST_BAR_CHARS = 13

function forecastDays(w: WeatherData): string {
  return w.daily.slice(0, FORECAST_DAYS).map((d, i) => i === 0 ? 'today' : d.day).join('\n')
}

function rangeBarChars(low: number, high: number, weekMin: number, weekMax: number, width: number): string {
  const range = Math.max(weekMax - weekMin, 1)
  const startPos = ((low - weekMin) / range) * width
  const endPos = ((high - weekMin) / range) * width
  const lo = Math.floor(startPos)
  const hi = Math.max(Math.ceil(endPos), lo + 1)
  let out = ''
  for (let i = 0; i < width; i++) {
    out += i >= lo && i < hi ? '━' : '─'
  }
  return out
}

function forecastTempsBars(w: WeatherData, weekMin: number, weekMax: number): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d => {
    const bar = rangeBarChars(d.tempMin, d.tempMax, weekMin, weekMax, FORECAST_BAR_CHARS)
    return `${d.tempMin}° ${bar} ${d.tempMax}°`
  }).join('\n')
}

async function renderForecastIconStrip(codes: number[]): Promise<number[]> {
  const w = FORECAST_ICON_STRIP_W
  const h = FORECAST_ROW_H * codes.length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < codes.length; i++) {
    const cy = i * FORECAST_ROW_H + FORECAST_ROW_H / 2
    await drawWeatherIcon(ctx, codes[i], w / 2, cy, FORECAST_ICON_DIAMETER)
  }
  return canvasToBytes(canvas)
}

export async function showForecastScreen(w: WeatherData): Promise<void> {
  const days = w.daily.slice(0, FORECAST_DAYS)
  const strip1Days = days.slice(0, FORECAST_STRIP1_ROWS)
  const strip2Days = days.slice(FORECAST_STRIP1_ROWS)
  const weekMin = Math.min(...days.map(d => d.tempMin))
  const weekMax = Math.max(...days.map(d => d.tempMax))

  await rebuildPage({
    containerTotalNum: 4,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'days',
        content: forecastDays(w),
        xPosition: DAY_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: DAY_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 1,
        paddingLength: FORECAST_COL_PAD,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'tempsbars',
        content: forecastTempsBars(w, weekMin, weekMax),
        xPosition: TEMPS_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: TEMPS_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 0,
        paddingLength: FORECAST_COL_PAD,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 3,
        containerName: 'icons1',
        xPosition: FORECAST_ICON_X,
        yPosition: FORECAST_STRIP1_Y,
        width: FORECAST_ICON_STRIP_W,
        height: FORECAST_STRIP1_H,
      }),
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'icons2',
        xPosition: FORECAST_ICON_X,
        yPosition: FORECAST_STRIP2_Y,
        width: FORECAST_ICON_STRIP_W,
        height: FORECAST_STRIP2_H,
      }),
    ],
  })

  await sendImage(await renderForecastIconStrip(strip1Days.map(d => d.wmoCode)), 3, 'icons1')
  await sendImage(await renderForecastIconStrip(strip2Days.map(d => d.wmoCode)), 4, 'icons2')
  appendEventLog(`Screen: ${state.screen}`)
}
