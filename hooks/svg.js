// Draws a Clawd animation as one self-contained SVG: every frame is a group of
// paths, and SMIL flips which group is visible, so the surface animates it on
// its own with no redraw from the plugin.

import { GROUND, H, PALETTE, TILE, W, framesOf } from './sprites.js'

export { TILE }

// Rectangles covering each color of a grid: runs along a row, merged with the
// run straight below while it has the same color, start and width.
const rectsOf = grid => {
  const byColor = new Map()
  let above = new Map()
  for (let y = 0; y < H; y++) {
    const here = new Map()
    let x = 0
    while (x < W) {
      const c = grid[y * W + x]
      if (!c) {
        x += 1
        continue
      }
      let w = 1
      while (x + w < W && grid[y * W + x + w] === c) w += 1
      const key = `${c}:${x}:${w}`
      const rect = above.get(key)
      if (rect) {
        rect[3] += 1
        here.set(key, rect)
      } else {
        const fresh = [x, y, w, 1]
        if (!byColor.has(c)) byColor.set(c, [])
        byColor.get(c).push(fresh)
        here.set(key, fresh)
      }
      x += w
    }
    above = here
  }
  return byColor
}

const frameMarkup = grid =>
  [...rectsOf(grid)]
    .map(([c, rects]) => `<path fill="${PALETTE[c]}" d="${rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')}"/>`)
    .join('')

const escapeXml = text => text.replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch])

const time = t => Number(t.toFixed(4))

// Chromium paints a frame whose document's color scheme differs from the
// page's on an opaque backdrop (white, for a light document in a dark app):
// following the page's scheme keeps the frame see-through.
const FRAME_STYLE =
  '<style>:root{color-scheme:light dark}html,body{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden}svg{display:block}</style>'

// The SVG document for one animation; `title` becomes its hover tooltip.
export const clawdSvg = (name, { title } = {}) => {
  const { ms, frames } = framesOf(name)
  const n = frames.length
  const dur = time((ms * n) / 1000)
  const groups = frames.map((grid, i) => {
    if (n === 1) return `<g>${frameMarkup(grid)}</g>`
    const from = time(i / n)
    const to = time((i + 1) / n)
    const [values, keyTimes] =
      i === 0 ? ['visible;hidden', `0;${to}`] : i === n - 1 ? ['hidden;visible', `0;${from}`] : ['hidden;visible;hidden', `0;${from};${to}`]
    const flip = `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/>`
    return `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${flip}${frameMarkup(grid)}</g>`
  })
  const tooltip = title ? `<title>${escapeXml(title)}</title>` : ''
  const tile = `<rect width="${W}" height="${H}" fill="${TILE}"/><rect x=".25" y=".25" width="${W - 0.5}" height="${H - 0.5}" fill="none" stroke="#33312e" stroke-width=".5"/>`
  const floor = `<rect x="4" y="${GROUND}" width="16" height="1" fill="#fff" opacity=".07"/>`
  // Sized by the element that holds it, an image or a sandboxed frame alike.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${FRAME_STYLE}${tooltip}${tile}<g shape-rendering="crispEdges">${floor}${groups.join('')}</g></svg>`
}
