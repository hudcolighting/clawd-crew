// Clawd Crew: a pane of little Clawds, one for every running Claude Code
// session and its subagents, each animated by what it is doing and labelled
// with its model, how long it has been at it and the tokens it is using,
// under a header of the account's usage limits and the crew's totals.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, TurnUsage } from 'claude-code'

import type { CrewChip, CrewCrowd, CrewLimit, CrewMember, CrewPhase, CrewStyle, CrewTone, CrewView } from '../types'
import { COLUMNS, ICON_COLUMNS, ICON_ROWS, ROWS, cellsOf, iconCells } from './cells'
import {
  type Io,
  buildView,
  limitsAsked,
  loadAnimations,
  me,
  nameHelpers,
  peekPeers,
  pollAlive,
  pollRegistry,
  publish,
  restore,
  retire,
  saveAnimations,
  setPaths,
  shareLimits,
  shouldAskLimits,
  track,
} from './crew'
import { iconSvg } from './icon.js'
import { VARIANTS } from './sprites.js'
import { clawdSvg } from './svg.js'
import { isUsageLeader, pollUsage, releaseUsage } from './usage'
import { clip } from './words'

const PANE = 'clawd-crew'
const TITLE = 'Clawd Crew'
const DOCK_COLUMNS = 56
const TICK_MS = 1000
const BLIT_MS = 120

// Tagged so a value an older build kept, in another shape, reads as absent.
const view = atom(
  { plugin: 'clawd-crew', key: 'view' } as const,
  { header: { limits: [], note: '', totals: [] }, groups: [], summary: '', style: 'pixels' } as CrewView,
  { shape: 'groups-7' },
)

const TONES: Record<CrewTone, string | undefined> = {
  work: '#D97757',
  wait: '#E5A33D',
  done: '#6FAE5A',
  error: '#E0524A',
  idle: undefined,
}

// The header's columns: its labels ("5-hour", "Tokens"), wider for a longer
// one up to a limit, and its usage bars, in cells; on the desktop a bar is
// half a line tall.
const LABEL_CELLS = 6
const LABEL_MAX_CELLS = 8
const BAR_CELLS = 8
const BAR_ROWS = 0.5
const RULE_ROWS = 0.125
// The space above a workflow phase that shows its agents, and above the one
// after it, on the desktop; a blank line on the terminal. Phases that are
// over and show none stay together.
const PHASE_GAP_ROWS = 0.6
// A workflow agent's Clawd, in cells across.
const CHIP_ICON_CELLS = 6
// The empty part of a usage bar, and the rule under the header.
const TRACK = '#3d3a36'
// The moods the settings list, in order, each with a title and a word on
// when it shows; and the settings' columns, in cells: the mood's, and each
// animation's.
const MOODS: readonly (readonly [mood: string, title: string, when: string])[] = [
  ['idle', 'Idle', 'Your turn'],
  ['sleeping', 'Asleep', 'Idle 10+ min'],
  ['thinking', 'Thinking', 'Pondering'],
  ['responding', 'Replying', 'Answering'],
  ['typing', 'Editing', 'Edit, Write'],
  ['reading', 'Reading', 'Read'],
  ['searching', 'Searching', 'Grep, Glob'],
  ['running', 'Running', 'Bash, shell'],
  ['browsing', 'Browsing', 'On the web'],
  ['delegating', 'Delegating', 'Subagents'],
  ['rallying', 'Rallying', 'Workflows'],
  ['planning', 'Planning', 'Todos, plans'],
  ['tooling', 'Tooling', 'Other tools'],
  ['waiting', 'Waiting', 'Needs you'],
  ['done', 'Done', 'Finished'],
  ['error', 'Error', 'Hit an error'],
  ['compacting', 'Compacting', 'Context full'],
]
const MOOD_CELLS = 13
// The moods a page of the settings shows. Every animation shown plays in a
// surface module of its own, and the desktop drops them all when too many
// play at once: three moods' worth is about a crew's.
const MOODS_PER_PAGE = 3
const PICK_CELLS = 10

const sprites = new Map<string, string>()

// One SVG per mood and tooltip, made once, for the `svg` style.
const spriteOf = (mood: string, tip: string) => {
  const key = `${mood}\n${tip}`
  let svg = sprites.get(key)
  if (!svg) {
    svg = clawdSvg(mood, { title: tip })
    if (sprites.size > 400) sprites.clear()
    sprites.set(key, svg)
  }
  return svg
}

// The file system and processes for crew.ts, which may not hold `$` itself.
const ioOf = ($: EngineInterface): Io => ({
  read: path => $.fs.read(path),
  write: (path, text) => $.fs.write(path, text),
  list: path => $.fs.list(path),
  exists: path => $.fs.exists(path),
  stat: path => $.fs.stat(path),
  run: (argv, timeoutMs, stdin) => $.process.run(argv, stdin === undefined ? { timeoutMs } : { timeoutMs, stdin }),
})

const openUnasked = async ($: EngineInterface) => {
  if ((await $.store.get('hidden')) === true) return
  const surfaces = await $.session.surfaces()
  const isRemote = surfaces.some(surface => surface !== 'terminal')
  // A terminal gets it unasked only once the person has asked for it before.
  if (!isRemote && (await $.store.get('wanted')) !== true) return
  await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS })
}

let style: CrewStyle = 'pixels'
let isTicking = false
let ticks = 0
let shown = ''
let blitTicks = 0
// The terminal's sprite rasters on screen, by key, and the frame each shows.
const mounted = new Map<string, { mood: string; frame: number }>()
// The animation the person picked for each mood where not its own, as the
// settings file every session shares keeps them; and whether this pane
// shows its settings in place of the crew.
let picks: Record<string, string> = {}
let isSetting = false
let settingsPage = 0
// Whether new and reopened sessions open the pane by themselves, as the
// settings set it for every session (kept in the store as `hidden`).
let opensItself = true

// Each Button is one lasting element, made once for each look, so it keeps
// its press handle from drawing to drawing. The desktop holds a new drawing
// back while the mouse button is down and sends the click to the drawing on
// screen, so a Button made afresh in each drawing has a new handle by then
// and the click lands nowhere. Clicking into the pane draws it again (it
// takes the focus), so that was every first click. A press runs what the
// latest drawing set for its key.
type ButtonLook = { plain?: true; dimColor?: boolean; variant?: 'primary' }
const buttons = new Map<string, RenderElement>()
const actions = new Map<string, () => void>()
// A press this soon after the last one is that press again (a double
// click, or a mouse sending one click twice), and does nothing.
const PRESS_GAP_MS = 300
let pressedAt = Number.NEGATIVE_INFINITY
// Where the credit under the settings links.
const MAKER_URL = 'https://github.com/hudcolighting'

// Builds the view and draws it again if anything it shows has changed.
const refresh = async ($: EngineInterface, now: number) => {
  const fresh: CrewView = { ...buildView(now, style), animations: picks, isSetting, settingsPage, opensItself }
  const text = JSON.stringify(fresh)
  if (text === shown) return
  shown = text
  await update($, view, () => fresh)
}

// With no session holding the usage limits, as on a first start, the
// session reading the transcripts asks for them with a one-token request,
// rather than leave the header without them until a reply.
let isAsking = false
const askLimits = async ($: EngineInterface, io: Io) => {
  if (isAsking) return
  isAsking = true
  try {
    const usage = await $.session.usage()
    track.measured(usage.context, usage.cost, usage.rateLimits)
    if (!(await shouldAskLimits(io, await $.clock.now()))) return
    await $.model.complete({ model: 'haiku', prompt: 'Reply with OK.', maxTokens: 1, timeoutMs: 30_000 }).catch(() => undefined)
    const answered = await $.session.usage()
    track.measured(answered.context, answered.cost, answered.rateLimits)
    const now = await $.clock.now()
    await limitsAsked(io, now, answered.rateLimits.length > 0)
    await shareLimits(io, now)
    await refresh($, now)
  } catch (error) {
    $.ui.log(`asking for the limits failed: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
  } finally {
    isAsking = false
  }
}

// Once a second: gather every session's state, publish this one's, and
// redraw the pane when anything it shows has changed.
const tick = async ($: EngineInterface, io: Io) => {
  if (isTicking) return
  isTicking = true
  ticks += 1
  try {
    const now = await $.clock.now()
    if (!me.sessionId) track.sessionStarted(await $.session.id(), await $.session.cwd())
    if (ticks % 60 === 1) void pollAlive(io, now)
    if (ticks % 2 === 1) await pollRegistry(io, now)
    if (ticks % 3 === 0) track.listed(await $.agent.list(), now)
    if (ticks % 2 === 0) void nameHelpers(io, now)
    if (ticks % 5 === 0) {
      const usage = await $.session.usage()
      track.measured(usage.context, usage.cost, usage.rateLimits)
    }
    if (ticks % 5 === 1) void pollUsage(io, me.sessionId, now)
    // A setting changed in another session's settings.
    if (ticks % 5 === 3) {
      picks = await loadAnimations(io)
      opensItself = (await $.store.get('hidden')) !== true
    }
    if (ticks % 4 === 2) void peekPeers(io, now)
    if (ticks % 30 === 6 && isUsageLeader()) void askLimits($, io)
    await publish(io, now)
    await shareLimits(io, now)
    await refresh($, now)
  } catch (error) {
    $.ui.log(`tick failed: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
  } finally {
    isTicking = false
  }
}

// The terminal has no SVG: its sprites are cell rasters stepped here.
const animateTerminal = async ($: EngineInterface) => {
  blitTicks += 1
  for (const [key, held] of mounted) {
    const { ms, cells } = cellsOf(held.mood)
    const frame = Math.floor((blitTicks * BLIT_MS) / ms) % cells.length
    if (frame === held.frame) continue
    held.frame = frame
    const blitted = await $.ui.blit({ requestId: PANE, key, cells: cells[frame]! })
    if (blitted.deny) mounted.delete(key)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    setPaths({
      custom: await $.env.get('CLAUDE_CONFIG_DIR'),
      profile: await $.env.get('USERPROFILE'),
      home: await $.env.get('HOME'),
      os: await $.env.get('OS'),
    })
    const io = ioOf($)
    track.sessionStarted(await $.session.id(), e.cwd)
    style = (await $.store.get('style')) === 'svg' ? 'svg' : 'pixels'
    await restore(io, await $.clock.now())
    opensItself = (await $.store.get('hidden')) !== true
    picks = await loadAnimations(io)
    await $.command.register({
      name: 'clawds',
      description: 'Show the Clawd Crew: every Claude Code session and subagent at work',
      argumentHint: '[hide | style pixels | style svg]',
    })
    $.clock.every(TICK_MS, () => void tick($, io))
    if ((await $.session.surfaces()).includes('terminal')) $.clock.every(BLIT_MS, () => void animateTerminal($))
    void openUnasked($)
    return started
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    if (e.surface !== 'terminal') void openUnasked($)
    return attached
  })

  on('session.end', async ($, e, next) => {
    const io = ioOf($)
    const now = await $.clock.now()
    // Reading the transcripts falls to another session.
    await releaseUsage(io, e.sessionId).catch(() => undefined)
    await retire(io, e.sessionId, now).catch(() => undefined)
    if (e.reason === 'clear') track.cleared()
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    track.turnStarted(await $.clock.now())
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    track.stepStarted(e.agentId, e.model, await $.clock.now())
    let usage: TurnUsage | null = null
    // However the step ends (an error, an interrupt), it is no longer under way.
    try {
      const stream = next(e)
      for await (const chunk of stream) {
        try {
          track.chunk(e.agentId, chunk)
        } catch {
          // Watching must never break the stream.
        }
        yield chunk
      }
      const result = await stream.result
      usage = result.usage
      return result
    } finally {
      track.stepEnded(e.agentId, usage, await $.clock.now())
    }
  })

  on('turn.complete', async ($, e, next) => {
    track.turnCompleted(e.agentId, e.reason, e.usage, await $.clock.now())
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `${e.tool}:${Math.random()}`
    track.toolStarted(e.agentId, id, e.tool, e, await $.clock.now())
    try {
      return await next(e)
    } finally {
      track.toolEnded(e.agentId, id, await $.clock.now())
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.agentId) track.spawned(spawned.agentId, e.subagentType, e.description, spawned.model, await $.clock.now())
    return spawned
  })

  on('session.compact', async ($, e, next) => {
    me.compacting = true
    try {
      return await next(e)
    } finally {
      me.compacting = false
    }
  })

  on('session.measure', ($, e, next) => {
    track.measured(e.context, e.cost, e.rateLimits)
    return next(e)
  })

  on('command.run', { command: 'clawds' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (/^(hide|close|off)$/.test(args)) {
      opensItself = false
      await $.store.set('hidden', true)
      await $.ui.close({ id: PANE })
      return { text: 'Clawd Crew is off duty. Run /clawds to call them back.' }
    }
    const styled = /^style\s+(pixels|svg)$/.exec(args)
    if (styled) {
      style = styled[1] === 'svg' ? 'svg' : 'pixels'
      await $.store.set('style', style)
      await refresh($, await $.clock.now())
      return {
        text:
          style === 'svg'
            ? 'Clawd Crew now draws SVG sprites (the app restarts their animation when the pane redraws).'
            : 'Clawd Crew now draws its sprites as boxes of color, animated without redraws.',
      }
    }
    await $.store.set('wanted', true)
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS })
    return { text: opened.isPlaced ? 'Clawd Crew is on duty.' : `Clawd Crew shows up once there is room: ${opened.reason}` }
  })

  // A header of usage bars and totals, then one group per session: its own
  // row, then its helpers' rows. No Box takes a key: a keyed Box is a hover
  // scope, which the desktop redraws whole.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const crew = await read($, view)
    const isTerminal = e.surface === 'terminal'
    const { Box, Text, Button, Link } = $.ui.resolve(e)

    // One press, however many clicks arrive together.
    const pressOnce = async (act: () => Promise<void>) => {
      const now = await $.clock.now()
      if (now - pressedAt < PRESS_GAP_MS) return
      pressedAt = now
      await act()
    }
    // A Button, as the lasting element for its look; `act` is what pressing
    // it does now.
    const button = (key: string, label: string, look: ButtonLook, act: () => Promise<void>) => {
      actions.set(key, () => void pressOnce(act))
      const id = JSON.stringify([e.surface, key, label, look])
      let made = buttons.get(id)
      if (!made) {
        if (buttons.size > 400) buttons.clear()
        made = (
          <Button key={key} {...look} onPress={() => actions.get(key)?.()}>
            {label}
          </Button>
        )
        buttons.set(id, made)
      }
      return made
    }

    // The animation a mood is drawn with: the one picked for it, if it is
    // one of that mood's.
    const animOf = (mood: string) => {
      const picked = crew.animations?.[mood]
      return picked !== undefined && VARIANTS[mood]?.some(([name]) => name === picked) ? picked : mood
    }

    // A line in its tone's color, or dim for a tone without one.
    const toned = (tone: CrewTone, text: string) => {
      const color = TONES[tone]
      return color ? (
        <Text color={color} wrap="truncate-end">
          {text}
        </Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          {text}
        </Text>
      )
    }

    const { limits, note, totals } = crew.header
    const labelCells = Math.min(LABEL_MAX_CELLS, Math.max(LABEL_CELLS, ...limits.map(limit => limit.label.length)))
    const label = (text: string) => (
      <Box width={labelCells} flexShrink={0}>
        <Text bold wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
    // How much of a window is left, as a bar that drains as it is used.
    const bar = (limit: CrewLimit, color: string) => {
      if (isTerminal) {
        const filled = limit.left > 0 ? Math.max(1, Math.round(limit.left * BAR_CELLS)) : 0
        return (
          <Box flexDirection="row" flexShrink={0}>
            {filled > 0 && <Text color={color}>{'━'.repeat(filled)}</Text>}
            {filled < BAR_CELLS && <Text dimColor>{'─'.repeat(BAR_CELLS - filled)}</Text>}
          </Box>
        )
      }
      return (
        <Box flexDirection="row" flexShrink={0} width={BAR_CELLS} height={BAR_ROWS} backgroundColor={TRACK}>
          {limit.left > 0 && <Box width={limit.left * BAR_CELLS} height={BAR_ROWS} backgroundColor={color} />}
        </Box>
      )
    }
    const fact = (name: string, text: string) => (
      <Box flexDirection="row" columnGap={1}>
        {label(name)}
        <Text dimColor wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
    const header =
      crew.summary === '' ? (
        <Text dimColor wrap="truncate-end">
          Rounding up the Clawds…
        </Text>
      ) : (
        <Box flexDirection="column">
          {limits.map(limit => {
            const color = TONES[limit.tone] ?? '#D97757'
            return (
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                {label(limit.label)}
                {bar(limit, color)}
                <Box flexShrink={0}>
                  <Text bold color={color}>
                    {limit.percent}
                  </Text>
                </Box>
                {limit.resets !== '' && (
                  <Text dimColor wrap="truncate-end">
                    {`· ${limit.resets}`}
                  </Text>
                )}
              </Box>
            )
          })}
          {note !== '' && fact('Limits', note)}
          {totals.map(total => fact(total.label, total.text))}
          {fact('Crew', crew.summary)}
        </Box>
      )
    // A state's dot, in its tone's color, or dim for a tone without one.
    const dot = (tone: CrewTone) => {
      const color = TONES[tone]
      return color ? <Text color={color}>●</Text> : <Text dimColor>●</Text>
    }
    // A crowd of helpers: each phase and how its helpers are faring, then the
    // helpers in two columns, each its Clawd (or dot) beside its name, what
    // it is doing, and how long it has worked with the tokens it used.
    // A phase's line: its title, checked off in color once over, and how its
    // agents are faring, its time and its tokens, cut to the pane's width: a
    // long title gives way to the figures, down to 8 cells.
    const phaseLine = (phase: CrewPhase, cells: number) => {
      const color = TONES[phase.tone]
      const title = clip(phase.title, Math.max(8, cells - 1 - phase.summary.length))
      const room = cells - 1 - title.length
      const summary = room >= 4 ? clip(phase.summary, room) : ''
      return (
        <Box flexDirection="row" columnGap={1}>
          {color ? (
            <Text bold color={color} wrap="truncate-end">
              {title}
            </Text>
          ) : (
            <Text bold wrap="truncate-end">
              {title}
            </Text>
          )}
          {summary !== '' && (
            <Text dimColor wrap="truncate-end">
              {summary}
            </Text>
          )}
        </Box>
      )
    }
    const crowdView = (crowd: CrewCrowd, indent: number, icon: (chip: CrewChip) => RenderElement, iconCells: number) => {
      const lineCells = Math.max(8, e.props.bodyColumns - indent)
      const cells = Math.max(12, Math.floor(lineCells / 2))
      // An agent's lines, cut to fit its column with a cell to spare, so a
      // long status never runs under the Clawd beside it.
      const textCells = Math.max(4, cells - iconCells - 2)
      return (
        <Box flexDirection="column" marginLeft={indent}>
          {crowd.phases.map((phase, index) => {
            const previous = crowd.phases[index - 1]
            const isSpaced = previous !== undefined && (phase.chips.length > 0 || previous.chips.length > 0)
            return (
              <Box flexDirection="column">
                {isSpaced && <Box height={isTerminal ? 1 : PHASE_GAP_ROWS} />}
                {phaseLine(phase, lineCells)}
                <Box flexDirection="row" flexWrap="wrap">
                  {phase.chips.map(chip => (
                    <Box flexDirection="row" width={cells} flexShrink={0} columnGap={1} overflow="hidden">
                      {icon(chip)}
                      <Box flexDirection="column" width={textCells} flexShrink={0} overflow="hidden">
                        <Text bold wrap="truncate-end">
                          {clip(chip.name, textCells)}
                        </Text>
                        {toned(chip.tone, clip(chip.doing, textCells))}
                        <Text dimColor wrap="truncate-end">
                          {clip(chip.fact, textCells)}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )
          })}
          {crowd.more > 0 && (
            <Text dimColor wrap="truncate-end">
              {`+${crowd.more} more`}
            </Text>
          )}
        </Box>
      )
    }
    // The settings button at the header's top right opens them in place of
    // the crew, and Done closes them.
    const toggleSettings = async () => {
      isSetting = !isSetting
      await refresh($, await $.clock.now())
    }
    const top = (
      <Box flexDirection="row" columnGap={1}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {header}
        </Box>
        {button('settings', '⚙', { plain: true }, toggleSettings)}
      </Box>
    )
    // A pick, kept for every session; its own animation is no pick at all.
    const pick = async (mood: string, name: string) => {
      const { [mood]: _, ...others } = picks
      picks = name === mood ? others : { ...others, [mood]: name }
      await saveAnimations(ioOf($), picks)
      await refresh($, await $.clock.now())
    }
    // The settings, a page of moods at a time: each mood, what it means, and
    // its animations, each shown playing where the surface can, with a
    // button under it to pick it; the arrows turn the page. At the foot, the
    // credit beside the Clawd Crew icon, drawn as the surface draws Clawds.
    const pages = Math.ceil(MOODS.length / MOODS_PER_PAGE)
    const page = crew.settingsPage ?? 0
    // Whether the pane opens by itself, for every session; a terminal's
    // too, which otherwise waits to be asked once.
    const setOpensItself = async (isOn: boolean) => {
      opensItself = isOn
      await $.store.set('hidden', !isOn)
      if (isOn) await $.store.set('wanted', true)
      await refresh($, await $.clock.now())
    }
    const turn = async (by: number) => {
      settingsPage = Math.min(Math.max(settingsPage + by, 0), pages - 1)
      await refresh($, await $.clock.now())
    }
    const settings = (show: (name: string, label: string) => RenderElement | false, icon: RenderElement) => (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              Settings
            </Text>
          </Box>
          {button('settings-done', 'Done', {}, toggleSettings)}
        </Box>
        <Box flexDirection="row" columnGap={1} marginTop={1}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              Opens by itself
            </Text>
            <Text dimColor wrap="truncate-end">
              In new and reopened sessions
            </Text>
          </Box>
          {button('opens-on', 'On', crew.opensItself !== false ? { variant: 'primary' } : { dimColor: true }, () => setOpensItself(true))}
          {button('opens-off', 'Off', crew.opensItself === false ? { variant: 'primary' } : { dimColor: true }, () => setOpensItself(false))}
        </Box>
        <Box flexDirection="row" columnGap={1} marginTop={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="truncate-end">
              Animations
            </Text>
          </Box>
          {button('settings-back', '◀', page === 0 ? { plain: true, dimColor: true } : { plain: true }, () => turn(-1))}
          <Text dimColor>{`${page + 1}/${pages}`}</Text>
          {button('settings-next', '▶', page === pages - 1 ? { plain: true, dimColor: true } : { plain: true }, () => turn(1))}
        </Box>
        <Text dimColor wrap="truncate-end">
          How each mood is drawn, in every session.
        </Text>
        {MOODS.slice(page * MOODS_PER_PAGE, (page + 1) * MOODS_PER_PAGE).map(([mood, title, when]) => {
          const current = animOf(mood)
          return (
            <Box flexDirection="row" columnGap={1} marginTop={1}>
              <Box flexDirection="column" width={MOOD_CELLS} flexShrink={0}>
                <Text bold wrap="truncate-end">
                  {title}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {when}
                </Text>
              </Box>
              {(VARIANTS[mood] ?? []).map(([name, label]) => (
                <Box flexDirection="column" width={PICK_CELLS} flexShrink={0}>
                  {show(name, label)}
                  {button(`pick:${name}`, label, name === current ? { variant: 'primary' } : { dimColor: true }, () => pick(mood, name))}
                </Box>
              ))}
            </Box>
          )
        })}
        <Box flexDirection="row" columnGap={1} alignItems="center" marginTop={1}>
          {icon}
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              Made by <Link href={MAKER_URL}>hudcolighting</Link>
            </Text>
          </Box>
        </Box>
      </Box>
    )
    const rule = isTerminal ? (
      <Text dimColor wrap="truncate-end">
        {'─'.repeat(Math.max(1, e.props.bodyColumns))}
      </Text>
    ) : (
      <Box flexDirection="column" height={1} justifyContent="center">
        <Box height={RULE_ROWS} backgroundColor={TRACK} />
      </Box>
    )

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const seen = new Set<string>()
      const row = (member: CrewMember) => {
        const key = `sprite:${member.key}`
        seen.add(key)
        const held = mounted.get(key)
        const mood = animOf(member.mood)
        if (!held || held.mood !== mood) mounted.set(key, { mood, frame: 0 })
        return (
          <Box flexDirection="row">
            <Raster key={key} columns={COLUMNS} rows={ROWS} cells={cellsOf(mood).cells[mounted.get(key)!.frame]!} />
            <Box flexDirection="column" flexGrow={1} flexShrink={1} marginLeft={1}>
              <Text bold={!member.isAgent} wrap="truncate-end">
                {member.name}
              </Text>
              {toned(member.tone, member.doing)}
              {member.facts.map(fact => (
                <Text dimColor wrap="truncate-end">
                  {fact}
                </Text>
              ))}
            </Box>
          </Box>
        )
      }
      const groups = crew.groups.map(group => (
        <Box flexDirection="column">
          {row(group.head)}
          {group.helpers.length > 0 && (
            <Box flexDirection="column" marginLeft={3}>
              {group.helpers.map(row)}
            </Box>
          )}
          {group.crowd && crowdView(group.crowd, 2, chip => dot(chip.tone), 1)}
        </Box>
      ))
      for (const key of mounted.keys()) if (!seen.has(key)) mounted.delete(key)
      return (
        <Box flexDirection="column">
          {top}
          {rule}
          {crew.isSetting ? settings(() => false, <Raster key="icon" columns={ICON_COLUMNS} rows={ICON_ROWS} cells={iconCells()} />) : groups}
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e)
    // The desktop draws each Clawd as a surface module, which outlives the
    // pane's redraws. Mobile and VS Code draw no surface modules, so they get
    // the SVG sprites, as every surface does in the `svg` style. Each module
    // is named as a fixed path where it is drawn.
    const modules = (() => {
      if (e.surface !== 'desktop' || crew.style === 'svg') return undefined
      const { Client } = $.ui.resolve(e)
      return {
        sprite: (member: CrewMember) => (
          <Client
            key={`sprite:${member.key}`}
            module="./sprite-client.tsx"
            props={{ mood: animOf(member.mood), size: member.isAgent ? 'helper' : 'session' }}
            width={member.isAgent ? 9 : 12}
            height={member.isAgent ? 4 : 5}
          />
        ),
        chip: (chip: CrewChip) => (
          <Client key={`sprite:${chip.key}`} module="./sprite-client.tsx" props={{ mood: animOf(chip.mood), size: 'tiny' }} width={6} height={3} />
        ),
        preview: (name: string) => <Client key={`preview:${name}`} module="./sprite-client.tsx" props={{ mood: name, size: 'helper' }} width={9} height={4} />,
        icon: <Client key="icon" module="./icon-client.tsx" width={10} height={5} />,
      }
    })()
    const sprite = (member: CrewMember) =>
      modules?.sprite(member) ?? (
        <Svg source={spriteOf(animOf(member.mood), member.tip)} alt={member.name} width={member.isAgent ? 48 : 72} height={member.isAgent ? 40 : 60} isInteractive />
      )
    // A crowd's helper: a tiny Clawd of its own.
    const chipSprite = (chip: CrewChip) =>
      modules?.chip(chip) ?? <Svg source={spriteOf(animOf(chip.mood), chip.name)} alt={chip.name} width={30} height={25} isInteractive />
    const row = (member: CrewMember) => (
      <Box flexDirection="row">
        {sprite(member)}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} marginLeft={1}>
          <Text bold={!member.isAgent} wrap="truncate-end">
            {member.name}
          </Text>
          {toned(member.tone, member.doing)}
          {member.facts.map(fact => (
            <Text dimColor wrap="truncate-end">
              {fact}
            </Text>
          ))}
        </Box>
      </Box>
    )
    // An animation in the settings, playing.
    const preview = (name: string, label: string) =>
      modules?.preview(name) ?? <Svg source={spriteOf(name, label)} alt={label} width={48} height={40} isInteractive />
    const icon = modules?.icon ?? <Svg source={iconSvg()} alt="Clawd Crew" width={40} height={40} />
    return (
      <Box flexDirection="column">
        {top}
        {rule}
        {crew.isSetting
          ? settings(preview, icon)
          : crew.groups.map((group, index) => (
              <Box flexDirection="column" marginTop={index === 0 ? 0 : 1}>
                {row(group.head)}
                {group.helpers.length > 0 && (
                  <Box flexDirection="column" marginLeft={4}>
                    {group.helpers.map(row)}
                  </Box>
                )}
                {group.crowd && crowdView(group.crowd, 2, chipSprite, CHIP_ICON_CELLS)}
              </Box>
            ))}
      </Box>
    )
  })
}
