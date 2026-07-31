import {
  ListContainerProperty,
  ListItemContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../../_shared/log'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '../layout'
import { cityKey, getActiveCity, getCities } from '../api'
import { t } from '../i18n'
import { state } from '../state'
import { rebuildPage } from '../render-shared'

// Full-screen city picker modal. Tap on any weather screen opens this list;
// the user picks a city or scrolls to the first item ("back") to dismiss.

// Marker for the GPS entry. Must come from the firmware's LVGL font — glyphs
// outside it are silently skipped, leaving a blank gap rather than a fallback
// box. U+25CE is in the confirmed Geometric Shapes range; the more obvious
// U+2316 ⌖ is in Miscellaneous Technical, which the font does not carry.
// Coverage table: github.com/nickustinov/even-g2-notes docs/display.md
const CURRENT_MARKER = '◎'

export function buildCityPickerLabels(): string[] {
  const cities = getCities()
  const active = getActiveCity()
  const activeKey = active ? cityKey(active) : ''
  const labels: string[] = [t('glasses.back')]
  for (const c of cities) {
    // The GPS entry is marked with ⌖ and named by the reverse geocoder. Before
    // the first fix it has no name, so it reads as unavailable rather than as
    // a blank row.
    const isCurrent = c.kind === 'current'
    const name = isCurrent
      ? `${CURRENT_MARKER} ${c.name ? cityLabel(c) : t('glasses.location_unavailable')}`
      : cityLabel(c)
    labels.push(cityKey(c) === activeKey ? `• ${name}` : `   ${name}`)
  }
  return labels
}

function cityLabel(c: { name: string; admin1: string; country: string }): string {
  return c.name + (c.admin1 ? `, ${c.admin1}` : '') + (c.country ? `, ${c.country}` : '')
}

export async function showCityPickerScreen(): Promise<void> {
  state.modal = 'cities'
  const labels = buildCityPickerLabels()

  await rebuildPage({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: 1,
        containerName: 'pickerList',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        borderWidth: 0,
        paddingLength: 4,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: labels.length,
          itemWidth: DISPLAY_WIDTH - 10,
          isItemSelectBorderEn: 1,
          itemName: labels,
        }),
      }),
    ],
  })

  appendEventLog(`Modal: cities (${labels.length - 1} entries)`)
}
