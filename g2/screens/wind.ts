import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { t } from '../i18n'
import { DISPLAY_WIDTH } from '../layout'
import { state } from '../state'
import type { WeatherData } from '../state'
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
  CHART_VALUES_X,
  displayTime,
  rebuildPage,
  renderDottedNumberBytes,
  sendImage,
  speedUnit,
  todayDateString,
  windLabel,
} from '../render-shared'

// Arrow shows direction the wind is BLOWING (180° from where it's coming
// FROM). 'n' = northern wind, comes from the north, blows southward → ↓.
// U+2190–U+2199 arrows are confirmed in the firmware font (even-g2-notes).
const WIND_ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘']

// Wind's values column is wider than the shared CHART_VALUES_W because CJK
// locales render 2-char compass labels (北東, 남서) alongside the speed
// digit and arrow. We extend into the 12px gap that normally sits between
// the values column and the big-number column — bars and total stay in the
// same place so swiping between chart screens doesn't shift any layout.
const WIND_VALUES_W = CHART_TOTAL_X - CHART_VALUES_X

function windArrow(deg: number): string {
  return WIND_ARROWS[Math.round(deg / 45) % 8]
}

function windTimesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => displayTime(h.time, true)).join('\n')
}

function windBarsText(w: WeatherData): string {
  const hours = w.hourly.slice(0, CHART_HOURS_VISIBLE)
  const maxSpeed = Math.max(...hours.map(h => h.windGust), 1)
  return hours.map(h => {
    const filled = Math.max(0, Math.min(CHART_BAR_CHARS, Math.round((h.windSpeed / maxSpeed) * CHART_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(CHART_BAR_CHARS - filled)
  }).join('\n')
}

function windValuesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h =>
    `${h.windSpeed} ${windArrow(h.windDir)} ${windLabel(h.windDir)}`
  ).join('\n')
}

export async function showWindScreen(w: WeatherData): Promise<void> {
  const speedStr = String(w.windSpeed)
  const currentArrow = windArrow(w.windDirection)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${t('glasses.wind_gusts', { value: w.windGust, unit: speedUnit() })}`,
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
        content: windTimesText(w),
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
        content: windBarsText(w),
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
        content: windValuesText(w),
        xPosition: CHART_VALUES_X,
        yPosition: CHART_BODY_Y,
        width: WIND_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'windlabel',
        content: t('glasses.label_wind'),
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_LABEL_TOP_Y,
        width: CHART_TOTAL_W,
        height: CHART_LABEL_TOP_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'unit',
        content: `${speedUnit()} ${currentArrow} ${windLabel(w.windDirection)} ${w.windDirection}°`,
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
        containerName: 'total',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_TOTAL_Y,
        width: CHART_TOTAL_W,
        height: CHART_TOTAL_H,
      }),
    ],
  })

  await sendImage(renderDottedNumberBytes(speedStr, CHART_TOTAL_W, CHART_TOTAL_H, CHART_HEADLINE_OPTS), 7, 'total')
  appendEventLog(`Screen: ${state.screen}`)
}
