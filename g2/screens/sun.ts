import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH } from '../layout'
import { canvasToBytes } from '../icons'
import { drawMoon, moonPhase } from '../moon'
import { state } from '../state'
import type { WeatherData } from '../state'
import {
  CHART_HEADER_H,
  CHART_PAD,
  daylightRemaining,
  dayProgress,
  formatHm,
  rebuildPage,
  sendImage,
  timeToMinutes,
  todayDateString,
} from '../render-shared'

const SUN_BODY_Y = CHART_HEADER_H + 4
const SUN_HALF_W = Math.floor(DISPLAY_WIDTH / 2)

// Left half (sun): label/value rows + progress bar + daylight remaining.
const SUN_LABEL_X = CHART_PAD
const SUN_LABEL_W = 90
const SUN_VALUE_X = SUN_LABEL_X + SUN_LABEL_W
const SUN_VALUE_W = SUN_HALF_W - SUN_VALUE_X - 8
const SUN_TIMES_Y = SUN_BODY_Y + 10
const SUN_TIMES_H = 64                    // 2 rows + paddingLength
const SUN_BAR_Y = SUN_TIMES_Y + SUN_TIMES_H + 8
const SUN_BAR_H = 40
const SUN_REMAIN_Y = SUN_BAR_Y + SUN_BAR_H + 4
const SUN_REMAIN_H = 36

// Each ━/─/● glyph is 20px in the firmware font. 12 chars × 20 = 240px fits
// the 264px content area (272 width − 2×4 padding) with 24px of slack so the
// line doesn't wrap and trigger a scrollbar sliver.
const SUN_BAR_CHARS = 12

// Right half (moon): visual on top, phase + illumination below.
const MOON_AREA_X = SUN_HALF_W
const MOON_AREA_W = DISPLAY_WIDTH - MOON_AREA_X
const MOON_IMG_SIZE = 100
const MOON_IMG_X = MOON_AREA_X + Math.floor((MOON_AREA_W - MOON_IMG_SIZE) / 2)
const MOON_IMG_Y = SUN_BODY_Y + 14
const MOON_TEXT_Y = MOON_IMG_Y + MOON_IMG_SIZE + 8
const MOON_TEXT_H = 70                    // 2 lines + paddingLength

function sunLabels(): string {
  return ['sunrise', 'sunset'].join('\n')
}

function sunValues(w: WeatherData): string {
  return [w.sunrise, w.sunset].join('\n')
}

function sunProgressLine(w: WeatherData): string {
  const pct = dayProgress(w.sunrise, w.sunset)
  const pos = Math.min(SUN_BAR_CHARS - 1, Math.max(0, Math.round(pct * (SUN_BAR_CHARS - 1))))
  let bar = ''
  for (let i = 0; i < SUN_BAR_CHARS; i++) {
    if (i === pos) bar += '●'
    else if (i < pos) bar += '━'
    else bar += '─'
  }
  return bar
}

function dayLengthString(w: WeatherData): string {
  const length = timeToMinutes(w.sunset) - timeToMinutes(w.sunrise)
  return `${formatHm(length)} day  ·  ${daylightRemaining(w.sunrise, w.sunset)} left`
}

async function renderMoonImage(phase: number): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = MOON_IMG_SIZE
  canvas.height = MOON_IMG_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, MOON_IMG_SIZE, MOON_IMG_SIZE)
  drawMoon(ctx, MOON_IMG_SIZE / 2, MOON_IMG_SIZE / 2, MOON_IMG_SIZE / 2 - 4, phase)
  return canvasToBytes(canvas)
}

export async function showSunScreen(w: WeatherData): Promise<void> {
  const moon = moonPhase()

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${w.currentDescription}`,
        xPosition: CHART_PAD,
        yPosition: 2,
        width: DISPLAY_WIDTH - CHART_PAD * 2,
        height: CHART_HEADER_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'sunlabels',
        content: sunLabels(),
        xPosition: SUN_LABEL_X,
        yPosition: SUN_TIMES_Y,
        width: SUN_LABEL_W,
        height: SUN_TIMES_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'sunvalues',
        content: sunValues(w),
        xPosition: SUN_VALUE_X,
        yPosition: SUN_TIMES_Y,
        width: SUN_VALUE_W,
        height: SUN_TIMES_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'sunbar',
        content: sunProgressLine(w),
        xPosition: CHART_PAD,
        yPosition: SUN_BAR_Y,
        width: SUN_HALF_W - CHART_PAD * 2,
        height: SUN_BAR_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'sunremain',
        content: dayLengthString(w),
        xPosition: CHART_PAD,
        yPosition: SUN_REMAIN_Y,
        width: SUN_HALF_W - CHART_PAD * 2,
        height: SUN_REMAIN_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'moontext',
        content: `${moon.name}\n${moon.illumination}% lit`,
        xPosition: MOON_IMG_X,
        yPosition: MOON_TEXT_Y,
        width: DISPLAY_WIDTH - MOON_IMG_X - 4,
        height: MOON_TEXT_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 7,
        containerName: 'moon',
        xPosition: MOON_IMG_X,
        yPosition: MOON_IMG_Y,
        width: MOON_IMG_SIZE,
        height: MOON_IMG_SIZE,
      }),
    ],
  })

  await sendImage(await renderMoonImage(moon.phase), 7, 'moon')
  appendEventLog(`Screen: ${state.screen}`)
}
