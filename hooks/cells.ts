// Terminal drawing: each 2 x 2 block of sprite pixels becomes one cell, a
// quadrant glyph in the block's main color over its second, the way the CLI
// draws its own logo, packed as a Raster takes its cells.

import { PALETTE, W, framesOf } from './sprites.js'

export const COLUMNS = W / 2
// Sprite rows 0-17: the last two rows only ever hold the SVG's shadow.
export const ROWS = 9

// Indexed by a mask of the lit quadrants: 1 top-left, 2 top-right,
// 4 bottom-left, 8 bottom-right.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const TERMINAL_DEFAULT = 0x01000000

const rgb = (index: number) => {
  const hex = index ? PALETTE[index] : undefined
  return hex ? parseInt(hex.slice(1), 16) : TERMINAL_DEFAULT
}

const encode = (grid: Uint8Array) => {
  const words = new Uint32Array(COLUMNS * ROWS * 3)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = col * 2
      const y = row * 2
      const pixels = [grid[y * W + x] ?? 0, grid[y * W + x + 1] ?? 0, grid[(y + 1) * W + x] ?? 0, grid[(y + 1) * W + x + 1] ?? 0]
      const counts = new Map<number, number>()
      for (const pixel of pixels) if (pixel) counts.set(pixel, (counts.get(pixel) ?? 0) + 1)
      const [fg = 0, bg = 0] = [...counts].sort((a, b) => b[1] - a[1]).map(([color]) => color)
      let mask = 0
      pixels.forEach((pixel, i) => {
        if (pixel && pixel !== bg) mask |= 1 << i
      })
      const at = (row * COLUMNS + col) * 3
      words[at] = QUADRANTS.charCodeAt(mask)
      words[at + 1] = mask === 0 ? TERMINAL_DEFAULT : rgb(fg)
      words[at + 2] = rgb(bg)
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

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
