import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { t } from '../i18n'
import { DISPLAY_WIDTH } from '../layout'
import { state } from '../state'
import type { HourlyPoint, WeatherData } from '../state'
import {
  CHART_BAR_CHARS,
  CHART_BARS_W,
  CHART_BARS_X,
  CHART_BODY_H,
  CHART_BODY_Y,
  CHART_HEADER_H,
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
  formatPressureValue,
  pressureUnitLabel,
  rebuildPage,
  renderDottedNumberBytes,
  sendImage,
  todayDateString,
} from '../render-shared'

// Pressure scale: clamp the bars to a fixed 980–1040 hPa window (the typical
// dynamic range) and only widen if the actual hourly readings drift beyond
// it. Stops a calm "999, 1000, 1001" sequence from drawing dramatic bars.
const PRESSURE_FLOOR = 980
const PRESSURE_CEIL = 1040

function trendLabel(w: WeatherData): string {
  const hours = w.hourly.slice(0, CHART_HOURS_VISIBLE)
  if (hours.length < 2) return t('pressure_trend.steady')
  const delta = hours[hours.length - 1].pressure - hours[0].pressure
  if (delta >= 2) return t('pressure_trend.rising')
  if (delta <= -2) return t('pressure_trend.falling')
  return t('pressure_trend.steady')
}

function pressureTimesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => displayTime(h.time, true)).join('\n')
}

function pressureBarsText(w: WeatherData): string {
  const hours = w.hourly.slice(0, CHART_HOURS_VISIBLE)
  const lo = Math.min(PRESSURE_FLOOR, ...hours.map(h => h.pressure))
  const hi = Math.max(PRESSURE_CEIL, ...hours.map(h => h.pressure))
  const span = Math.max(hi - lo, 1)
  return hours.map(h => {
    const ratio = (h.pressure - lo) / span
    const filled = Math.max(0, Math.min(CHART_BAR_CHARS, Math.round(ratio * CHART_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(CHART_BAR_CHARS - filled)
  }).join('\n')
}

function pressureValuesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE)
    .map((h: HourlyPoint) => formatPressureValue(h.pressure))
    .join('\n')
}

export async function showPressureScreen(w: WeatherData): Promise<void> {
  const currentStr = formatPressureValue(w.pressure)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${trendLabel(w)}`,
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
        content: pressureTimesText(w),
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
        content: pressureBarsText(w),
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
        content: pressureValuesText(w),
        xPosition: CHART_VALUES_X,
        yPosition: CHART_BODY_Y,
        width: CHART_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'preslabel',
        content: t('glasses.label_pressure'),
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_LABEL_TOP_Y,
        width: CHART_TOTAL_W,
        height: CHART_LABEL_TOP_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'pressub',
        content: pressureUnitLabel(),
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
        containerName: 'presnum',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_TOTAL_Y,
        width: CHART_TOTAL_W,
        height: CHART_TOTAL_H,
      }),
    ],
  })

  // Tight charGap so 4-char values ("1024", "29.9") fit CHART_TOTAL_W=216
  // at dotSize=2 (the chart-screen default). Without a fixed opts the
  // shared renderDottedNumberBytes autosizer bottoms out at dotSize=5, way
  // too big for this column.
  const PRESSURE_HEADLINE_OPTS = { dotSize: 2, dotGap: 1, cellGap: 1, charGap: 4 }
  await sendImage(
    renderDottedNumberBytes(currentStr, CHART_TOTAL_W, CHART_TOTAL_H, PRESSURE_HEADLINE_OPTS),
    7,
    'presnum',
  )
  appendEventLog(`Screen: ${state.screen}`)
}
