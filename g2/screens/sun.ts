import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH } from '../layout'
import { canvasToBytes } from '../icons'
import { getSavedCity } from '../api'
import {
  daysToPhase,
  drawMoon,
  formatHHMM,
  moonDistanceKm,
  moonPhase,
  moonRiseSet,
} from '../moon'
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
const LINE_H = 27

// Left half: sunrise / sunset table + progress bar + day length.
const SUN_LABEL_X = CHART_PAD
const SUN_LABEL_W = 90
const SUN_VALUE_X = SUN_LABEL_X + SUN_LABEL_W
const SUN_VALUE_W = SUN_HALF_W - SUN_VALUE_X - 8
const SUN_TIMES_Y = SUN_BODY_Y + 10
const SUN_TIMES_H = LINE_H * 2 + 12
const SUN_BAR_Y = SUN_TIMES_Y + SUN_TIMES_H + 8
const SUN_BAR_H = 36
const SUN_REMAIN_Y = SUN_BAR_Y + SUN_BAR_H + 4
const SUN_REMAIN_H = LINE_H + 10
const SUN_BAR_CHARS = 12

// Right half: small moon icon top-left + phase/illum next to it, then a
// 4-row stats grid below (rise / set / full in / distance).
const MOON_IMG_SIZE = 80
const MOON_IMG_X = SUN_HALF_W + 8
const MOON_IMG_Y = SUN_BODY_Y + 14
const MOON_HEAD_X = MOON_IMG_X + MOON_IMG_SIZE + 10
const MOON_HEAD_Y = MOON_IMG_Y + 14
const MOON_HEAD_W = DISPLAY_WIDTH - MOON_HEAD_X - 8
const MOON_HEAD_H = LINE_H * 2 + 8

const MOON_STATS_Y = MOON_IMG_Y + MOON_IMG_SIZE + 10
const MOON_STATS_H = LINE_H * 4 + 12
const MOON_STATS_LABEL_X = SUN_HALF_W + 8
const MOON_STATS_LABEL_W = 110
const MOON_STATS_VALUE_X = MOON_STATS_LABEL_X + MOON_STATS_LABEL_W
const MOON_STATS_VALUE_W = DISPLAY_WIDTH - MOON_STATS_VALUE_X - 8

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
  const city = getSavedCity()
  const now = new Date()
  const times = city ? moonRiseSet(now, city.latitude, city.longitude) : { rise: null, set: null }
  const distance = city ? moonDistanceKm(now, city.latitude, city.longitude) : null
  const daysToFull = daysToPhase(0.5, moon.phase)

  const moonHeadText = `${moon.name}\n${moon.illumination}% illuminated`
  const statsLabels = ['moonrise', 'moonset', 'full in', 'distance'].join('\n')
  const statsValues = [
    formatHHMM(times.rise),
    formatHHMM(times.set),
    `${daysToFull} d`,
    distance !== null ? `${distance.toLocaleString()} km` : '–',
  ].join('\n')

  await rebuildPage({
    containerTotalNum: 9,
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
        containerName: 'moonhead',
        content: moonHeadText,
        xPosition: MOON_HEAD_X,
        yPosition: MOON_HEAD_Y,
        width: MOON_HEAD_W,
        height: MOON_HEAD_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 7,
        containerName: 'moonlabels',
        content: statsLabels,
        xPosition: MOON_STATS_LABEL_X,
        yPosition: MOON_STATS_Y,
        width: MOON_STATS_LABEL_W,
        height: MOON_STATS_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 8,
        containerName: 'moonvalues',
        content: statsValues,
        xPosition: MOON_STATS_VALUE_X,
        yPosition: MOON_STATS_Y,
        width: MOON_STATS_VALUE_W,
        height: MOON_STATS_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 9,
        containerName: 'moon',
        xPosition: MOON_IMG_X,
        yPosition: MOON_IMG_Y,
        width: MOON_IMG_SIZE,
        height: MOON_IMG_SIZE,
      }),
    ],
  })

  await sendImage(await renderMoonImage(moon.phase), 9, 'moon')
  appendEventLog(`Screen: ${state.screen}`)
}
