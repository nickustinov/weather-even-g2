import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '../layout'
import { state } from '../state'
import type { WeatherData } from '../state'
import {
  daylightRemaining,
  formatPressure,
  rebuildPage,
  renderDottedNumberBytes,
  renderWeatherIconBytes,
  sendImage,
  speedUnit,
  todayDateString,
  windLabel,
} from '../render-shared'
import type { DotTextOpts } from '../dot-digits'
import { measureDotted } from '../dot-digits'
import { showLoading } from './idle'

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

const TODAY_CONDITION_ICON_SIZE = 48

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
  // renderDottedNumberBytes draws at x=4 inside the temp canvas, vertically
  // centered. Icon sits below the visible glyph bounds.
  const yOffset = Math.floor((TODAY_TEMP_H - measured.height) / 2)
  return {
    x: TODAY_TEMP_X + 4 + prefixWidth + charGap - 6,
    y: TODAY_TEMP_Y + yOffset + measured.height - 28,
  }
}

function todayHeader(w: WeatherData): string {
  return `${w.city.toLowerCase()}  ·  ${todayDateString()}  ·  ${w.currentDescription.toLowerCase()}`
}

function todayRangeAndDaylight(today: WeatherData['daily'][number], w: WeatherData): string {
  const range = `↑ ${today.tempMax}°    ↓ ${today.tempMin}°`
  const daylight = `${daylightRemaining(w.sunrise, w.sunset)} daylight left`
  return `${range}\n${daylight}`
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

export async function showTodayScreen(w: WeatherData): Promise<void> {
  const today = w.daily[0]
  if (!today) {
    await showLoading()
    return
  }

  const headlineText = `${w.currentTemp}°`
  const { x: conditionIconX, y: conditionIconY } = todayDegreePosition(w.currentTemp)

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

  await sendImage(renderDottedNumberBytes(headlineText, TODAY_TEMP_W, TODAY_TEMP_H, TODAY_HEADLINE_OPTS), 5, 'headline')
  await sendImage(await renderWeatherIconBytes(w.currentWmoCode, TODAY_CONDITION_ICON_SIZE), 6, 'condition')
  appendEventLog(`Screen: ${state.screen}`)
}
