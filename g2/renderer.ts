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
import { drawWeatherIconAt, canvasToBytes } from './icons'
import { autoSizeDotted, drawDotted, measureDotted } from './dot-digits'
import umbrellaUrl from './assets/umbrella.png'
import windIconUrl from './assets/wind.png'

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
  if (code === 0) return 'Clear'
  if (code === 1) return 'Mostly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code >= 85 && code <= 86) return 'Snow showers'
  if (code === 95) return 'Thunderstorm'
  if (code >= 96) return 'Hail storm'
  return ''
}

// ---------------------------------------------------------------------------
// Small icon rendering (for image overlay)
// ---------------------------------------------------------------------------

function drawWeatherIcon(wmoCode: number, size: number): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = size > 60 ? 2 : 1.5
  drawWeatherIconAt(ctx, wmoCode, size / 2, size / 2, size * 0.35)
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

// Left half: big dotted temp + range subtitle, vertically centred as a unit.
const TODAY_TEMP_W = Math.floor(DISPLAY_WIDTH / 2) - TODAY_PAD * 2
const TODAY_TEMP_H = 130
const TODAY_RANGE_H = 38
const TODAY_LEFT_TOTAL_H = TODAY_TEMP_H + 6 + TODAY_RANGE_H
const TODAY_TEMP_X = TODAY_PAD
const TODAY_TEMP_Y = Math.floor((DISPLAY_HEIGHT - TODAY_LEFT_TOTAL_H) / 2)
const TODAY_RANGE_Y = TODAY_TEMP_Y + TODAY_TEMP_H + 6

// Right half: stats grid (two text columns + a progress-bar row).
const TODAY_RIGHT_X = Math.floor(DISPLAY_WIDTH / 2) + TODAY_PAD
const TODAY_RIGHT_W = DISPLAY_WIDTH - TODAY_RIGHT_X - TODAY_PAD
const TODAY_STAT_LABEL_W = 90
const TODAY_STAT_VALUE_X = TODAY_RIGHT_X + TODAY_STAT_LABEL_W
const TODAY_STAT_VALUE_W = TODAY_RIGHT_W - TODAY_STAT_LABEL_W

const DAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function todayHeader(city: string): string {
  const d = new Date()
  return `${city.toLowerCase()}  ·  ${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

function todayRange(today: WeatherData['daily'][number]): string {
  return `↑ ${today.tempMax}°    ↓ ${today.tempMin}°`
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
  return ['rise', 'set', '', 'uv', 'sun', 'rain', 'daylight'].join('\n')
}

function todayStatValues(w: WeatherData, today: WeatherData['daily'][number]): string {
  return [
    w.sunrise,
    w.sunset,
    '',
    String(Math.round(today.uvMax)),
    `${today.sunshineHours.toFixed(1)} h`,
    `${today.precipSum.toFixed(1)} ${precipUnit()}`,
    daylightValue(w.sunrise, w.sunset),
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
  const x = Math.floor((w - m.width) / 2)
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

  const headlineText = `${today.tempMax}°`

  await rebuildPage({
    containerTotalNum: 5,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: todayHeader(w.city),
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
        content: todayRange(today),
        xPosition: TODAY_TEMP_X,
        yPosition: TODAY_RANGE_Y,
        width: TODAY_TEMP_W,
        height: TODAY_RANGE_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'statlabels',
        content: todayStatLabels(),
        xPosition: TODAY_RIGHT_X,
        yPosition: TODAY_BODY_Y,
        width: TODAY_STAT_LABEL_W,
        height: DISPLAY_HEIGHT - TODAY_BODY_Y - TODAY_PAD,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'statvalues',
        content: todayStatValues(w, today),
        xPosition: TODAY_STAT_VALUE_X,
        yPosition: TODAY_BODY_Y,
        width: TODAY_STAT_VALUE_W,
        height: DISPLAY_HEIGHT - TODAY_BODY_Y - TODAY_PAD,
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
    ],
  })

  await sendImage(renderDottedNumberBytes(headlineText, TODAY_TEMP_W, TODAY_TEMP_H), 5, 'headline')
  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 0 – 7-day forecast (text + icon overlay)
// ---------------------------------------------------------------------------

const HEADER_H = 50
const COL_Y = HEADER_H
const COL_H = DISPLAY_HEIGHT - COL_Y
const DAY_COL_W = 120
const TEMP_COL_W = 130
const COND_COL_X = DAY_COL_W + TEMP_COL_W
const COND_COL_W = DISPLAY_WIDTH - COND_COL_X

function forecastDays(w: WeatherData): string {
  return w.daily.slice(0, 7).map((d, i) => i === 0 ? 'Today' : d.day).join('\n')
}

function forecastTemps(w: WeatherData): string {
  return w.daily.slice(0, 7).map(d => `${d.tempMax}\u00B0/${d.tempMin}\u00B0`).join('\n')
}

function forecastConds(w: WeatherData): string {
  return w.daily.slice(0, 7).map(d => {
    const cond = wmoShort(d.wmoCode)
    const precip = d.precipProb > 0 ? ` ${d.precipProb}%` : ''
    return `${cond}${precip}`
  }).join('\n')
}

async function showForecastScreen(w: WeatherData): Promise<void> {
  await rebuildPage({
    containerTotalNum: 4,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city} \u00B7 ${w.currentTemp}\u00B0 \u00B7 ${w.currentDescription}`,
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: HEADER_H,
        isEventCapture: 1,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'days',
        content: forecastDays(w),
        xPosition: 0,
        yPosition: COL_Y,
        width: DAY_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'temps',
        content: forecastTemps(w),
        xPosition: DAY_COL_W,
        yPosition: COL_Y,
        width: TEMP_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'conds',
        content: forecastConds(w),
        xPosition: COND_COL_X,
        yPosition: COL_Y,
        width: COND_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
    ],
  })

  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 1 – Today's details (text + icon overlay)
// ---------------------------------------------------------------------------

function windLabel(deg: number): string {
  const d = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return d[Math.round(deg / 45) % 8]
}

const NOW_ICON_SIZE = 100
const NOW_ICON_PADDING_RIGHT = 20
const NOW_LABEL_W = 120
const NOW_VALUE_W = 300

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

function nowLabels(): string {
  return ['Feels like', 'Wind', 'Humidity', 'Pressure', '', 'Sunrise', 'Sunset'].join('\n')
}

function nowValues(w: WeatherData): string {
  return [
    `${w.feelsLike}\u00B0`,
    `${w.windSpeed} ${speedUnit()} ${windLabel(w.windDirection)}`,
    `${w.humidity}%`,
    formatPressure(w.pressure),
    '',
    w.sunrise,
    w.sunset,
  ].join('\n')
}

async function showNowScreen(w: WeatherData): Promise<void> {
  await rebuildPage({
    containerTotalNum: 4,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city} \u00B7 ${w.currentTemp}\u00B0 \u00B7 ${w.currentDescription}`,
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: HEADER_H,
        isEventCapture: 1,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'labels',
        content: nowLabels(),
        xPosition: 0,
        yPosition: COL_Y,
        width: NOW_LABEL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'values',
        content: nowValues(w),
        xPosition: NOW_LABEL_W,
        yPosition: COL_Y,
        width: NOW_VALUE_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'icon',
        xPosition: DISPLAY_WIDTH - NOW_ICON_SIZE - NOW_ICON_PADDING_RIGHT,
        yPosition: Math.floor((DISPLAY_HEIGHT - NOW_ICON_SIZE) / 2),
        width: NOW_ICON_SIZE,
        height: NOW_ICON_SIZE,
      }),
    ],
  })

  await sendImage(drawWeatherIcon(w.currentWmoCode, NOW_ICON_SIZE), 4, 'icon')
  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 2 – Precipitation (horizontal bar chart)
// ---------------------------------------------------------------------------

const BAR_WIDTH = 12

function makeBar(pct: number): string {
  const filled = Math.round((pct / 100) * BAR_WIDTH)
  const empty = BAR_WIDTH - filled
  return '\u2588'.repeat(filled) + '\u2592'.repeat(empty)
}

const TIME_COL_W = 80

function chartTimes(hours: WeatherData['hourly']): string {
  return hours.map((h, i) => i === 0 ? 'Now' : h.time).join('\n')
}

function rainBars(hours: WeatherData['hourly']): string {
  return hours.map(h => `${makeBar(h.precipProb)} ${h.precipProb}%`).join('\n')
}

function windBars(hours: WeatherData['hourly'], maxSpeed: number): string {
  return hours.map(h => {
    const pct = (h.windSpeed / maxSpeed) * 100
    return `${makeBar(pct)} ${h.windSpeed} ${windLabel(h.windDir)}`
  }).join('\n')
}

// Pre-loaded PNG icons for chart screens
const iconCache = new Map<string, number[]>()

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function loadPngIcon(url: string, width: number, height: number): Promise<number[]> {
  const cached = iconCache.get(url)
  if (cached) return cached

  const img = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const bytes = canvasToBytes(canvas)

  iconCache.set(url, bytes)
  return bytes
}

const UMBRELLA_W = 107
const UMBRELLA_H = 100
const WIND_ICON_W = 117
const WIND_ICON_H = 93
const BARS_COL_W = DISPLAY_WIDTH - TIME_COL_W

async function showRainScreen(w: WeatherData): Promise<void> {
  const hours = w.hourly.slice(0, 7)
  const totalMm = hours.reduce((s, h) => s + h.precipMm, 0)

  await rebuildPage({
    containerTotalNum: 4,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `Precipitation \u00B7 ${Math.round(totalMm * 10) / 10} ${precipUnit()} next 12h`,
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: HEADER_H,
        isEventCapture: 1,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'times',
        content: chartTimes(hours),
        xPosition: 0,
        yPosition: COL_Y,
        width: TIME_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'bars',
        content: rainBars(hours),
        xPosition: TIME_COL_W,
        yPosition: COL_Y,
        width: BARS_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'label',
        xPosition: DISPLAY_WIDTH - UMBRELLA_W - 10,
        yPosition: Math.floor((DISPLAY_HEIGHT - UMBRELLA_H) / 2),
        width: UMBRELLA_W,
        height: UMBRELLA_H,
      }),
    ],
  })

  await sendImage(await loadPngIcon(umbrellaUrl, UMBRELLA_W, UMBRELLA_H), 4, 'label')
  appendEventLog(`Screen: ${state.screen}`)
}

// ---------------------------------------------------------------------------
// Screen 3 – Wind (horizontal bar chart)
// ---------------------------------------------------------------------------

async function showWindScreen(w: WeatherData): Promise<void> {
  const hours = w.hourly.slice(0, 7)
  const maxSpeed = Math.max(...hours.map(h => h.windGust), 1)

  await rebuildPage({
    containerTotalNum: 4,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `Wind \u00B7 ${w.windSpeed} ${speedUnit()} ${windLabel(w.windDirection)}`,
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: HEADER_H,
        isEventCapture: 1,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'times',
        content: chartTimes(hours),
        xPosition: 0,
        yPosition: COL_Y,
        width: TIME_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'bars',
        content: windBars(hours, maxSpeed),
        xPosition: TIME_COL_W,
        yPosition: COL_Y,
        width: BARS_COL_W,
        height: COL_H,
        isEventCapture: 0,
        paddingLength: 6,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'label',
        xPosition: DISPLAY_WIDTH - WIND_ICON_W - 10,
        yPosition: Math.floor((DISPLAY_HEIGHT - WIND_ICON_H) / 2),
        width: WIND_ICON_W,
        height: WIND_ICON_H,
      }),
    ],
  })

  await sendImage(await loadPngIcon(windIconUrl, WIND_ICON_W, WIND_ICON_H), 4, 'label')
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
  const leftText = formatHoursColumn(leftHours, 'Now')
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
    case 'now':
      await showNowScreen(state.weather)
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
        content: 'No city selected.\n\nOpen Weather in your phone browser and choose a city for the forecast.',
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
        content: 'Loading weather...',
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
