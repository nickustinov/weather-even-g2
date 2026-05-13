import { TextContainerProperty } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '../layout'
import { state } from '../state'
import type { WeatherData } from '../state'
import { rebuildPage, wmoShort } from '../render-shared'

const HOURS_PER_COL = 9
const COL_WIDTH = Math.floor(DISPLAY_WIDTH / 2)

function formatHoursColumn(hours: WeatherData['hourly'], startLabel: string | null): string {
  const lines: string[] = []
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i]
    const label = i === 0 && startLabel ? startLabel : h.time
    const cond = wmoShort(h.wmoCode)
    const precip = h.precipProb > 0 ? ` · ${h.precipProb}%` : ''
    lines.push(`${label.padEnd(6)}${h.temp}° · ${cond}${precip}`)
  }
  return lines.join('\n')
}

export async function showHoursScreen(w: WeatherData): Promise<void> {
  const leftHours = w.hourly.slice(0, HOURS_PER_COL)
  const rightHours = w.hourly.slice(HOURS_PER_COL, HOURS_PER_COL * 2)
  const leftText = formatHoursColumn(leftHours, 'now')
  const rightText = formatHoursColumn(rightHours, null)

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'left',
        content: leftText,
        xPosition: 0,
        yPosition: 0,
        width: COL_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 6,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'right',
        content: rightText,
        xPosition: COL_WIDTH,
        yPosition: 0,
        width: COL_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 0,
        paddingLength: 6,
      }),
    ],
  })

  appendEventLog(`Screen: ${state.screen}`)
}
