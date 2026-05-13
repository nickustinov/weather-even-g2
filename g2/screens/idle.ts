import { TextContainerProperty } from '@evenrealities/even_hub_sdk'
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '../layout'
import { rebuildPage } from '../render-shared'

export async function showSetupMessage(): Promise<void> {
  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'setup',
        content: 'no city selected.\n\nopen weather in your phone browser and choose a city for the forecast.',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 6,
      }),
    ],
  })
}

export async function showLoading(): Promise<void> {
  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'loading',
        content: 'loading weather...',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 4,
      }),
    ],
  })
}
