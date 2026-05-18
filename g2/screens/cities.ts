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

export function buildCityPickerLabels(): string[] {
  const cities = getCities()
  const active = getActiveCity()
  const labels: string[] = [t('glasses.back')]
  for (const c of cities) {
    const isActive = active && cityKey(c) === cityKey(active)
    const name = c.name + (c.admin1 ? `, ${c.admin1}` : '') + (c.country ? `, ${c.country}` : '')
    labels.push(isActive ? `• ${name}` : `   ${name}`)
  }
  return labels
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
