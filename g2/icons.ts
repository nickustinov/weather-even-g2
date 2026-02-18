type IconType = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

function wmoToIconType(code: number): IconType {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code >= 85 && code <= 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

function drawSun(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * r * 0.55, cy + Math.sin(angle) * r * 0.55)
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
    ctx.stroke()
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath()
  ctx.arc(cx - w * 0.25, cy, h * 0.45, 0, Math.PI * 2)
  ctx.arc(cx, cy - h * 0.2, h * 0.55, 0, Math.PI * 2)
  ctx.arc(cx + w * 0.25, cy, h * 0.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(cx - w * 0.35, cy, w * 0.7, h * 0.3)
}

function drawRain(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, s: number): void {
  const saved = ctx.lineWidth
  ctx.lineWidth = Math.max(1, s * 0.15)
  for (let i = 0; i < 5; i++) {
    const x = cx - w / 2 + (i + 0.5) * (w / 5)
    const y = cy + (i % 2) * s * 0.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - s * 0.25, y + s)
    ctx.stroke()
  }
  ctx.lineWidth = saved
}

function drawSnow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, s: number): void {
  for (let i = 0; i < 6; i++) {
    const x = cx - w / 2 + (i + 0.5) * (w / 6)
    const y = cy + (i % 2) * s * 0.7
    ctx.beginPath()
    ctx.arc(x, y, Math.max(1.5, s * 0.2), 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFog(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, s: number): void {
  const saved = ctx.lineWidth
  ctx.lineWidth = Math.max(1, s * 0.2)
  for (let i = 0; i < 4; i++) {
    const y = cy - s * 0.8 + i * s * 0.55
    const offset = i % 2 === 0 ? 0 : s * 0.3
    ctx.beginPath()
    ctx.moveTo(cx - w / 2 + offset, y)
    ctx.lineTo(cx + w / 2 - offset, y)
    ctx.stroke()
  }
  ctx.lineWidth = saved
}

function drawLightning(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.beginPath()
  ctx.moveTo(cx + 0.3 * s, cy)
  ctx.lineTo(cx - 0.3 * s, cy + s * 0.5)
  ctx.lineTo(cx + 0.1 * s, cy + s * 0.5)
  ctx.lineTo(cx - 0.5 * s, cy + s * 1.2)
  ctx.lineTo(cx + 0.2 * s, cy + s * 0.65)
  ctx.lineTo(cx - 0.2 * s, cy + s * 0.65)
  ctx.lineTo(cx + 0.3 * s, cy)
  ctx.fill()
}

export function drawWeatherIconAt(
  ctx: CanvasRenderingContext2D,
  wmoCode: number,
  cx: number,
  cy: number,
  size: number,
): void {
  const saved = { stroke: ctx.strokeStyle, fill: ctx.fillStyle, lw: ctx.lineWidth }
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = Math.max(1, size / 12)

  const type = wmoToIconType(wmoCode)

  // Scale factors so every icon type fills the same bounding box.
  // Sun (clear) naturally spans 2*size; cloud-based icons are smaller,
  // so they get a larger internal scale to compensate.
  const scaleMap: Record<IconType, number> = {
    'clear': 1,
    'partly-cloudy': 1.3,
    'cloudy': 1.5,
    'fog': 1.4,
    'rain': 1.4,
    'snow': 1.4,
    'storm': 1.3,
  }
  const s = size * scaleMap[type]

  switch (type) {
    case 'clear':
      drawSun(ctx, cx, cy, s)
      break
    case 'partly-cloudy':
      drawSun(ctx, cx - s * 0.3, cy - s * 0.25, s * 0.55)
      drawCloud(ctx, cx + s * 0.15, cy + s * 0.15, s, s * 0.5)
      break
    case 'cloudy':
      drawCloud(ctx, cx, cy - s * 0.1, s * 1.1, s * 0.55)
      drawCloud(ctx, cx - s * 0.25, cy + s * 0.2, s * 0.8, s * 0.4)
      break
    case 'fog':
      drawFog(ctx, cx, cy, s * 1.2, s * 0.5)
      break
    case 'rain':
      drawCloud(ctx, cx, cy - s * 0.25, s * 1.1, s * 0.45)
      drawRain(ctx, cx, cy + s * 0.3, s * 0.8, s * 0.35)
      break
    case 'snow':
      drawCloud(ctx, cx, cy - s * 0.25, s * 1.1, s * 0.45)
      drawSnow(ctx, cx, cy + s * 0.3, s * 0.8, s * 0.3)
      break
    case 'storm':
      drawCloud(ctx, cx, cy - s * 0.3, s * 1.1, s * 0.45)
      drawLightning(ctx, cx, cy + s * 0.15, s * 0.5)
      break
  }

  ctx.strokeStyle = saved.stroke
  ctx.fillStyle = saved.fill
  ctx.lineWidth = saved.lw
}

export function canvasToBytes(canvas: HTMLCanvasElement): number[] {
  const dataUrl = canvas.toDataURL('image/png')
  const binary = atob(dataUrl.split(',')[1])
  const bytes: number[] = []
  for (let i = 0; i < binary.length; i++) {
    bytes.push(binary.charCodeAt(i))
  }
  return bytes
}
