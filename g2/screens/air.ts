import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH } from '../layout'
import { aqiCategory } from '../api'
import { state } from '../state'
import type { AirQuality, WeatherData } from '../state'
import {
  CHART_BODY_H,
  CHART_BODY_Y,
  CHART_HEADER_H,
  CHART_HEADLINE_OPTS,
  CHART_LABEL_BOT_H,
  CHART_LABEL_BOT_Y,
  CHART_LABEL_TOP_H,
  CHART_LABEL_TOP_Y,
  CHART_PAD,
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

// "pm2.5" doesn't fit in the 60px labels column the rain/wind screens use
// (it sizes for "20:00"). Stretch the labels column right and shorten the
// bars to compensate, keeping the values + total columns at the same x as
// rain/wind so the layout still feels consistent across screens.
const AIR_LABEL_X = CHART_PAD
const AIR_LABEL_W = 76
const AIR_BARS_X = AIR_LABEL_X + AIR_LABEL_W + 4
const AIR_BARS_W = CHART_VALUES_X - AIR_BARS_X - 4
// One fewer bar segment than rain/wind: the firmware ━ glyph is ~21px wide
// and 8 of them wrap inside this screen's shorter bars column.
const AIR_BAR_CHARS = 7

// Each pollutant's "full bar" value — picked at the EU AQI "poor" boundary so
// a full bar visually maps to a clearly unhealthy reading. CO is in µg/m³
// (Open-Meteo's unit) and runs much higher than the others.
type Pollutant = {
  label: string
  value: number
  scaleMax: number
  unit: string
}

function pollutants(aq: AirQuality): Pollutant[] {
  // Unit "ug" instead of "µg" because the firmware font silently drops the
  // µ glyph — every value would render as " g" otherwise.
  return [
    { label: 'pm2.5', value: aq.pm2_5,           scaleMax: 50,    unit: 'ug' },
    { label: 'pm10',  value: aq.pm10,            scaleMax: 100,   unit: 'ug' },
    { label: 'no2',   value: aq.nitrogenDioxide, scaleMax: 230,   unit: 'ug' },
    { label: 'o3',    value: aq.ozone,           scaleMax: 240,   unit: 'ug' },
    { label: 'so2',   value: aq.sulphurDioxide,  scaleMax: 500,   unit: 'ug' },
    { label: 'co',    value: aq.carbonMonoxide,  scaleMax: 15000, unit: 'ug' },
  ]
}

function labelsText(rows: Pollutant[]): string {
  return rows.map(r => r.label).join('\n')
}

function barsText(rows: Pollutant[]): string {
  return rows.map(r => {
    const filled = Math.max(0, Math.min(AIR_BAR_CHARS, Math.round((r.value / r.scaleMax) * AIR_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(AIR_BAR_CHARS - filled)
  }).join('\n')
}

function valuesText(rows: Pollutant[]): string {
  return rows.map(r => `${formatPollutant(r.value)} ${r.unit}`).join('\n')
}

function formatPollutant(v: number): string {
  // CO ranges in the thousands; everything else fits in 1-decimal under 100.
  if (v >= 1000) return Math.round(v).toLocaleString()
  if (v >= 100) return String(Math.round(v))
  return v.toFixed(1)
}

export async function showAirScreen(w: WeatherData): Promise<void> {
  const aq = w.airQuality
  if (!aq) {
    await rebuildPage({
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          containerID: 1,
          containerName: 'unavailable',
          content: 'air quality data unavailable',
          xPosition: CHART_PAD,
          yPosition: CHART_BODY_Y + 40,
          width: DISPLAY_WIDTH - CHART_PAD * 2,
          height: 64,
          isEventCapture: 1,
          paddingLength: 4,
        }),
      ],
    })
    appendEventLog(`Screen: ${state.screen}`)
    return
  }

  const rows = pollutants(aq)
  const aqiStr = String(aq.euAqi)
  const category = aqiCategory(aq.euAqi)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${category}`,
        xPosition: CHART_PAD,
        yPosition: 2,
        width: DISPLAY_WIDTH - CHART_PAD * 2,
        height: CHART_HEADER_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'labels',
        content: labelsText(rows),
        xPosition: AIR_LABEL_X,
        yPosition: CHART_BODY_Y,
        width: AIR_LABEL_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'bars',
        content: barsText(rows),
        xPosition: AIR_BARS_X,
        yPosition: CHART_BODY_Y,
        width: AIR_BARS_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'values',
        content: valuesText(rows),
        xPosition: CHART_VALUES_X,
        yPosition: CHART_BODY_Y,
        width: CHART_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'aqilabel',
        content: 'air quality',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_LABEL_TOP_Y,
        width: CHART_TOTAL_W,
        height: CHART_LABEL_TOP_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 6,
        containerName: 'aqiunit',
        content: 'eu aqi',
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
        containerName: 'aqinumber',
        xPosition: CHART_TOTAL_X,
        yPosition: CHART_TOTAL_Y,
        width: CHART_TOTAL_W,
        height: CHART_TOTAL_H,
      }),
    ],
  })

  await sendImage(renderDottedNumberBytes(aqiStr, CHART_TOTAL_W, CHART_TOTAL_H, CHART_HEADLINE_OPTS), 7, 'aqinumber')
  appendEventLog(`Screen: ${state.screen}`)
}
