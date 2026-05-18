import {
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { wmoDescription } from '../api'
import { DISPLAY_WIDTH } from '../layout'
import { canvasToBytes } from '../icons'
import { state } from '../state'
import type { HourlyPoint, WeatherData } from '../state'
import { drawWeatherIcon } from '../weather-icons'
import { displayTime, rebuildPage, sendImage, todayDateString } from '../render-shared'

// Vertical 2-column hourly forecast. Each column shows 8 hours with one
// text container per data type (times / temps / percents) and 2 image
// strips for the icons (split 4+4 because 8×27 > 144px image-height cap).
// Per-column text containers guarantee perfect alignment regardless of how
// wide individual values render in the proportional font.

const HOURS_HEADER_H = 38
const HOURS_BODY_Y = HOURS_HEADER_H + 4         // 42
const HOURS_BODY_PAD = 4
const HOURS_ROW_H = 27                          // firmware line height
const HOURS_PER_COL = 8
const HOURS_BODY_H = HOURS_ROW_H * HOURS_PER_COL + HOURS_BODY_PAD * 2  // 224
const HOURS_ICON_DIAMETER = 24

const HOURS_STRIP_ROWS = HOURS_PER_COL / 2      // 4 each
const HOURS_STRIP_H = HOURS_ROW_H * HOURS_STRIP_ROWS  // 108
const HOURS_STRIP1_Y = HOURS_BODY_Y + HOURS_BODY_PAD  // align with text top
const HOURS_STRIP2_Y = HOURS_STRIP1_Y + HOURS_STRIP_H

// Column geometry (within the 288px-wide half of the screen). Gutter +
// times width match CHART_PAD / CHART_TIMES_W on rain/wind so the hours
// container has the same left offset as on those screens.
const HOURS_GUTTER = 8
const HOURS_TIMES_W = 60
const HOURS_ICON_W = 32
// Widths tight around worst-case content (' 100°' = 39px, '100%' = 46px) so
// the visual gap between temp and pct isn't padded by unused container slack.
const HOURS_TEMP_W = 48
const HOURS_PCT_W = 56
const HOURS_GAP = 6
const HOURS_TIMES_X = HOURS_GUTTER
const HOURS_ICON_X = HOURS_TIMES_X + HOURS_TIMES_W + HOURS_GAP
const HOURS_TEMP_X = HOURS_ICON_X + HOURS_ICON_W + HOURS_GAP
const HOURS_PCT_X = HOURS_TEMP_X + HOURS_TEMP_W + HOURS_GAP

const RIGHT_HALF_OFFSET = Math.floor(DISPLAY_WIDTH / 2)

function timesText(hours: HourlyPoint[]): string {
  return hours.map(h => displayTime(h.time, true)).join('\n')
}

function tempsText(hours: HourlyPoint[]): string {
  return hours.map(h => `${h.temp}°`).join('\n')
}

function percentsText(hours: HourlyPoint[]): string {
  return hours.map(h => `${h.precipProb}%`).join('\n')
}

async function renderIconStrip(codes: number[]): Promise<number[]> {
  const canvas = document.createElement('canvas')
  canvas.width = HOURS_ICON_W
  canvas.height = HOURS_ROW_H * codes.length
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < codes.length; i++) {
    const cy = i * HOURS_ROW_H + HOURS_ROW_H / 2
    await drawWeatherIcon(ctx, codes[i], canvas.width / 2, cy, HOURS_ICON_DIAMETER)
  }
  return canvasToBytes(canvas)
}

type ColIds = {
  timesId: number
  tempsId: number
  pctId: number
  icons1Id: number
  icons2Id: number
}

function columnContainers(
  hours: HourlyPoint[],
  xOffset: number,
  ids: ColIds,
  isEventCapture: 0 | 1,
): { text: TextContainerProperty[]; images: ImageContainerProperty[] } {
  const text: TextContainerProperty[] = [
    new TextContainerProperty({
      containerID: ids.timesId,
      containerName: `times-${xOffset}`,
      content: timesText(hours),
      xPosition: xOffset + HOURS_TIMES_X,
      yPosition: HOURS_BODY_Y,
      width: HOURS_TIMES_W,
      height: HOURS_BODY_H,
      isEventCapture,
      paddingLength: HOURS_BODY_PAD,
    }),
    new TextContainerProperty({
      containerID: ids.tempsId,
      containerName: `temps-${xOffset}`,
      content: tempsText(hours),
      xPosition: xOffset + HOURS_TEMP_X,
      yPosition: HOURS_BODY_Y,
      width: HOURS_TEMP_W,
      height: HOURS_BODY_H,
      isEventCapture: 0,
      paddingLength: HOURS_BODY_PAD,
    }),
    new TextContainerProperty({
      containerID: ids.pctId,
      containerName: `pct-${xOffset}`,
      content: percentsText(hours),
      xPosition: xOffset + HOURS_PCT_X,
      yPosition: HOURS_BODY_Y,
      width: HOURS_PCT_W,
      height: HOURS_BODY_H,
      isEventCapture: 0,
      paddingLength: HOURS_BODY_PAD,
    }),
  ]
  const images: ImageContainerProperty[] = [
    new ImageContainerProperty({
      containerID: ids.icons1Id,
      containerName: `icons1-${xOffset}`,
      xPosition: xOffset + HOURS_ICON_X,
      yPosition: HOURS_STRIP1_Y,
      width: HOURS_ICON_W,
      height: HOURS_STRIP_H,
    }),
    new ImageContainerProperty({
      containerID: ids.icons2Id,
      containerName: `icons2-${xOffset}`,
      xPosition: xOffset + HOURS_ICON_X,
      yPosition: HOURS_STRIP2_Y,
      width: HOURS_ICON_W,
      height: HOURS_STRIP_H,
    }),
  ]
  return { text, images }
}

const HEADER_ID = 1
const LEFT_IDS: ColIds = { timesId: 2, tempsId: 3, pctId: 4, icons1Id: 5, icons2Id: 6 }
const RIGHT_IDS: ColIds = { timesId: 7, tempsId: 8, pctId: 9, icons1Id: 10, icons2Id: 11 }

export async function showHoursScreen(w: WeatherData): Promise<void> {
  const visible = w.hourly.slice(0, HOURS_PER_COL * 2)
  const leftHours = visible.slice(0, HOURS_PER_COL)
  const rightHours = visible.slice(HOURS_PER_COL)

  const left = columnContainers(leftHours, 0, LEFT_IDS, 1)
  const right = columnContainers(rightHours, RIGHT_HALF_OFFSET, RIGHT_IDS, 0)

  await rebuildPage({
    containerTotalNum: 11,
    textObject: [
      new TextContainerProperty({
        containerID: HEADER_ID,
        containerName: 'header',
        content: `${w.city.toLowerCase()}  ·  ${w.currentTemp}°  ·  ${todayDateString()}  ·  ${wmoDescription(w.currentWmoCode)}`,
        xPosition: 8,
        yPosition: 2,
        width: DISPLAY_WIDTH - 16,
        height: HOURS_HEADER_H,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      ...left.text,
      ...right.text,
    ],
    imageObject: [
      ...left.images,
      ...right.images,
    ],
  })

  const leftCodes = leftHours.map(h => h.wmoCode)
  const rightCodes = rightHours.map(h => h.wmoCode)
  await sendImage(await renderIconStrip(leftCodes.slice(0, HOURS_STRIP_ROWS)), LEFT_IDS.icons1Id, 'icons-left-1')
  await sendImage(await renderIconStrip(leftCodes.slice(HOURS_STRIP_ROWS)), LEFT_IDS.icons2Id, 'icons-left-2')
  await sendImage(await renderIconStrip(rightCodes.slice(0, HOURS_STRIP_ROWS)), RIGHT_IDS.icons1Id, 'icons-right-1')
  await sendImage(await renderIconStrip(rightCodes.slice(HOURS_STRIP_ROWS)), RIGHT_IDS.icons2Id, 'icons-right-2')

  appendEventLog(`Screen: ${state.screen}`)
}
