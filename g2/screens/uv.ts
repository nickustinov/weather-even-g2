import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH } from '../layout'
import { uvCategory, uvCategoryShort } from '../api'
import { state } from '../state'
import type { HourlyPoint, WeatherData } from '../state'
import {
  CHART_BAR_CHARS,
  CHART_BARS_W,
  CHART_BARS_X,
  CHART_BODY_H,
  CHART_BODY_Y,
  CHART_HEADER_H,
  CHART_HEADLINE_OPTS,
  CHART_HOURS_VISIBLE,
  CHART_LABEL_BOT_H,
  CHART_LABEL_BOT_Y,
  CHART_LABEL_TOP_H,
  CHART_LABEL_TOP_Y,
  CHART_PAD,
  CHART_TIMES_W,
  CHART_TIMES_X,
  CHART_TOTAL_H,
  CHART_TOTAL_W,
  CHART_TOTAL_X,
  CHART_TOTAL_Y,
  CHART_VALUES_W,
  CHART_VALUES_X,
  rebuildPage,
  renderDottedNumberBytes,
  sendImage,
  todayDateString,
} from '../render-shared'

// UV maxes out at ~12 in tropical noon sun; clamp the bar scale to 11 so a
// "very high" reading paints a near-full bar without saturating at 6.
const UV_BAR_MAX = 11

function uvTimesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => h.time).join('\n')
}

function uvBarsText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => {
    const filled = Math.max(0, Math.min(CHART_BAR_CHARS, Math.round((h.uvIndex / UV_BAR_MAX) * CHART_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(CHART_BAR_CHARS - filled)
  }).join('\n')
}

// Use the category word per row so the screen reads as a forecast of *risk*,
// not a row of raw numbers most people don't know how to interpret.
function uvValuesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => {
    const val = h.uvIndex < 10 ? h.uvIndex.toFixed(1) : String(Math.round(h.uvIndex))
    return `${val} ${uvCategoryShort(h.uvIndex)}`
  }).join('\n')
}

// Build the protection-advisory header subtitle: the first and last hour
// today the UV is "moderate" or worse (≥3). Falls back to the category word
// when there's no exposure window (overcast / winter / night).
function protectionWindow(w: WeatherData): string {
  // Walk hours only until the hour-number wraps backwards (= midnight
  // crossed) so the window doesn't span days and report "protect 17:00–16:00".
  const todayWindow: HourlyPoint[] = []
  let prevHour = -1
  for (const h of w.hourly) {
    const hourNum = parseInt(h.time.split(':')[0], 10)
    if (prevHour >= 0 && hourNum < prevHour) break
    todayWindow.push(h)
    prevHour = hourNum
  }
  const protectHours = todayWindow.filter(h => h.uvIndex >= 3)
  if (protectHours.length === 0) return uvCategory(w.hourly[0]?.uvIndex ?? 0)
  const first = protectHours[0].time
  const last = protectHours[protectHours.length - 1].time
  if (first === last) return `protect at ${first}`
  return `protect ${first}–${last}`
}

export async function showUvScreen(w: WeatherData): Promise<void> {
  const current = w.hourly[0]?.uvIndex ?? 0
  const currentStr = current < 10 ? current.toFixed(1) : String(Math.round(current))

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${protectionWindow(w)}`,
        xPosition: CHART_PAD,
        yPosition: 2,
        width: DISPLAY_WIDTH - CHART_PAD * 2,
        height: CHART_HEADER_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'times',
        content: uvTimesText(w),
        xPosition: CHART_TIMES_X,
        yPosition: CHART_BODY_Y,
        width: CHART_TIMES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'bars',
        content: uvBarsText(w),
        xPosition: CHART_BARS_X,
        yPosition: CHART_BODY_Y,
        width: CHART_BARS_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'values',
        content: uvValuesText(w),
        xPosition: CHART_VALUES_X,
        yPosition: CHART_BODY_Y,
        width: CHART_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'uvlabel',
        content: 'uv index',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_LABEL_TOP_Y,
        width: CHART_TOTAL_W,
        height: CHART_LABEL_TOP_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'uvsub',
        content: uvCategory(current),
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_LABEL_BOT_Y,
        width: CHART_TOTAL_W,
        height: CHART_LABEL_BOT_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 7,
        containerName: 'uvnum',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_TOTAL_Y,
        width: CHART_TOTAL_W,
        height: CHART_TOTAL_H,
      }),
    ],
  })

  await sendImage(renderDottedNumberBytes(currentStr, CHART_TOTAL_W, CHART_TOTAL_H, CHART_HEADLINE_OPTS), 7, 'uvnum')
  appendEventLog(`Screen: ${state.screen}`)
}
