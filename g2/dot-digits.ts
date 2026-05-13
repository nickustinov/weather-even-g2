// Dotted 7-segment digit renderer.
//
// Each glyph is laid out on a 6×7 macro cell grid. Every ON cell renders as
// a 3×3 pattern of small square dots, giving the digits a textured LED-matrix
// look similar to the Even watch headline font.
//
// `dotSize` = pixel side of one mini-dot.
// `dotGap`  = gap between mini-dots within a single macro cell.
// `charGap` = extra horizontal gap between consecutive glyphs.
//
// Macro cell size = 3 * dotSize + 2 * dotGap.
// Macro cells are placed flush against each other (no inter-cell gap).

type Glyph = {
  width: number      // number of macro-cell columns
  rows: string[]     // 7 strings of `width` chars ('O' = lit cell, '.' = empty)
}

const ROWS = 7
const SUB_CELLS = 3   // each macro cell = SUB_CELLS × SUB_CELLS mini-dots

// 7-segment digits in a 6×7 cell layout. Horizontals span cols 1–4 at rows 0,
// 3, 6; verticals are at col 0 / col 5, rows 1–2 (top) and 4–5 (bottom).
// Rounded corners (cells at (0,0), (0,5), (3,0), (3,5), (6,0), (6,5) off).
const GLYPHS: Record<string, Glyph> = {
  '0': { width: 6, rows: [
    '.OOOO.',
    'O....O',
    'O....O',
    'O....O',
    'O....O',
    'O....O',
    '.OOOO.',
  ]},
  '1': { width: 4, rows: [
    '.O..',
    '..O.',
    '..O.',
    '..O.',
    '..O.',
    '..O.',
    '..O.',
  ]},
  '2': { width: 6, rows: [
    '.OOOO.',
    '.....O',
    '.....O',
    'OOOOOO',
    'O.....',
    'O.....',
    '.OOOO.',
  ]},
  '3': { width: 6, rows: [
    '.OOOO.',
    '.....O',
    '.....O',
    '.OOOOO ',
    '.....O',
    '.....O',
    '.OOOO.',
  ]},
  '4': { width: 6, rows: [
    'O....O',
    'O....O',
    'O....O',
    '.OOOOO',
    '.....O',
    '.....O',
    '.....O',
  ]},
  '5': { width: 6, rows: [
    '.OOOO.',
    'O.....',
    'O.....',
    'OOOOOO',
    '.....O',
    '.....O',
    'OOOOO.',
  ]},
  '6': { width: 6, rows: [
    '.OOOO.',
    'O.....',
    'O.....',
    'OOOOOO',
    'O....O',
    'O....O',
    '.OOOO.',
  ]},
  '7': { width: 6, rows: [
    'OOOOO.',
    '.....O',
    '....O.',
    '...O..',
    '..O...',
    '..O...',
    '..O...',
  ]},
  '8': { width: 6, rows: [
    '.OOOO.',
    'O....O',
    'O....O',
    '.OOOO.',
    'O....O',
    'O....O',
    '.OOOO.',
  ]},
  '9': { width: 6, rows: [
    '.OOOO.',
    'O....O',
    'O....O',
    '.OOOOO',
    '.....O',
    '.....O',
    '.OOOO.',
  ]},
  '-': { width: 4, rows: [
    '....',
    '....',
    '....',
    'OOOO',
    '....',
    '....',
    '....',
  ]},
  '.': { width: 1, rows: [
    '.',
    '.',
    '.',
    '.',
    '.',
    '.',
    'O',
  ]},
  '°': { width: 4, rows: [
    '.OO.',
    'O..O',
    'O..O',
    '.OO.',
    '....',
    '....',
    '....',
  ]},
  ' ': { width: 2, rows: [
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
  ]},
}

export type DotTextOpts = {
  dotSize?: number   // mini-dot pixel side
  dotGap?: number    // pixel gap between mini-dots within a macro cell
  cellGap?: number   // pixel gap between adjacent macro cells (within a glyph)
  charGap?: number   // extra horizontal gap between glyphs (px)
}

const DEFAULT_DOT = 2
const DEFAULT_GAP = 1
const DEFAULT_CELL_GAP = 1
const DEFAULT_CHAR_GAP = 4

function macroCellSize(opts: DotTextOpts): number {
  const dot = opts.dotSize ?? DEFAULT_DOT
  const gap = opts.dotGap ?? DEFAULT_GAP
  return SUB_CELLS * dot + (SUB_CELLS - 1) * gap
}

function macroCellStride(opts: DotTextOpts): number {
  return macroCellSize(opts) + (opts.cellGap ?? DEFAULT_CELL_GAP)
}

function glyphPixelWidth(glyph: Glyph, opts: DotTextOpts): number {
  const cellGap = opts.cellGap ?? DEFAULT_CELL_GAP
  return glyph.width * macroCellSize(opts) + (glyph.width - 1) * cellGap
}

export function measureDotted(text: string, opts: DotTextOpts = {}): { width: number; height: number } {
  const charGap = opts.charGap ?? DEFAULT_CHAR_GAP
  const cellGap = opts.cellGap ?? DEFAULT_CELL_GAP
  const cell = macroCellSize(opts)

  let width = 0
  let count = 0
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) continue
    width += glyphPixelWidth(g, opts)
    count += 1
  }
  if (count > 1) width += (count - 1) * charGap

  return { width, height: ROWS * cell + (ROWS - 1) * cellGap }
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, opts: DotTextOpts): void {
  const dot = opts.dotSize ?? DEFAULT_DOT
  const gap = opts.dotGap ?? DEFAULT_GAP
  for (let r = 0; r < SUB_CELLS; r++) {
    for (let c = 0; c < SUB_CELLS; c++) {
      ctx.fillRect(x + c * (dot + gap), y + r * (dot + gap), dot, dot)
    }
  }
}

export function drawDotted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: DotTextOpts = {},
): void {
  const charGap = opts.charGap ?? DEFAULT_CHAR_GAP
  const stride = macroCellStride(opts)

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
          drawCell(ctx, cursorX + col * stride, y + row * stride, opts)
        }
      }
    }
    cursorX += glyphPixelWidth(glyph, opts)
    first = false
  }
}

// Pick the largest dotSize whose rendered `text` fits inside maxWidth × maxHeight.
export function autoSizeDotted(
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxDotSize = 6,
  minDotSize = 2,
): DotTextOpts {
  for (let d = maxDotSize; d >= minDotSize; d--) {
    const gap = Math.max(1, Math.floor(d / 3))
    const opts: DotTextOpts = {
      dotSize: d,
      dotGap: gap,
      cellGap: 1,
      charGap: Math.max(2, d),
    }
    const m = measureDotted(text, opts)
    if (m.width <= maxWidth && m.height <= maxHeight) return opts
  }
  return { dotSize: minDotSize, dotGap: 1, cellGap: 1, charGap: 2 }
}
