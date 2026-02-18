import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, IMAGE_WIDTH, IMAGE_HEIGHT, PADDING } from './layout'
import { state, bridge, SCREENS } from './state'
import type { WeatherData } from './state'
import { drawWeatherIconAt, canvasToBytes } from './icons'

// ---------------------------------------------------------------------------
// Rebuild helper
// ---------------------------------------------------------------------------

async function rebuildPage(config: {
  containerTotalNum: number
  textObject?: TextContainerProperty[]
  listObject?: ListContainerProperty[]
  imageObject?: ImageContainerProperty[]
}): Promise<void> {
  if (!bridge) return
  if (!state.startupRendered) {
    await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(config))
    state.startupRendered = true
    return
  }
  await bridge.rebuildPageContainer(new RebuildPageContainer(config))
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function createCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = DISPLAY_WIDTH
  c.height = IMAGE_HEIGHT
  return c
}

function clear(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
}

function font(ctx: CanvasRenderingContext2D, size: number, weight = ''): void {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`.trim()
}

function drawPageDots(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const dotR = 3
  const gap = 12
  const total = SCREENS.length
  const totalW = total * dotR * 2 + (total - 1) * gap
  const startX = (w - totalW) / 2 + dotR
  const y = h - 10

  for (let i = 0; i < total; i++) {
    const x = startX + i * (dotR * 2 + gap)
    ctx.beginPath()
    ctx.arc(x, y, dotR, 0, Math.PI * 2)
    if (i === state.screenIndex) {
      ctx.fillStyle = '#fff'
      ctx.fill()
    } else {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
}

function separator(ctx: CanvasRenderingContext2D, y: number, w: number): void {
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PADDING, y)
  ctx.lineTo(w - PADDING, y)
  ctx.stroke()
  ctx.strokeStyle = '#fff'
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function windLabel(deg: number): string {
  const d = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return d[Math.round(deg / 45) % 8]
}

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
// Screen 0 – 7-day forecast
// ---------------------------------------------------------------------------

function drawForecastScreen(w: WeatherData): number[] {
  const canvas = createCanvas()
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  clear(ctx, W, H)

  // Header
  font(ctx, 15)
  ctx.textAlign = 'left'
  ctx.fillText(w.city, PADDING, 20)
  ctx.textAlign = 'right'
  font(ctx, 15, 'bold')
  ctx.fillText(`${w.currentTemp}\u00B0`, W / 2 + 20, 20)
  font(ctx, 13)
  ctx.fillStyle = '#aaa'
  ctx.fillText(w.currentDescription, W - PADDING, 20)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'

  separator(ctx, 30, W)

  // 7-day columns
  const days = w.daily.slice(0, 7)
  const colW = Math.floor((W - PADDING * 2) / 7)
  const x0 = PADDING
  const y0 = 38

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const x = x0 + i * colW
    const cx = x + colW / 2

    // Column border
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    rr(ctx, x + 2, y0, colW - 4, H - y0 - 26, 8)
    ctx.stroke()

    // Day name
    font(ctx, 12, i === 0 ? 'bold' : '')
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.fillText(i === 0 ? 'Today' : d.day, cx, y0 + 18)

    // Weather icon
    drawWeatherIconAt(ctx, d.wmoCode, cx, y0 + 50, 16)

    // High temp
    font(ctx, 18, 'bold')
    ctx.fillStyle = '#fff'
    ctx.fillText(`${d.tempMax}\u00B0`, cx, y0 + 88)

    // Low temp
    font(ctx, 13)
    ctx.fillStyle = '#888'
    ctx.fillText(`${d.tempMin}\u00B0`, cx, y0 + 106)

    // Precipitation probability
    if (d.precipProb > 0) {
      font(ctx, 10)
      ctx.fillStyle = d.precipProb >= 50 ? '#aaf' : '#777'
      ctx.fillText(`${d.precipProb}%`, cx, y0 + 132)
    }

    // Precipitation amount
    if (d.precipSum > 0) {
      font(ctx, 9)
      ctx.fillStyle = '#666'
      ctx.fillText(`${d.precipSum}mm`, cx, y0 + 148)
    }

    // Wind
    font(ctx, 9)
    ctx.fillStyle = '#777'
    ctx.fillText(`${d.windMax}km/h`, cx, y0 + 172)

    // UV index
    if (d.uvMax > 0) {
      ctx.fillStyle = d.uvMax >= 6 ? '#fff' : '#777'
      ctx.fillText(`UV ${d.uvMax}`, cx, y0 + 188)
    }

    ctx.fillStyle = '#fff'
  }

  ctx.textAlign = 'left'
  drawPageDots(ctx, W, H)
  return canvasToBytes(canvas)
}

// ---------------------------------------------------------------------------
// Screen 1 – Today's details
// ---------------------------------------------------------------------------

function drawNowScreen(w: WeatherData): number[] {
  const canvas = createCanvas()
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  clear(ctx, W, H)

  const y0 = PADDING
  const contentH = H - y0 - 22 // room for page dots
  const gap = 8
  const leftW = Math.floor((W - PADDING * 2 - gap) * 0.33)
  const rightW = W - PADDING * 2 - gap - leftW
  const leftX = PADDING
  const rightX = leftX + leftW + gap

  // Left panel – outlined box with icon, temp, city, description
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  rr(ctx, leftX, y0, leftW, contentH, 8)
  ctx.stroke()

  // Weather icon
  const iconCx = leftX + leftW / 2
  drawWeatherIconAt(ctx, w.currentWmoCode, iconCx, y0 + 60, 40)

  // Temperature
  ctx.textAlign = 'center'
  font(ctx, 36, 'bold')
  ctx.fillStyle = '#fff'
  ctx.fillText(`${w.currentTemp}\u00B0`, iconCx, y0 + 130)

  // City
  font(ctx, 14)
  ctx.fillStyle = '#aaa'
  ctx.fillText(w.city, iconCx, y0 + 155)

  // Description
  font(ctx, 12)
  ctx.fillStyle = '#777'
  ctx.fillText(w.currentDescription, iconCx, y0 + 175)

  ctx.textAlign = 'left'

  // Right panel – 2×3 grid of detail cards
  const cardGap = 6
  const cardW = Math.floor((rightW - cardGap) / 2)
  const cardH = Math.floor((contentH - cardGap * 2) / 3)

  const cards = [
    { label: 'FEELS LIKE', value: `${w.feelsLike}\u00B0C` },
    { label: 'WIND', value: `${w.windSpeed} km/h ${windLabel(w.windDirection)}` },
    { label: 'HUMIDITY', value: `${w.humidity}%` },
    { label: 'PRESSURE', value: `${w.pressure} hPa` },
    { label: 'SUNRISE', value: w.sunrise },
    { label: 'SUNSET', value: w.sunset },
  ]

  for (let i = 0; i < cards.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = rightX + col * (cardW + cardGap)
    const y = y0 + row * (cardH + cardGap)

    ctx.strokeStyle = '#444'
    ctx.lineWidth = 1
    rr(ctx, x, y, cardW, cardH, 8)
    ctx.stroke()

    font(ctx, 10)
    ctx.fillStyle = '#888'
    ctx.fillText(cards[i].label, x + 8, y + 18)

    font(ctx, 17, 'bold')
    ctx.fillStyle = '#fff'
    ctx.fillText(cards[i].value, x + 8, y + 44)
  }

  drawPageDots(ctx, W, H)
  return canvasToBytes(canvas)
}

// ---------------------------------------------------------------------------
// Screen 2 – Precipitation
// ---------------------------------------------------------------------------

function drawRainScreen(w: WeatherData): number[] {
  const canvas = createCanvas()
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  clear(ctx, W, H)

  const hours = w.hourly.slice(0, 24)
  const totalMm = hours.slice(0, 12).reduce((s, h) => s + h.precipMm, 0)

  // Header
  font(ctx, 15)
  ctx.fillText('Precipitation', PADDING, 20)
  ctx.textAlign = 'right'
  font(ctx, 13)
  ctx.fillStyle = '#888'
  ctx.fillText(`${Math.round(totalMm * 10) / 10} mm next 12h`, W - PADDING, 20)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'

  separator(ctx, 30, W)

  // Vertical bar chart
  const count = hours.length
  const chartX = PADDING
  const chartW = W - PADDING * 2
  const barTop = 44
  const barBottom = 242
  const barMaxH = barBottom - barTop
  const slotW = Math.floor(chartW / count)
  const barW = Math.max(4, slotW - 3)

  for (let i = 0; i < count; i++) {
    const h = hours[i]
    const x = chartX + i * slotW
    const cx = x + slotW / 2

    // Bar background
    ctx.fillStyle = '#181818'
    rr(ctx, cx - barW / 2, barTop, barW, barMaxH, 3)
    ctx.fill()

    // Bar fill
    if (h.precipProb > 0) {
      const fillH = Math.max(4, (h.precipProb / 100) * barMaxH)
      const fillY = barBottom - fillH
      ctx.fillStyle = h.precipProb >= 60 ? '#fff' : h.precipProb >= 30 ? '#aaa' : '#555'
      rr(ctx, cx - barW / 2, fillY, barW, fillH, 3)
      ctx.fill()
    }

    // Percentage label on top of significant bars
    if (h.precipProb >= 30) {
      font(ctx, 9)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      const labelY = barBottom - (h.precipProb / 100) * barMaxH - 4
      ctx.fillText(`${h.precipProb}`, cx, labelY)
    }

    // Time labels – show every 3rd hour
    if (i % 3 === 0) {
      font(ctx, 10)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#888'
      ctx.fillText(h.time, cx, 258)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
  }

  drawPageDots(ctx, W, H)
  return canvasToBytes(canvas)
}

// ---------------------------------------------------------------------------
// Screen 3 – Wind
// ---------------------------------------------------------------------------

function drawWindArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: number, size: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  // Rotate so arrow points in the wind direction (dir = where wind comes FROM,
  // so arrow points downwind = dir + 180)
  ctx.rotate(((dir + 180) * Math.PI) / 180)
  const s = size
  ctx.beginPath()
  ctx.moveTo(0, -s)          // tip
  ctx.lineTo(-s * 0.35, s * 0.4)
  ctx.lineTo(0, s * 0.15)
  ctx.lineTo(s * 0.35, s * 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawWindScreen(w: WeatherData): number[] {
  const canvas = createCanvas()
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  clear(ctx, W, H)

  const hours = w.hourly.slice(0, 24)
  const maxSpeed = Math.max(...hours.map((h) => h.windGust), 1)

  // Header
  font(ctx, 15)
  ctx.fillText('Wind', PADDING, 20)
  ctx.textAlign = 'right'
  font(ctx, 13)
  ctx.fillStyle = '#888'
  ctx.fillText(`Now ${w.windSpeed} km/h ${windLabel(w.windDirection)}`, W - PADDING, 20)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'

  separator(ctx, 30, W)

  // Chart area
  const count = hours.length
  const chartX = PADDING + 30 // room for Y-axis labels
  const chartW = W - chartX - PADDING
  const chartTop = 44
  const chartBottom = 230
  const chartH = chartBottom - chartTop
  const slotW = chartW / count

  // Y-axis grid lines + labels
  const gridSteps = 4
  const stepVal = Math.ceil(maxSpeed / gridSteps / 5) * 5
  for (let i = 0; i <= gridSteps; i++) {
    const val = i * stepVal
    const y = chartBottom - (val / (stepVal * gridSteps)) * chartH
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(chartX, y)
    ctx.lineTo(chartX + chartW, y)
    ctx.stroke()

    font(ctx, 9)
    ctx.fillStyle = '#555'
    ctx.textAlign = 'right'
    ctx.fillText(`${val}`, chartX - 4, y + 3)
  }
  ctx.textAlign = 'left'

  // Gust area fill (lighter)
  ctx.beginPath()
  ctx.moveTo(chartX, chartBottom)
  for (let i = 0; i < count; i++) {
    const x = chartX + (i + 0.5) * slotW
    const y = chartBottom - (hours[i].windGust / (stepVal * gridSteps)) * chartH
    if (i === 0) ctx.lineTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineTo(chartX + (count - 0.5) * slotW, chartBottom)
  ctx.closePath()
  ctx.fillStyle = '#1a1a1a'
  ctx.fill()

  // Wind speed area fill
  ctx.beginPath()
  ctx.moveTo(chartX, chartBottom)
  for (let i = 0; i < count; i++) {
    const x = chartX + (i + 0.5) * slotW
    const y = chartBottom - (hours[i].windSpeed / (stepVal * gridSteps)) * chartH
    ctx.lineTo(x, y)
  }
  ctx.lineTo(chartX + (count - 0.5) * slotW, chartBottom)
  ctx.closePath()
  ctx.fillStyle = '#333'
  ctx.fill()

  // Wind speed line
  ctx.beginPath()
  for (let i = 0; i < count; i++) {
    const x = chartX + (i + 0.5) * slotW
    const y = chartBottom - (hours[i].windSpeed / (stepVal * gridSteps)) * chartH
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.stroke()

  // Direction arrows every 3 hours
  for (let i = 0; i < count; i += 3) {
    const x = chartX + (i + 0.5) * slotW
    const y = chartBottom - (hours[i].windSpeed / (stepVal * gridSteps)) * chartH
    ctx.fillStyle = '#fff'
    drawWindArrow(ctx, x, y - 12, hours[i].windDir, 6)
  }

  // Time labels
  for (let i = 0; i < count; i += 3) {
    font(ctx, 10)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#888'
    ctx.fillText(hours[i].time, chartX + (i + 0.5) * slotW, 248)
  }

  // Legend
  font(ctx, 9)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#888'
  ctx.fillText('Speed', chartX, 262)
  ctx.fillStyle = '#555'
  ctx.fillText('Gusts', chartX + 50, 262)

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'

  drawPageDots(ctx, W, H)
  return canvasToBytes(canvas)
}

// ---------------------------------------------------------------------------
// Screen 4 – Hourly forecast
// ---------------------------------------------------------------------------

function drawHoursColumn(
  ctx: CanvasRenderingContext2D,
  hours: { time: string; temp: number; wmoCode: number; precipProb: number }[],
  x0: number,
  colW: number,
  y0: number,
  startLabel: string | null,
): void {
  const rowH = 24
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i]
    const y = y0 + i * rowH

    // Row separator
    if (i > 0) {
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x0 + colW, y)
      ctx.stroke()
    }

    // Time
    font(ctx, 11)
    ctx.fillStyle = '#aaa'
    ctx.textAlign = 'left'
    const label = i === 0 && startLabel ? startLabel : h.time
    ctx.fillText(label, x0, y + 16)

    // Weather icon
    drawWeatherIconAt(ctx, h.wmoCode, x0 + 52, y + 11, 7)

    // Temperature
    font(ctx, 13, 'bold')
    ctx.fillStyle = '#fff'
    ctx.fillText(`${h.temp}\u00B0C`, x0 + 72, y + 16)

    // Condition
    font(ctx, 11)
    ctx.fillStyle = '#888'
    ctx.fillText(wmoShort(h.wmoCode), x0 + 120, y + 16)

    // Precipitation
    if (h.precipProb > 0) {
      ctx.textAlign = 'right'
      ctx.fillStyle = h.precipProb >= 50 ? '#fff' : '#777'
      font(ctx, 11)
      ctx.fillText(`${h.precipProb}%`, x0 + colW, y + 16)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
  }
}

function drawHoursScreen(w: WeatherData): number[] {
  const canvas = createCanvas()
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  clear(ctx, W, H)

  // Header
  font(ctx, 15)
  ctx.fillText('Hourly forecast', PADDING, 20)
  separator(ctx, 30, W)

  const y0 = 38
  const gap = 12
  const colW = Math.floor((W - PADDING * 2 - gap) / 2)
  const rowCount = 10
  const leftHours = w.hourly.slice(0, rowCount)
  const rightHours = w.hourly.slice(rowCount, rowCount * 2)

  // Vertical divider
  const divX = PADDING + colW + gap / 2
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(divX, y0)
  ctx.lineTo(divX, H - 22)
  ctx.stroke()

  drawHoursColumn(ctx, leftHours, PADDING, colW, y0, 'Now')
  drawHoursColumn(ctx, rightHours, PADDING + colW + gap, colW, y0, null)

  drawPageDots(ctx, W, H)
  return canvasToBytes(canvas)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function renderScreen(): number[] | null {
  if (!state.weather) return null
  switch (state.screen) {
    case 'forecast':
      return drawForecastScreen(state.weather)
    case 'now':
      return drawNowScreen(state.weather)
    case 'rain':
      return drawRainScreen(state.weather)
    case 'wind':
      return drawWindScreen(state.weather)
    case 'hours':
      return drawHoursScreen(state.weather)
  }
}

export async function showScreen(): Promise<void> {
  if (!state.weather) {
    await showLoading()
    return
  }

  const imageBytes = renderScreen()
  if (!imageBytes) return

  await rebuildPage({
    containerTotalNum: 2,
    imageObject: [
      new ImageContainerProperty({
        containerID: 1,
        containerName: 'screen',
        xPosition: 0,
        yPosition: 0,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
      }),
    ],
    listObject: [
      // 1x1 hidden list for event capture. With 1 item the user is
      // always at both scroll boundaries, so every swipe immediately
      // fires SCROLL_TOP or SCROLL_BOTTOM.
      new ListContainerProperty({
        containerID: 2,
        containerName: 'evt',
        xPosition: 0,
        yPosition: 0,
        width: 1,
        height: 1,
        borderWidth: 0,
        borderColor: 0,
        borderRdaius: 0,
        paddingLength: 0,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: 1,
          itemWidth: 1,
          isItemSelectBorderEn: 0,
          itemName: [' '],
        }),
      }),
    ],
  })

  await pushImage(imageBytes)
  appendEventLog(`Screen: ${state.screen}`)
}

async function pushImage(bytes: number[]): Promise<void> {
  if (!bridge) return
  const result = await bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: 1,
      containerName: 'screen',
      imageData: bytes,
    }),
  )
  appendEventLog(`Image: ${String(result)}`)
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
        isEventCapture: 0,
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
