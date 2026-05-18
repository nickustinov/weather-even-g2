import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH } from '../layout'
import {
  aqiCategory,
  getAqiScale,
  hasPollenData,
  pollenScaleMax,
  pollenSpeciesLabel,
} from '../api'
import { t } from '../i18n'
import { state } from '../state'
import type { AirQuality, Pollen, WeatherData } from '../state'
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

// "pm2.5" and "mugwort" don't fit in the 60px labels column rain/wind use;
// stretch the labels column and shrink the bars to compensate. Values + AQI
// columns stay at the same x as the other chart screens.
const AIR_LABEL_X = CHART_PAD
const AIR_LABEL_W = 88
const AIR_BARS_X = AIR_LABEL_X + AIR_LABEL_W + 4
const AIR_BARS_W = CHART_VALUES_X - AIR_BARS_X - 4
// Pollen-row block sits lower than the body top so it visually balances
// against the big AQI digit on the right (which itself starts at y=120).
const AIR_BODY_Y = CHART_BODY_Y + 25
// One fewer bar segment than rain/wind: the firmware ━ glyph is ~21px wide
// and 8 of them wrap inside this screen's shorter bars column.
const AIR_BAR_CHARS = 6

type Row = { label: string; value: number; scaleMax: number; suffix: string }

function pollenRows(p: Pollen): Row[] {
  // Show every species that has data (null = not in coverage area), even if
  // the value is 0 — a "0" reading is informative ("no birch today").
  const species: (keyof Pollen)[] = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed']
  const rows: Row[] = []
  for (const s of species) {
    const v = p[s]
    if (v === null) continue
    rows.push({ label: pollenSpeciesLabel(s), value: v, scaleMax: pollenScaleMax(s), suffix: '' })
  }
  return rows
}

function pollutantRows(aq: AirQuality): Row[] {
  return [
    { label: 'pm2.5', value: aq.pm2_5,           scaleMax: 50,    suffix: 'ug' },
    { label: 'pm10',  value: aq.pm10,            scaleMax: 100,   suffix: 'ug' },
    { label: 'no2',   value: aq.nitrogenDioxide, scaleMax: 230,   suffix: 'ug' },
    { label: 'o3',    value: aq.ozone,           scaleMax: 240,   suffix: 'ug' },
    { label: 'so2',   value: aq.sulphurDioxide,  scaleMax: 500,   suffix: 'ug' },
    { label: 'co',    value: aq.carbonMonoxide,  scaleMax: 15000, suffix: 'ug' },
  ]
}

function labelsText(rows: Row[]): string {
  return rows.map(r => r.label).join('\n')
}

function barsText(rows: Row[]): string {
  return rows.map(r => {
    const filled = Math.max(0, Math.min(AIR_BAR_CHARS, Math.round((r.value / r.scaleMax) * AIR_BAR_CHARS)))
    return '━'.repeat(filled) + '─'.repeat(AIR_BAR_CHARS - filled)
  }).join('\n')
}

function valuesText(rows: Row[]): string {
  return rows.map(r => {
    const v = formatValue(r.value)
    return r.suffix ? `${v} ${r.suffix}` : v
  }).join('\n')
}

function formatValue(v: number): string {
  if (v >= 1000) return Math.round(v).toLocaleString()
  if (v >= 100) return String(Math.round(v))
  if (v >= 10) return v.toFixed(1)
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
          content: t('glasses.air_unavailable'),
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

  const usePollen = hasPollenData(aq.pollen)
  const rows = usePollen ? pollenRows(aq.pollen) : pollutantRows(aq)
  const scale = getAqiScale()
  const aqiValue = scale === 'us' ? aq.usAqi : aq.euAqi
  const aqiStr = String(aqiValue)

  // Header subtitle is always the AQI category so users see the overall
  // air-quality reading at a glance. The pollen detail (which species is
  // elevated and by how much) is fully visible in the bars + values column.
  const headerExtra = aqiCategory(aqiValue)

  await rebuildPage({
    containerTotalNum: 7,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${headerExtra}`,
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
        yPosition: AIR_BODY_Y,
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
        yPosition: AIR_BODY_Y,
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
        yPosition: AIR_BODY_Y,
        width: CHART_VALUES_W,
        height: CHART_BODY_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'aqilabel',
        content: t('glasses.label_air_quality'),
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
        content: scale === 'us' ? t('glasses.us_aqi') : t('glasses.eu_aqi'),
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
