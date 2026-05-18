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
import { t } from '../i18n'
import { rebuildPage, sendImage, wmoShort } from '../render-shared'

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

// Row layout: day | icon | cond | low | range bar | high | precip%. Each
// text section is its OWN text container at a fixed x — concatenating them
// into one row would let the proportional-font width of "9°" vs "10°" shift
// the bar's start x from row to row.
const FORECAST_X_GUTTER = 8
const DAY_COL_X = FORECAST_X_GUTTER
const DAY_COL_W = 76
const FORECAST_ICON_X = DAY_COL_X + DAY_COL_W + 10
// Condition column (e.g. "rain", "snow showers", "thunderstorm") — width
// budget sized so worst-case "snow showers" (123px in firmware) fits with
// paddingLength=4 on each side.
const COND_COL_X = FORECAST_ICON_X + FORECAST_ICON_STRIP_W + 8
const COND_COL_W = 132
const LO_COL_X = COND_COL_X + COND_COL_W + 10
const LO_COL_W = 48                        // worst case "-12°" / "100°"
// 6-cell bars. HI and PCT are fixed-width and pinned to the right edge of
// the canvas (PCT_COL_X anchors against DISPLAY_WIDTH); BARS_COL_X is then
// computed leftward from HI so the bars consume the remaining row budget.
const FORECAST_BAR_CHARS = 6
const BARS_COL_W = FORECAST_BAR_CHARS * 20 + 8
const HI_COL_W = 48
// PCT column sized for worst-case "100%" (≈ 51px firmware font) +
// paddingLength=4 on each side, then anchored to the right canvas edge.
const PCT_COL_W = 60

// DAY_COL_W (76px) fits ~5 firmware-font chars. If a locale's "today_day"
// translation is wider than the column it would wrap; fall back to the
// regular weekday short form (always 2–3 chars and guaranteed to fit).
const TODAY_DAY_MAX_CHARS = 5

function forecastDays(w: WeatherData): string {
  const todayLabel = t('glasses.today_day')
  const safeToday = todayLabel.length <= TODAY_DAY_MAX_CHARS ? todayLabel : w.daily[0]?.day ?? todayLabel
  return w.daily.slice(0, FORECAST_DAYS).map((d, i) => i === 0 ? safeToday : d.day).join('\n')
}

function forecastConditions(w: WeatherData): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d => wmoShort(d.wmoCode)).join('\n')
}

function forecastLowTemps(w: WeatherData): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d => `${d.tempMin}°`).join('\n')
}

function forecastHighTemps(w: WeatherData): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d => `${d.tempMax}°`).join('\n')
}

function forecastPrecipPcts(w: WeatherData): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d => `${d.precipProb}%`).join('\n')
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

function forecastBars(w: WeatherData, weekMin: number, weekMax: number): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d =>
    rangeBarChars(d.tempMin, d.tempMax, weekMin, weekMax, FORECAST_BAR_CHARS),
  ).join('\n')
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
  // Right-to-left placement: PCT pinned to the canvas edge, HI to its left,
  // bars consume the remaining width between LO and HI.
  const PCT_COL_X = DISPLAY_WIDTH - PCT_COL_W - FORECAST_X_GUTTER
  const HI_COL_X = PCT_COL_X - HI_COL_W - 4
  const BARS_COL_X = HI_COL_X - BARS_COL_W - 4

  await rebuildPage({
    containerTotalNum: 8,
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
        containerName: 'cond',
        content: forecastConditions(w),
        xPosition: COND_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: COND_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 0,
        paddingLength: FORECAST_COL_PAD,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'lo',
        content: forecastLowTemps(w),
        xPosition: LO_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: LO_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 0,
        paddingLength: FORECAST_COL_PAD,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'bars',
        content: forecastBars(w, weekMin, weekMax),
        xPosition: BARS_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: BARS_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 0,
        paddingLength: FORECAST_COL_PAD,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'hi',
        content: forecastHighTemps(w),
        xPosition: HI_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: HI_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 0,
        paddingLength: FORECAST_COL_PAD,
      }),
      new TextContainerProperty({
        containerID: 8,
        containerName: 'pct',
        content: forecastPrecipPcts(w),
        xPosition: PCT_COL_X,
        yPosition: FORECAST_BODY_Y,
        width: PCT_COL_W,
        height: FORECAST_BODY_H,
        isEventCapture: 0,
        paddingLength: FORECAST_COL_PAD,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 6,
        containerName: 'icons1',
        xPosition: FORECAST_ICON_X,
        yPosition: FORECAST_STRIP1_Y,
        width: FORECAST_ICON_STRIP_W,
        height: FORECAST_STRIP1_H,
      }),
      new ImageContainerProperty({
        containerID: 7,
        containerName: 'icons2',
        xPosition: FORECAST_ICON_X,
        yPosition: FORECAST_STRIP2_Y,
        width: FORECAST_ICON_STRIP_W,
        height: FORECAST_STRIP2_H,
      }),
    ],
  })

  await sendImage(await renderForecastIconStrip(strip1Days.map(d => d.wmoCode)), 6, 'icons1')
  await sendImage(await renderForecastIconStrip(strip2Days.map(d => d.wmoCode)), 7, 'icons2')
  appendEventLog(`Screen: ${state.screen}`)
}
