// The Clawd Crew icon (media/icon.png): Clawd lifting the stage light over
// his head, its beams fanning out, on a 32 x 32 grid in the sprites' colors.
// One letter a pixel; '.' is the tile.

import { TILE } from './sprites.js'

export const ICON_SIZE = 32

const COLORS = {
  o: '#D97757', // Clawd
  k: '#1C1B1A', // ink
  w: '#FFFFFF', // the light
  l: '#C8C3B9', // its shade
  y: '#F2C14E', // beams
  f: '#2c2a27', // the floor
}

const ROWS = [
  '................................',
  '................................',
  '................................',
  '.......www......................',
  '.......www......................',
  '.......www................yyy...',
  '.......www.............yyy......',
  '....wwwwwwwwwwwwk....yy.........',
  '...wwwwkwkwwwwwwkw..............',
  '..lwwwwkkkwwwwwwkww.............',
  '..lwwwwkkkwwwwwwkww..yyyyyyyy...',
  '..lwwwwwwwwwwwwwkww.............',
  '..lwwwwwwwwwwwwwkww.............',
  '...lllllllllllllkl...yy.........',
  '....llllllllllllk......yyy......',
  '..oo............oo........yyy...',
  '..oo............oo..............',
  '..oooooooooooooooo..............',
  '....ookooooookoo................',
  '....ookooooookoo................',
  '....oooooooooooo................',
  '....oooooooooooo................',
  '....oooooooooooo................',
  '....oooooooooooo................',
  '....oooooooooooo................',
  '.....o.o....o.o.................',
  '.....o.o....o.o.................',
  '..ffffffffffffffff..............',
  '................................',
  '................................',
  '................................',
  '................................',
]

// Each pixel's color, row by row; null where the tile shows.
export const ICON = ROWS.map(row => [...row].map(ch => COLORS[ch] ?? null))

// The icon as an SVG document, sized by the element that holds it: runs of a
// color along each row, on the tile.
export const iconSvg = () => {
  const byColor = new Map()
  ICON.forEach((row, y) => {
    let x = 0
    while (x < ICON_SIZE) {
      const color = row[x]
      let n = 1
      while (x + n < ICON_SIZE && row[x + n] === color) n += 1
      if (color) {
        if (!byColor.has(color)) byColor.set(color, [])
        byColor.get(color).push(`M${x} ${y}h${n}v1h-${n}z`)
      }
      x += n
    }
  })
  const paths = [...byColor].map(([color, runs]) => `<path fill="${color}" d="${runs.join('')}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" width="100%" height="100%"><rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="${TILE}"/><g shape-rendering="crispEdges">${paths}</g></svg>`
}
