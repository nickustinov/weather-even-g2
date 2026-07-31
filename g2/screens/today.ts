import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { wmoSummary } from '../api'
import { t } from '../i18n'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '../layout'
import { state } from '../state'
import type { WeatherData } from '../state'
import {
  daylightRemaining,
  displayTime,
  formatPressure,
  rebuildPage,
  sendImage,
  speedUnit,
  todayDateString,
  windLabel,
} from '../render-shared'
import type { DotTextOpts } from '../dot-digits'
import { drawDotted, measureDotted } from '../dot-digits'
import { canvasToBytes } from '../icons'
import { drawWeatherIcon } from '../weather-icons'

const TODAY_PAD = 8
const TODAY_HEADER_Y = 0
const TODAY_HEADER_H = 38
const TODAY_BODY_Y = TODAY_HEADER_H + 4

// Left half: big dotted temp + combined range/daylight subtitle. Body shifts
// 12px below the centred position; range gets an additional 10px on top.
const TODAY_BODY_TOP_GAP = 12
const TODAY_RANGE_EXTRA_GAP = 10
const TODAY_TEMP_W = Math.floor(DISPLAY_WIDTH / 2) - TODAY_PAD * 2
const TODAY_TEMP_H = 130
const TODAY_RANGE_H = 64
const TODAY_LEFT_TOTAL_H = TODAY_TEMP_H + 4 + TODAY_RANGE_H
const TODAY_TEMP_X = TODAY_PAD
const TODAY_TEMP_Y = Math.floor((DISPLAY_HEIGHT - TODAY_LEFT_TOTAL_H) / 2) + TODAY_BODY_TOP_GAP
const TODAY_RANGE_Y = TODAY_TEMP_Y + TODAY_TEMP_H + 4 + TODAY_RANGE_EXTRA_GAP

// Right half: stats grid (label + value columns).
const TODAY_RIGHT_X = Math.floor(DISPLAY_WIDTH / 2) + TODAY_PAD
const TODAY_RIGHT_W = DISPLAY_WIDTH - TODAY_RIGHT_X - TODAY_PAD
const TODAY_STATS_Y = TODAY_BODY_Y + TODAY_BODY_TOP_GAP
const TODAY_STATS_H = DISPLAY_HEIGHT - TODAY_STATS_Y - TODAY_PAD
const TODAY_STAT_LABEL_W = 90
const TODAY_STAT_VALUE_X = TODAY_RIGHT_X + TODAY_STAT_LABEL_W
const TODAY_STAT_VALUE_W = TODAY_RIGHT_W - TODAY_STAT_LABEL_W

const TODAY_CONDITION_ICON_SIZE = 58

// The condition icon is composited into the headline canvas rather than given
// its own container. Every updateImageRawData call costs ~104ms of fixed
// overhead on hardware regardless of payload size, so a single 281x141 send
// beats a 272x130 plus a 58x58 — the extra ~450 bytes of gray4 cost about 2ms.
//
// Dimensions are the worst case over all temperatures ("100°" pushes the icon
// furthest right, and the icon hangs ~11px below the text box). Both stay
// inside the 288x144 image-container limit, clear of the stats column at
// x=296 and of the range row below.
const TODAY_HEADLINE_W = 281
const TODAY_HEADLINE_H = 141

// Today's headline is slightly larger than the chart screens but still fixed
// so swiping between values doesn't rescale. d=3 macro cell = 11px, '100°'
// renders at ~245px which fits the 260px content area.
const TODAY_HEADLINE_OPTS: DotTextOpts = { dotSize: 3, dotGap: 1, cellGap: 1, charGap: 12 }

// Computes the screen position of the ° glyph in the rendered headline, used
// to anchor the condition icon. With the dotted font's per-glyph widths
// (digit=6 cells, '1'=4 cells, °=4 cells) the offset isn't a clean per-char
// constant — we measure the prefix exactly using the same opts autoSize
// picks at render time.
function todayDegreePosition(temp: number): { x: number; y: number } {
  const text = `${temp}°`
  const charGap = TODAY_HEADLINE_OPTS.charGap ?? 3
  const prefix = text.slice(0, -1)
  const prefixWidth = measureDotted(prefix, TODAY_HEADLINE_OPTS).width
  const measured = measureDotted(text, TODAY_HEADLINE_OPTS)
  // The headline is drawn at x=4 inside the temp canvas, vertically
  // centered. Icon sits below the visible glyph bounds.
  const yOffset = Math.floor((TODAY_TEMP_H - measured.height) / 2)
  // 3-char temps ("105", "-12") push the icon past the right-side stats
  // column; shift back 10px to keep the icon inside the headline area.
  const wideAdjust = String(temp).length >= 3 ? -20 : 0
  return {
    x: TODAY_TEMP_X + 4 + prefixWidth + charGap + 14 + wideAdjust,
    y: TODAY_TEMP_Y + yOffset + measured.height - 23,
  }
}

// Draws the big dotted temperature and the condition icon onto one canvas.
// Content is positioned using the ORIGINAL 272x130 text box rather than the
// enlarged canvas, so nothing moves on screen relative to the two-container
// version — the canvas only grew to cover where the icon already sat.
async function renderTodayHeadlineBytes(text: string, wmoCode: number, isDay: boolean): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = TODAY_HEADLINE_W
  canvas.height = TODAY_HEADLINE_H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, TODAY_HEADLINE_W, TODAY_HEADLINE_H)

  const m = measureDotted(text, TODAY_HEADLINE_OPTS)
  ctx.fillStyle = '#999'
  drawDotted(ctx, text, 4, Math.floor((TODAY_TEMP_H - m.height) / 2), TODAY_HEADLINE_OPTS)

  // Same absolute position as the old standalone container, expressed
  // relative to the canvas origin.
  const { x, y } = todayDegreePosition(Number(text.replace('°', '')))
  const half = TODAY_CONDITION_ICON_SIZE / 2
  await drawWeatherIcon(
    ctx,
    wmoCode,
    x - TODAY_TEMP_X + half,
    y - TODAY_TEMP_Y + half,
    TODAY_CONDITION_ICON_SIZE,
    isDay,
  )
  return canvasToBytes(canvas)
}

function todayHeader(w: WeatherData): string {
  return `${w.city.toLowerCase()}  ·  ${todayDateString()}  ·  ${wmoSummary(w.currentWmoCode, w.currentCloudCover).toLowerCase()}`
}

function todayRangeAndDaylight(today: WeatherData['daily'][number], w: WeatherData): string {
  const range = `↑ ${today.tempMax}°    ↓ ${today.tempMin}°`
  // "0m of daylight left" is misleading during polar day, and there is no
  // meaningful remaining figure during polar night either.
  const daylight = w.polarDay ? t('glasses.polar_day')
    : w.polarNight ? t('glasses.polar_night')
    : t('glasses.daylight_left', { value: daylightRemaining(w.sunrise, w.sunset) })
  return `${range}\n${daylight}`
}

function todayStatLabels(): string {
  return [
    t('glasses.stat_feels'),
    t('glasses.stat_wind'),
    t('glasses.stat_humid'),
    t('glasses.stat_press'),
    t('glasses.stat_rise'),
    t('glasses.stat_set'),
    t('glasses.stat_uv'),
  ].join('\n')
}

function todayStatValues(w: WeatherData, today: WeatherData['daily'][number]): string {
  return [
    `${w.feelsLike}°`,
    `${w.windSpeed} ${speedUnit()} ${windLabel(w.windDirection)}`,
    `${w.humidity}%`,
    formatPressure(w.pressure),
    displayTime(w.sunrise),
    displayTime(w.sunset),
    String(Math.round(today.uvMax)),
  ].join('\n')
}

export async function showTodayScreen(w: WeatherData): Promise<void> {
  const today = w.daily[0]
  if (!today) return

  const headlineText = `${w.currentTemp}°`

  await rebuildPage({
    containerTotalNum: 5,
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
        width: TODAY_HEADLINE_W,
        height: TODAY_HEADLINE_H,
      }),
    ],
  })

  await sendImage(
    await renderTodayHeadlineBytes(headlineText, w.currentWmoCode, w.currentIsDay),
    5,
    'headline',
  )
  appendEventLog(`Screen: ${state.screen}`)
}
