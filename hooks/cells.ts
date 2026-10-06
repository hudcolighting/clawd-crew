// Terminal drawing: each 2 x 2 block of sprite pixels becomes one cell, a
// quadrant glyph in the block's main color over its second, the way the CLI
// draws its own logo, packed as a Raster takes its cells.

import { ICON } from './icon.js'
import { PALETTE, W, framesOf } from './sprites.js'

export const COLUMNS = W / 2
// Sprite rows 0-17: the last two rows only ever hold the SVG's shadow.
export const ROWS = 9

// Indexed by a mask of the lit quadrants: 1 top-left, 2 top-right,
// 4 bottom-left, 8 bottom-right.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const TERMINAL_DEFAULT = 0x01000000

const rgbOf = (hex: string | null | undefined) => (hex ? parseInt(hex.slice(1), 16) : undefined)

// A picture as Raster cells, `colorAt` giving each pixel's 0xRRGGBB, or
// undefined where nothing is drawn.
const pack = (colorAt: (x: number, y: number) => number | undefined, columns: number, rows: number) => {
  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = col * 2
      const y = row * 2
      const pixels = [colorAt(x, y), colorAt(x + 1, y), colorAt(x, y + 1), colorAt(x + 1, y + 1)]
      const counts = new Map<number, number>()
      for (const pixel of pixels) if (pixel !== undefined) counts.set(pixel, (counts.get(pixel) ?? 0) + 1)
      const [fg, bg] = [...counts].sort((a, b) => b[1] - a[1]).map(([color]) => color)
      let mask = 0
      pixels.forEach((pixel, i) => {
        if (pixel !== undefined && pixel !== bg) mask |= 1 << i
      })
      const at = (row * columns + col) * 3
      words[at] = QUADRANTS.charCodeAt(mask)
      words[at + 1] = mask === 0 || fg === undefined ? TERMINAL_DEFAULT : fg
      words[at + 2] = bg ?? TERMINAL_DEFAULT
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

const encode = (grid: Uint8Array) => pack((x, y) => rgbOf(PALETTE[grid[y * W + x] ?? 0]), COLUMNS, ROWS)

const cache = new Map<string, { ms: number; cells: string[] }>()

// Every frame of an animation as Raster cells, and how long each one shows.
export const cellsOf = (mood: string) => {
  const hit = cache.get(mood)
  if (hit) return hit
  const { ms, frames } = framesOf(mood)
  const made = { ms, cells: frames.map(encode) }
  cache.set(mood, made)
  return made
}

// The Clawd Crew icon, cut to what is drawn on it: the terminal stands it on
// no tile, as it does its Clawds.
const ICON_BOX = (() => {
  let left = Infinity
  let top = Infinity
  let right = -1
  let bottom = -1
  ICON.forEach((row, y) =>
    row.forEach((color, x) => {
      if (!color) return
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }),
  )
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
})()

export const ICON_COLUMNS = Math.ceil(ICON_BOX.width / 2)
export const ICON_ROWS = Math.ceil(ICON_BOX.height / 2)

let iconPacked: string | undefined

export const iconCells = () =>
  (iconPacked ??= pack(
    (x, y) => (x < ICON_BOX.width && y < ICON_BOX.height ? rgbOf(ICON[ICON_BOX.top + y]?.[ICON_BOX.left + x]) : undefined),
    ICON_COLUMNS,
    ICON_ROWS,
  ))
