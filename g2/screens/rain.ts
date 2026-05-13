import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
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
  CHART_VALUES_W,
  CHART_VALUES_X,
  precipUnit,
  rebuildPage,
  renderDottedNumberBytes,
  sendImage,
} from '../render-shared'

function rainTimesText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => h.time).join('\n')
}

function rainBarsText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => {
    const filled = Math.max(0, Math.min(CHART_BAR_CHARS, Math.round((h.precipProb / 100) * CHART_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(CHART_BAR_CHARS - filled)
  }).join('\n')
}

function rainPercentsText(w: WeatherData): string {
  return w.hourly.slice(0, CHART_HOURS_VISIBLE).map(h => `${h.precipProb}%`).join('\n')
}

function rainPeakLine(w: WeatherData): string {
  const next = w.hourly.slice(0, 12)
  if (next.length === 0) return ''
  const peak = next.reduce((best, h) => h.precipProb > best.precipProb ? h : best, next[0])
  if (peak.precipProb === 0) return 'no rain expected'
  return `peak ${peak.precipProb}% at ${peak.time}`
}

export async function showRainScreen(w: WeatherData): Promise<void> {
  const totalRaw = w.daily[0]?.precipSum ?? 0
  // 1 decimal under 10 ("0.5"), integer at 10+ ("12", "999"). Always ≤ 3
  // chars so the fixed CHART_HEADLINE_OPTS dotSize never overflows.
  const totalStr = totalRaw < 10 ? totalRaw.toFixed(1) : Math.round(totalRaw).toString()

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${rainPeakLine(w)}`,
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
        content: rainTimesText(w),
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
        content: rainBarsText(w),
        xPosition: CHART_BARS_X,
        yPosition: CHART_BODY_Y,
        width: CHART_BARS_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'percents',
        content: rainPercentsText(w),
        xPosition: CHART_VALUES_X,
        yPosition: CHART_BODY_Y,
        width: CHART_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'preciplabel',
        content: 'precipitation',
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
        content: `${precipUnit()} today`,
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

  await sendImage(renderDottedNumberBytes(totalStr, CHART_TOTAL_W, CHART_TOTAL_H, CHART_HEADLINE_OPTS), 7, 'total')
  appendEventLog(`Screen: ${state.screen}`)
}
