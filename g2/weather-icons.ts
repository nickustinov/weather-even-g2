// Phosphor "thin" weather icons rasterised to canvas for the glasses
// display. Thin outlines are the lightest variant — minimal stroke weight
// suits the dotted/textured monochrome aesthetic at small sizes.

import sunSvg from '@phosphor-icons/core/assets/thin/sun-thin.svg?raw'
import cloudSunSvg from '@phosphor-icons/core/assets/thin/cloud-sun-thin.svg?raw'
import cloudSvg from '@phosphor-icons/core/assets/thin/cloud-thin.svg?raw'
import cloudFogSvg from '@phosphor-icons/core/assets/thin/cloud-fog-thin.svg?raw'
import cloudRainSvg from '@phosphor-icons/core/assets/thin/cloud-rain-thin.svg?raw'
import cloudSnowSvg from '@phosphor-icons/core/assets/thin/cloud-snow-thin.svg?raw'
import cloudLightningSvg from '@phosphor-icons/core/assets/thin/cloud-lightning-thin.svg?raw'

type IconKey = 'sun' | 'cloudSun' | 'cloud' | 'cloudFog' | 'cloudRain' | 'cloudSnow' | 'cloudLightning'

const SVGS: Record<IconKey, string> = {
  sun: sunSvg,
  cloudSun: cloudSunSvg,
  cloud: cloudSvg,
  cloudFog: cloudFogSvg,
  cloudRain: cloudRainSvg,
  cloudSnow: cloudSnowSvg,
  cloudLightning: cloudLightningSvg,
}

export function wmoToIconKey(wmoCode: number): IconKey {
  if (wmoCode === 0) return 'sun'
  if (wmoCode <= 2) return 'cloudSun'
  if (wmoCode === 3) return 'cloud'
  if (wmoCode === 45 || wmoCode === 48) return 'cloudFog'
  if (wmoCode >= 51 && wmoCode <= 67) return 'cloudRain'
  if (wmoCode >= 71 && wmoCode <= 77) return 'cloudSnow'
  if (wmoCode >= 80 && wmoCode <= 82) return 'cloudRain'
  if (wmoCode >= 85 && wmoCode <= 86) return 'cloudSnow'
  if (wmoCode >= 95) return 'cloudLightning'
  return 'cloud'
}

const imageCache = new Map<IconKey, HTMLImageElement>()
const loadingCache = new Map<IconKey, Promise<HTMLImageElement>>()

function loadIcon(key: IconKey): Promise<HTMLImageElement> {
  const cached = imageCache.get(key)
  if (cached) return Promise.resolve(cached)
  const loading = loadingCache.get(key)
  if (loading) return loading

  // Dim icons to ~60% brightness (#999) so they sit behind the brighter
  // dotted text + headline instead of competing for visual weight.
  const svg = SVGS[key].replace(/currentColor/g, '#999999')
  const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      imageCache.set(key, img)
      loadingCache.delete(key)
      resolve(img)
    }
    img.onerror = (e) => {
      loadingCache.delete(key)
      reject(e)
    }
    img.src = dataUrl
  })
  loadingCache.set(key, promise)
  return promise
}

// Pre-warm the cache so the first render of a screen doesn't see a one-frame
// blank while SVGs decode.
export function preloadWeatherIcons(): Promise<void> {
  return Promise.all(Object.keys(SVGS).map(k => loadIcon(k as IconKey))).then(() => {})
}

export async function drawWeatherIcon(
  ctx: CanvasRenderingContext2D,
  wmoCode: number,
  cx: number,
  cy: number,
  size: number,
): Promise<void> {
  const img = await loadIcon(wmoToIconKey(wmoCode))
  ctx.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size)
}
