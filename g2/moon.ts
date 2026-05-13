// Moon phase math + canvas rendering. Open-Meteo doesn't provide moon phase
// directly, but it's deterministic from date — synodic period is 29.530588
// days starting from a known new moon. Moonrise/moonset/distance use suncalc
// because those depend on observer lat/lon and proper orbital mechanics.

import SunCalc from 'suncalc'

const SYNODIC_PERIOD_DAYS = 29.530588853
// Known new moon: 2000-01-06 18:14 UTC.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)
const MS_PER_DAY = 1000 * 60 * 60 * 24

export type MoonPhaseInfo = {
  /** 0..1, 0 = new, 0.5 = full, 1 = new again */
  phase: number
  /** Human-readable phase name */
  name: string
  /** 0..100, percent of disk illuminated */
  illumination: number
}

export function moonPhase(date: Date = new Date()): MoonPhaseInfo {
  const days = (date.getTime() - KNOWN_NEW_MOON_MS) / MS_PER_DAY
  const raw = days / SYNODIC_PERIOD_DAYS
  const phase = ((raw % 1) + 1) % 1

  let name: string
  if (phase < 0.02 || phase >= 0.98) name = 'new moon'
  else if (phase < 0.23) name = 'waxing crescent'
  else if (phase < 0.27) name = 'first quarter'
  else if (phase < 0.48) name = 'waxing gibbous'
  else if (phase < 0.52) name = 'full moon'
  else if (phase < 0.73) name = 'waning gibbous'
  else if (phase < 0.77) name = 'last quarter'
  else name = 'waning crescent'

  const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100)
  return { phase, name, illumination }
}

export function daysToPhase(targetPhase: number, currentPhase: number): number {
  let delta = targetPhase - currentPhase
  if (delta <= 0) delta += 1
  return Math.round(delta * SYNODIC_PERIOD_DAYS)
}

export type MoonRiseSet = {
  rise: Date | null
  set: Date | null
}

// Wraps SunCalc.getMoonTimes; suncalc may report no rise/set on some days
// (very high latitudes around solstice) — in which case fields are null.
export function moonRiseSet(date: Date, lat: number, lon: number): MoonRiseSet {
  const r = SunCalc.getMoonTimes(date, lat, lon, false)
  return {
    rise: r.rise instanceof Date ? r.rise : null,
    set: r.set instanceof Date ? r.set : null,
  }
}

export function moonDistanceKm(date: Date, lat: number, lon: number): number {
  return Math.round(SunCalc.getMoonPosition(date, lat, lon).distance)
}

export function formatHHMM(d: Date | null): string {
  if (!d) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// Draws the moon as a filled white disk minus the unlit portion. The
// terminator (line between lit and dark) is a vertical line at the quarters
// and a curved (ellipse-shaped) edge at crescent/gibbous phases.
export function drawMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phase: number,
): void {
  // Full lit disk.
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, 2 * Math.PI)
  ctx.fill()

  if (phase >= 0.49 && phase <= 0.51) return // full moon — no shadow

  // Width of the terminator ellipse: 0 at quarters, r at new moon.
  // |phase - 0.25| or |phase - 0.75| distance from a quarter, normalised to 0..1.
  const distFromQuarter = Math.min(
    Math.abs(phase - 0.25),
    Math.abs(phase - 0.75),
  ) // 0 (quarter) to 0.25 (new/full)
  const ellipseRx = r * (distFromQuarter / 0.25)

  ctx.fillStyle = '#000'

  if (phase < 0.5) {
    // Waxing — shadow on the LEFT.
    ctx.beginPath()
    ctx.arc(cx, cy, r, Math.PI / 2, 3 * Math.PI / 2, false)
    ctx.fill()
    if (phase < 0.25) {
      // Crescent: dark ellipse encroaches on right side.
      ctx.beginPath()
      ctx.ellipse(cx, cy, ellipseRx, r, 0, 0, 2 * Math.PI)
      ctx.fill()
    } else {
      // Gibbous: lit ellipse carves out part of the left dark.
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(cx, cy, ellipseRx, r, 0, 0, 2 * Math.PI)
      ctx.fill()
    }
  } else {
    // Waning — shadow on the RIGHT.
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false)
    ctx.fill()
    if (phase > 0.75) {
      // Crescent: dark ellipse encroaches on left.
      ctx.beginPath()
      ctx.ellipse(cx, cy, ellipseRx, r, 0, 0, 2 * Math.PI)
      ctx.fill()
    } else {
      // Gibbous: lit ellipse carves out part of the right dark.
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(cx, cy, ellipseRx, r, 0, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
}
