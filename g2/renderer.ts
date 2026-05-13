import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from './layout'
import { state, getBridge, SCREENS } from './state'
import type { WeatherData } from './state'
import { getSavedUnit } from './api'
import { canvasToBytes } from './icons'
import { drawWeatherIcon } from './weather-icons'
import { autoSizeDotted, drawDotted, measureDotted } from './dot-digits'

// ---------------------------------------------------------------------------
// Rebuild helper
// ---------------------------------------------------------------------------

async function rebuildPage(config: {
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

// ---------------------------------------------------------------------------
// Text formatting helpers
// ---------------------------------------------------------------------------

function wmoShort(code: number): string {
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

// ---------------------------------------------------------------------------
// Weather icon rasterisation
// ---------------------------------------------------------------------------

async function renderWeatherIconBytes(wmoCode: number, size: number): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  await drawWeatherIcon(ctx, wmoCode, size / 2, size / 2, size)
  return canvasToBytes(canvas)
}

async function sendImage(bytes: number[], containerID: number, containerName: string): Promise<void> {
  const b = getBridge()
  if (!b) return
  const result = await b.updateImageRawData(
    new ImageRawDataUpdate({ containerID, containerName, imageData: bytes }),
  )
  appendEventLog(`Image: ${String(result)}`)
}

// ---------------------------------------------------------------------------
// Today screen – at-a-glance day summary
//
// Layout:
//   ┌─ header: "city · day DD mon" ──────────────────────────────────────┐
//   │                                  │                                  │
//   │     BIG DOTTED HIGH TEMP         │   rise   06:45                   │
//   │           (canvas image)         │   set    19:30                   │
//   │                                  │                                  │
//   │                                  │   ━━━━━━━━━━────── 62%           │
//   │                                  │                                  │
//   │     ↑ 22°   ↓ 10°                │   uv     6                       │
//   │                                  │   sun    8.2 h                   │
//   │                                  │   rain   0.5 mm                  │
//   └────────────────────────────────────────────────────────────────────┘
// ---------------------------------------------------------------------------

// Sized so every text container is taller than the firmware font's natural
// ~30px line height — when the container is shorter than what the font wants,
// LVGL renders a small vertical scrollbar sliver on the right edge.
const TODAY_PAD = 8
const TODAY_HEADER_Y = 0
const TODAY_HEADER_H = 38
const TODAY_BODY_Y = TODAY_HEADER_H + 4

// Left half: big dotted temp + combined range/daylight subtitle. Body shifts
// 20px below the centred position; range gets an additional 10px on top.
const TODAY_BODY_TOP_GAP = 12
const TODAY_RANGE_EXTRA_GAP = 10
const TODAY_TEMP_W = Math.floor(DISPLAY_WIDTH / 2) - TODAY_PAD * 2
const TODAY_TEMP_H = 130
const TODAY_RANGE_H = 64 // 2 lines × 27px + paddingLength × 2 + slack
const TODAY_LEFT_TOTAL_H = TODAY_TEMP_H + 4 + TODAY_RANGE_H
const TODAY_TEMP_X = TODAY_PAD
const TODAY_TEMP_Y = Math.floor((DISPLAY_HEIGHT - TODAY_LEFT_TOTAL_H) / 2) + TODAY_BODY_TOP_GAP
const TODAY_RANGE_Y = TODAY_TEMP_Y + TODAY_TEMP_H + 4 + TODAY_RANGE_EXTRA_GAP

// Right half: stats grid (label + value columns), shifted down by the same
// 10px gap as the left side so both halves align below the header.
const TODAY_RIGHT_X = Math.floor(DISPLAY_WIDTH / 2) + TODAY_PAD
const TODAY_RIGHT_W = DISPLAY_WIDTH - TODAY_RIGHT_X - TODAY_PAD
const TODAY_STATS_Y = TODAY_BODY_Y + TODAY_BODY_TOP_GAP
const TODAY_STATS_H = DISPLAY_HEIGHT - TODAY_STATS_Y - TODAY_PAD
const TODAY_STAT_LABEL_W = 90
const TODAY_STAT_VALUE_X = TODAY_RIGHT_X + TODAY_STAT_LABEL_W
const TODAY_STAT_VALUE_W = TODAY_RIGHT_W - TODAY_STAT_LABEL_W

// Condition icon sits directly under the degree glyph of the headline. The
// x-offset (156) is the canvas position of the degree for a 2-digit temp at
// dotSize=8 — 1- and 3-digit temps shift the degree, so this can drift.
const TODAY_CONDITION_ICON_SIZE = 61
const TODAY_CONDITION_ICON_X_BASE = TODAY_TEMP_X + 156
// 2-char temps render with bigger dotSize → digits extend lower → icon needs
// to drop too. Each extra char (3-digit or negative) shrinks dotSize and the
// icon should rise to stay snug against the digit baseline.
const TODAY_CONDITION_ICON_Y_BASE = TODAY_TEMP_Y + 66
const TODAY_CONDITION_ICON_PER_EXTRA_CHAR_Y = 5
// Each char beyond the 2-digit baseline pushes the degree (and icon) right
// by ~55px in the rendered dotted font. Covers 3-digit and negative temps.
const TODAY_CONDITION_ICON_PER_EXTRA_CHAR = 55

const DAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function todayHeader(w: WeatherData): string {
  const d = new Date()
  const date = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  return `${w.city.toLowerCase()}  ·  ${date}  ·  ${w.currentDescription.toLowerCase()}`
}

function todayRangeAndDaylight(today: WeatherData['daily'][number], w: WeatherData): string {
  const range = `↑ ${today.tempMax}°    ↓ ${today.tempMin}°`
  const daylight = `${daylightValue(w.sunrise, w.sunset)} daylight left`
  return `${range}\n${daylight}`
}

function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':')
  if (parts.length !== 2) return 0
  return Number(parts[0]) * 60 + Number(parts[1])
}

function formatHm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function daylightValue(sunrise: string, sunset: string): string {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const sunMin = timeToMinutes(sunrise)
  const setMin = timeToMinutes(sunset)
  if (nowMin < sunMin) return formatHm(setMin - sunMin)
  if (nowMin >= setMin) return '0m'
  return formatHm(setMin - nowMin)
}

function todayStatLabels(): string {
  return ['feels', 'wind', 'humid', 'press', 'rise', 'set', 'uv'].join('\n')
}

function todayStatValues(w: WeatherData, today: WeatherData['daily'][number]): string {
  return [
    `${w.feelsLike}°`,
    `${w.windSpeed} ${speedUnit()} ${windLabel(w.windDirection)}`,
    `${w.humidity}%`,
    formatPressure(w.pressure),
    w.sunrise,
    w.sunset,
    String(Math.round(today.uvMax)),
  ].join('\n')
}

function renderDottedNumberBytes(text: string, w: number, h: number): number[] {
  const opts = autoSizeDotted(text, w - 12, h - 8, 10, 5)
  const m = measureDotted(text, opts)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  // Left-aligned so the headline lines up visually with the range and
  // daylight subtitles (also left-aligned) directly below it.
  const x = 4
  const y = Math.floor((h - m.height) / 2)
  drawDotted(ctx, text, x, y, opts)
  return canvasToBytes(canvas)
}

async function showTodayScreen(w: WeatherData): Promise<void> {
  const today = w.daily[0]
  if (!today) {
    await showLoading()
    return
  }

  const headlineText = `${w.currentTemp}°`
  const extraChars = Math.max(0, String(w.currentTemp).length - 2)
  const conditionIconX = TODAY_CONDITION_ICON_X_BASE + extraChars * TODAY_CONDITION_ICON_PER_EXTRA_CHAR
  const conditionIconY = TODAY_CONDITION_ICON_Y_BASE - extraChars * TODAY_CONDITION_ICON_PER_EXTRA_CHAR_Y

  await rebuildPage({
    containerTotalNum: 6,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: todayHeader(w),
        xPosition: TODAY_PAD,
        yPosition: TODAY_HEADER_Y + 2,
        width: DISPLAY_WIDTH - TODAY_PAD * 2,
        height: TODAY_HEADER_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'range',
        content: todayRangeAndDaylight(today, w),
        xPosition: TODAY_TEMP_X,
        yPosition: TODAY_RANGE_Y,
        width: TODAY_TEMP_W,
        height: TODAY_RANGE_H,
        isEventCapture: 0,
        paddingLength: 2,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'statlabels',
        content: todayStatLabels(),
        xPosition: TODAY_RIGHT_X,
        yPosition: TODAY_STATS_Y,
        width: TODAY_STAT_LABEL_W,
        height: TODAY_STATS_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'statvalues',
        content: todayStatValues(w, today),
        xPosition: TODAY_STAT_VALUE_X,
        yPosition: TODAY_STATS_Y,
        width: TODAY_STAT_VALUE_W,
        height: TODAY_STATS_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 5,
        containerName: 'headline',
        xPosition: TODAY_TEMP_X,
        yPosition: TODAY_TEMP_Y,
        width: TODAY_TEMP_W,
        height: TODAY_TEMP_H,
      }),
      new ImageContainerProperty({
        containerID: 6,
        containerName: 'condition',
        xPosition: conditionIconX,
        yPosition: conditionIconY,
        width: TODAY_CONDITION_ICON_SIZE,
        height: TODAY_CONDITION_ICON_SIZE,
      }),
    ],
  })

  await sendImage(renderDottedNumberBytes(headlineText, TODAY_TEMP_W, TODAY_TEMP_H), 5, 'headline')
  await sendImage(await renderWeatherIconBytes(w.currentWmoCode, TODAY_CONDITION_ICON_SIZE), 6, 'condition')
  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 0 – 7-day forecast (text + icon overlay)
// ---------------------------------------------------------------------------

const HEADER_H = 50
const COL_Y = HEADER_H
const COL_H = DISPLAY_HEIGHT - COL_Y

// 10-day forecast, full-screen (no header). 10 rows × 28px = 280, fits in
// 288 with paddingLength=4 (content area = 280 exact). Split into 5 + 5 icon
// and bar strips to stay under the 144px image-container ceiling.
const FORECAST_DAYS = 10
const FORECAST_BODY_Y = 0
const FORECAST_BODY_H = DISPLAY_HEIGHT
const FORECAST_COL_PAD = 4
// 27px is the firmware font's line height — verified against
// @evenrealities/pretext, which mirrors what LVGL actually uses. Any other
// value here makes the icon strip drift relative to text rows.
const FORECAST_ROW_H = 27
const FORECAST_ICON_STRIP_W = 30
const FORECAST_ICON_DIAMETER = 24
const FORECAST_STRIP1_ROWS = 5
const FORECAST_STRIP1_Y = FORECAST_BODY_Y + FORECAST_COL_PAD + 1
const FORECAST_STRIP1_H = FORECAST_ROW_H * FORECAST_STRIP1_ROWS
const FORECAST_STRIP2_ROWS = FORECAST_DAYS - FORECAST_STRIP1_ROWS
const FORECAST_STRIP2_Y = FORECAST_STRIP1_Y + FORECAST_STRIP1_H
const FORECAST_STRIP2_H = FORECAST_ROW_H * FORECAST_STRIP2_ROWS

// Row order matches iOS Weather: day → icon → low → range bar → high.
// Wide gap after the icons pushes the lo/bar/hi cluster rightwards. Tight
// gaps around the bar so the lo/hi numbers read as labels for its endpoints.
const FORECAST_X_GUTTER = 8
const DAY_COL_X = FORECAST_X_GUTTER
const DAY_COL_W = 76
const FORECAST_ICON_X = DAY_COL_X + DAY_COL_W + 18
// One text container per row: `14° ──━━━── 20°`. Bar uses ━ U+2501 and
// ─ U+2500 — both supported by the firmware font (verified in even-g2-notes).
// 48px gap matches the visual day-to-icon spacing for typical day labels.
const TEMPS_COL_X = FORECAST_ICON_X + FORECAST_ICON_STRIP_W + 48
const TEMPS_COL_W = DISPLAY_WIDTH - TEMPS_COL_X - FORECAST_X_GUTTER
// Each ━/─ glyph measures 20px wide in the firmware font, so 15 chars =
// 300px. Plus "14° " (32px) and " 20°" (36px), the full row is 368px and
// fits in the ~380px content area when TEMPS_COL_X is offset by 48.
const FORECAST_BAR_CHARS = 15

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
    out += i >= lo && i < hi ? '\u2501' : '\u2500'
  }
  return out
}

function forecastTempsBars(w: WeatherData, weekMin: number, weekMax: number): string {
  return w.daily.slice(0, FORECAST_DAYS).map(d => {
    const bar = rangeBarChars(d.tempMin, d.tempMax, weekMin, weekMax, FORECAST_BAR_CHARS)
    return `${d.tempMin}\u00B0 ${bar} ${d.tempMax}\u00B0`
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

async function showForecastScreen(w: WeatherData): Promise<void> {
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

// ---------------------------------------------------------------------------
// Screen 1 – Today's details (text + icon overlay)
// ---------------------------------------------------------------------------

function windLabel(deg: number): string {
  const d = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  return d[Math.round(deg / 45) % 8]
}

function speedUnit(): string {
  return getSavedUnit() === 'imperial' ? 'mph' : 'km/h'
}

function precipUnit(): string {
  return getSavedUnit() === 'imperial' ? 'in' : 'mm'
}

function formatPressure(hPa: number): string {
  if (getSavedUnit() === 'imperial') {
    return `${(hPa * 0.02953).toFixed(2)} inHg`
  }
  return `${hPa} hPa`
}

// ---------------------------------------------------------------------------
// Screen 2 – Precipitation (horizontal bar chart)
// ---------------------------------------------------------------------------

// Rain screen layout: header + 3-column hourly grid (times | bars | %) on the
// left + dotted total stack (label / number / unit) on the right. Bars use
// ━/─ Unicode chars. Times and percents go in their own containers because
// the firmware font is proportional — 20:00 is wider than 13:00, so a single
// container would misalign the bars.
const RAIN_PAD = 8
const RAIN_HEADER_H = 38
const RAIN_BODY_Y = RAIN_HEADER_H + 4
const RAIN_BODY_H = DISPLAY_HEIGHT - RAIN_BODY_Y - RAIN_PAD
const RAIN_HOURS_VISIBLE = 8
const RAIN_BAR_CHARS = 8

const RAIN_TIMES_X = RAIN_PAD
const RAIN_TIMES_W = 60
const RAIN_BARS_X = RAIN_TIMES_X + RAIN_TIMES_W + 4
const RAIN_BARS_W = 174
const RAIN_PERCENTS_X = RAIN_BARS_X + RAIN_BARS_W + 4
const RAIN_PERCENTS_W = 68
const RAIN_TOTAL_X = RAIN_PERCENTS_X + RAIN_PERCENTS_W + 12
const RAIN_TOTAL_W = DISPLAY_WIDTH - RAIN_TOTAL_X - RAIN_PAD

const RAIN_PRECIP_LABEL_Y = 50
const RAIN_PRECIP_LABEL_H = 36
const RAIN_TOTAL_Y = 90
const RAIN_TOTAL_H = 120
const RAIN_LABEL_Y = RAIN_TOTAL_Y + RAIN_TOTAL_H
const RAIN_LABEL_H = 36

function rainTimesText(w: WeatherData): string {
  return w.hourly.slice(0, RAIN_HOURS_VISIBLE).map(h => h.time).join('\n')
}

function rainBarsText(w: WeatherData): string {
  return w.hourly.slice(0, RAIN_HOURS_VISIBLE).map(h => {
    const filled = Math.max(0, Math.min(RAIN_BAR_CHARS, Math.round((h.precipProb / 100) * RAIN_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(RAIN_BAR_CHARS - filled)
  }).join('\n')
}

function rainPercentsText(w: WeatherData): string {
  return w.hourly.slice(0, RAIN_HOURS_VISIBLE).map(h => `${h.precipProb}%`).join('\n')
}


async function showRainScreen(w: WeatherData): Promise<void> {
  const totalRaw = w.daily[0]?.precipSum ?? 0
  const totalStr = totalRaw.toFixed(1)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  \u00B7  ${w.currentTemp}\u00B0  \u00B7  ${w.currentDescription}`,
        xPosition: RAIN_PAD,
        yPosition: 2,
        width: DISPLAY_WIDTH - RAIN_PAD * 2,
        height: RAIN_HEADER_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'times',
        content: rainTimesText(w),
        xPosition: RAIN_TIMES_X,
        yPosition: RAIN_BODY_Y,
        width: RAIN_TIMES_W,
        height: RAIN_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'bars',
        content: rainBarsText(w),
        xPosition: RAIN_BARS_X,
        yPosition: RAIN_BODY_Y,
        width: RAIN_BARS_W,
        height: RAIN_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'percents',
        content: rainPercentsText(w),
        xPosition: RAIN_PERCENTS_X,
        yPosition: RAIN_BODY_Y,
        width: RAIN_PERCENTS_W,
        height: RAIN_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'preciplabel',
        content: 'precipitation',
        xPosition: RAIN_TOTAL_X,
        yPosition: RAIN_PRECIP_LABEL_Y,
        width: RAIN_TOTAL_W,
        height: RAIN_PRECIP_LABEL_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'unit',
        content: `${precipUnit()} today`,
        xPosition: RAIN_TOTAL_X,
        yPosition: RAIN_LABEL_Y,
        width: RAIN_TOTAL_W,
        height: RAIN_LABEL_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 7,
        containerName: 'total',
        xPosition: RAIN_TOTAL_X,
        yPosition: RAIN_TOTAL_Y,
        width: RAIN_TOTAL_W,
        height: RAIN_TOTAL_H,
      }),
    ],
  })

  await sendImage(renderDottedNumberBytes(totalStr, RAIN_TOTAL_W, RAIN_TOTAL_H), 7, 'total')
  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 3 – Wind (Unicode bars + arrows, dotted current speed)
// ---------------------------------------------------------------------------

// Same column geometry as the rain screen so the screens read as a series.
const WIND_PAD = 8
const WIND_HEADER_H = 38
const WIND_BODY_Y = WIND_HEADER_H + 4
const WIND_BODY_H = DISPLAY_HEIGHT - WIND_BODY_Y - WIND_PAD
const WIND_HOURS_VISIBLE = 8
const WIND_BAR_CHARS = 8

const WIND_TIMES_X = WIND_PAD
const WIND_TIMES_W = 60
const WIND_BARS_X = WIND_TIMES_X + WIND_TIMES_W + 4
const WIND_BARS_W = 174
const WIND_VALUES_X = WIND_BARS_X + WIND_BARS_W + 4
const WIND_VALUES_W = 110
const WIND_TOTAL_X = WIND_VALUES_X + WIND_VALUES_W + 12
const WIND_TOTAL_W = DISPLAY_WIDTH - WIND_TOTAL_X - WIND_PAD

const WIND_LABEL_TOP_Y = 50
const WIND_LABEL_TOP_H = 36
const WIND_TOTAL_Y = 90
const WIND_TOTAL_H = 120
const WIND_LABEL_BOT_Y = WIND_TOTAL_Y + WIND_TOTAL_H
const WIND_LABEL_BOT_H = 36

// Compass arrow points toward the direction the wind is FROM — matches the
// existing windLabel convention ('sw' = wind from southwest). U+2190–U+2199
// arrows are confirmed in the firmware font (even-g2-notes display.md).
const WIND_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

function windArrow(deg: number): string {
  return WIND_ARROWS[Math.round(deg / 45) % 8]
}

function windTimesText(w: WeatherData): string {
  return w.hourly.slice(0, WIND_HOURS_VISIBLE).map(h => h.time).join('\n')
}

function windBarsText(w: WeatherData): string {
  const hours = w.hourly.slice(0, WIND_HOURS_VISIBLE)
  const maxSpeed = Math.max(...hours.map(h => h.windGust), 1)
  return hours.map(h => {
    const filled = Math.max(0, Math.min(WIND_BAR_CHARS, Math.round((h.windSpeed / maxSpeed) * WIND_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(WIND_BAR_CHARS - filled)
  }).join('\n')
}

function windValuesText(w: WeatherData): string {
  return w.hourly.slice(0, WIND_HOURS_VISIBLE).map(h =>
    `${h.windSpeed} ${windArrow(h.windDir)} ${windLabel(h.windDir)}`
  ).join('\n')
}

async function showWindScreen(w: WeatherData): Promise<void> {
  const speedStr = String(w.windSpeed)
  const currentArrow = windArrow(w.windDirection)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${w.currentDescription}`,
        xPosition: WIND_PAD,
        yPosition: 2,
        width: DISPLAY_WIDTH - WIND_PAD * 2,
        height: WIND_HEADER_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'times',
        content: windTimesText(w),
        xPosition: WIND_TIMES_X,
        yPosition: WIND_BODY_Y,
        width: WIND_TIMES_W,
        height: WIND_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'bars',
        content: windBarsText(w),
        xPosition: WIND_BARS_X,
        yPosition: WIND_BODY_Y,
        width: WIND_BARS_W,
        height: WIND_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'values',
        content: windValuesText(w),
        xPosition: WIND_VALUES_X,
        yPosition: WIND_BODY_Y,
        width: WIND_VALUES_W,
        height: WIND_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'windlabel',
        content: 'wind',
        xPosition: WIND_TOTAL_X,
        yPosition: WIND_LABEL_TOP_Y,
        width: WIND_TOTAL_W,
        height: WIND_LABEL_TOP_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'unit',
        content: `${speedUnit()} ${currentArrow} ${windLabel(w.windDirection)}`,
        xPosition: WIND_TOTAL_X,
        yPosition: WIND_LABEL_BOT_Y,
        width: WIND_TOTAL_W,
        height: WIND_LABEL_BOT_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 7,
        containerName: 'total',
        xPosition: WIND_TOTAL_X,
        yPosition: WIND_TOTAL_Y,
        width: WIND_TOTAL_W,
        height: WIND_TOTAL_H,
      }),
    ],
  })

  await sendImage(renderDottedNumberBytes(speedStr, WIND_TOTAL_W, WIND_TOTAL_H), 7, 'total')
  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 4 – Hourly forecast (two columns side by side)
// ---------------------------------------------------------------------------

function formatHoursColumn(hours: WeatherData['hourly'], startLabel: string | null): string {
  const lines: string[] = []
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i]
    const label = i === 0 && startLabel ? startLabel : h.time
    const cond = wmoShort(h.wmoCode)
    const precip = h.precipProb > 0 ? ` \u00B7 ${h.precipProb}%` : ''
    lines.push(`${label.padEnd(6)}${h.temp}\u00B0 \u00B7 ${cond}${precip}`)
  }
  return lines.join('\n')
}

const HOURS_PER_COL = 9
const COL_WIDTH = Math.floor(DISPLAY_WIDTH / 2)

async function showHoursScreen(w: WeatherData): Promise<void> {
  const leftHours = w.hourly.slice(0, HOURS_PER_COL)
  const rightHours = w.hourly.slice(HOURS_PER_COL, HOURS_PER_COL * 2)
  const leftText = formatHoursColumn(leftHours, 'now')
  const rightText = formatHoursColumn(rightHours, null)

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'left',
        content: leftText,
        xPosition: 0,
        yPosition: 0,
        width: COL_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'right',
        content: rightText,
        xPosition: COL_WIDTH,
        yPosition: 0,
        width: COL_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 0,
        paddingLength: 6,
      }),
    ],
  })

  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function showScreen(): Promise<void> {
  if (!state.weather) {
    await showLoading()
    return
  }

  switch (state.screen) {
    case 'today':
      await showTodayScreen(state.weather)
      break
    case 'forecast':
      await showForecastScreen(state.weather)
      break
    case 'rain':
      await showRainScreen(state.weather)
      break
    case 'wind':
      await showWindScreen(state.weather)
      break
    case 'hours':
      await showHoursScreen(state.weather)
      break
  }
}

export async function showSetupMessage(): Promise<void> {
  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'setup',
        content: 'no city selected.\n\nopen weather in your phone browser and choose a city for the forecast.',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 6,
      }),
    ],
  })
}

export async function showLoading(): Promise<void> {
  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'loading',
        content: 'loading weather...',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 4,
      }),
    ],
  })
}

export function nextScreen(): void {
  state.screenIndex = (state.screenIndex + 1) % SCREENS.length
  state.screen = SCREENS[state.screenIndex]
}

export function prevScreen(): void {
  state.screenIndex = (state.screenIndex - 1 + SCREENS.length) % SCREENS.length
  state.screen = SCREENS[state.screenIndex]
}

export function firstScreen(): void {
  state.screenIndex = 0
  state.screen = SCREENS[0]
}
