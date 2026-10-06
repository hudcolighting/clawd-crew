// The desktop's Clawd: the same pixel art as the SVG sprites, drawn as boxes
// of color by a surface module and stepped by the surface's own frame clock.
// An SVG sprite is a frame the app rebuilds when the pane redraws, which
// restarts its animation; this instance outlives the pane's redraws, and a
// new mood just reaches it as new props.

import type { ClientSurface } from 'claude-code'

import { FLOOR, GROUND, H, PALETTE, TILE, W, framesOf } from './sprites.js'

export type SpriteProps = { mood: string; size: 'session' | 'helper' | 'tiny' }

type State = { mood: string; frame: number; epoch: number }

// One art pixel, in cells: roughly square in a code font whose line is about
// twice as tall as a character is wide.
const PIXEL = {
  session: { w: 0.5, h: 0.25 },
  helper: { w: 0.375, h: 0.1875 },
  // A helper in a crowd.
  tiny: { w: 0.25, h: 0.125 },
} as const

const TICK_MS = 100
// The canvas's last row is always empty: the floor is the row above it.
const ROWS = H - 1

type Run = [color: string | null, length: number]
type Band = { rows: number; runs: Run[]; sig: string }

const colorAt = (grid: Uint8Array, x: number, y: number) => {
  const index = grid[y * W + x] ?? 0
  if (index) return PALETTE[index] ?? null
  return y === GROUND && x >= 4 && x < W - 4 ? FLOOR : null
}

// A frame as bands: runs of one color along a row, and identical rows merged.
const bandsOf = (grid: Uint8Array) => {
  const bands: Band[] = []
  for (let y = 0; y < ROWS; y++) {
    const runs: Run[] = []
    let x = 0
    while (x < W) {
      const color = colorAt(grid, x, y)
      let n = 1
      while (x + n < W && colorAt(grid, x + n, y) === color) n += 1
      runs.push([color, n])
      x += n
    }
    const sig = JSON.stringify(runs)
    const last = bands[bands.length - 1]
    if (last && last.sig === sig) last.rows += 1
    else bands.push({ rows: 1, runs, sig })
  }
  return bands
}

const animations = new Map<string, { ms: number; frames: Band[][] }>()

const animationOf = (mood: string) => {
  let held = animations.get(mood)
  if (!held) {
    const { ms, frames } = framesOf(mood)
    held = { ms, frames: frames.map(bandsOf) }
    animations.set(mood, held)
  }
  return held
}

// Surfaces whose clock is already running: the function is called again for
// the same instance on every redraw, and the clock must start only once.
const started = new WeakSet<object>()

export default function ClawdSprite(props: SpriteProps, surface: ClientSurface<State>) {
  const { Box } = surface.elements
  const pixel = PIXEL[props.size] ?? PIXEL.session

  if (!started.has(surface)) {
    started.add(surface)
    let t = 0
    let epoch = -1
    surface.every(TICK_MS, () => {
      const held = surface.state
      if (!held) return
      if (held.epoch !== epoch) {
        epoch = held.epoch
        t = 0
      }
      t += TICK_MS
      const { ms, frames } = animationOf(held.mood)
      const frame = Math.floor(t / ms) % frames.length
      if (frame !== held.frame) surface.setState({ ...held, frame })
    })
  }

  let { mood, frame } = surface.state ?? { mood: props.mood, frame: 0 }
  if (surface.state === undefined || surface.state.mood !== props.mood) {
    mood = props.mood
    frame = 0
    surface.setState({ mood, frame, epoch: (surface.state?.epoch ?? 0) + 1 })
  }

  const { frames } = animationOf(mood)
  const bands = frames[frame % frames.length] ?? []
  return (
    <Box flexDirection="column" width={W * pixel.w} height={ROWS * pixel.h} backgroundColor={TILE}>
      {bands.map(band => {
        const height = band.rows * pixel.h
        if (band.runs.length === 1 && band.runs[0]![0] === null) return <Box height={height} />
        return (
          <Box flexDirection="row" height={height}>
            {band.runs.map(([color, n]) =>
              color === null ? <Box width={n * pixel.w} height={height} /> : <Box width={n * pixel.w} height={height} backgroundColor={color} />,
            )}
          </Box>
        )
      })}
    </Box>
  )
}
