// The desktop's Clawd Crew icon, beside the credit under the settings: the
// icon's pixels drawn as boxes of color, as the desktop's Clawds are, still.

import type { ClientSurface } from 'claude-code'

import { ICON, ICON_SIZE } from './icon.js'
import { TILE } from './sprites.js'

// One icon pixel, in cells: twice as wide as tall, roughly square in a code
// font, so the icon fills 10 columns by 5 rows.
const PIXEL = { w: 10 / ICON_SIZE, h: 5 / ICON_SIZE }

type Run = [color: string | null, length: number]

// Runs of one color along a row, and identical rows merged into one band.
const BANDS = (() => {
  const bands: { rows: number; runs: Run[]; sig: string }[] = []
  for (const row of ICON) {
    const runs: Run[] = []
    let x = 0
    while (x < ICON_SIZE) {
      const color = row[x] ?? null
      let n = 1
      while (x + n < ICON_SIZE && (row[x + n] ?? null) === color) n += 1
      runs.push([color, n])
      x += n
    }
    const sig = JSON.stringify(runs)
    const last = bands[bands.length - 1]
    if (last && last.sig === sig) last.rows += 1
    else bands.push({ rows: 1, runs, sig })
  }
  return bands
})()

export default function ClawdCrewIcon(_props: unknown, surface: ClientSurface) {
  const { Box } = surface.elements
  return (
    <Box flexDirection="column" width={ICON_SIZE * PIXEL.w} height={ICON_SIZE * PIXEL.h} backgroundColor={TILE}>
      {BANDS.map(band => {
        const height = band.rows * PIXEL.h
        if (band.runs.length === 1 && band.runs[0]![0] === null) return <Box height={height} />
        return (
          <Box flexDirection="row" height={height}>
            {band.runs.map(([color, n]) =>
              color === null ? <Box width={n * PIXEL.w} height={height} /> : <Box width={n * PIXEL.w} height={height} backgroundColor={color} />,
            )}
          </Box>
        )
      })}
    </Box>
  )
}
