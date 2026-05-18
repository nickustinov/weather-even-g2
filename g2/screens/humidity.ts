import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH } from '../layout'
import { humidityComfort } from '../api'
import { t } from '../i18n'
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
  CHART_VALUES_W,
  CHART_VALUES_X,
  displayTime,
  rebuildPage,
  renderDottedNumberBytes,
  sendImage,
  todayDateString,
} from '../render-shared'

function humidityTimesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => displayTime(h.time, true)).join('\n')
}

function humidityBarsText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => {
    const filled = Math.max(0, Math.min(CHART_BAR_CHARS, Math.round((h.humidity / 100) * CHART_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(CHART_BAR_CHARS - filled)
  }).join('\n')
}

// Show humidity % and dew point side by side — % alone is misleading because
// 80% at 5°C feels fine while 80% at 25°C feels swampy. Dew point >18°C is the
// usual "uncomfortable" threshold.
function humidityValuesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h =>
    `${h.humidity}% ${h.dewPoint}°`
  ).join('\n')
}

export async function showHumidityScreen(w: WeatherData): Promise<void> {
  const currentStr = String(w.humidity)
  const comfort = humidityComfort(w.humidity)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${t('glasses.feels_comfort', { comfort })}`,
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
        content: humidityTimesText(w),
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
        content: humidityBarsText(w),
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
        content: humidityValuesText(w),
        xPosition: CHART_VALUES_X,
        yPosition: CHART_BODY_Y,
        width: CHART_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'humlabel',
        content: t('glasses.label_humidity'),
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_LABEL_TOP_Y,
        width: CHART_TOTAL_W,
        height: CHART_LABEL_TOP_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'humsub',
        content: t('glasses.dew', { value: w.hourly[0]?.dewPoint ?? 0 }),
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
        containerName: 'humnum',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_TOTAL_Y,
        width: CHART_TOTAL_W,
        height: CHART_TOTAL_H,
      }),
    ],
  })

  // Dotted font has no '%' glyph — the "humidity" label above carries the unit.
  await sendImage(renderDottedNumberBytes(currentStr, CHART_TOTAL_W, CHART_TOTAL_H, CHART_HEADLINE_OPTS), 7, 'humnum')
  appendEventLog(`Screen: ${state.screen}`)
}
