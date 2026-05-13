import { ImageContainerProperty, TextContainerProperty } from '@evenrealities/even_hub_sdk'
import { DISPLAY_WIDTH } from '../layout'
import { canvasToBytes } from '../icons'
import { drawWeatherIcon } from '../weather-icons'
import { rebuildPage, sendImage } from '../render-shared'

const SETUP_ICON_SIZE = 88
// Text container is roughly sized to the rendered text width so the
// left-aligned LVGL content sits visually centred under the icon. Width
// estimated from firmware char widths (~10px each, 30 chars ≈ 300px).
const SETUP_TEXT_W = 360
const SETUP_TEXT_H = 40
const SETUP_TEXT_TEXT = 'choose a city in the phone app'

export async function showSetupMessage(): Promise<void> {
  const iconX = Math.floor((DISPLAY_WIDTH - SETUP_ICON_SIZE) / 2)
  const iconY = 85
  const textX = Math.floor((DISPLAY_WIDTH - SETUP_TEXT_W) / 2) + 40
  const textY = iconY + SETUP_ICON_SIZE + 5

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'setupMsg',
        content: SETUP_TEXT_TEXT,
        xPosition: textX,
        yPosition: textY,
        width: SETUP_TEXT_W,
        height: SETUP_TEXT_H,
        isEventCapture: 1,
        paddingLength: 4,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 2,
        containerName: 'setupIcon',
        xPosition: iconX,
        yPosition: iconY,
        width: SETUP_ICON_SIZE,
        height: SETUP_ICON_SIZE,
      }),
    ],
  })

  // Render the phosphor sun (WMO 0) at the configured size and push.
  const canvas = document.createElement('canvas')
  canvas.width = SETUP_ICON_SIZE
  canvas.height = SETUP_ICON_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SETUP_ICON_SIZE, SETUP_ICON_SIZE)
  await drawWeatherIcon(ctx, 0, SETUP_ICON_SIZE / 2, SETUP_ICON_SIZE / 2, SETUP_ICON_SIZE)
  await sendImage(canvasToBytes(canvas), 2, 'setupIcon')
}

