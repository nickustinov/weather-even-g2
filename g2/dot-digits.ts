// Dotted 7-segment digit renderer inspired by the Even watch face headline
// style: each segment is a row/column of square dots with visible gaps,
// reminiscent of an LED-matrix display.
//
// Each glyph is laid out on an 11-row tall dot grid. Width is per-glyph so
// punctuation can be narrower than digits.

type Glyph = {
  width: number     // number of dot columns
  rows: string[]    // ROWS lines, each `width` chars of '.' or 'O'
}

const ROWS = 11

const GLYPHS: Record<string, Glyph> = {
  '0': { width: 7, rows: [
    '.OOOOO.',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    '.OOOOO.',
  ]},
  '1': { width: 7, rows: [
    '...OO..',
    '..OOO..',
    '.OOOO..',
    '...OO..',
    '...OO..',
    '...OO..',
    '...OO..',
    '...OO..',
    '...OO..',
    '...OO..',
    '.OOOOOO',
  ]},
  '2': { width: 7, rows: [
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.OOOOO.',
    'OO.....',
    'OO.....',
    'OO.....',
    'OO.....',
    '.OOOOO.',
  ]},
  '3': { width: 7, rows: [
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.OOOOO.',
  ]},
  '4': { width: 7, rows: [
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
  ]},
  '5': { width: 7, rows: [
    '.OOOOO.',
    'OO.....',
    'OO.....',
    'OO.....',
    'OO.....',
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.OOOOO.',
  ]},
  '6': { width: 7, rows: [
    '.OOOOO.',
    'OO.....',
    'OO.....',
    'OO.....',
    'OO.....',
    '.OOOOO.',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    '.OOOOO.',
  ]},
  '7': { width: 7, rows: [
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
  ]},
  '8': { width: 7, rows: [
    '.OOOOO.',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    '.OOOOO.',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    '.OOOOO.',
  ]},
  '9': { width: 7, rows: [
    '.OOOOO.',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    'OO...OO',
    '.OOOOO.',
    '.....OO',
    '.....OO',
    '.....OO',
    '.....OO',
    '.OOOOO.',
  ]},
  '-': { width: 5, rows: [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    'OOOOO',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
  ]},
  '.': { width: 3, rows: [
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    'OO.',
    'OO.',
  ]},
  '°': { width: 5, rows: [
    '.OOO.',
    'O...O',
    'O...O',
    '.OOO.',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
  ]},
  ' ': { width: 3, rows: [
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
  ]},
}

export type DotTextOpts = {
  dotSize?: number     // pixel side of each dot square
  dotGap?: number      // pixel gap between adjacent dots
  charGap?: number     // extra horizontal gap between glyphs, in pixels
}

const DEFAULT_DOT = 7
const DEFAULT_GAP = 2
const DEFAULT_CHAR_GAP = 6

function glyphPixelWidth(glyph: Glyph, dotSize: number, dotGap: number): number {
  return glyph.width * (dotSize + dotGap) - dotGap
}

export function measureDotted(text: string, opts: DotTextOpts = {}): { width: number; height: number } {
  const dotSize = opts.dotSize ?? DEFAULT_DOT
  const dotGap = opts.dotGap ?? DEFAULT_GAP
  const charGap = opts.charGap ?? DEFAULT_CHAR_GAP

  let width = 0
  let glyphCount = 0
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) continue
    width += glyphPixelWidth(g, dotSize, dotGap)
    glyphCount += 1
  }
  if (glyphCount > 1) width += (glyphCount - 1) * charGap

  const height = ROWS * (dotSize + dotGap) - dotGap
  return { width, height }
}

export function drawDotted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: DotTextOpts = {},
): void {
  const dotSize = opts.dotSize ?? DEFAULT_DOT
  const dotGap = opts.dotGap ?? DEFAULT_GAP
  const charGap = opts.charGap ?? DEFAULT_CHAR_GAP
  const cell = dotSize + dotGap

  let cursorX = x
  let first = true
  for (const ch of text) {
    const glyph = GLYPHS[ch]
    if (!glyph) continue
    if (!first) cursorX += charGap
    for (let row = 0; row < glyph.rows.length; row++) {
      const line = glyph.rows[row]
      for (let col = 0; col < glyph.width; col++) {
        if (line[col] === 'O') {
          ctx.fillRect(cursorX + col * cell, y + row * cell, dotSize, dotSize)
        }
      }
    }
    cursorX += glyphPixelWidth(glyph, dotSize, dotGap)
    first = false
  }
}

// Choose a dot size that makes `text` fit within `maxWidth` and `maxHeight`.
// Honours the ratio dotGap = floor(dotSize / 3) for consistent visual style.
export function autoSizeDotted(
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxDotSize = 10,
  minDotSize = 3,
): DotTextOpts {
  for (let d = maxDotSize; d >= minDotSize; d--) {
    const gap = Math.max(1, Math.floor(d / 3))
    const opts: DotTextOpts = { dotSize: d, dotGap: gap, charGap: Math.max(2, gap * 2) }
    const m = measureDotted(text, opts)
    if (m.width <= maxWidth && m.height <= maxHeight) return opts
  }
  return { dotSize: minDotSize, dotGap: 1, charGap: 2 }
}
