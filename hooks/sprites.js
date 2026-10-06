// Clawd pixel art. Every animation is a list of frames, each frame a W x H
// grid of palette indices built from a few parts (body, eyes, arms, legs and
// one prop), so a state reads at a glance and both renderers (SVG on the
// remote surfaces, terminal cells) draw from the same grids.
//
// Proportions follow the CLI's own logo ( ▐▛███▜▌ ), whose quadrant pixels
// are twice as tall as wide: a 12 x 8 body, 1 x 2 eyes, 2 x 2 arms halfway
// down and four 1 x 2 legs.

export const W = 24
export const H = 20

// Palette indices.
const B = 1 // body
const S = 2 // body shade
const K = 3 // ink
const WT = 4 // white
const G = 5 // gray
const D = 6 // dark gray
const BL = 7 // blue
const GR = 8 // green
const R = 9 // red
const Y = 10 // yellow
const L = 11 // light gray
const BR = 12 // brown
const MB = 13 // a small Clawd's body

export const PALETTE = [
  null,
  '#D97757',
  '#B4583A',
  '#1C1B1A',
  '#FFFFFF',
  '#8F8B84',
  '#4B4844',
  '#6A9BCC',
  '#6FAE5A',
  '#E0524A',
  '#F2C14E',
  '#C8C3B9',
  '#9A6B45',
  '#E8A084',
]

// The dark tile every Clawd stands on, and the floor line under his feet.
export const TILE = '#1b1a19'
export const FLOOR = '#2c2a27'

// Where the body's top-left corner sits when Clawd stands still; his legs
// reach the ground two rows under the body.
const BX = 6
const BY = 8
const BODY_W = 12
const BODY_H = 8
export const GROUND = BY + BODY_H + 2

const put = (g, x, y, c) => {
  if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c
}

const box = (g, x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c)
}

// Draws rows of characters, each mapped to a palette index; others are skipped.
const art = (g, x, y, rows, map) => {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = map[row[i]]
      if (c !== undefined) put(g, x + i, y + j, c)
    }
  })
}

// Each arm pose: rows from the body's top, and how tall.
const ARMS = { rest: [4, 2], mid: [2, 2], up: [-2, 3], down: [6, 2] }

const arm = (g, x, by, kind, c) => {
  if (kind === 'none') return
  const [dy, h] = ARMS[kind]
  box(g, x, by + dy, 2, h, c)
}

const eyes = (g, bx, by, bw, bh, kind) => {
  const xs = [bx + 2, bx + bw - 3]
  xs.forEach((x, side) => {
    const inward = side === 0 ? 0 : -1
    switch (kind) {
      case 'closed':
        box(g, x + inward, by + 3, 2, 1, K)
        break
      // Shut tight, halfway down however flat he has been pressed.
      case 'squished':
        box(g, x + inward, by + Math.floor((bh - 1) / 2), 2, 1, K)
        break
      // Open, on a body pressed too flat for his usual eyes.
      case 'dot':
        put(g, x, by + Math.floor((bh - 1) / 2), K)
        break
      // His left eye peeking open, the right still shut.
      case 'wink':
        if (side === 0) box(g, x, by + 2, 1, 2, K)
        else box(g, x + inward, by + 3, 2, 1, K)
        break
      case 'up':
        box(g, x, by + 1, 1, 2, K)
        break
      case 'upright':
        box(g, x + 1, by + 1, 1, 2, K)
        break
      case 'upleft':
        box(g, x - 1, by + 1, 1, 2, K)
        break
      case 'down':
        box(g, x, by + 3, 1, 2, K)
        break
      case 'downleft':
        box(g, x - 1, by + 3, 1, 2, K)
        break
      case 'downright':
        box(g, x + 1, by + 3, 1, 2, K)
        break
      case 'left':
        box(g, x - 1, by + 2, 1, 2, K)
        break
      case 'right':
        box(g, x + 1, by + 2, 1, 2, K)
        break
      case 'wide':
        box(g, x, by + 1, 1, 3, K)
        break
      case 'happy':
        put(g, x - 1, by + 3, K)
        put(g, x, by + 2, K)
        put(g, x + 1, by + 3, K)
        break
      case 'x':
        put(g, x - 1, by + 1, K)
        put(g, x + 1, by + 1, K)
        put(g, x, by + 2, K)
        put(g, x - 1, by + 3, K)
        put(g, x + 1, by + 3, K)
        break
      default:
        box(g, x, by + 2, 1, 2, K)
    }
  })
}

// Clawd himself. `dy` moves him and his legs (a hop), `breathe` sinks the
// body a row onto shortened legs, `squash` trades height for width, `lie`
// rests the squashed body on the ground with the legs tucked under.
const clawd = (g, o) => {
  const sq = o.squash ?? o.lie ?? 0
  const bw = BODY_W + 2 * sq
  const bh = BODY_H - sq
  const bx = BX + (o.dx ?? 0) - sq
  const by = o.lie !== undefined ? GROUND - bh : BY + (o.dy ?? 0) + sq + (o.breathe ? 1 : 0)
  const c = o.color ?? B
  const legs = o.lie !== undefined ? 'none' : (o.legs ?? 'stand')
  if (legs !== 'none') {
    const ground = GROUND + (o.dy ?? 0)
    const top = by + bh
    ;[bx + 1, bx + 3, bx + bw - 4, bx + bw - 2].forEach((x, i) => {
      let bottom = legs === 'tuck' ? top + 1 : ground
      if (legs === 'walkA' && i % 2 === 0) bottom -= 1
      if (legs === 'walkB' && i % 2 === 1) bottom -= 1
      for (let y = top; y < bottom; y++) put(g, x, y, c)
    })
  }
  box(g, bx, by, bw, bh, c)
  arm(g, bx - 2, by, o.armL ?? 'rest', c)
  arm(g, bx + bw, by, o.armR ?? 'rest', c)
  eyes(g, bx, by, bw, bh, o.eyes ?? 'open')
}

const INK = { o: G, w: WT }

// A rounded white bubble over his right shoulder, its tail pointing at him.
const bubble = g => {
  art(g, 14, 0, ['.ooooooo.', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', 'owwwwwwwo', '.ooooooo.'], INK)
  put(g, 15, 6, G)
  put(g, 14, 7, G)
}

// A thought cloud over his right shoulder, and the puffs trailing to it.
const cloud = g => art(g, 15, 0, ['.oooooo.', 'owwwwwwo', 'owwwwwwo', 'owwwwwwo', '.oooooo.'], INK)
const puffs = g => {
  put(g, 15, 6, G)
  put(g, 14, 7, G)
}

const GLYPHS = {
  '?': ['###', '..#', '.##', '...', '.#.'],
  '!': ['#', '#', '#', '.', '#'],
  z: ['###', '..#', '.#.', '###'],
  Z: ['####', '...#', '..#.', '.#..', '####'],
  '+': ['.#.', '###', '.#.'],
}

const glyph = (g, ch, x, y, c) => art(g, x, y, GLYPHS[ch], { '#': c })

// A small Clawd standing at column `x`: a 5 x 3 body, an arm each side and
// four legs, a little paler than the big one. `side` is which side of the
// big Clawd he stands on: he looks toward him and salutes with the outer arm.
// `lift` stands him that many rows higher, on another's head.
const mini = (g, x, pose, side, lift = 0) => {
  const y = (pose === 'hop' ? 13 : 14) - lift
  box(g, x + 1, y, 5, 3, MB)
  const outer = side === 'left' ? x : x + 6
  const inner = side === 'left' ? x + 6 : x
  put(g, inner, y + 2, MB)
  if (pose === 'salute') {
    put(g, outer, y, MB)
    put(g, outer, y - 1, MB)
  } else {
    put(g, outer, y + 2, MB)
  }
  const look = side === 'left' ? 1 : -1
  put(g, x + 2 + look, y + 1, K)
  put(g, x + 4 + look, y + 1, K)
  const legs = { walkA: [1, 4], walkB: [2, 5], hop: [2, 4] }[pose] ?? [1, 2, 4, 5]
  for (const leg of legs) put(g, x + leg, y + 3, MB)
}

// A small Clawd of a crowd, the top-left of its 5 x 3 body at (x, y), on four
// legs, an arm each side. Poses: 'stand', 'hop' (a row up), 'cheer'
// (both arms up off its top corners), 'stepA' and 'stepB' (marching, a pair
// of legs lifted).
const member = (g, x, y, pose) => {
  const top = pose === 'hop' ? y - 1 : y
  box(g, x, top, 5, 3, MB)
  put(g, x + 1, top + 1, K)
  put(g, x + 3, top + 1, K)
  const legs = { stepA: [0, 3], stepB: [1, 4], hop: [1, 3] }[pose] ?? [0, 1, 3, 4]
  for (const leg of legs) put(g, x + leg, top + 3, MB)
  // Arms: up off its top corners to cheer, else at its sides, where a
  // neighbor's arm meets it, hand in hand.
  if (pose === 'cheer') {
    put(g, x, top - 1, MB)
    put(g, x + 4, top - 1, MB)
  } else {
    put(g, x - 1, top + 2, MB)
    put(g, x + 5, top + 2, MB)
  }
}

// Where the crowd stands, left to right: one beside the podium, four in a row
// on the floor in front of it, one beside it on the other side.
const CROWD = [
  [0, 9],
  [0, 14],
  [6, 14],
  [12, 14],
  [18, 14],
  [19, 9],
]

// How high the podium lifts him, and the podium itself under his feet.
const PODIUM_LIFT = -6
const podium = g => {
  box(g, 5, GROUND + PODIUM_LIFT, 14, 1, L)
  box(g, 5, GROUND + PODIUM_LIFT + 1, 14, 1, D)
}

// Props: drawn behind Clawd unless HELD lists them, each taking a step that
// advances once per frame of its animation.
const PROPS = {
  // A thought cloud filling with dots; at step -1 only its trail of puffs.
  dots: (g, n) => {
    puffs(g)
    if (n < 0) return
    cloud(g)
    for (let i = 0; i < n; i++) put(g, 17 + i * 2, 2, K)
  },
  // The cloud holding a lit bulb: an idea. Odd steps add its rays.
  idea: (g, n) => {
    puffs(g)
    cloud(g)
    art(g, 17, 1, ['.yy.', 'yyyy', '.gg.'], { y: Y, g: G })
    if (n % 2 === 1) {
      put(g, 16, 2, Y)
      put(g, 21, 2, Y)
    }
  },
  // A speech bubble whose two lines grow; steps 0-6 write one reply, 7-13
  // the next, with lines of other lengths.
  speech: (g, n) => {
    bubble(g)
    const step = n % 7
    let left = step === 0 ? 0 : step * 2 - 1
    const lines = n < 7 ? [5, 5] : [3, 5]
    lines.forEach((max, i) => {
      const width = Math.min(left, max)
      if (width > 0) box(g, 16, 2 + i * 2, width, 1, D)
      left -= width
    })
  },
  ask: (g, n) => {
    bubble(g)
    glyph(g, '?', 17, n % 2 === 0 ? 1 : 0, K)
  },
  alert: (g, n) => {
    bubble(g)
    glyph(g, '!', 18, n % 2 === 0 ? 1 : 0, B)
  },
  // The back of a laptop lid with a steady glowing logo, `glow` its color,
  // its base below.
  laptop: (g, glow = WT) => {
    box(g, BX + 1, BY + 4, 10, 4, G)
    box(g, BX + 1, BY + 4, 10, 1, L)
    box(g, BX + 5, BY + 6, 2, 1, glow)
    box(g, BX, BY + 8, 12, 1, D)
  },
  // A book held up in front of him with its covers to us, so only his eyes
  // peek over the pages' edge. `turn` is a page flipping over the top: 1
  // lifting on the right, 2 upright at the spine, 3 falling to the left.
  book: (g, { turn = 0 } = {}) => {
    art(g, BX - 1, BY + 4, ['wwwwww.wwwwww', 'cccccckcccccc', 'cyyyyckcccccc', 'cccccckcccccc', 'cccccckcccccc'], {
      w: WT,
      c: BL,
      k: D,
      y: Y,
    })
    if (turn === 1) box(g, BX + 7, BY + 3, 2, 1, WT)
    if (turn === 2) box(g, BX + 5, BY + 2, 1, 2, WT)
    if (turn === 3) box(g, BX + 3, BY + 3, 2, 1, WT)
  },
  // A magnifying glass in his right hand: `level` 0 held low, 1 at his
  // shoulder, 2 raised high; a glint crosses the lens.
  magnifier: (g, { level = 1, glint = 0 } = {}) => {
    const y = [7, 5, 1][level]
    const hand = [BY + 4, BY + 2, BY - 2][level]
    art(g, 19, y, ['.ooo.', 'obbbo', 'obbbo', 'obbbo', '.ooo.'], { o: G, b: BL })
    put(g, 20 + (glint % 3), y + 1, WT)
    for (let row = y + 5; row <= hand; row++) put(g, 20, row, BR)
  },
  terminal: (g, n) => {
    box(g, 15, 0, 9, 7, D)
    box(g, 15, 0, 9, 1, L)
    put(g, 16, 0, R)
    put(g, 17, 0, Y)
    put(g, 18, 0, GR)
    art(g, 16, 2, ['#.', '.#', '#.'], { '#': GR })
    const typed = n % 4
    if (typed > 0) box(g, 19, 3, typed, 1, L)
    if (n % 2 === 0) box(g, 19 + typed, 4, 2, 1, WT)
  },
  // A globe whose continents scroll past as it spins.
  globe: (g, n) => {
    const disc = ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..']
    const land = ['.....##.......', '..####.....#..', '.###....##.##.', '..##.....####.', '....#.....##..', '..........#...', '..............']
    disc.forEach((row, j) => {
      for (let i = 0; i < 7; i++) {
        if (row[i] === '#') put(g, 16 + i, j, land[j][(i + n) % 14] === '#' ? GR : BL)
      }
    })
  },
  // A clipboard held at his right side, a tick appearing by each line in turn.
  clipboard: (g, n) => {
    box(g, 19, 7, 5, 8, BR)
    box(g, 20, 8, 3, 6, WT)
    box(g, 20, 6, 2, 2, G)
    for (let i = 0; i < 3; i++) {
      const row = 9 + i * 2
      if (i < n) put(g, 20, row, GR)
      box(g, 21, row, 2, 1, G)
    }
  },
  // Two gears turning, and a wrench in his right hand working the lower one.
  workshop: (g, n) => {
    const a = ['.#.#.', '#####', '##.##', '#####', '.#.#.']
    const b = ['#.#.#', '.###.', '##.##', '.###.', '#.#.#']
    const turn = Math.floor(n / 2) % 2
    art(g, 14, 0, turn === 0 ? a : b, { '#': L })
    art(g, 18, 2, turn === 0 ? b : a, { '#': G })
    const wrench = turn === 0 ? ['#.#', '###', '.#.', '.#.'] : ['.#.#', '.###', '.#..', '#...']
    art(g, 19, 7, wrench, { '#': L })
  },
  // Two small Clawds at his feet taking orders; each step names their poses.
  minis: (g, { a = 'stand', b = 'stand' } = {}) => {
    mini(g, 0, a, 'left')
    mini(g, 17, b, 'right')
  },
  // He stands on a podium before a crowd of small Clawds; the step is each
  // one's pose, in the order CROWD lists them.
  crowd: (g, poses) => {
    podium(g)
    CROWD.forEach(([x, y], i) => member(g, x, y, poses[i] ?? 'stand'))
  },
  // Z's rising off him as he sleeps, a new one every other step, each
  // growing as it floats up and away. A negative step shows none.
  zz: (g, t) => {
    if (t < 0) return
    const levels = [
      () => glyph(g, 'z', 16, 8, G),
      () => glyph(g, 'z', 18, 5, L),
      () => glyph(g, 'Z', 19, 1, L),
    ]
    levels.forEach((draw, k) => {
      if ((((t - k) % 2) + 2) % 2 === 0) draw()
    })
  },
  // Three stars circling over his head while he is dizzy; the nearer ones,
  // low on the ring, are drawn bigger.
  dizzy: (g, n) => {
    for (let i = 0; i < 3; i++) {
      const angle = ((n % 6) / 6 + i / 3) * Math.PI * 2
      const x = Math.round(BX + 6 + Math.cos(angle) * 6)
      const y = Math.round(5 + Math.sin(angle) * 1.5)
      if (Math.sin(angle) > 0.3) glyph(g, '+', x - 1, y - 1, Y)
      else put(g, x, y, Y)
    }
  },
  // A bead of sweat running down beside his head.
  sweat: (g, n) => {
    put(g, BX + BODY_W, BY - 1 + n, BL)
    put(g, BX + BODY_W, BY + n, BL)
  },
  sparkles: (g, n) => {
    const spots = [
      [1, 5],
      [19, 2],
      [21, 10],
      [0, 12],
      [17, 6],
      [4, 1],
    ]
    spots.forEach(([x, y], i) => {
      if ((i + n) % 2 === 0) glyph(g, '+', x, y, Y)
      else put(g, x + 1, y + 1, Y)
    })
  },
  // A hydraulic press: its housing at the top, a rod down to a steel plate
  // with a hazard-striped edge. The step is the row the plate's top is on.
  press: (g, top) => {
    box(g, 8, 0, 8, 2, D)
    box(g, 8, 0, 8, 1, G)
    if (top > 2) box(g, 11, 2, 2, top - 2, L)
    box(g, 3, top, 18, 1, G)
    for (let x = 3; x < 21; x++) put(g, x, top + 1, Math.floor((x - 3) / 2) % 2 === 0 ? Y : D)
  },
  oops: (g, n) => {
    glyph(g, '!', 18, 1 + (n % 2), R)
    glyph(g, '!', 20, 2 - (n % 2), R)
  },
}

const HELD = new Set(['laptop', 'book', 'clipboard', 'magnifier', 'press', 'minis', 'crowd', 'workshop'])

const range = n => Array.from({ length: n }, (_, i) => i)

// A run of typing: the hands take turns on the keys, the eyes stay on them.
const typed = (count, extra = {}) =>
  range(count).map(i => ({ eyes: 'down', armL: i % 2 === 0 ? 'mid' : 'rest', armR: i % 2 === 0 ? 'rest' : 'mid', prop: ['laptop'], ...extra }))

// Each frame is Clawd's pose and a prop with its step, or several as `props`.
const ANIMS = {
  // Waiting for a prompt, but not still: he breathes, glances around, blinks,
  // shuffles a step, stretches and taps a foot. No wave or hop: those mean
  // "needs you" and "done".
  idle: {
    ms: 260,
    frames: [
      {},
      {},
      { breathe: 1 },
      { breathe: 1 },
      { eyes: 'left' },
      { eyes: 'left' },
      { eyes: 'left' },
      {},
      { eyes: 'right' },
      { eyes: 'right' },
      { eyes: 'right' },
      {},
      { eyes: 'closed' },
      {},
      { dx: -1, legs: 'walkA', eyes: 'left' },
      { dx: -1, legs: 'walkB', eyes: 'left' },
      { dx: -1 },
      { legs: 'walkA' },
      {},
      { squash: -1, armL: 'up', armR: 'up', eyes: 'closed' },
      { squash: -1, armL: 'up', armR: 'up', eyes: 'closed' },
      { armL: 'mid', armR: 'mid' },
      {},
      { breathe: 1 },
      { breathe: 1 },
      {},
      { legs: 'walkA' },
      {},
      { legs: 'walkA' },
      {},
    ],
  },
  // Ten seconds of sleep: slow breaths under a stream of Z's; he twitches
  // an arm, peeks out with one eye (the Z's pause), and shifts over.
  sleeping: {
    ms: 500,
    frames: range(20).map(f => {
      const frame = { lie: [2, 2, 3, 3][f % 4], eyes: 'closed', prop: ['zz', f] }
      if (f === 6 || f === 7) frame.armR = 'mid'
      if (f === 12 || f === 13) Object.assign(frame, { eyes: 'wink', prop: ['zz', -1] })
      if (f === 16 || f === 17) frame.dx = 1
      return frame
    }),
  },
  // Hand on his chin under a filling thought cloud: he looks about, shifts
  // his weight, taps a foot, and now and then a bulb lights up.
  thinking: {
    ms: 350,
    frames: [
      { eyes: 'up', armL: 'mid', prop: ['dots', 0] },
      { eyes: 'up', armL: 'mid', prop: ['dots', 0] },
      { eyes: 'up', armL: 'mid', prop: ['dots', 1] },
      { eyes: 'up', armL: 'mid', prop: ['dots', 2] },
      { eyes: 'up', armL: 'mid', prop: ['dots', 3] },
      { eyes: 'upleft', armL: 'mid', prop: ['dots', 3] },
      { eyes: 'upleft', armL: 'mid', breathe: 1, prop: ['dots', 3] },
      { eyes: 'closed', armL: 'mid', breathe: 1, prop: ['dots', 3] },
      { eyes: 'upright', armL: 'mid', prop: ['dots', 1] },
      { eyes: 'upright', armL: 'mid', prop: ['dots', 2] },
      { eyes: 'upright', armL: 'mid', prop: ['dots', 3] },
      { eyes: 'up', armL: 'mid', dx: 1, prop: ['dots', 3] },
      { eyes: 'up', armL: 'mid', dx: 1, legs: 'walkA', prop: ['dots', 3] },
      { eyes: 'up', armL: 'mid', dx: 1, prop: ['dots', 3] },
      { eyes: 'up', armL: 'mid', dx: 1, legs: 'walkA', prop: ['dots', 3] },
      { eyes: 'left', armL: 'mid', prop: ['dots', 2] },
      { eyes: 'left', armL: 'mid', breathe: 1, prop: ['dots', 3] },
      { eyes: 'wide', prop: ['idea', 0] },
      { eyes: 'wide', armR: 'up', prop: ['idea', 1] },
      { eyes: 'happy', armR: 'up', prop: ['idea', 0] },
      { eyes: 'happy', armR: 'mid', prop: ['idea', 1] },
      { eyes: 'up', armL: 'mid', prop: ['dots', 0] },
      { eyes: 'up', armL: 'mid', breathe: 1, prop: ['dots', 0] },
      { eyes: 'closed', armL: 'mid', prop: ['dots', 0] },
    ],
  },
  // He talks with his hands while a reply fills the bubble line by line,
  // pauses, and starts on the next.
  responding: {
    ms: 300,
    frames: [
      ...[0, 1, 2, 3, 4, 5, 6, 6, 6].map((n, i) => ({ breathe: i % 2, armR: i % 3 === 1 ? 'mid' : 'rest', prop: ['speech', n] })),
      { eyes: 'closed', prop: ['speech', 6] },
      { prop: ['speech', 6] },
      { eyes: 'right', prop: ['speech', 6] },
      ...[7, 8, 9, 10, 11, 12, 13, 13, 13].map((n, i) => ({
        breathe: i % 2,
        armL: i % 3 === 0 ? 'mid' : 'rest',
        armR: i % 3 === 2 ? 'mid' : 'rest',
        dx: i >= 3 && i < 7 ? 1 : 0,
        prop: ['speech', n],
      })),
      { eyes: 'happy', prop: ['speech', 13] },
      { eyes: 'happy', armR: 'mid', prop: ['speech', 13] },
      { eyes: 'closed', prop: ['speech', 13] },
      { prop: ['speech', 0] },
      { breathe: 1, prop: ['speech', 0] },
      { eyes: 'left', prop: ['speech', 0] },
      { prop: ['speech', 0] },
    ],
  },
  // Ten seconds at the laptop: bursts of typing between a look at the
  // screen, a think, a blink and a sit back.
  typing: {
    ms: 250,
    frames: [
      ...typed(8),
      { eyes: 'downright', prop: ['laptop'] },
      { eyes: 'downright', prop: ['laptop'] },
      { eyes: 'down', prop: ['laptop'] },
      ...typed(6),
      { eyes: 'up', prop: ['laptop'] },
      { eyes: 'up', breathe: 1, prop: ['laptop'] },
      { eyes: 'upright', prop: ['laptop'] },
      ...typed(8),
      { eyes: 'closed', prop: ['laptop'] },
      { eyes: 'down', prop: ['laptop'] },
      ...typed(6),
      { eyes: 'down', breathe: 1, prop: ['laptop'] },
      { eyes: 'down', breathe: 1, prop: ['laptop'] },
      ...typed(2),
    ],
  },
  // From behind the book: his eyes go down the left page, then the right,
  // and a page flips over the top as he turns it.
  reading: {
    ms: 340,
    frames: [
      ...range(4).map(() => ({ eyes: 'downleft', prop: ['book', {}] })),
      ...range(4).map(() => ({ eyes: 'downright', prop: ['book', {}] })),
      { eyes: 'closed', prop: ['book', {}] },
      { eyes: 'downright', armR: 'mid', prop: ['book', { turn: 1 }] },
      { eyes: 'down', armR: 'mid', prop: ['book', { turn: 2 }] },
      { eyes: 'downleft', prop: ['book', { turn: 3 }] },
      ...range(4).map(() => ({ eyes: 'downleft', prop: ['book', {}] })),
      ...range(4).map(() => ({ eyes: 'downright', prop: ['book', {}] })),
      { eyes: 'downright', breathe: 1, prop: ['book', {}] },
      { eyes: 'downright', armR: 'mid', prop: ['book', { turn: 1 }] },
      { eyes: 'down', armR: 'mid', prop: ['book', { turn: 2 }] },
      { eyes: 'downleft', prop: ['book', { turn: 3 }] },
      { eyes: 'down', prop: ['book', {}] },
      { eyes: 'closed', prop: ['book', {}] },
      { eyes: 'down', prop: ['book', {}] },
      { eyes: 'downleft', prop: ['book', {}] },
    ],
  },
  // He raises the magnifying glass high and lowers it again, peering through.
  searching: {
    ms: 280,
    frames: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
      [2, 2],
      [1, 2],
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [2, 1],
      [2, 2],
      [2, 0],
      [1, 1],
      [0, 2],
      [0, 0],
      [1, 1],
    ].map(([level, glint]) => ({ eyes: level === 2 ? 'upright' : 'right', armR: ['rest', 'mid', 'up'][level], prop: ['magnifier', { level, glint }] })),
  },
  running: {
    ms: 110,
    frames: range(8).map(n => ({
      legs: n % 2 === 0 ? 'walkA' : 'walkB',
      dy: n % 2 === 0 ? 0 : -1,
      armL: n % 2 === 0 ? 'mid' : 'down',
      armR: n % 2 === 0 ? 'down' : 'mid',
      eyes: 'upright',
      prop: ['terminal', Math.floor(n / 2)],
    })),
  },
  // Beside a spinning globe: he points at it, sways, hops with his arms up,
  // taps a foot and reaches for it.
  browsing: {
    ms: 200,
    frames: range(28).map(n => {
      const pose =
        n < 7
          ? { eyes: 'upright', armR: 'mid' }
          : n < 12
            ? { eyes: 'up', armL: 'mid', dx: n % 2 === 0 ? -1 : 0 }
            : n < 16
              ? { eyes: 'happy', armL: 'up', armR: 'up', dy: n % 2 === 0 ? -1 : 0, legs: n % 2 === 0 ? 'tuck' : 'stand' }
              : n < 22
                ? { eyes: 'right', armR: 'up', legs: n % 2 === 0 ? 'walkA' : 'stand' }
                : { eyes: 'upright', armR: n % 2 === 0 ? 'mid' : 'rest', breathe: n % 2 }
      return { ...pose, prop: ['globe', n] }
    }),
  },
  // The big Clawd gives orders to two small ones at his feet: they salute in
  // turn, march in place, and hop to it.
  delegating: {
    ms: 260,
    frames: [
      { eyes: 'left', armL: 'mid', prop: ['minis', {}] },
      { eyes: 'left', armL: 'up', prop: ['minis', {}] },
      { eyes: 'left', armL: 'up', prop: ['minis', { a: 'salute' }] },
      { eyes: 'left', armL: 'mid', prop: ['minis', { a: 'salute' }] },
      { eyes: 'right', armR: 'mid', prop: ['minis', {}] },
      { eyes: 'right', armR: 'up', prop: ['minis', {}] },
      { eyes: 'right', armR: 'up', prop: ['minis', { b: 'salute' }] },
      { eyes: 'right', armR: 'mid', prop: ['minis', { b: 'salute' }] },
      { eyes: 'down', armL: 'mid', armR: 'mid', prop: ['minis', { a: 'walkA', b: 'walkB' }] },
      { eyes: 'down', armL: 'up', armR: 'up', prop: ['minis', { a: 'walkB', b: 'walkA' }] },
      { eyes: 'down', armL: 'mid', armR: 'mid', prop: ['minis', { a: 'walkA', b: 'walkB' }] },
      { eyes: 'down', armL: 'up', armR: 'up', prop: ['minis', { a: 'walkB', b: 'walkA' }] },
      { eyes: 'happy', prop: ['minis', { a: 'hop' }] },
      { eyes: 'happy', prop: ['minis', { b: 'hop' }] },
      { eyes: 'happy', prop: ['minis', { a: 'hop' }] },
      { breathe: 1, prop: ['minis', {}] },
    ],
  },
  // A big job: up on a podium he conducts a crowd of small Clawds. A wave
  // runs through them, left to right, as he waves them on; they cheer one by
  // one; then everyone marches in place while he keeps the beat.
  rallying: {
    ms: 220,
    frames: [
      ...range(8).map(n => ({
        dy: PODIUM_LIFT,
        eyes: n < 4 ? 'downleft' : 'downright',
        armL: n % 4 < 2 ? 'up' : 'mid',
        armR: n % 4 < 2 ? 'mid' : 'up',
        prop: ['crowd', CROWD.map((_, i) => (n === i || n === i + 1 ? 'hop' : 'stand'))],
      })),
      ...range(8).map(n => ({
        dy: PODIUM_LIFT,
        eyes: n < 6 ? 'down' : 'happy',
        armL: 'up',
        armR: 'up',
        prop: ['crowd', CROWD.map((_, i) => (i <= n ? 'cheer' : 'stand'))],
      })),
      ...range(8).map(n => ({
        dy: PODIUM_LIFT,
        eyes: n % 4 < 2 ? 'down' : 'happy',
        armL: n % 2 === 0 ? 'mid' : 'rest',
        armR: n % 2 === 0 ? 'rest' : 'mid',
        prop: ['crowd', CROWD.map((_, i) => ((i + n) % 2 === 0 ? 'stepA' : 'stepB'))],
      })),
    ],
  },
  // A clipboard at his side: he reads it, ticks lines off, nods, looks up to
  // think, and starts a fresh page.
  planning: {
    ms: 330,
    frames: [
      { eyes: 'right', armR: 'mid', prop: ['clipboard', 0] },
      { eyes: 'downright', armR: 'mid', prop: ['clipboard', 0] },
      { eyes: 'downright', armR: 'mid', prop: ['clipboard', 1] },
      { eyes: 'right', armR: 'mid', breathe: 1, prop: ['clipboard', 1] },
      { eyes: 'downright', armR: 'mid', prop: ['clipboard', 1] },
      { eyes: 'downright', armR: 'mid', prop: ['clipboard', 2] },
      { eyes: 'right', armR: 'mid', breathe: 1, prop: ['clipboard', 2] },
      { eyes: 'up', armR: 'mid', prop: ['clipboard', 2] },
      { eyes: 'upleft', armR: 'mid', prop: ['clipboard', 2] },
      { eyes: 'downright', armR: 'mid', prop: ['clipboard', 2] },
      { eyes: 'downright', armR: 'mid', prop: ['clipboard', 3] },
      { eyes: 'happy', armR: 'mid', prop: ['clipboard', 3] },
      { eyes: 'happy', armR: 'mid', armL: 'mid', prop: ['clipboard', 3] },
      { eyes: 'closed', armR: 'mid', prop: ['clipboard', 3] },
      { eyes: 'right', armR: 'mid', prop: ['clipboard', 3] },
      { eyes: 'right', armR: 'mid', prop: ['clipboard', 0] },
    ],
  },
  // Wrench in hand, he turns the lower of two gears a notch at a time.
  tooling: {
    ms: 220,
    frames: range(16).map(n => ({
      eyes: n % 8 < 6 ? 'upright' : 'right',
      armR: 'mid',
      prop: ['workshop', n],
    })),
  },
  // He waves, taps a foot, hops with both arms up to be seen, waves the other
  // arm and looks around, while his bubble asks and then exclaims.
  waiting: {
    ms: 280,
    frames: [
      ...range(6).map(n => ({ eyes: 'wide', armR: n % 2 === 0 ? 'up' : 'mid', prop: ['ask', n] })),
      ...range(6).map(n => ({ eyes: n % 3 === 2 ? 'closed' : 'open', legs: n % 2 === 0 ? 'walkA' : 'stand', prop: ['ask', 0] })),
      ...range(4).map(n => ({
        eyes: 'wide',
        armL: 'up',
        armR: 'up',
        dy: n % 2 === 0 ? -2 : 0,
        legs: n % 2 === 0 ? 'tuck' : 'stand',
        prop: ['alert', n],
      })),
      ...range(6).map(n => ({ eyes: 'wide', armL: n % 2 === 0 ? 'up' : 'mid', prop: ['alert', n] })),
      ...range(4).map(n => ({ eyes: n < 2 ? 'left' : 'right', dx: n < 2 ? -1 : 1, prop: ['ask', n] })),
      ...range(4).map(n => ({ eyes: 'wide', armR: n % 2 === 0 ? 'up' : 'mid', breathe: n % 2, prop: ['ask', n] })),
    ],
  },
  done: {
    ms: 130,
    frames: [
      { squash: 1, eyes: 'happy', prop: ['sparkles', 0] },
      { dy: -2, legs: 'tuck', armL: 'up', armR: 'up', eyes: 'happy', prop: ['sparkles', 1] },
      { dy: -4, legs: 'tuck', armL: 'up', armR: 'up', eyes: 'happy', prop: ['sparkles', 0] },
      { dy: -5, legs: 'tuck', armL: 'up', armR: 'up', eyes: 'happy', prop: ['sparkles', 1] },
      { dy: -4, legs: 'tuck', armL: 'up', armR: 'up', eyes: 'happy', prop: ['sparkles', 0] },
      { dy: -2, armL: 'mid', armR: 'mid', eyes: 'happy', prop: ['sparkles', 1] },
      { squash: 1, eyes: 'happy', prop: ['sparkles', 0] },
      { eyes: 'happy', prop: ['sparkles', 1] },
      { eyes: 'happy', prop: ['sparkles', 0] },
      { eyes: 'happy', prop: ['sparkles', 1] },
    ],
  },
  // The shock (shaking, dark and X-eyed under a red "!!") and a dizzy spell
  // with stars circling his head, over and over while the error shows.
  error: {
    ms: 140,
    frames: [
      ...range(8).map(n => ({ color: S, eyes: 'x', dx: [0, -1, 0, 1][n % 4], armL: 'down', armR: 'down', prop: ['oops', n] })),
      ...range(24).map(n => ({
        color: S,
        eyes: 'x',
        breathe: 1,
        dx: [0, 0, -1, -1, 0, 0, 1, 1][n % 8],
        armL: 'down',
        armR: 'down',
        prop: ['dizzy', Math.floor(n / 2)],
      })),
    ],
  },
  // A hydraulic press comes down and squashes him flat, presses him flatter
  // still, and lifts; he lies flat a moment, comes to, and pops back up. The
  // press step is its plate's row.
  compacting: {
    ms: 150,
    frames: [
      { eyes: 'up', prop: ['press', 2] },
      { eyes: 'up', prop: ['press', 4] },
      { eyes: 'wide', prop: ['press', 6] },
      { squash: 2, eyes: 'closed', armL: 'mid', armR: 'mid', prop: ['press', 8] },
      { squash: 4, eyes: 'squished', armL: 'mid', armR: 'mid', prop: ['press', 10] },
      { squash: 5, eyes: 'squished', armL: 'none', armR: 'none', prop: ['press', 11] },
      { lie: 6, eyes: 'squished', prop: ['press', 14] },
      { lie: 6, eyes: 'squished', prop: ['press', 14] },
      { lie: 7, eyes: 'squished', prop: ['press', 15] },
      { lie: 7, eyes: 'squished', prop: ['press', 15] },
      { lie: 7, eyes: 'squished', prop: ['press', 15] },
      { lie: 6, eyes: 'squished', prop: ['press', 14] },
      { lie: 6, eyes: 'squished', prop: ['press', 11] },
      { lie: 6, eyes: 'squished', prop: ['press', 7] },
      { lie: 6, eyes: 'squished', prop: ['press', 2] },
      { lie: 6, eyes: 'dot', prop: ['press', 2] },
      { lie: 5, eyes: 'dot', prop: ['press', 2] },
      { squash: -2, armL: 'up', armR: 'up', eyes: 'happy', prop: ['press', 2] },
      { dy: -2, legs: 'tuck', armL: 'up', armR: 'up', eyes: 'happy', prop: ['press', 2] },
      { dy: -1, armL: 'mid', armR: 'mid', eyes: 'happy', prop: ['press', 2] },
      { squash: 1, eyes: 'happy', prop: ['press', 2] },
      { prop: ['press', 2] },
      { eyes: 'up', prop: ['press', 2] },
      { eyes: 'up', prop: ['press', 2] },
    ],
  },
}

// ------------------------------------------------- more to pick from --
//
// Two more animations for every mood, each a routine of five to fifteen
// seconds: the person picks which one a mood uses in the pane's settings.
// A frame may hold several props as `props`, drawn in order, those HELD lists
// in front of him.

const NOTE = ['.##', '.#.', '.#.', '##.']
const CUP = ['y....y', 'yyyyyy', '.yyyy.', '..yy..', '..yy..', '.yyyy.']

// Whether cell (x, y) is in the triangle with corners p, q and r.
const inTriangle = (x, y, [px, py], [qx, qy], [rx, ry]) => {
  const d1 = (x - qx) * (py - qy) - (px - qx) * (y - qy)
  const d2 = (x - rx) * (qy - ry) - (qx - rx) * (y - ry)
  const d3 = (x - px) * (ry - py) - (rx - px) * (y - py)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

// The sea's surface at column x, `n` steps into its roll: a swell between
// rows 11 and 17.
const swellAt = (x, n) => 14 - Math.round(3 * Math.sin(((x + n * 2) / 24) * Math.PI * 2))

// A crate, its top-left corner at (x, y).
const crate = (g, x, y) => {
  box(g, x, y, 3, 2, BR)
  put(g, x + 1, y, Y)
}

Object.assign(PROPS, {
  // A mug of coffee, steam curling off it: `at` his hand, `near` on its way
  // up, `lips` to his face for a sip.
  mug: (g, { at = 'hand', steam = 0 } = {}) => {
    const [x, y] = { hand: [20, 9], near: [18, 9], lips: [15, 10] }[at]
    art(g, x, y, ['bbb', 'www', 'www'], { b: BR, w: WT })
    ;[y - 1, y - 2, y - 3].forEach((sy, k) => put(g, x + ((steam + k) % 3), sy, k === 2 ? L : G))
  },
  // Two notes drifting up and away from him as he hums.
  notes: (g, n) => {
    ;[0, 1].forEach(k => {
      const t = (n + k * 4) % 8
      art(g, 12 + k * 5 + (t % 2), 5 - t, NOTE, { '#': k === 0 ? Y : BL })
    })
  },
  // The night over him: a crescent moon, and stars twinkling in turn.
  night: (g, n) => {
    art(g, 1, 0, ['.yy', 'y..', 'y..', '.yy'], { y: Y })
    ;[
      [7, 1],
      [12, 4],
      [18, 1],
      [21, 5],
      [15, 0],
    ].forEach(([x, y], i) => {
      const phase = (i + n) % 3
      if (phase !== 0) put(g, x, y, phase === 1 ? WT : L)
    })
  },
  // A striped blanket over him as he lies asleep, up to just under his eyes.
  blanket: (g, { lie = 2, dx = 0 } = {}) => {
    const bx = BX + dx - lie
    const bw = BODY_W + 2 * lie
    const by = GROUND - (BODY_H - lie)
    for (let y = by + 4; y < GROUND; y++) {
      for (let x = bx - 1; x <= bx + bw; x++) put(g, x, y, Math.floor((x - bx + 1) / 2) % 2 === 0 ? BL : WT)
    }
  },
  // A question mark bobbing over his head.
  qmark: (g, n) => glyph(g, '?', 11, 1 + (n % 2), Y),
  // A puzzle cube in his hands, three squares a side, two pixels each:
  // `cells` their colors row by row, `y` its top row, and `twist` a row
  // (0-2) or a column (3-5) caught turning, a pixel out of line.
  cube: (g, { cells = [], y = 11, twist = -1 } = {}) => {
    const x = BX + 3
    cells.forEach((c, i) => {
      const row = Math.floor(i / 3)
      const col = i % 3
      const shift = twist === row ? 1 : 0
      const lift = twist === col + 3 ? 1 : 0
      box(g, x + col * 2 + shift, y + row * 2 - lift, 2, 2, c)
    })
  },
  // A sheet of paper before him, written on line by line: `n` letters down,
  // the pen at the last.
  letter: (g, n) => {
    box(g, BX + 1, BY + 4, 10, 5, WT)
    let left = n
    let tip = [BX + 2, BY + 5]
    for (const [y, width] of [
      [BY + 5, 8],
      [BY + 7, 6],
    ]) {
      const w = Math.min(Math.max(left, 0), width)
      if (w > 0) box(g, BX + 2, y, w, 1, D)
      if (left >= 0) tip = [BX + 2 + w, y]
      left -= width
    }
    const [x, y] = tip
    put(g, x, y, K)
    put(g, x + 1, y - 1, Y)
    put(g, x + 2, y - 2, Y)
  },
  // A whiteboard at his upper left: `n` strokes of it drawn.
  board: (g, n) => {
    box(g, 0, 0, 11, 7, G)
    box(g, 1, 1, 9, 5, WT)
    let left = n
    for (const [x, y, c, width] of [
      [2, 2, BL, 6],
      [2, 4, R, 4],
      [7, 4, GR, 2],
    ]) {
      const w = Math.min(Math.max(left, 0), width)
      if (w > 0) box(g, x, y, w, 1, c)
      left -= width
    }
  },
  // Green code raining down behind him, as in a hacker film: in each column
  // a bright head and a fading trail.
  matrix: (g, n) => {
    ;[0, 2, 3, 5, 8, 11, 14, 18, 20, 21, 23].forEach((x, k) => {
      const head = ((n * (1 + (k % 2)) + k * 7) % 26) - 4
      for (let t = 0; t < 5; t++) {
        const y = head - t
        if (y >= 0 && y < GROUND) put(g, x, y, t === 0 ? WT : t < 3 ? GR : D)
      }
    })
  },
  // Dark glasses over his eyes, a glint crossing them now and then.
  shades: (g, glint = 0) => {
    box(g, BX + 1, BY + 2, 4, 2, K)
    box(g, BX + 7, BY + 2, 4, 2, K)
    box(g, BX + 5, BY + 2, 2, 1, K)
    if (glint % 6 === 0) put(g, BX + 2, BY + 2, WT)
    if (glint % 6 === 3) put(g, BX + 8, BY + 2, WT)
  },
  // A monitor at his upper right, code scrolling up it.
  monitor: (g, n) => {
    box(g, 14, 0, 10, 7, D)
    box(g, 15, 1, 8, 5, K)
    const code = [
      [0, 4, GR],
      [1, 6, L],
      [0, 3, Y],
      [2, 5, BL],
      [1, 4, L],
      [0, 6, GR],
      [2, 3, Y],
      [1, 5, L],
    ]
    for (let row = 0; row < 5; row++) {
      const [indent, w, c] = code[(row + n) % code.length]
      box(g, 16 + indent, 1 + row, Math.min(w, 6 - indent), 1, c)
    }
    box(g, 18, 7, 2, 1, G)
  },
  // A keyboard in front of him, its keys lighting as he types.
  keyboard: (g, n) => {
    box(g, BX, BY + 6, BODY_W, 2, D)
    for (let k = 0; k < 5; k++) put(g, BX + 1 + k * 2 + (n % 2), BY + 6 + (k % 2), (n + k) % 3 === 0 ? WT : L)
  },
  // A newspaper held up before him, his eyes over its top; `turn` lifts a
  // corner, then the page, as he turns it.
  newspaper: (g, { turn = 0 } = {}) => {
    box(g, 4, 11, 16, 6, L)
    box(g, 11, 11, 1, 6, G)
    box(g, 5, 12, 5, 1, K)
    box(g, 13, 12, 3, 1, D)
    for (const y of [14, 15]) {
      box(g, 5, y, 5, 1, G)
      box(g, 13, y, 6, 1, G)
    }
    if (turn === 1) {
      box(g, 18, 11, 2, 1, WT)
      put(g, 19, 12, WT)
    }
    if (turn === 2) box(g, 12, 10, 5, 1, WT)
  },
  // A tablet in his hands, its screen toward him: we see its back, its
  // camera and its logo.
  tablet: g => {
    box(g, BX + 2, BY + 4, 8, 5, G)
    box(g, BX + 2, BY + 4, 8, 1, L)
    put(g, BX + 8, BY + 5, K)
    box(g, BX + 5, BY + 6, 2, 2, L)
  },
  // A flashlight in his raised right hand pointed out over his head, its
  // beam sweeping the dark: `dir` 0 low, 1 level, 2 high, past the top. The
  // cone is lit in a checker, solid where it lands; the flashlight points
  // along it, its lens at the cone's tip.
  flashlight: (g, dir = 1) => {
    const [lens, a, b] = [
      [
        [14, 6],
        [0, 2],
        [0, 7],
      ],
      [
        [14, 4],
        [0, 0],
        [0, 6],
      ],
      [
        [14, 2],
        [0, -4],
        [0, 1],
      ],
    ][dir]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < W; x++) {
        if (!inTriangle(x, y, lens, a, b)) continue
        if (x <= 1 || (x + y) % 2 === 0) put(g, x, y, Y)
      }
    }
    const [lx, ly] = lens
    if (dir === 2) {
      // Tilted up: the tube climbs from his hand to the lens.
      put(g, 17, 5, G)
      put(g, 16, 4, G)
      put(g, 16, 3, G)
      put(g, 15, 3, G)
      put(g, 15, 2, G)
    } else box(g, lx + 1, ly, 3, 2, G)
    put(g, lx, ly, WT)
    put(g, lx, ly + 1, WT)
  },
  // Binoculars held to his eyes, big barrels and lenses, a glint crossing a
  // lens: `low` rows lower on their way down to his chest (5), and `dy`
  // lifting them with him when he hops.
  binoculars: (g, { dx = 0, glint = 0, low = 0, dy = 0 } = {}) => {
    const x = BX + dx
    const y = BY + low + dy
    box(g, x, y, 4, 4, D)
    box(g, x + 8, y, 4, 4, D)
    box(g, x + 4, y + 1, 4, 2, D)
    box(g, x + 1, y + 1, 2, 2, BL)
    box(g, x + 9, y + 1, 2, 2, BL)
    if (glint % 4 === 0) put(g, x + 1, y + 1, WT)
    if (glint % 4 === 2) put(g, x + 9, y + 1, WT)
  },
  // A treadmill: its belt running under his feet, its console ahead of him.
  treadmill: (g, n) => {
    for (let x = 2; x < 22; x++) put(g, x, GROUND, (x + n) % 4 === 0 ? L : D)
    box(g, 21, 9, 1, 9, G)
    box(g, 20, 7, 4, 3, D)
    put(g, 21, 8, n % 2 === 0 ? GR : Y)
    put(g, 22, 8, GR)
  },
  // A progress bar across the top: `n` cells of 20 filled; past full, it
  // flashes.
  progress: (g, n) => {
    box(g, 1, 1, 22, 4, G)
    box(g, 2, 2, 20, 2, D)
    const fill = Math.min(20, n)
    if (fill > 0) box(g, 2, 2, fill, 2, n > 20 && n % 2 === 1 ? Y : GR)
  },
  // A big swell rolling in under him, filled down to the bottom: foam along
  // its face, a lip curling off the crest, spray flying; and his surfboard,
  // two pixels thick, riding its face, `board` the two ends of its deck.
  waves: (g, { n = 0, board: [x0, y0, x1, y1] = [5, 15, 19, 15] } = {}) => {
    for (let x = 0; x < W; x++) {
      const top = swellAt(x, n)
      for (let y = top; y <= GROUND; y++) put(g, x, y, y === top ? WT : BL)
      if (top === 11) {
        put(g, x - 1, top - 1, WT)
        if ((x + n) % 2 === 0) put(g, x - 2, top - 3, WT)
      }
    }
    for (let x = x0; x <= x1; x++) {
      const y = Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0))
      put(g, x, y, x === x0 || x === x1 ? BR : Y)
      put(g, x, y + 1, BR)
    }
  },
  // A browser window at his upper right loading a page: `n` 0-3 a spinner,
  // then a picture and its lines of text one by one.
  browser: (g, n) => {
    box(g, 11, 0, 13, 7, WT)
    box(g, 11, 0, 13, 1, L)
    put(g, 12, 0, R)
    put(g, 13, 0, Y)
    put(g, 14, 0, GR)
    if (n < 4) {
      const ring = [
        [16, 2],
        [17, 2],
        [18, 3],
        [17, 4],
        [16, 4],
        [15, 3],
      ]
      ring.forEach(([x, y], i) => {
        if ((i - n * 2 + 12) % 6 < 3) put(g, x, y, BL)
      })
      return
    }
    box(g, 12, 2, 5, 4, BL)
    box(g, 12, 5, 5, 1, GR)
    put(g, 15, 3, Y)
    ;[
      [18, 2, 5],
      [18, 3, 3],
      [18, 5, 4],
    ].forEach(([x, y, w], i) => {
      if (n >= 5 + i) box(g, x, y, w, 1, G)
    })
  },
  // A stack of crates on the floor at his right, the work to hand out.
  stack: g => {
    crate(g, 20, 16)
    crate(g, 21, 14)
    crate(g, 20, 12)
  },
  // A crate held at [x, y].
  crate: (g, [x, y] = [0, 0]) => crate(g, x, y),
  // Small Clawds on the move: each { x, pose, side, lift, carry }, the
  // carriers with a crate on their heads.
  walkers: (g, list = []) => {
    for (const { x, pose = 'stand', side = 'left', lift = 0, carry = false } of list) {
      mini(g, x, pose, side, lift)
      if (carry) crate(g, x + 2, (pose === 'hop' ? 13 : 14) - lift - 2)
    }
  },
  // A star, its center at [x, y].
  star: (g, [x, y] = [21, 2]) => {
    glyph(g, '+', x - 1, y - 1, Y)
    put(g, x, y, WT)
  },
  // An endless file of small Clawds marching off to the right below the
  // podium, `n` steps along.
  line: (g, n) => {
    podium(g)
    for (let k = 0; k < 5; k++) member(g, ((k * 6 + n) % 30) - 6, 14, (n + k) % 2 === 0 ? 'stepA' : 'stepB')
  },
  // Small Clawds, each [x, y, pose].
  members: (g, list = []) => {
    for (const [x, y, pose] of list) member(g, x, y, pose)
  },
  // A map held open before him, a dotted path traced across it: `n` dots
  // drawn, then its X, flashing past six.
  map: (g, n) => {
    box(g, 4, 12, 16, 5, BR)
    box(g, 5, 13, 14, 3, L)
    put(g, 9, 14, BL)
    put(g, 10, 14, BL)
    const path = [
      [6, 15],
      [8, 14],
      [11, 15],
      [13, 14],
      [15, 15],
      [16, 13],
    ]
    path.slice(0, Math.min(n, path.length)).forEach(([x, y]) => put(g, x, y, R))
    if (n >= path.length) {
      const c = n > path.length && n % 2 === 1 ? Y : R
      put(g, 17, 13, c)
      put(g, 18, 14, c)
      put(g, 18, 13, c)
      put(g, 17, 14, c)
    }
  },
  // A cork board at his upper left, `n` sticky notes up on it.
  stickies: (g, n) => {
    box(g, 0, 0, 12, 7, BR)
    ;[
      [1, 1, Y],
      [4, 1, GR],
      [7, 1, BL],
      [1, 4, R],
      [4, 4, Y],
      [7, 4, GR],
      [10, 2, BL],
    ]
      .slice(0, n)
      .forEach(([x, y, c]) => box(g, x, y, 2, 2, c))
  },
  // A block of wood at his right with a nail in it, `nail` 0-3 how far in,
  // and a hammer in his right hand: `up` raised, else struck down on the
  // nail, `hit` with sparks.
  hammer: (g, { up = false, nail = 0, hit = false } = {}) => {
    box(g, 19, 15, 5, 3, BR)
    const h = 3 - nail
    if (h > 0) box(g, 21, 15 - h, 1, h, L)
    if (up) {
      box(g, 19, 3, 3, 2, G)
      box(g, 20, 5, 1, 1, BR)
      return
    }
    const top = 13 - h
    box(g, 20, top, 3, 2, G)
    for (let y = Math.min(11, top); y <= Math.max(11, top); y++) put(g, 19, y, BR)
    if (hit) {
      put(g, 19, top + 2, Y)
      put(g, 23, top + 2, Y)
      put(g, 23, top - 1, Y)
    }
  },
  // A toolbox on the floor at his right, `open` or shut, with `tool` held up
  // out of it: 1 a wrench, 2 a screwdriver.
  toolbox: (g, { open = false, tool = 0 } = {}) => {
    box(g, 18, 14, 6, 4, R)
    box(g, 18, 15, 6, 1, D)
    box(g, 20, 13, 2, 1, D)
    if (open) box(g, 19, 14, 4, 1, K)
    if (tool === 1) art(g, 18, 2, ['#.#', '###', '.#.', '.#.'], { '#': L })
    if (tool === 2) {
      box(g, 19, 1, 1, 3, L)
      box(g, 19, 4, 1, 2, Y)
    }
  },
  // A sign on a stick in his right hand, `glyph` on its white face in a gray
  // frame: `y` the top row of the frame, raised high over him (-3 or -2) or
  // lowered to his shoulder (1); `tilt` leans it.
  sign: (g, { glyph: ch = '?', y = -2, tilt = 0 } = {}) => {
    const x = 15 + tilt
    box(g, x, y, 9, 7, G)
    box(g, x + 1, y + 1, 7, 5, WT)
    glyph(g, ch, ch === '!' ? x + 4 : x + 3, y + 1, ch === '!' ? R : B)
    const hand = y < 0 ? 6 : 10
    for (let sy = y + 7; sy < hand; sy++) put(g, 19, sy, BR)
  },
  // A desk bell at his right; `ring` draws its sound.
  bell: (g, ring = false) => {
    box(g, 19, 16, 5, 2, D)
    art(g, 19, 13, ['.###.', '#####', '#####'], { '#': L })
    put(g, 21, 12, K)
    if (ring) {
      put(g, 18, 11, Y)
      put(g, 19, 10, Y)
      put(g, 23, 10, Y)
      put(g, 23, 12, Y)
    }
  },
  // A gold cup: `high` held up over his head, else before him; `dy` lifts it
  // with him when he hops.
  trophy: (g, { high = true, dy = 0 } = {}) => {
    const y = (high ? 1 : 10) + dy
    art(g, 9, y, CUP, { y: Y })
    put(g, 10, y + 1, WT)
  },
  // Confetti falling all around him.
  confetti: (g, n) => {
    const colors = [Y, R, BL, GR, MB, WT]
    for (let k = 0; k < 12; k++) put(g, ((k * 7 + 3) % W) + ((n + k) % 3 === 0 ? 1 : 0), (n + k * 5) % 19, colors[k % colors.length])
  },
  // Puffs of smoke rising off him.
  smoke: (g, n) => {
    for (let k = 0; k < 3; k++) {
      const t = (n + k * 3) % 9
      art(g, 9 + k * 2 + (t % 2), 6 - t, ['.##.', '####', '.##.'], { '#': t < 3 ? D : G })
    }
  },
  // A dark cloud over him and the rain from it; `flash` lights it up as
  // lightning leaves it, the rain held.
  rain: (g, { n = 0, flash = false } = {}) => {
    art(g, 5, 0, ['..####......', '.########...', '############', '.##########.'], { '#': flash ? L : D })
    if (flash) return
    ;[6, 9, 12, 15, 8, 14].forEach((x, k) => put(g, x, 4 + ((n + k * 2) % 4), BL))
  },
  // A bolt of lightning from the cloud down onto his head: `n` 0 the whole
  // bolt with sparks off him, 1 its top fading, 2 the sparks alone.
  bolt: (g, n = 0) => {
    const path = [
      [12, 4],
      [11, 5],
      [12, 6],
      [11, 7],
    ]
    path.slice(0, n === 0 ? path.length : n === 1 ? 2 : 0).forEach(([x, y]) => {
      put(g, x, y, Y)
      put(g, x + 1, y, WT)
    })
    if (n !== 1) {
      ;[
        [8, 7],
        [16, 7],
        [9, 6],
        [15, 6],
      ].forEach(([x, y]) => put(g, x, y, Y))
    }
  },
  // A stick vacuum in his right hand, its head on the floor beside him,
  // sucking up the bits that roll and hop into it, a streak behind each and
  // the air rushing in; a negative step, switched off with nothing left.
  vacuum: (g, n) => {
    box(g, 16, 13, 2, 2, G)
    put(g, 16, 12, n < 0 ? D : R)
    put(g, 17, 15, D)
    put(g, 17, 16, D)
    box(g, 16, 17, 4, 1, D)
    if (n < 0) return
    put(g, 20 + (n % 2), 15 + ((n + 1) % 2), L)
    put(g, 21 - (n % 2), 16 - ((n + 1) % 2), L)
    ;[Y, R, BL].forEach((c, k) => {
      const x = 20 + ((((k * 4 - n) % 12) + 12) % 12)
      if (x > 23) return
      const y = x <= 21 ? 16 : 17
      box(g, x, y, 2, 1, c)
      if (x + 2 < W) put(g, x + 2, y, L)
    })
  },
})

for (const prop of ['mug', 'blanket', 'cube', 'letter', 'shades', 'keyboard', 'newspaper', 'tablet', 'binoculars', 'crate', 'walkers', 'star', 'line', 'members', 'map', 'hammer', 'sign', 'trophy', 'vacuum']) {
  HELD.add(prop)
}

const loop = (count, make) => range(count).map(make)

// A puzzle cube's faces on the way from scrambled to solved, a row or a
// column turned between each, and the line turned to reach the next.
const CUBE = [
  [R, Y, BL, GR, WT, R, Y, BL, GR],
  [Y, BL, R, GR, WT, R, Y, BL, GR],
  [Y, BL, R, R, GR, WT, Y, BL, GR],
  [GR, BL, R, GR, GR, WT, GR, BL, GR],
  [GR, GR, R, GR, GR, WT, GR, GR, GR],
  [GR, GR, GR, GR, GR, GR, GR, GR, GR],
]
const CUBE_TURNS = [0, 1, 3, 4, 5]

// The two small Clawds handing work on, by step of a 24-step round: walking
// in from the left, stopping in front of him for a crate, and walking off
// to the right with it.
const carrier = f => {
  const x = f < 6 ? -7 + f * 2 : f < 9 ? 3 : 3 + (f - 8) * 2
  if (x > W) return undefined
  const isWalking = f < 6 || f >= 9
  return { x, pose: isWalking ? (f % 2 === 0 ? 'walkA' : 'walkB') : f === 8 ? 'salute' : 'stand', side: 'left', carry: f >= 6 }
}

// A horde of small Clawds: where each of them ends up, in the order they
// pile on, on the floor, clinging to his sides, on his head, in his face.
const HORDE = [
  [0, 14],
  [19, 14],
  [1, 10],
  [18, 10],
  [6, 5],
  [13, 5],
  [9, 2],
  [7, 11],
  [12, 11],
  [16, 1],
  [2, 1],
]
const hordeAt = n => {
  if (n < 4) {
    const step = n % 2 === 0 ? 'stepA' : 'stepB'
    return [
      [Math.min(0, -6 + (n + 1) * 2), 14, step],
      [Math.max(19, 25 - (n + 1) * 2), 14, step],
    ]
  }
  if (n >= 24) return []
  if (n >= 20) {
    const fling = (n - 19) * 3
    return HORDE.map(([x, y]) => [x + (x < 10 ? -fling : fling), y - fling, 'cheer'])
  }
  const count = Math.min(HORDE.length, n - 1)
  return HORDE.slice(0, count).map(([x, y], i) => [x, y, i === count - 1 && n < 12 ? 'hop' : n >= 12 && (n + i) % 2 === 0 ? 'cheer' : 'stand'])
}

// The tower: one small Clawd climbs onto the other to reach a star he
// points at, jumps for it, and brings it down to him. Each step: the
// climber's [x, lift, pose, side], the one below's [x, pose], and where
// the star is.
const TOWER = [
  [[0, 0, 'stand', 'left'], [17, 'stand'], [21, 2]],
  [[0, 0, 'stand', 'left'], [17, 'stand'], [21, 2]],
  [[0, 0, 'salute', 'left'], [17, 'salute'], [21, 2]],
  [[0, 0, 'stand', 'left'], [17, 'stand'], [21, 2]],
  [[3, 0, 'walkA', 'left'], [17, 'stand'], [21, 2]],
  [[5, 0, 'walkB', 'left'], [17, 'stand'], [21, 2]],
  [[8, 0, 'walkA', 'left'], [17, 'stand'], [21, 2]],
  [[10, 0, 'walkB', 'left'], [17, 'stand'], [21, 2]],
  [[12, 0, 'walkA', 'left'], [17, 'stand'], [21, 2]],
  [[14, 2, 'hop', 'left'], [17, 'stand'], [21, 2]],
  [[17, 4, 'stand', 'right'], [17, 'stand'], [21, 2]],
  [[17, 4, 'salute', 'right'], [17, 'stand'], [21, 2]],
  [[18, 4, 'salute', 'right'], [18, 'stand'], [21, 2]],
  [[16, 4, 'salute', 'right'], [16, 'stand'], [21, 2]],
  [[17, 4, 'salute', 'right'], [17, 'stand'], [21, 2]],
  [[17, 8, 'salute', 'right'], [17, 'stand'], [22, 4]],
  [[17, 4, 'stand', 'right'], [17, 'stand'], [20, 8]],
  [[17, 4, 'stand', 'right'], [17, 'stand'], [20, 8]],
  [[14, 2, 'hop', 'right'], [17, 'stand'], [17, 10]],
  [[11, 0, 'stand', 'right'], [17, 'stand'], [14, 12]],
  [[11, 0, 'hop', 'right'], [17, 'hop'], [14, 11]],
  [[11, 0, 'stand', 'right'], [17, 'stand'], [14, 12]],
  [[11, 0, 'hop', 'right'], [17, 'hop'], [14, 11]],
  [[11, 0, 'stand', 'right'], [17, 'stand'], [14, 12]],
  [[9, 0, 'walkA', 'right'], [17, 'stand'], [16, 9]],
  [[6, 0, 'walkB', 'right'], [17, 'stand'], [18, 6]],
  [[3, 0, 'walkA', 'right'], [17, 'stand'], [20, 4]],
  [[0, 0, 'stand', 'left'], [17, 'stand'], [21, 2]],
]

Object.assign(ANIMS, {
  // A coffee break: steam curling off the mug in his hand, he brings it up
  // to his face for a sip, savors it, looks about, and sips again.
  'idle.coffee': {
    ms: 300,
    frames: [
      ...loop(6, n => ({ armR: 'mid', breathe: n % 4 < 2 ? 0 : 1, eyes: n === 4 ? 'closed' : 'right', prop: ['mug', { steam: n }] })),
      { armR: 'mid', eyes: 'right', prop: ['mug', { at: 'near', steam: 6 }] },
      ...loop(4, n => ({ armR: 'mid', eyes: 'closed', prop: ['mug', { at: 'lips', steam: 7 + n }] })),
      { armR: 'mid', eyes: 'happy', prop: ['mug', { at: 'near', steam: 11 }] },
      ...loop(5, n => ({ armR: 'mid', eyes: 'happy', breathe: n % 2, prop: ['mug', { steam: 12 + n }] })),
      ...loop(6, n => ({ armR: 'mid', eyes: n < 3 ? 'left' : 'upright', prop: ['mug', { steam: 17 + n }] })),
      { armR: 'mid', eyes: 'right', prop: ['mug', { at: 'near', steam: 23 }] },
      ...loop(3, n => ({ armR: 'mid', eyes: 'closed', prop: ['mug', { at: 'lips', steam: 24 + n }] })),
      { armR: 'mid', eyes: 'happy', prop: ['mug', { at: 'near', steam: 27 }] },
      ...loop(3, n => ({ armR: 'mid', eyes: n === 1 ? 'closed' : 'open', legs: n === 2 ? 'walkA' : 'stand', prop: ['mug', { steam: 28 + n }] })),
    ],
  },
  // He hums a tune, swaying side to side and keeping time, notes drifting off.
  'idle.tune': {
    ms: 280,
    frames: loop(30, n => ({
      dx: [0, 1, 1, 0, -1, -1][n % 6],
      eyes: n % 10 < 7 ? 'happy' : 'closed',
      armL: n % 4 < 2 ? 'mid' : 'rest',
      armR: n % 4 < 2 ? 'rest' : 'mid',
      legs: n % 6 === 1 || n % 6 === 4 ? 'walkA' : 'stand',
      prop: ['notes', n],
    })),
  },
  // Tucked in under a striped blanket beneath the moon and twinkling stars:
  // he breathes slowly, peeks out once, and rolls over a little.
  'sleeping.blanket': {
    ms: 500,
    frames: loop(20, f => {
      const lie = [1, 1, 2, 2][f % 4]
      const dx = f >= 14 && f < 18 ? 1 : 0
      return { lie, dx, eyes: f === 8 || f === 9 ? 'wink' : 'closed', props: [['night', f], ['blanket', { lie, dx }]] }
    }),
  },
  // Dozing off on his feet: he nods, startles awake, sweats a bead, looks
  // about, and drifts off again.
  'sleeping.doze': {
    ms: 400,
    frames: [
      ...loop(14, f => ({ eyes: 'closed', breathe: f % 4 < 2 ? 0 : 1, armL: 'down', armR: 'down', prop: ['zz', f] })),
      { eyes: 'wide', armL: 'up', armR: 'up', dy: -1, legs: 'tuck' },
      { eyes: 'wide', armL: 'mid', armR: 'mid' },
      ...loop(4, n => ({ eyes: n < 2 ? 'left' : 'right', prop: ['sweat', n] })),
      { eyes: 'wink' },
      { eyes: 'closed' },
      { eyes: 'wink' },
      ...loop(2, f => ({ eyes: 'closed', breathe: 1, armL: 'down', armR: 'down', prop: ['zz', f] })),
    ],
  },
  // He paces back and forth, stops to scratch his head over a question, and
  // then the bulb lights.
  'thinking.pace': {
    ms: 300,
    frames: [
      ...[0, 1, 2, 3, 3, 2, 1, 0, -1, -2, -3, -3, -2, -1, 0].map((dx, i) => ({
        dx,
        legs: i % 2 === 0 ? 'walkA' : 'walkB',
        eyes: i < 4 || i > 10 ? 'right' : 'left',
        armL: 'mid',
        prop: ['dots', Math.min(3, Math.floor(i / 4))],
      })),
      { eyes: 'up', armL: 'up', prop: ['qmark', 0] },
      { eyes: 'up', armL: 'mid', prop: ['qmark', 1] },
      { eyes: 'up', armL: 'up', prop: ['qmark', 0] },
      { eyes: 'upleft', armL: 'mid', prop: ['qmark', 1] },
      { eyes: 'upright', armL: 'mid', breathe: 1, prop: ['qmark', 0] },
      ...loop(5, n => ({ eyes: 'up', armL: 'mid', prop: ['dots', 1 + Math.min(2, n)] })),
      { eyes: 'wide', armR: 'up', prop: ['idea', 1] },
      { eyes: 'happy', armR: 'up', prop: ['idea', 0] },
      { eyes: 'happy', armR: 'mid', prop: ['idea', 1] },
      { eyes: 'happy', prop: ['idea', 0] },
      { eyes: 'up', armL: 'mid', breathe: 1, prop: ['dots', 0] },
    ],
  },
  // A puzzle cube in his hands: he studies it and turns it a row or a column
  // at a time until every square matches, holds it up, hops, and scrambles
  // it again.
  'thinking.cube': {
    ms: 300,
    frames: [
      ...CUBE.slice(0, -1).flatMap((cells, i) => [
        { eyes: 'down', armL: 'mid', armR: 'mid', prop: ['cube', { cells }] },
        { eyes: i % 2 === 0 ? 'downleft' : 'downright', armL: 'mid', armR: 'mid', breathe: 1, prop: ['cube', { cells }] },
        { eyes: 'down', armL: 'rest', armR: 'mid', prop: ['cube', { cells, twist: CUBE_TURNS[i] }] },
      ]),
      { eyes: 'wide', armL: 'mid', armR: 'mid', prop: ['cube', { cells: CUBE[5] }] },
      { eyes: 'happy', armL: 'up', armR: 'up', prop: ['cube', { cells: CUBE[5], y: 1 }] },
      { eyes: 'happy', armL: 'up', armR: 'up', dy: -2, legs: 'tuck', prop: ['cube', { cells: CUBE[5], y: -1 }] },
      { eyes: 'happy', armL: 'up', armR: 'up', prop: ['cube', { cells: CUBE[5], y: 1 }] },
      { eyes: 'happy', armL: 'mid', armR: 'mid', prop: ['cube', { cells: CUBE[5] }] },
      { eyes: 'down', dx: -1, armL: 'mid', armR: 'mid', prop: ['cube', { cells: CUBE[2] }] },
      { eyes: 'down', dx: 1, armL: 'mid', armR: 'mid', prop: ['cube', { cells: CUBE[1] }] },
      { eyes: 'down', armL: 'mid', armR: 'mid', prop: ['cube', { cells: CUBE[0] }] },
    ],
  },
  // He writes his reply out on a sheet of paper, reads it over pleased, and
  // starts the next.
  'responding.letter': {
    ms: 260,
    frames: [
      ...loop(15, n => ({ eyes: 'down', armR: n % 2 === 0 ? 'rest' : 'mid', breathe: n % 5 === 4 ? 1 : 0, prop: ['letter', n] })),
      { eyes: 'downright', prop: ['letter', 14] },
      { eyes: 'happy', prop: ['letter', 14] },
      { eyes: 'happy', armR: 'mid', prop: ['letter', 14] },
      { eyes: 'closed', prop: ['letter', 14] },
      ...loop(13, n => ({ eyes: 'down', armR: n % 2 === 0 ? 'mid' : 'rest', prop: ['letter', n] })),
    ],
  },
  // At a whiteboard: he draws his answer out stroke by stroke, turns to
  // explain it, and wipes it for the next.
  'responding.board': {
    ms: 300,
    frames: [
      ...loop(12, n => ({ eyes: 'upleft', armL: n % 2 === 0 ? 'up' : 'mid', prop: ['board', n + 1] })),
      ...loop(8, n => ({
        eyes: n % 4 === 3 ? 'closed' : 'open',
        armR: n % 2 === 0 ? 'mid' : 'rest',
        armL: n < 4 ? 'up' : 'rest',
        breathe: n % 2,
        prop: ['board', 12],
      })),
      { eyes: 'happy', armL: 'up', prop: ['board', 12] },
      { eyes: 'happy', armL: 'up', armR: 'up', prop: ['board', 12] },
      { eyes: 'happy', prop: ['board', 12] },
      ...loop(5, () => ({ eyes: 'upleft', armL: 'mid', prop: ['board', 0] })),
    ],
  },
  // Hacker mode: dark glasses on and green code raining down behind him, he
  // types flat out, the logo on his laptop glowing green; he pushes his
  // glasses up and gets back to it.
  'typing.matrix': {
    ms: 150,
    frames: [
      ...loop(28, n => ({
        armL: n % 2 === 0 ? 'mid' : 'rest',
        armR: n % 2 === 0 ? 'rest' : 'mid',
        breathe: n % 10 === 9 ? 1 : 0,
        props: [['matrix', n], ['laptop', GR], ['shades', n]],
      })),
      ...loop(4, n => ({ armR: 'up', props: [['matrix', 28 + n], ['laptop', GR], ['shades', n === 1 ? 0 : 1]] })),
      ...loop(8, n => ({
        armL: n % 2 === 0 ? 'mid' : 'rest',
        armR: n % 2 === 0 ? 'rest' : 'mid',
        props: [['matrix', 32 + n], ['laptop', GR], ['shades', 1]],
      })),
    ],
  },
  // At a desk: code scrolls up his monitor as he types on the keyboard, a
  // glance at the keys, a sit back.
  'typing.desk': {
    ms: 250,
    frames: [
      ...loop(10, n => ({
        eyes: 'upright',
        armL: n % 2 === 0 ? 'down' : 'rest',
        armR: n % 2 === 0 ? 'rest' : 'down',
        props: [['monitor', n], ['keyboard', n]],
      })),
      ...loop(3, () => ({ eyes: 'down', props: [['monitor', 10], ['keyboard', 0]] })),
      ...loop(10, n => ({
        eyes: 'upright',
        armL: n % 2 === 0 ? 'down' : 'rest',
        armR: n % 2 === 0 ? 'rest' : 'down',
        props: [['monitor', 10 + n], ['keyboard', n]],
      })),
      { eyes: 'up', breathe: 1, props: [['monitor', 20], ['keyboard', 0]] },
      { eyes: 'closed', breathe: 1, props: [['monitor', 20], ['keyboard', 0]] },
      { eyes: 'happy', props: [['monitor', 20], ['keyboard', 0]] },
      ...loop(6, n => ({
        eyes: 'upright',
        armL: n % 2 === 0 ? 'down' : 'rest',
        armR: n % 2 === 0 ? 'rest' : 'down',
        props: [['monitor', 20 + n], ['keyboard', n]],
      })),
    ],
  },
  // Behind a newspaper: his eyes run across the columns, and he turns the
  // page.
  'reading.paper': {
    ms: 340,
    frames: [
      ...loop(5, () => ({ eyes: 'upleft', prop: ['newspaper', {}] })),
      ...loop(5, () => ({ eyes: 'upright', prop: ['newspaper', {}] })),
      { eyes: 'up', breathe: 1, prop: ['newspaper', {}] },
      { eyes: 'upright', armR: 'mid', prop: ['newspaper', { turn: 1 }] },
      { eyes: 'up', armR: 'mid', prop: ['newspaper', { turn: 2 }] },
      { eyes: 'upleft', prop: ['newspaper', {}] },
      ...loop(5, () => ({ eyes: 'upleft', prop: ['newspaper', {}] })),
      ...loop(4, () => ({ eyes: 'upright', prop: ['newspaper', {}] })),
      { eyes: 'closed', prop: ['newspaper', {}] },
      { eyes: 'up', breathe: 1, prop: ['newspaper', {}] },
      { eyes: 'upleft', prop: ['newspaper', {}] },
    ],
  },
  // Reading on a tablet held toward him, so we see its back: his eyes on it,
  // and a swipe of his hand now and then.
  'reading.tablet': {
    ms: 300,
    frames: loop(28, n => ({
      eyes: n % 14 === 13 ? 'closed' : 'down',
      armR: n % 7 === 6 ? 'mid' : 'rest',
      breathe: n % 10 === 9 ? 1 : 0,
      prop: ['tablet'],
    })),
  },
  // A flashlight held high, its beam sweeping the dark, his eyes after it.
  'searching.flashlight': {
    ms: 260,
    frames: [0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 0].map((dir, n) => ({
      eyes: ['left', 'left', 'upleft'][dir],
      armR: 'up',
      legs: n % 7 === 3 ? 'walkA' : 'stand',
      prop: ['flashlight', dir],
    })),
  },
  // Binoculars to his eyes, scanning side to side; he lowers them to his
  // chest, spots something, hops, and lifts them to look again.
  'searching.binoculars': {
    ms: 280,
    frames: [
      ...[0, 0, -1, -1, -1, 0, 0, 1, 1, 1, 0, 0, -1, -1, 0, 1, 1, 0].map((dx, n) => ({
        dx,
        armL: 'mid',
        armR: 'mid',
        prop: ['binoculars', { dx, glint: n }],
      })),
      { eyes: 'down', armL: 'rest', armR: 'rest', prop: ['binoculars', { low: 3 }] },
      { eyes: 'wide', armL: 'rest', armR: 'rest', prop: ['binoculars', { low: 5 }] },
      { eyes: 'wide', armL: 'rest', armR: 'rest', dy: -1, legs: 'tuck', prop: ['binoculars', { low: 5, dy: -1 }] },
      { eyes: 'happy', armL: 'rest', armR: 'rest', prop: ['binoculars', { low: 5 }] },
      { eyes: 'right', armL: 'rest', armR: 'rest', prop: ['binoculars', { low: 5 }] },
      { eyes: 'left', armL: 'rest', armR: 'rest', prop: ['binoculars', { low: 5 }] },
      { eyes: 'up', armL: 'mid', armR: 'mid', prop: ['binoculars', { low: 2 }] },
      ...loop(3, n => ({ armL: 'mid', armR: 'mid', prop: ['binoculars', { glint: n }] })),
    ],
  },
  // Running on a treadmill, its belt racing under him, until he breaks a
  // sweat.
  'running.treadmill': {
    ms: 150,
    frames: loop(40, n => ({
      legs: n % 2 === 0 ? 'walkA' : 'walkB',
      dy: n % 2 === 0 ? 0 : -1,
      armL: n % 2 === 0 ? 'mid' : 'down',
      armR: n % 2 === 0 ? 'down' : 'mid',
      eyes: n % 20 === 19 ? 'closed' : 'right',
      props: [['treadmill', n], ...(n >= 20 ? [['sweat', (n - 20) % 4]] : [])],
    })),
  },
  // He watches a progress bar fill, pumping his fists as it nears the end,
  // and cheers when it is done.
  'running.progress': {
    ms: 250,
    frames: [
      ...loop(20, n => ({
        eyes: n % 8 === 7 ? 'closed' : 'up',
        armL: n >= 14 && n % 2 === 0 ? 'mid' : 'rest',
        armR: n >= 14 && n % 2 === 1 ? 'mid' : 'rest',
        legs: n % 5 === 4 ? 'walkA' : 'stand',
        prop: ['progress', n + 1],
      })),
      ...loop(6, n => ({
        eyes: 'happy',
        armL: 'up',
        armR: 'up',
        dy: n % 2 === 0 ? -2 : 0,
        legs: n % 2 === 0 ? 'tuck' : 'stand',
        prop: ['progress', 21 + n],
      })),
      ...loop(4, n => ({ eyes: 'happy', breathe: n % 2, prop: ['progress', 0] })),
    ],
  },
  // Surfing the web on a big swell: he rides up and down its face, leaning
  // into it, arms out, and catches air off the crests.
  'browsing.surf': {
    ms: 200,
    frames: loop(36, n => {
      const y0 = swellAt(5, n) - 2
      const y1 = swellAt(19, n) - 2
      const isAir = n % 12 === 4 || n % 12 === 5
      const lean = y0 < y1 ? 1 : y0 > y1 ? -1 : 0
      return {
        dy: Math.round((y0 + y1) / 2) - GROUND - (isAir ? 3 : 0),
        legs: isAir ? 'tuck' : 'stand',
        armL: lean > 0 ? 'up' : lean < 0 ? 'down' : 'mid',
        armR: lean > 0 ? 'down' : lean < 0 ? 'up' : 'mid',
        eyes: isAir ? 'happy' : 'right',
        prop: ['waves', { n, board: [5, y0 - (isAir ? 3 : 0), 19, y1 - (isAir ? 3 : 0)] }],
      }
    }),
  },
  // A page loading in a browser window: he clicks, waits on the spinner,
  // watches it fill in, and clicks on.
  'browsing.window': {
    ms: 280,
    frames: [
      { eyes: 'upright', armR: 'up', prop: ['browser', 0] },
      { eyes: 'upright', armR: 'mid', prop: ['browser', 0] },
      ...loop(6, n => ({ eyes: 'upright', breathe: n % 2, legs: n % 3 === 2 ? 'walkA' : 'stand', prop: ['browser', n % 4] })),
      ...loop(5, n => ({ eyes: 'upright', prop: ['browser', 4 + n] })),
      { eyes: 'happy', armR: 'up', prop: ['browser', 9] },
      { eyes: 'happy', armR: 'mid', prop: ['browser', 9] },
      ...loop(6, n => ({ eyes: n % 3 === 0 ? 'up' : 'upright', prop: ['browser', 9] })),
      { eyes: 'closed', prop: ['browser', 9] },
      { eyes: 'upright', armR: 'up', prop: ['browser', 9] },
      ...loop(5, n => ({ eyes: 'upright', prop: ['browser', n % 4] })),
    ],
  },
  // Handing out the work: small Clawds walk up one after another, each takes
  // a crate from him and carries it off to the right, while he fetches the
  // next from the stack.
  'delegating.handoff': {
    ms: 250,
    frames: loop(24, n => {
      const t = n % 12
      const isHolding = t < 6 || t === 11
      return {
        eyes: t === 9 || t === 10 ? 'downright' : t === 7 || t === 8 ? 'happy' : 'downleft',
        armL: t === 6 ? 'down' : isHolding ? 'mid' : 'rest',
        armR: t === 9 || t === 10 ? 'down' : isHolding ? 'mid' : 'rest',
        props: [['stack'], ['walkers', [carrier(n), carrier((n + 12) % 24)].filter(Boolean)], ...(isHolding ? [['crate', [10, 11]]] : [])],
      }
    }),
  },
  // He points up at a star out of reach: one small Clawd climbs onto the
  // other, stretches, jumps for it, and brings it down to him, and they
  // cheer; it floats back up.
  'delegating.tower': {
    ms: 260,
    frames: TOWER.map(([[x, lift, pose, side], [bx, bpose], at], f) => ({
      eyes: f < 4 || (f >= 11 && f < 15) || f >= 24 ? 'upright' : f === 15 ? 'wide' : f >= 19 && f < 24 ? 'happy' : 'downright',
      armR: f < 4 || (f >= 11 && f < 15) ? 'up' : f >= 19 && f < 24 ? 'up' : 'rest',
      armL: f >= 19 && f < 24 ? 'up' : 'rest',
      props: [
        [
          'walkers',
          [
            { x: bx, pose: bpose, side: 'right' },
            { x, pose, side, lift },
          ],
        ],
        ['star', at],
      ],
    })),
  },
  // An endless file of small Clawds marching off to the right at his orders,
  // he up on the podium waving them on.
  'rallying.line': {
    ms: 200,
    frames: loop(30, n => ({
      dy: PODIUM_LIFT,
      eyes: n % 10 < 7 ? 'downright' : 'right',
      armR: n % 6 < 3 ? 'mid' : 'up',
      armL: n % 12 < 6 ? 'rest' : 'mid',
      prop: ['line', n],
    })),
  },
  // A horde of small Clawds swarms in from both sides and piles onto him
  // until he is buried, arms flailing; he bursts free, flinging them off, and
  // catches his breath.
  'rallying.horde': {
    ms: 220,
    frames: loop(32, n => {
      const frame = { prop: ['members', hordeAt(n)] }
      if (n < 4) return { ...frame, eyes: n < 2 ? 'left' : 'right' }
      if (n < 12) return { ...frame, eyes: 'wide', dx: [0, -1, 0, 1][n % 4], armL: n % 2 === 0 ? 'up' : 'mid', armR: n % 2 === 0 ? 'mid' : 'up' }
      if (n < 20) return { ...frame, eyes: 'wide', dx: [0, 1][n % 2], armL: 'up', armR: 'up' }
      if (n === 20) return { ...frame, eyes: 'wide', dy: -2, legs: 'tuck', armL: 'up', armR: 'up' }
      if (n === 21) return { ...frame, eyes: 'happy', dy: -1, armL: 'up', armR: 'up' }
      if (n < 24) return { ...frame, eyes: 'happy', squash: n === 22 ? 1 : 0 }
      return { ...frame, eyes: n % 4 === 3 ? 'closed' : 'open', breathe: n % 2, props: [['members', []], ['sweat', (n - 24) % 4]] }
    }),
  },
  // He traces a route across a map, dot by dot, to the X, and starts again.
  'planning.map': {
    ms: 300,
    frames: [
      ...loop(14, n => ({ eyes: n % 2 === 0 ? 'down' : 'downright', breathe: n % 7 === 6 ? 1 : 0, prop: ['map', Math.floor(n / 2)] })),
      ...loop(6, n => ({ eyes: n < 3 ? 'happy' : 'down', armR: n % 2 === 0 ? 'mid' : 'rest', prop: ['map', 7 + n] })),
      ...loop(8, n => ({ eyes: n === 4 ? 'closed' : 'downleft', prop: ['map', 0] })),
    ],
  },
  // Sticky notes going up on a cork board one by one; he steps back pleased,
  // and clears it for the next plan.
  'planning.stickies': {
    ms: 300,
    frames: [
      ...loop(21, n => {
        const isPlacing = n % 3 === 0
        return {
          eyes: isPlacing ? 'upleft' : n % 3 === 1 ? 'up' : 'upright',
          armL: isPlacing ? 'up' : 'mid',
          prop: ['stickies', Math.floor(n / 3) + 1],
        }
      }),
      ...loop(4, n => ({ eyes: 'happy', breathe: n % 2, prop: ['stickies', 7] })),
      ...loop(3, () => ({ eyes: 'upleft', armL: 'up', prop: ['stickies', 0] })),
    ],
  },
  // He hammers a nail into a block, blow by blow with sparks, admires it, and
  // sets up the next.
  'tooling.hammer': {
    ms: 180,
    frames: [
      ...[0, 1, 2].flatMap(nail => [
        { eyes: 'downright', armR: 'up', prop: ['hammer', { up: true, nail }] },
        { eyes: 'downright', armR: 'up', prop: ['hammer', { up: true, nail }] },
        { eyes: 'downright', armR: 'mid', prop: ['hammer', { nail: nail + 1, hit: true }] },
        { eyes: 'downright', armR: 'mid', prop: ['hammer', { nail: nail + 1 }] },
        { eyes: 'downright', armR: 'mid', prop: ['hammer', { nail: nail + 1 }] },
      ]),
      ...loop(6, n => ({ eyes: 'happy', armR: n % 2 === 0 ? 'up' : 'mid', breathe: n % 2, prop: ['hammer', { up: n % 2 === 0, nail: 3 }] })),
      ...loop(4, () => ({ eyes: 'downright', armR: 'mid', prop: ['hammer', { nail: 3 }] })),
      ...loop(6, () => ({ eyes: 'right', armR: 'mid', prop: ['hammer', { nail: 0 }] })),
    ],
  },
  // Rummaging in a toolbox: out comes a wrench, not the one, back it goes;
  // out comes a screwdriver, and he is pleased.
  'tooling.toolbox': {
    ms: 260,
    frames: [
      ...loop(6, n => ({ eyes: 'downright', armR: n % 2 === 0 ? 'down' : 'rest', prop: ['toolbox', { open: true }] })),
      ...loop(5, n => ({ eyes: n < 3 ? 'upright' : n === 3 ? 'left' : 'right', armR: 'up', prop: ['toolbox', { open: true, tool: 1 }] })),
      ...loop(4, n => ({ eyes: 'downright', armR: n % 2 === 0 ? 'down' : 'rest', prop: ['toolbox', { open: true }] })),
      ...loop(6, n => ({ eyes: n < 2 ? 'upright' : 'happy', armR: 'up', prop: ['toolbox', { open: true, tool: 2 }] })),
      ...loop(6, n => ({ eyes: 'happy', armR: n % 2 === 0 ? 'up' : 'mid', breathe: n % 2, prop: ['toolbox', { tool: n % 2 === 0 ? 2 : 0 }] })),
      ...loop(5, () => ({ eyes: 'downright', prop: ['toolbox', {}] })),
    ],
  },
  // He pumps a sign up and down on its stick, a question on it, then an
  // exclamation, hopping to be seen.
  'waiting.sign': {
    ms: 260,
    frames: [
      ...loop(12, n => {
        const y = [-3, -3, -2, 1, 1, -2][n % 6]
        return {
          eyes: 'wide',
          armR: y < 0 ? 'up' : 'mid',
          legs: n % 6 === 3 ? 'walkA' : 'stand',
          prop: ['sign', { glyph: '?', y, tilt: n % 6 === 1 ? 1 : n % 6 === 4 ? -1 : 0 }],
        }
      }),
      ...loop(6, n => ({ eyes: n % 3 === 2 ? 'closed' : 'open', armR: 'mid', breathe: n % 2, prop: ['sign', { glyph: '?', y: 1 }] })),
      ...loop(12, n => {
        const y = [-3, -2, 1, -2][n % 4]
        return {
          eyes: 'wide',
          armR: y < 0 ? 'up' : 'mid',
          armL: n % 2 === 0 ? 'up' : 'mid',
          legs: n % 4 === 0 ? 'walkA' : 'stand',
          prop: ['sign', { glyph: '!', y }],
        }
      }),
    ],
  },
  // He taps a desk bell, ding ding, and waits, looking out at you, and taps
  // it again.
  'waiting.bell': {
    ms: 240,
    frames: [
      { eyes: 'downright', armR: 'down', prop: ['bell', true] },
      { eyes: 'downright', armR: 'rest', prop: ['bell', false] },
      { eyes: 'downright', armR: 'down', prop: ['bell', true] },
      { eyes: 'wide', armR: 'rest', prop: ['bell', false] },
      ...loop(8, n => ({ eyes: n % 4 === 3 ? 'closed' : 'wide', legs: n % 2 === 0 ? 'walkA' : 'stand', prop: ['bell', false] })),
      ...loop(4, n => ({ eyes: n < 2 ? 'left' : 'right', prop: ['bell', false] })),
      { eyes: 'downright', armR: 'down', prop: ['bell', true] },
      { eyes: 'downright', armR: 'rest', prop: ['bell', false] },
      ...loop(6, n => ({ eyes: 'wide', armL: n % 2 === 0 ? 'up' : 'mid', prop: ['bell', false] })),
      { eyes: 'downright', armR: 'down', prop: ['bell', true] },
      { eyes: 'downright', armR: 'rest', prop: ['bell', true] },
      { eyes: 'downright', armR: 'down', prop: ['bell', true] },
      ...loop(5, n => ({ eyes: 'wide', breathe: n % 2, prop: ['bell', false] })),
    ],
  },
  // A trophy held high over his head, hopping, sparkles all around; he
  // lowers it to admire it, and lifts it again.
  'done.trophy': {
    ms: 220,
    frames: [
      ...loop(8, n => {
        const dy = n % 4 === 1 ? -2 : 0
        return { eyes: 'happy', armL: 'up', armR: 'up', dy, legs: dy ? 'tuck' : 'stand', props: [['sparkles', n], ['trophy', { dy }]] }
      }),
      ...loop(8, n => ({ eyes: n % 4 === 3 ? 'closed' : 'happy', armL: 'mid', armR: 'mid', props: [['sparkles', n], ['trophy', { high: false }]] })),
      ...loop(12, n => {
        const dy = n % 6 === 2 ? -2 : 0
        return { eyes: 'happy', armL: 'up', armR: 'up', dy, legs: dy ? 'tuck' : 'stand', props: [['sparkles', n], ['trophy', { dy }]] }
      }),
    ],
  },
  // A happy dance, side to side with his arms up in turn, under falling
  // confetti.
  'done.dance': {
    ms: 200,
    frames: loop(30, n => {
      const beat = n % 8
      return {
        dx: [0, -1, -1, 0, 0, 1, 1, 0][beat],
        dy: beat === 3 || beat === 7 ? -1 : 0,
        legs: beat % 2 === 0 ? 'walkA' : 'walkB',
        armL: beat < 4 ? 'up' : 'mid',
        armR: beat < 4 ? 'mid' : 'up',
        eyes: 'happy',
        prop: ['confetti', n],
      }
    }),
  },
  // Something burnt out: dark and X-eyed with smoke pouring off him under a
  // red "!!", then coughing and fanning at it, the smoke still coming.
  'error.smoke': {
    ms: 260,
    frames: [
      ...loop(8, n => ({ color: S, eyes: 'x', dx: [0, -1, 0, 1][n % 4], armL: 'down', armR: 'down', props: [['smoke', n], ['oops', n]] })),
      ...loop(16, n => ({
        color: S,
        eyes: n % 5 < 3 ? 'closed' : 'x',
        squash: n % 5 === 2 ? 1 : 0,
        armR: n % 2 === 0 ? 'up' : 'mid',
        prop: ['smoke', n + 8],
      })),
    ],
  },
  // A rain cloud of his own, dark and drooping under it, until lightning
  // strikes him: a white flash, and he is left charred and smoking, shaking,
  // then dazed in the rain, twitching with the odd spark.
  'error.rain': {
    ms: 300,
    frames: [
      ...loop(12, n => ({
        color: S,
        eyes: n % 6 === 5 ? 'closed' : 'down',
        breathe: n % 4 < 2 ? 1 : 0,
        armL: 'down',
        armR: 'down',
        prop: ['rain', { n }],
      })),
      { color: S, eyes: 'up', armL: 'down', armR: 'down', prop: ['rain', { n: 12 }] },
      { color: WT, eyes: 'x', armL: 'up', armR: 'up', props: [['rain', { flash: true }], ['bolt', 0]] },
      { color: D, eyes: 'x', armL: 'up', armR: 'up', props: [['rain', { flash: true }], ['bolt', 1]] },
      ...loop(4, n => ({
        color: D,
        eyes: 'x',
        dx: [-1, 1, -1, 0][n],
        armL: 'down',
        armR: 'down',
        props: [['rain', { n: 13 + n }], ['smoke', n]],
      })),
      ...loop(8, n => {
        const isTwitch = n === 2 || n === 5
        return {
          color: D,
          eyes: 'x',
          breathe: isTwitch ? 0 : 1,
          armL: isTwitch ? 'up' : 'down',
          armR: isTwitch ? 'up' : 'down',
          props: [['rain', { n: 17 + n }], ['smoke', 4 + n], ...(isTwitch ? [['bolt', 2]] : [])],
        }
      }),
      ...loop(6, n => ({ color: S, eyes: 'down', breathe: 1, armL: 'down', armR: 'down', prop: ['rain', { n: 25 + n }] })),
    ],
  },
  // He squishes himself down flat, all the way, holds it, and springs back
  // up tall; a quick shallow one, and a deep one held long.
  'compacting.squeeze': {
    ms: 200,
    frames: [
      { eyes: 'up' },
      { eyes: 'up', breathe: 1 },
      { squash: 1, eyes: 'closed', armL: 'mid', armR: 'mid' },
      { squash: 2, eyes: 'closed', armL: 'mid', armR: 'mid' },
      { squash: 3, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 4, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 5, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 5, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 4, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 2, eyes: 'closed', armL: 'mid', armR: 'mid' },
      { squash: -1, eyes: 'wide', armL: 'up', armR: 'up' },
      { squash: -2, eyes: 'happy', armL: 'up', armR: 'up' },
      { squash: -1, eyes: 'happy', armL: 'mid', armR: 'mid' },
      {},
      { squash: 2, eyes: 'closed', armL: 'mid', armR: 'mid' },
      { squash: 3, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 2, eyes: 'closed', armL: 'mid', armR: 'mid' },
      { squash: -1, eyes: 'open', armL: 'up', armR: 'up' },
      {},
      { squash: 1, eyes: 'closed', armL: 'mid', armR: 'mid' },
      { squash: 3, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 5, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 6, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 6, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 6, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 4, eyes: 'squished', armL: 'none', armR: 'none' },
      { squash: 1, eyes: 'wide', armL: 'mid', armR: 'mid' },
      { squash: -2, eyes: 'happy', armL: 'up', armR: 'up' },
      { dy: -2, legs: 'tuck', eyes: 'happy', armL: 'up', armR: 'up' },
      { squash: 1, eyes: 'happy' },
    ],
  },
  // A stick vacuum in his hand, its head on the floor beside him: the bits
  // roll and hop into it, the air rushing in, until the floor is clean.
  'compacting.vacuum': {
    ms: 160,
    frames: [
      ...loop(36, n => ({
        dx: -3,
        eyes: n % 12 < 9 ? 'downright' : 'right',
        armR: 'down',
        breathe: n % 6 === 5 ? 1 : 0,
        legs: n % 12 === 6 ? 'walkA' : 'stand',
        prop: ['vacuum', n],
      })),
      ...loop(6, n => ({ dx: -3, eyes: 'happy', armR: 'down', armL: n % 2 === 0 ? 'up' : 'mid', prop: ['vacuum', -1] })),
    ],
  },
})

// What each mood can be drawn as, its own animation first, each with the
// short name the settings show.
export const VARIANTS = {
  idle: [
    ['idle', 'Classic'],
    ['idle.coffee', 'Coffee'],
    ['idle.tune', 'Humming'],
  ],
  sleeping: [
    ['sleeping', 'Classic'],
    ['sleeping.blanket', 'Tucked in'],
    ['sleeping.doze', 'Dozing'],
  ],
  thinking: [
    ['thinking', 'Classic'],
    ['thinking.pace', 'Pacing'],
    ['thinking.cube', 'Cube'],
  ],
  responding: [
    ['responding', 'Classic'],
    ['responding.letter', 'Letter'],
    ['responding.board', 'Board'],
  ],
  typing: [
    ['typing', 'Classic'],
    ['typing.matrix', 'Matrix'],
    ['typing.desk', 'Desk'],
  ],
  reading: [
    ['reading', 'Classic'],
    ['reading.paper', 'Paper'],
    ['reading.tablet', 'Tablet'],
  ],
  searching: [
    ['searching', 'Classic'],
    ['searching.flashlight', 'Torch'],
    ['searching.binoculars', 'Binocs'],
  ],
  running: [
    ['running', 'Classic'],
    ['running.treadmill', 'Treadmill'],
    ['running.progress', 'Progress'],
  ],
  browsing: [
    ['browsing', 'Classic'],
    ['browsing.surf', 'Surfing'],
    ['browsing.window', 'Browser'],
  ],
  delegating: [
    ['delegating', 'Classic'],
    ['delegating.handoff', 'Hand-off'],
    ['delegating.tower', 'Tower'],
  ],
  rallying: [
    ['rallying', 'Classic'],
    ['rallying.line', 'Line'],
    ['rallying.horde', 'Horde'],
  ],
  planning: [
    ['planning', 'Classic'],
    ['planning.map', 'Map'],
    ['planning.stickies', 'Stickies'],
  ],
  tooling: [
    ['tooling', 'Classic'],
    ['tooling.hammer', 'Hammer'],
    ['tooling.toolbox', 'Toolbox'],
  ],
  waiting: [
    ['waiting', 'Classic'],
    ['waiting.sign', 'Sign'],
    ['waiting.bell', 'Bell'],
  ],
  done: [
    ['done', 'Classic'],
    ['done.trophy', 'Trophy'],
    ['done.dance', 'Dance'],
  ],
  error: [
    ['error', 'Classic'],
    ['error.smoke', 'Smoke'],
    ['error.rain', 'Rain'],
  ],
  compacting: [
    ['compacting', 'Classic'],
    ['compacting.squeeze', 'Squeeze'],
    ['compacting.vacuum', 'Vacuum'],
  ],
}

export const ANIMATIONS = Object.keys(ANIMS)

const cache = new Map()

// The frames of one animation as grids, and how long each frame shows.
export const framesOf = name => {
  const key = ANIMS[name] ? name : 'idle'
  const hit = cache.get(key)
  if (hit) return hit
  const anim = ANIMS[key]
  const frames = anim.frames.map(o => {
    const g = new Uint8Array(W * H)
    const props = o.props ?? (o.prop ? [o.prop] : [])
    for (const [prop, step] of props) if (!HELD.has(prop)) PROPS[prop](g, step)
    clawd(g, o)
    for (const [prop, step] of props) if (HELD.has(prop)) PROPS[prop](g, step)
    return g
  })
  const out = { ms: anim.ms, frames }
  cache.set(key, out)
  return out
}
