// Who is working, and on what. This session's own loops come from the
// engine's events; every other running session from the registry the engine
// keeps under <config>/sessions, enriched by the live file each session
// running this mod publishes, or, for one that does not, by a peek at the
// tail of its transcript.

import type { AgentInfo, SessionRateLimit, TurnStepChunk, TurnUsage } from 'claude-code'

import type { CrewChip, CrewCrowd, CrewGroup, CrewHeader, CrewLimit, CrewMember, CrewPhase, CrewStyle, CrewTone, CrewView } from '../types'
import { type Totals, isTotalReady, isUsageReady, setUsagePaths, usageSince, usageTotal } from './usage'
import { type Doing, type Mood, briefly, clip, describeTool, doingLine, elapsed, isWorkMood, modelName, money, roughly, shortCount } from './words'

// The file system and processes, as the hooks module reaches them for us:
// only it may hold the engine interface.
export type Io = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<readonly { name: string; kind: string; size: number; mtimeMs: number }[]>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<{ size: number; mtimeMs: number }>
  run: (argv: string[], timeoutMs: number, stdin?: string) => Promise<{ stdout: string }>
}

const SLEEP_AFTER_MS = 10 * 60_000
const FLASH_MS = 6_000
// Each change of a Clawd's animation reloads its sprite: hold one at least
// this long, unless the change is one to see at once.
const SPRITE_HOLD_MS = 2_000
const HELPER_LINGER_MS = 12_000
// A running helper with no step or tool call in flight and none for this long
// is taken for over: its end was missed (the mod loaded mid-run, say).
const HELPER_IDLE_MS = 120_000
const HELPER_FORGET_MS = 5 * 60_000
const LIVE_STALE_MS = 30_000
const TRAIL_WINDOW_MS = 10 * 60_000
const TAIL_BYTES = 160_000
// A session's subagents show a row each, this many at most; a workflow's
// agents show by phase, a tiny Clawd each, this many at most.
const MAX_HELPERS_SHOWN = 8
const MAX_CHIPS = 24
// A workflow phase whose agents have all finished is over once it has stayed
// so a moment (a pipeline's next agent may yet start in it); a run's phases
// are let go a while after its last agent stopped.
const PHASE_SETTLE_MS = 5_000
const RUN_LINGER_MS = 3 * 60_000
// How often, and how many times, an unnamed helper's meta file is looked for,
// and how long a name found is kept.
const NAME_RETRY_MS = 2_000
const NAME_TRIES = 10
// The longest a helper is kept off screen while its name is looked for.
const NAME_WAIT_MS = 30_000
const NAMING_FORGET_MS = 60 * 60_000
const RUN_FOLDERS_MS = 5_000

// ---------------------------------------------------------------- paths --

const where = { config: '', sep: '/', isWindows: false }

const join = (...parts: string[]) => parts.join(where.sep)

export const setPaths = (env: { custom?: string; profile?: string; home?: string; os?: string }) => {
  where.isWindows = env.os === 'Windows_NT'
  where.sep = where.isWindows ? '\\' : '/'
  where.config = env.custom || join((where.isWindows ? env.profile || env.home : env.home || env.profile) ?? '', '.claude')
  setUsagePaths(where.config, where.sep, where.isWindows)
}

const liveFileOf = (sessionId: string) => join(where.config, 'clawd-crew', 'live', `${sessionId}.json`)

const limitsFile = () => join(where.config, 'clawd-crew', 'limits.json')
const askedFile = () => join(where.config, 'clawd-crew', 'asked.json')
const settingsFile = () => join(where.config, 'clawd-crew', 'settings.json')

// The animation the person picked for each mood, where not its own: kept in
// a file every session reads, so each draws them alike.
export const loadAnimations = async (io: Io): Promise<Record<string, string>> => {
  try {
    const kept = JSON.parse(await io.read(settingsFile())) as { v?: number; animations?: unknown }
    if (kept.v !== 1 || typeof kept.animations !== 'object' || kept.animations === null) return {}
    return Object.fromEntries(Object.entries(kept.animations).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

export const saveAnimations = (io: Io, animations: Record<string, string>) => io.write(settingsFile(), JSON.stringify({ v: 1, animations }))

// ------------------------------------------------------- this session --

type Loop = {
  doing: Doing
  tools: Map<string, Doing>
  // Model steps under way: a step thinks for minutes at times.
  stepping: number
  model?: string
  context?: number
  output: number
  // Every step's tokens, in (cached and not) and out.
  tokens: number
  toolCalls: number
  lastAt: number
}

// A workflow phase as this session follows it: how each of its agents stands
// (with stand-ins for ones a reload left only counted), when it began and
// last changed, and every token its agents used.
type Phase = {
  run: string
  title: string
  startedAt: number
  lastAt: number
  tokens: number
  agents: Map<string, 'running' | 'done' | 'error'>
}

type Helper = {
  id: string
  type: string
  label: string
  // The workflow phase it runs in, and the run, for a workflow's agent.
  phase?: string
  run?: string
  model?: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'error'
  // In the engine's list of agents, which says when it ends.
  isListed: boolean
  // Named by a spawn, the engine's list or its meta file: a helper, not one
  // of the engine's own loops (compaction, memory).
  isNamed?: boolean
}

const THINKING: Doing = { mood: 'thinking', detail: '' }

const newLoop = (): Loop => ({ doing: THINKING, tools: new Map(), stepping: 0, output: 0, tokens: 0, toolCalls: 0, lastAt: 0 })

export const me = {
  sessionId: '',
  cwd: '',
  model: undefined as string | undefined,
  main: newLoop(),
  loops: new Map<string, Loop>(),
  helpers: new Map<string, Helper>(),
  busySince: undefined as number | undefined,
  idleSince: undefined as number | undefined,
  lastTurnEnd: 0,
  flash: undefined as (Doing & { until: number }) | undefined,
  compacting: false,
  context: undefined as number | undefined,
  contextPercent: undefined as number | undefined,
  costUsd: undefined as number | undefined,
  // The account's usage-limit windows, as the engine last read them.
  limits: [] as Limit[],
  // The phases of its workflows, by `<run>:<title>`.
  phases: new Map<string, Phase>(),
  restoredBusySince: undefined as number | undefined,
  isReconciled: false,
}

const loopOf = (agentId: string | undefined) => {
  if (agentId === undefined) return me.main
  let loop = me.loops.get(agentId)
  if (!loop) {
    loop = newLoop()
    me.loops.set(agentId, loop)
  }
  return loop
}

const helperOf = (agentId: string, now: number) => {
  let helper = me.helpers.get(agentId)
  if (!helper) {
    helper = { id: agentId, type: 'helper', label: '', startedAt: now, status: 'running', isListed: false }
    me.helpers.set(agentId, helper)
  }
  return helper
}

const latestTool = (loop: Loop) => {
  let last: Doing | undefined
  for (const doing of loop.tools.values()) last = doing
  return last
}

export const track = {
  sessionStarted(sessionId: string, cwd: string) {
    if (me.sessionId !== sessionId) {
      me.sessionId = sessionId
      me.isReconciled = false
    }
    me.cwd = cwd
  },

  cleared() {
    me.sessionId = ''
    me.main = newLoop()
    me.loops.clear()
    me.helpers.clear()
    me.busySince = undefined
    me.flash = undefined
    me.context = undefined
    me.contextPercent = undefined
    me.costUsd = undefined
    me.phases.clear()
  },

  turnStarted(now: number) {
    me.busySince = now
    me.idleSince = undefined
    me.flash = undefined
    me.main.doing = THINKING
    me.main.tools.clear()
  },

  stepStarted(agentId: string | undefined, model: string, now: number) {
    const loop = loopOf(agentId)
    loop.model = model
    loop.lastAt = now
    loop.stepping += 1
    if (loop.tools.size === 0) loop.doing = THINKING
    if (agentId === undefined) {
      me.model = model
      if (me.busySince === undefined) {
        me.busySince = now
        me.idleSince = undefined
      }
    } else {
      const helper = helperOf(agentId, now)
      helper.model = model
      // Finished, and at work again (a background agent sent a message).
      if (helper.status !== 'running') {
        helper.status = 'running'
        helper.endedAt = undefined
      }
      const phase = phaseOf(helper)
      if (phase && phase.agents.get(agentId) !== 'running') {
        phase.agents.set(agentId, 'running')
        phase.lastAt = now
      }
    }
  },

  chunk(agentId: string | undefined, chunk: TurnStepChunk) {
    const loop = loopOf(agentId)
    if (loop.tools.size > 0) return
    if (chunk.kind === 'thinking' && loop.doing.mood !== 'thinking') loop.doing = THINKING
    else if (chunk.kind === 'text' && loop.doing.mood !== 'responding') loop.doing = { mood: 'responding', detail: '' }
    else if (chunk.kind === 'tool') loop.doing = describeTool(chunk.name, undefined)
  },

  stepEnded(agentId: string | undefined, usage: TurnUsage | null, now: number) {
    const loop = loopOf(agentId)
    loop.lastAt = now
    loop.stepping = Math.max(0, loop.stepping - 1)
    if (!usage) return
    loop.context = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    loop.output += usage.output_tokens
    const tokens = loop.context + usage.output_tokens
    loop.tokens += tokens
    if (agentId !== undefined) {
      const phase = phaseOf(me.helpers.get(agentId))
      if (phase?.agents.has(agentId)) phase.tokens += tokens
    }
    if (usage.model) loop.model = usage.model
  },

  toolStarted(agentId: string | undefined, id: string, tool: string, input: unknown, now: number) {
    const loop = loopOf(agentId)
    const doing = describeTool(tool, input)
    loop.tools.set(id, doing)
    loop.toolCalls += 1
    loop.lastAt = now
    loop.doing = doing
    if (agentId !== undefined) helperOf(agentId, now)
  },

  toolEnded(agentId: string | undefined, id: string, now: number) {
    const loop = loopOf(agentId)
    loop.tools.delete(id)
    loop.lastAt = now
    loop.doing = latestTool(loop) ?? THINKING
  },

  spawned(agentId: string, type: string, label: string, model: string | undefined, now: number) {
    const helper = helperOf(agentId, now)
    helper.type = type
    helper.label = label
    helper.model = model ?? helper.model
    helper.isListed = true
    helper.isNamed = true
    helper.status = 'running'
    helper.startedAt = now
    helper.endedAt = undefined
  },

  turnCompleted(agentId: string | undefined, reason: string, usage: TurnUsage | undefined, now: number) {
    if (agentId !== undefined) {
      const loop = me.loops.get(agentId)
      loop?.tools.clear()
      if (loop && usage) loop.output = Math.max(loop.output, usage.output_tokens)
      const helper = me.helpers.get(agentId)
      if (helper) {
        const status = reason === 'error' || reason === 'refusal' ? 'error' : 'done'
        helper.status = status
        helper.endedAt = now
        if (usage?.model) helper.model = usage.model
        const phase = phaseOf(helper)
        if (phase) {
          phase.agents.set(agentId, status)
          phase.lastAt = now
        }
      }
      // Idle, if it is, from when its last helper finished, not its last turn.
      if (me.busySince === undefined) me.idleSince = now
      return
    }
    me.busySince = undefined
    me.idleSince = now
    me.lastTurnEnd = now
    me.main.tools.clear()
    me.main.doing = THINKING
    if (reason === 'answer') me.flash = { mood: 'done', detail: 'Done!', until: now + FLASH_MS }
    else if (reason === 'error' || reason === 'refusal') {
      const detail = reason === 'refusal' ? 'The turn ended in a refusal' : 'The turn ended on an error'
      me.flash = { mood: 'error', detail, until: now + FLASH_MS }
    } else me.flash = undefined
  },

  measured(context: { tokens?: number; percent?: number }, cost: { usd: number } | undefined, rateLimits: readonly SessionRateLimit[]) {
    if (context.tokens !== undefined) me.context = context.tokens
    if (context.percent !== undefined) me.contextPercent = context.percent
    if (cost) me.costUsd = cost.usd
    // None before the first reply: keep what an earlier load read.
    if (rateLimits.length > 0) me.limits = rateLimits.map(limitOf)
  },

  listed(list: readonly AgentInfo[], now: number) {
    for (const agent of list) {
      const status = agent.status === 'running' || agent.status === 'pending' ? 'running' : agent.status === 'completed' ? 'done' : 'error'
      const helper = me.helpers.get(agent.id)
      if (!helper) {
        // One that ended before this module loaded is history, not news.
        me.helpers.set(agent.id, {
          id: agent.id,
          type: agent.type,
          label: agent.description,
          startedAt: now,
          endedAt: status === 'running' ? undefined : 0,
          status,
          isListed: true,
          isNamed: true,
        })
        continue
      }
      helper.type = agent.type || helper.type
      helper.label = agent.description || helper.label
      helper.isListed = true
      helper.isNamed = true
      if (helper.status === 'running' && status !== 'running') {
        helper.status = status
        helper.endedAt = now
      } else if (helper.status !== 'running' && status === 'running' && now - (helper.endedAt ?? 0) > 3000) {
        helper.status = 'running'
        helper.endedAt = undefined
      }
    }
    for (const [id, helper] of me.helpers) {
      // A workflow's finished agent is kept for as long as its phase runs on.
      const phase = phaseOf(helper)
      if (phase && !isPhaseOver(phase, now)) continue
      if (helper.endedAt !== undefined && now - helper.endedAt > HELPER_FORGET_MS) {
        me.helpers.delete(id)
        me.loops.delete(id)
      }
    }
    sweepRuns(now)
  },
}

// A running helper at work until it ends: the engine lists it, or it has a
// step or a tool call under way however long that takes, or had one a while
// ago.
const isAtWork = (helper: Helper, now: number) => {
  const loop = me.loops.get(helper.id)
  const isBusy = loop !== undefined && (loop.stepping > 0 || loop.tools.size > 0)
  return helper.isListed || isBusy || now - (loop?.lastAt ?? 0) < HELPER_IDLE_MS
}

const phaseKey = (run: string | undefined, title: string | undefined) => (run && title ? `${run}:${title}` : undefined)

const phaseOf = (helper: Helper | undefined) => {
  const key = phaseKey(helper?.run, helper?.phase)
  return key ? me.phases.get(key) : undefined
}

// One of a phase's agents still at work. One whose end never came through is
// taken for finished once it has been still a while.
const agentWorks = (id: string, state: string, now: number) => {
  if (state !== 'running') return false
  const helper = me.helpers.get(id)
  return helper !== undefined && helper.status === 'running' && isAtWork(helper, now)
}

// Every agent of the phase has finished, and none has started for a moment.
const isPhaseOver = (phase: Phase, now: number) =>
  phase.agents.size > 0 && ![...phase.agents].some(([id, state]) => agentWorks(id, state, now)) && now - phase.lastAt >= PHASE_SETTLE_MS

// A named workflow agent joins its phase, bringing the tokens it has used.
const joinPhase = (helper: Helper, now: number) => {
  const key = phaseKey(helper.run, helper.phase)
  if (!key || !helper.run || !helper.phase) return
  let phase = me.phases.get(key)
  if (!phase) {
    phase = { run: helper.run, title: helper.phase, startedAt: helper.startedAt, lastAt: now, tokens: 0, agents: new Map() }
    me.phases.set(key, phase)
  }
  if (phase.agents.has(helper.id)) return
  phase.agents.set(helper.id, helper.status)
  phase.tokens += me.loops.get(helper.id)?.tokens ?? 0
  phase.startedAt = Math.min(phase.startedAt, helper.startedAt)
  phase.lastAt = now
}

// A run is let go once none of its agents is at work and it has been still a
// while.
const sweepRuns = (now: number) => {
  const runs = new Map<string, { isWorking: boolean; lastAt: number }>()
  for (const phase of me.phases.values()) {
    const run = runs.get(phase.run) ?? { isWorking: false, lastAt: 0 }
    run.isWorking ||= [...phase.agents].some(([id, state]) => agentWorks(id, state, now))
    run.lastAt = Math.max(run.lastAt, phase.lastAt)
    runs.set(phase.run, run)
  }
  for (const [key, phase] of me.phases) {
    const run = runs.get(phase.run)
    if (run && !run.isWorking && now - run.lastAt > RUN_LINGER_MS) me.phases.delete(key)
  }
}

const isShown = (helper: Helper, now: number) => {
  const loop = me.loops.get(helper.id)
  // Nothing names it and it has called no tool: one of the engine's own loops.
  if (!helper.isListed && !helper.isNamed && (loop?.toolCalls ?? 0) === 0) return false
  // It may yet be named: wait for the name rather than show it as "helper".
  if (!helper.isListed && isUnnamed(helper) && isNamePending(me.sessionId, helper.id, now)) return false
  if (helper.status !== 'running') {
    // A workflow's agent stays until every agent of its phase has finished.
    const phase = phaseOf(helper)
    if (phase) return !isPhaseOver(phase, now)
    return helper.endedAt !== undefined && now - helper.endedAt < HELPER_LINGER_MS
  }
  return isAtWork(helper, now)
}

const helperDoing = (helper: Helper): Doing => {
  if (helper.status === 'done') return { mood: 'done', detail: 'Finished' }
  if (helper.status === 'error') return { mood: 'error', detail: 'Stopped early' }
  const loop = me.loops.get(helper.id)
  if (!loop || loop.lastAt === 0) return { mood: 'thinking', detail: 'Getting started…' }
  return latestTool(loop) ?? loop.doing
}

const waitingDoing = (entry: Entry): Doing => {
  const why =
    entry.needs ||
    (entry.waitingFor === 'dialog open' ? 'Waiting for your OK' : entry.waitingFor === 'input needed' ? 'Needs your input' : entry.waitingFor) ||
    'Needs you'
  return { mood: 'waiting', detail: clip(why, 90) }
}

const BACKGROUND: Doing = { mood: 'delegating', detail: 'Working in the background' }

const idleDoing = (since: number | undefined, now: number): Doing => ({
  mood: since !== undefined && now - since > SLEEP_AFTER_MS ? 'sleeping' : 'idle',
  detail: '',
})

// ------------------------------------------------- what gets published --

export type HelperSnap = {
  id: string
  type: string
  label: string
  phase?: string
  run?: string
  model?: string
  mood: Mood
  detail: string
  startedAt: number
  endedAt?: number
  context?: number
  output?: number
  tokens?: number
}

export type SessionSnap = {
  v: 1
  sessionId: string
  cwd: string
  model?: string
  mood: Mood
  detail: string
  since?: number
  context?: number
  contextPercent?: number
  output?: number
  costUsd?: number
  limits?: Limit[]
  helpers: HelperSnap[]
  phases?: PhaseSnap[]
  updatedAt: number
  ended?: boolean
}

// A workflow phase as a session publishes it: its time, its tokens, and how
// many of its agents are at work, done or failed. `endedAt` once it is over.
export type PhaseSnap = {
  key: string
  run: string
  title: string
  startedAt: number
  endedAt?: number
  tokens: number
  working: number
  done: number
  failed: number
}

const isPhaseSnap = (value: unknown): value is PhaseSnap => {
  if (value === null || typeof value !== 'object') return false
  const phase = value as PhaseSnap
  return (
    typeof phase.key === 'string' &&
    typeof phase.title === 'string' &&
    typeof phase.startedAt === 'number' &&
    typeof phase.tokens === 'number' &&
    typeof phase.working === 'number' &&
    typeof phase.done === 'number' &&
    typeof phase.failed === 'number'
  )
}

const runningHelperCount = (now: number) => [...me.helpers.values()].filter(h => h.status === 'running' && isShown(h, now)).length

const waitingOn = (running: number): Doing => ({ mood: 'delegating', detail: `Waiting on ${running} helper${running === 1 ? '' : 's'}` })

const selfDoing = (entry: Entry | undefined, now: number): { doing: Doing; since?: number } => {
  if (me.compacting) return { doing: { mood: 'compacting', detail: 'Compacting the conversation' }, since: me.busySince }
  if (entry?.status === 'waiting') return { doing: waitingDoing(entry), since: entry.statusUpdatedAt }
  if (me.flash && now < me.flash.until) return { doing: { mood: me.flash.mood, detail: me.flash.detail }, since: me.idleSince }
  if (me.busySince !== undefined) {
    const own = latestTool(me.main)
    if (own) return { doing: own, since: me.busySince }
    // Its turn goes on, but between steps with no tool of its own under way
    // it does nothing but wait on its helpers: a background agent sent off,
    // a workflow running, and the model waits for them to come back.
    const running = me.main.stepping === 0 ? runningHelperCount(now) : 0
    if (running > 0) return { doing: waitingOn(running), since: me.busySince }
    return { doing: me.main.doing, since: me.busySince }
  }
  const running = runningHelperCount(now)
  if (running > 0) return { doing: waitingOn(running), since: me.idleSince }
  // Its turn is over but the session is busy: something it started runs on in
  // the background (a workflow between phases, say). At work, not asleep.
  if (entry?.status === 'busy') return { doing: BACKGROUND, since: me.idleSince }
  const since = me.idleSince ?? entry?.statusUpdatedAt
  return { doing: idleDoing(since, now), since }
}

export const selfSnap = (now: number): SessionSnap => {
  const { doing, since } = selfDoing(registry.get(me.sessionId), now)
  const helpers = [...me.helpers.values()]
    .filter(helper => isShown(helper, now))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((helper): HelperSnap => {
      const loop = me.loops.get(helper.id)
      const { mood, detail } = helperDoing(helper)
      return {
        id: helper.id,
        type: helper.type,
        label: helper.label,
        phase: helper.phase,
        run: helper.run,
        model: helper.model ?? loop?.model,
        mood,
        detail,
        startedAt: helper.startedAt,
        endedAt: helper.endedAt,
        context: loop?.context,
        output: loop?.output || undefined,
        tokens: loop?.tokens || undefined,
      }
    })
  return {
    v: 1,
    sessionId: me.sessionId,
    cwd: me.cwd,
    model: me.model ?? me.main.model,
    mood: doing.mood,
    detail: doing.detail,
    since,
    context: me.context ?? me.main.context,
    contextPercent: me.contextPercent,
    output: me.main.output || undefined,
    costUsd: me.costUsd,
    limits: me.limits.length > 0 ? me.limits : undefined,
    helpers,
    phases: me.phases.size > 0 ? phaseSnaps(now) : undefined,
    updatedAt: now,
  }
}

const phaseSnaps = (now: number) =>
  [...me.phases].map(([key, phase]): PhaseSnap => {
    let working = 0
    let done = 0
    let failed = 0
    for (const [id, state] of phase.agents) {
      if (agentWorks(id, state, now)) working += 1
      else if (state === 'error') failed += 1
      else done += 1
    }
    const endedAt = isPhaseOver(phase, now) ? phase.lastAt : undefined
    return { key, run: phase.run, title: phase.title, startedAt: phase.startedAt, endedAt, tokens: phase.tokens, working, done, failed }
  })

// Picks up what this session's own live file kept from before a reload.
export const restore = async (io: Io, now: number) => {
  try {
    const snap = JSON.parse(await io.read(liveFileOf(me.sessionId))) as SessionSnap
    if (snap.v !== 1 || snap.sessionId !== me.sessionId || snap.ended) return
    me.main.output = Math.max(me.main.output, snap.output ?? 0)
    if (me.limits.length === 0) me.limits = limitsIn(snap.limits)
    me.model ??= snap.model
    me.costUsd ??= snap.costUsd
    if (isWorkMood(snap.mood)) me.restoredBusySince = snap.since
    for (const kept of snap.helpers) {
      if (me.helpers.has(kept.id)) continue
      const isOver = kept.endedAt !== undefined
      me.helpers.set(kept.id, {
        id: kept.id,
        type: kept.type,
        label: kept.label,
        phase: kept.phase,
        run: kept.run,
        model: kept.model,
        startedAt: kept.startedAt,
        endedAt: kept.endedAt,
        status: isOver ? (kept.mood === 'error' ? 'error' : 'done') : 'running',
        // The engine's list says again within seconds whether it is in it.
        isListed: false,
        isNamed: true,
      })
      const loop = loopOf(kept.id)
      loop.output = kept.output ?? 0
      loop.tokens = kept.tokens ?? 0
      loop.context = kept.context
      loop.model = kept.model
      // Its step or tool call under way, if any, began before this load.
      loop.lastAt = now
    }
    // Its phases, the agents they counted that are gone from the list as
    // stand-ins, so the counts carry on.
    for (const kept of Array.isArray(snap.phases) ? snap.phases.filter(isPhaseSnap) : []) {
      if (me.phases.has(kept.key)) continue
      const phase: Phase = { run: kept.run, title: kept.title, startedAt: kept.startedAt, lastAt: kept.endedAt ?? now, tokens: kept.tokens, agents: new Map() }
      for (const helper of me.helpers.values()) if (phaseKey(helper.run, helper.phase) === kept.key) phase.agents.set(helper.id, helper.status)
      const known = [...phase.agents.values()]
      for (let i = known.filter(state => state === 'done').length; i < kept.done; i++) phase.agents.set(`~done:${i}`, 'done')
      for (let i = known.filter(state => state === 'error').length; i < kept.failed; i++) phase.agents.set(`~error:${i}`, 'error')
      me.phases.set(kept.key, phase)
    }
  } catch {
    // Nothing kept: a fresh session.
  }
}

let lastPublished = ''
let lastPublishedAt = 0

export const publish = async (io: Io, now: number) => {
  if (!me.sessionId || !where.config) return
  const snap = selfSnap(now)
  const { updatedAt: _, ...comparable } = snap
  const text = JSON.stringify(comparable)
  if (text === lastPublished && now - lastPublishedAt < 10_000) return
  lastPublished = text
  lastPublishedAt = now
  await io.write(liveFileOf(me.sessionId), JSON.stringify(snap))
}

export const retire = async (io: Io, sessionId: string, now: number) => {
  if (!sessionId || !where.config) return
  lastPublished = ''
  await io.write(liveFileOf(sessionId), JSON.stringify({ v: 1, sessionId, ended: true, updatedAt: now }))
}

// ------------------------------------------------------- usage limits --

// One of the account's usage-limit windows as a session read it: how much of
// it is used, 0 to 100, and when it resets, in clock milliseconds.
export type Limit = { kind: string; used: number; resetsAt?: number }

// Two readings whose reset times are this close are of the same window.
const SAME_WINDOW_MS = 10 * 60_000

const limitOf = (limit: SessionRateLimit): Limit => {
  const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : Number.NaN
  return Number.isFinite(resetsAt) ? { kind: limit.kind, used: limit.percentUsed, resetsAt } : { kind: limit.kind, used: limit.percentUsed }
}

const isLimit = (value: unknown): value is Limit => {
  if (value === null || typeof value !== 'object') return false
  const limit = value as Limit
  return typeof limit.kind === 'string' && typeof limit.used === 'number' && (limit.resetsAt === undefined || typeof limit.resetsAt === 'number')
}

// The readings a file holds, any malformed one left out.
const limitsIn = (value: unknown) => (Array.isArray(value) ? value.filter(isLimit) : [])

// The best reading of each window among every session's: one of the latest
// window, and the most used of those, since use only grows until a reset.
export const bestLimits = (readings: readonly Limit[]) => {
  const byKind = new Map<string, Limit[]>()
  for (const reading of readings) byKind.set(reading.kind, [...(byKind.get(reading.kind) ?? []), reading])
  return [...byKind.values()]
    .map(group => {
      const latest = Math.max(...group.map(reading => reading.resetsAt ?? 0))
      return group
        .filter(reading => (reading.resetsAt ?? 0) >= latest - SAME_WINDOW_MS)
        .reduce((best, reading) =>
          reading.used > best.used || (reading.used === best.used && (reading.resetsAt ?? 0) > (best.resetsAt ?? 0)) ? reading : best,
        )
    })
    .sort((a, b) => a.kind.localeCompare(b.kind))
}

// The best readings any session has had, kept in a file of their own so a
// session shows the limits before its first reply, even after a restart.
let shared: Limit[] = []
let sharedText = ''

const readShared = async (io: Io) => {
  try {
    const kept = JSON.parse(await io.read(limitsFile())) as { v?: number; limits?: unknown }
    if (kept.v !== 1) return
    shared = limitsIn(kept.limits)
    sharedText = JSON.stringify(shared)
  } catch {
    // None kept yet.
  }
}

// This session's readings, those the other sessions published, and the file's.
const readings = () => [...me.limits, ...[...live.values()].flatMap(snap => limitsIn(snap.limits)), ...shared]

export const shareLimits = async (io: Io, now: number) => {
  if (!where.config) return
  const best = bestLimits(readings())
  const text = JSON.stringify(best)
  if (best.length === 0 || text === sharedText) return
  shared = best
  sharedText = text
  await io.write(limitsFile(), JSON.stringify({ v: 1, limits: best, updatedAt: now }))
}

// The limits come with every reply, so on a first start there are none to
// show until one comes. When no session has a reading of a window still
// open, one session asks for them: the smallest request there is, whose
// answer brings them as a reply does. The asking is noted, and no session
// asks again within five hours; within a week when the answer brought none,
// as it never will off a subscription.
const ASK_AGAIN_MS = 5 * 60 * 60_000
const ASK_AGAIN_EMPTY_MS = 7 * 24 * 60 * 60_000

export const shouldAskLimits = async (io: Io, now: number) => {
  if (!where.config) return false
  if (bestLimits(readings()).some(limit => limit.resetsAt === undefined || limit.resetsAt > now)) return false
  try {
    const kept = JSON.parse(await io.read(askedFile())) as { v?: number; at?: unknown; found?: unknown }
    const wait = kept.found === false ? ASK_AGAIN_EMPTY_MS : ASK_AGAIN_MS
    if (kept.v === 1 && typeof kept.at === 'number' && Math.abs(now - kept.at) < wait) return false
  } catch {
    // Never asked.
  }
  // Noted before asking, so a session wondering meanwhile leaves it be.
  await io.write(askedFile(), JSON.stringify({ v: 1, at: now }))
  return true
}

export const limitsAsked = (io: Io, now: number, found: boolean) => io.write(askedFile(), JSON.stringify({ v: 1, at: now, found }))

// ------------------------------------------------------------ totals --

const DAY_MS = 24 * 60 * 60_000
const WEEK_MS = 7 * DAY_MS

const startOfDay = (now: number) => new Date(now).setHours(0, 0, 0, 0)

// The weekly limit's window when one is known, else the last seven days.
const startOfWeek = (limits: readonly Limit[], now: number) => {
  const resetsAt = limits.find(limit => limit.kind === 'seven_day')?.resetsAt
  if (resetsAt === undefined) return now - WEEK_MS
  return Math.max(now - WEEK_MS, resetsAt > now ? resetsAt - WEEK_MS : resetsAt)
}

// ------------------------------------------------------ other sessions --

type Entry = {
  pid: number
  sessionId: string
  cwd?: string
  startedAt?: number
  kind?: string
  name?: string
  status?: string
  statusUpdatedAt?: number
  updatedAt?: number
  waitingFor?: string
  needs?: string
  spare?: boolean
}

let registry = new Map<string, Entry>()
const live = new Map<string, SessionSnap>()
let alive: Set<number> | undefined
// When `alive` was listed: a session started after that is not in it yet.
let aliveAt = 0

export const pollRegistry = async (io: Io, now: number) => {
  if (!where.config) return
  await readShared(io)
  const dir = join(where.config, 'sessions')
  const files = (await io.list(dir).catch(() => [])).filter(file => file.kind === 'file' && /^\d+\.json$/.test(file.name))
  const rows = await Promise.all(
    files.map(async file => {
      try {
        return JSON.parse(await io.read(join(dir, file.name))) as Entry
      } catch {
        return undefined
      }
    }),
  )
  const next = new Map<string, Entry>()
  for (const row of rows) {
    if (!row || typeof row.sessionId !== 'string' || typeof row.pid !== 'number' || row.spare === true) continue
    if (alive && !alive.has(row.pid) && (row.startedAt ?? 0) < aliveAt - 5_000) continue
    const held = next.get(row.sessionId)
    if (!held || (row.updatedAt ?? 0) > (held.updatedAt ?? 0)) next.set(row.sessionId, row)
  }
  registry = next

  if (!me.isReconciled && me.sessionId) {
    // Loaded mid-turn (a reload, or the mod enabled while working): the
    // registry knows the session is busy even though no turn.start came.
    const own = registry.get(me.sessionId)
    if (own?.status === 'busy' && me.busySince === undefined) me.busySince = me.restoredBusySince ?? own.statusUpdatedAt ?? now
    me.isReconciled = own !== undefined
  }

  await Promise.all(
    [...registry.keys()]
      .filter(id => id !== me.sessionId)
      .map(async id => {
        try {
          const snap = JSON.parse(await io.read(liveFileOf(id))) as SessionSnap
          if (snap.v === 1 && !snap.ended && now - snap.updatedAt < LIVE_STALE_MS) live.set(id, snap)
          else live.delete(id)
        } catch {
          live.delete(id)
        }
      }),
  )
  for (const id of live.keys()) if (!registry.has(id)) live.delete(id)
}

// Which process ids are running, so a registry file a crashed session left
// behind does not show as a Clawd forever.
export const pollAlive = async (io: Io, now: number) => {
  try {
    aliveAt = now
    if (where.isWindows) {
      const { stdout } = await io.run(['tasklist', '/FO', 'CSV', '/NH'], 20_000)
      const pids = new Set([...stdout.matchAll(/^"[^"]*","(\d+)"/gm)].map(match => Number(match[1])))
      alive = pids.size > 0 ? pids : undefined
    } else {
      const { stdout } = await io.run(['ps', '-A', '-o', 'pid='], 20_000)
      const pids = new Set(stdout.split(/\s+/).filter(Boolean).map(Number))
      alive = pids.size > 0 ? pids : undefined
    }
  } catch {
    alive = undefined
  }
}

// ------------------------------------------- peeking at a transcript --

type Peek = {
  size: number
  mtimeMs: number
  at: number
  doing?: Doing
  model?: string
  context?: number
  output?: number
  isFinished: boolean
}

type Trail = { id: string; type: string; label: string; phase?: string; path: string; startedAt: number; writtenAt: number }

const peeks = new Map<string, Peek>()
const trails = new Map<string, Trail[]>()
type Meta = { type: string; label: string; phase?: string; run?: string }

const metas = new Map<string, Meta>()
const transcriptDirs = new Map<string, { dir?: string; checkedAt: number }>()
let isPeeking = false

type Line = {
  type?: string
  message?: { model?: string; usage?: Record<string, number>; content?: unknown }
}

type Block = { type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string }

// What the last lines of a transcript say: the model, the context the last
// response was answered over, and what the loop is doing right now.
export const parseTail = (text: string) => {
  const lines = text.split('\n')
  let model: string | undefined
  let context: number | undefined
  let output: number | undefined
  let doing: Doing | undefined
  let isFinished = false
  let isDecided = false
  const answered = new Set<string>()
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i]!.trim()
    if (!raw.startsWith('{')) continue
    let row: Line
    try {
      row = JSON.parse(raw) as Line
    } catch {
      continue
    }
    const message = row.message
    const blocks = (Array.isArray(message?.content) ? message.content : []) as Block[]
    if (row.type === 'assistant' && message) {
      if (!model && typeof message.model === 'string' && !message.model.startsWith('<')) model = message.model
      const usage = message.usage
      if (context === undefined && usage) {
        context = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        output = usage.output_tokens
      }
      if (!isDecided) {
        isDecided = true
        const open = blocks.filter(block => block.type === 'tool_use' && !answered.has(block.id ?? ''))
        const last = open.at(-1)
        if (last?.name === 'SubagentHandback') isFinished = true
        else if (last?.name) doing = describeTool(last.name, last.input)
        else {
          const hasText = blocks.some(block => block.type === 'text')
          doing = hasText ? { mood: 'responding', detail: '' } : THINKING
          isFinished = hasText
        }
      }
    } else if (row.type === 'user' && message) {
      for (const block of blocks) if (block.type === 'tool_result' && block.tool_use_id) answered.add(block.tool_use_id)
      if (!isDecided) {
        isDecided = true
        doing = THINKING
      }
    }
    if (isDecided && model && context !== undefined) break
  }
  return { model, context, output, doing, isFinished }
}

const quote = (path: string) => `'${path.replace(/'/g, "''")}'`

// The last TAIL_BYTES of each file, read by one child process: the engine's
// file reads stop at 4 MiB and a busy transcript runs to hundreds.
const readTails = async (io: Io, paths: string[]) => {
  const tails = new Map<string, string>()
  const argv = where.isWindows
    ? [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$ErrorActionPreference='SilentlyContinue';foreach($p in @(${paths.map(quote).join(',')})){$t='';try{$s=[IO.File]::Open($p,'Open','Read','ReadWrite,Delete');$n=[Math]::Min(${TAIL_BYTES},$s.Length);[void]$s.Seek(-$n,'End');$b=New-Object byte[] $n;$r=0;while($r -lt $n){$k=$s.Read($b,$r,$n-$r);if($k -le 0){break};$r+=$k};$s.Close();$t=[Convert]::ToBase64String($b,0,$r)}catch{};[Console]::Out.WriteLine('@@'+$p+'@@'+$t)}`,
      ]
    : ['sh', '-c', `for f; do printf '@@%s@@' "$f"; tail -c ${TAIL_BYTES} "$f" 2>/dev/null | base64 | tr -d '\\n'; echo; done`, 'sh', ...paths]
  const { stdout } = await io.run(argv, 20_000)
  const decoder = new TextDecoder()
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^@@(.*?)@@([A-Za-z0-9+/=]*)$/.exec(line)
    if (!match || !match[2]) continue
    try {
      tails.set(match[1]!, decoder.decode(Uint8Array.fromBase64(match[2])))
    } catch {
      // A tail that does not decode is skipped until the file changes again.
    }
  }
  return tails
}

const projectDirName = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

const transcriptOf = async (io: Io, entry: Entry, now: number) => {
  const known = transcriptDirs.get(entry.sessionId)
  if (known?.dir) return join(known.dir, `${entry.sessionId}.jsonl`)
  if (known && now - known.checkedAt < 60_000) return undefined
  const projects = join(where.config, 'projects')
  const guess = join(projects, projectDirName(entry.cwd ?? ''))
  if (await io.exists(join(guess, `${entry.sessionId}.jsonl`))) {
    transcriptDirs.set(entry.sessionId, { dir: guess, checkedAt: now })
    return join(guess, `${entry.sessionId}.jsonl`)
  }
  // Long paths are shortened when the folder is named; look for the file.
  for (const folder of await io.list(projects).catch(() => [])) {
    if (folder.kind !== 'dir') continue
    const dir = join(projects, folder.name)
    if (await io.exists(join(dir, `${entry.sessionId}.jsonl`))) {
      transcriptDirs.set(entry.sessionId, { dir, checkedAt: now })
      return join(dir, `${entry.sessionId}.jsonl`)
    }
  }
  transcriptDirs.set(entry.sessionId, { checkedAt: now })
  return undefined
}

// What an agent's meta file, beside its transcript, says it is: its type
// (`workflow-subagent` for a workflow's agent), its label ("write:layout")
// and, in a workflow, its phase.
const metaOf = async (io: Io, path: string): Promise<Meta> => {
  const held = metas.get(path)
  if (held) return held
  try {
    const meta = JSON.parse(await io.read(path)) as { agentType?: unknown; description?: unknown; workflowPhase?: unknown }
    const found: Meta = {
      type: typeof meta.agentType === 'string' && meta.agentType ? meta.agentType : 'helper',
      label: typeof meta.description === 'string' ? meta.description : '',
      phase: typeof meta.workflowPhase === 'string' && meta.workflowPhase ? meta.workflowPhase : undefined,
    }
    metas.set(path, found)
    return found
  } catch {
    return { type: 'helper', label: '' }
  }
}

// Subagent transcripts written lately, under <session>/subagents and one
// level of workflow folders beneath it.
const trailsOf = async (io: Io, sessionDir: string, now: number) => {
  const found: Trail[] = []
  const scan = async (folder: string) => {
    const entries = await io.list(folder).catch(() => [])
    const byName = new Map(entries.map(entry => [entry.name, entry]))
    for (const entry of entries) {
      if (entry.kind !== 'file' || !/^agent-.+\.jsonl$/.test(entry.name) || now - entry.mtimeMs > TRAIL_WINDOW_MS) continue
      const id = entry.name.slice('agent-'.length, -'.jsonl'.length)
      const metaName = `agent-${id}.meta.json`
      const meta = await metaOf(io, join(folder, metaName))
      const startedAt = byName.get(metaName)?.mtimeMs || entry.mtimeMs
      found.push({ id, type: meta.type, label: meta.label, phase: meta.phase, path: join(folder, entry.name), startedAt, writtenAt: entry.mtimeMs })
    }
    return entries
  }
  const root = join(sessionDir, 'subagents')
  const top = await scan(root)
  if (top.some(entry => entry.kind === 'dir' && entry.name === 'workflows')) {
    const flows = join(root, 'workflows')
    for (const flow of await io.list(flows).catch(() => [])) {
      if (flow.kind !== 'dir') continue
      const stat = await io.stat(join(flows, flow.name)).catch(() => undefined)
      if (stat && now - stat.mtimeMs < 3 * 60 * 60_000) await scan(join(flows, flow.name))
    }
  }
  return found.sort((a, b) => a.startedAt - b.startedAt)
}

// Refreshes what the transcripts of sessions without a live file say; at
// most one child process at a time, and only for files that changed.
export const peekPeers = async (io: Io, now: number) => {
  if (isPeeking || !where.config) return
  isPeeking = true
  try {
    const wanted = new Map<string, { size: number; mtimeMs: number }>()
    const want = (path: string, size: number, mtimeMs: number, minGapMs: number) => {
      const held = peeks.get(path)
      const isChanged = !held || held.size !== size || held.mtimeMs !== mtimeMs
      if (isChanged && (!held || now - held.at > minGapMs)) wanted.set(path, { size, mtimeMs })
    }
    for (const entry of registry.values()) {
      if (entry.sessionId === me.sessionId || live.has(entry.sessionId)) continue
      const file = await transcriptOf(io, entry, now)
      if (!file) continue
      const stat = await io.stat(file).catch(() => undefined)
      if (stat) want(file, stat.size, stat.mtimeMs, 5_000)
      if (entry.status === 'busy' || entry.status === 'waiting') {
        const found = await trailsOf(io, file.slice(0, -'.jsonl'.length), now)
        trails.set(entry.sessionId, found)
        for (const trail of found) want(trail.path, 0, trail.writtenAt, 4_000)
      } else {
        trails.delete(entry.sessionId)
      }
    }
    if (wanted.size === 0) return
    const tails = await readTails(io, [...wanted.keys()])
    for (const [path, stamp] of wanted) {
      const text = tails.get(path)
      const parsed = text === undefined ? { isFinished: false } : parseTail(text)
      peeks.set(path, { ...parsed, ...stamp, at: now })
    }
  } catch {
    // A failed peek is retried on the next round.
  } finally {
    isPeeking = false
  }
}

// --------------------------------------------------- naming the helpers --

// A workflow's agents reach a session as steps and tool calls only: no spawn
// or list event names them. Each has a meta file beside its transcript, in
// <session>/subagents/workflows/<run>, that holds its label. A session names
// its own helpers, and finds names for the ones a peer on an older build of
// the mod published unnamed.
type Naming = { meta?: Meta; tries: number; triedAt: number; firstAt: number }

// By `<session id>:<agent id>`.
const namings = new Map<string, Naming>()
// By session folder: its run folders, newest first, and where the last name
// was found (a workflow's agents share one run folder).
const runFolders = new Map<string, { at: number; folders: string[] }>()
const lastRunFolders = new Map<string, string>()
// When each run folder was first seen to change: a run's folder is made as it
// starts, so this orders them; stat once, not each listing.
const runTimes = new Map<string, number>()
let isNaming = false

const isUnnamed = (helper: { type: string; label: string }) => helper.type === 'helper' && !helper.label

// Not named yet, with tries and time left: shown once named, or once given
// up on (it then shows as "helper", and takes its name if one turns up).
const isNamePending = (sessionId: string, agentId: string, now: number) => {
  const naming = namings.get(`${sessionId}:${agentId}`)
  if (!naming) return true
  return !naming.meta && naming.tries < NAME_TRIES && now - naming.firstAt < NAME_WAIT_MS
}

// Where a session's agents' meta files are: <session>/subagents, then its
// workflow runs' folders, newest first. A listing gives a folder no time; a
// stat does.
const runFoldersOf = async (io: Io, sessionDir: string, now: number) => {
  const held = runFolders.get(sessionDir)
  if (held && now - held.at < RUN_FOLDERS_MS) return held.folders
  const subagents = join(sessionDir, 'subagents')
  const workflows = join(subagents, 'workflows')
  const runs = await Promise.all(
    (await io.list(workflows).catch(() => []))
      .filter(entry => entry.kind === 'dir')
      .map(async entry => {
        const path = join(workflows, entry.name)
        let mtimeMs = runTimes.get(path)
        if (mtimeMs === undefined) {
          mtimeMs = (await io.stat(path).catch(() => undefined))?.mtimeMs ?? 0
          runTimes.set(path, mtimeMs)
        }
        return { path, mtimeMs }
      }),
  )
  runs.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const folders = [subagents, ...runs.map(run => run.path)]
  runFolders.set(sessionDir, { at: now, folders })
  return folders
}

// Looks for one agent's meta file, at most NAME_TRIES times, each round: the
// file comes a moment after the agent's first step. A miss lists the run
// folders afresh next time, as the agent's run may be newer than the list.
const findName = async (io: Io, sessionId: string, cwd: string, agentId: string, now: number) => {
  const key = `${sessionId}:${agentId}`
  const naming = namings.get(key) ?? { tries: 0, triedAt: 0, firstAt: now }
  if (naming.meta || naming.tries >= NAME_TRIES || now - naming.triedAt < NAME_RETRY_MS) return naming.meta
  naming.triedAt = now
  namings.set(key, naming)
  // No transcript found (yet): that costs no try, only the wait.
  const transcript = await transcriptOf(io, { pid: 0, sessionId, cwd }, now)
  if (!transcript) return undefined
  naming.tries += 1
  const sessionDir = transcript.slice(0, -'.jsonl'.length)
  const found = await runFoldersOf(io, sessionDir, now)
  const last = lastRunFolders.get(sessionDir)
  const folders = last && found.includes(last) ? [last, ...found.filter(folder => folder !== last)] : found
  for (const folder of folders) {
    const path = join(folder, `agent-${agentId}.meta.json`)
    if (!(await io.exists(path))) continue
    const meta = await metaOf(io, path)
    // Caught mid-write, it did not parse: looked for again next round.
    if (!metas.has(path)) break
    // A workflow's agent: its run is the folder it is in.
    naming.meta = folder === found[0] ? meta : { ...meta, run: folder.split(where.sep).pop() }
    lastRunFolders.set(sessionDir, folder)
    return naming.meta
  }
  runFolders.delete(sessionDir)
  return undefined
}

// A peer's helper with the name found for it, if it went unnamed.
const named = (sessionId: string, helper: HelperSnap): HelperSnap => {
  if (!isUnnamed(helper)) return helper
  const meta = namings.get(`${sessionId}:${helper.id}`)?.meta
  return meta ? { ...helper, type: meta.type, label: meta.label, phase: meta.phase, run: meta.run } : helper
}

// Every other round: names this session's unnamed helpers, and finds names
// for the ones peers published unnamed.
export const nameHelpers = async (io: Io, now: number) => {
  if (isNaming || !me.sessionId || !where.config) return
  isNaming = true
  try {
    for (const helper of me.helpers.values()) {
      if (!isUnnamed(helper) || helper.status !== 'running') continue
      const meta = await findName(io, me.sessionId, me.cwd, helper.id, now)
      if (!meta) continue
      helper.type = meta.type
      helper.label = meta.label
      helper.phase = meta.phase
      helper.run = meta.run
      // Known now: shown while it works, tool calls or not.
      helper.isNamed = true
      joinPhase(helper, now)
    }
    for (const snap of live.values()) {
      const cwd = snap.cwd || registry.get(snap.sessionId)?.cwd || ''
      for (const helper of snap.helpers) {
        if (isUnnamed(helper) && helper.endedAt === undefined) await findName(io, snap.sessionId, cwd, helper.id, now)
      }
    }
    for (const [key, naming] of namings) if (now - naming.triedAt > NAMING_FORGET_MS) namings.delete(key)
  } catch {
    // Looked for again on a later round.
  } finally {
    isNaming = false
  }
}

// ---------------------------------------------------------------- view --

type Row = {
  key: string
  name: string
  cwd: string
  isSelf: boolean
  model?: string
  doing: Doing
  since?: number
  startedAt: number
  context?: number
  contextPercent?: number
  output?: number
  costUsd?: number
  source: string
  helpers: HelperSnap[]
  phases: PhaseSnap[]
}

const folderName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd

const toneOf = (mood: Mood): CrewTone => {
  if (mood === 'waiting') return 'wait'
  if (mood === 'error') return 'error'
  if (mood === 'done') return 'done'
  if (mood === 'idle' || mood === 'sleeping') return 'idle'
  return 'work'
}

const timeLine = (mood: Mood, since: number | undefined, now: number) => {
  if (since === undefined) return ''
  if (mood === 'idle' || mood === 'sleeping') return `idle ${roughly(now - since)}`
  if (mood === 'waiting') return `waiting ${elapsed(now - since)}`
  if (mood === 'done' || mood === 'error') return ''
  return `working ${elapsed(now - since)}`
}

const usageLine = (context: number | undefined, percent: number | undefined, output: number | undefined, cost: number | undefined) =>
  [
    context !== undefined ? `${shortCount(context)} ctx${percent !== undefined ? ` (${Math.round(percent)}%)` : ''}` : '',
    output ? `${shortCount(output)} out` : '',
    cost ? money(cost) : '',
  ]
    .filter(Boolean)
    .join(' · ')

const rowOfSnap = (entry: Entry | undefined, snap: SessionSnap, isSelf: boolean, now: number): Row => {
  let doing: Doing = { mood: snap.mood, detail: snap.detail }
  let since = snap.since
  if (!isSelf && entry?.status === 'waiting') {
    doing = waitingDoing(entry)
    since = entry.statusUpdatedAt
  }
  if (!isSelf && (doing.mood === 'idle' || doing.mood === 'sleeping')) doing = entry?.status === 'busy' ? BACKGROUND : idleDoing(since, now)
  return {
    key: snap.sessionId,
    name: entry?.name || folderName(snap.cwd || entry?.cwd || '') || 'Session',
    cwd: snap.cwd || entry?.cwd || '',
    isSelf,
    model: snap.model,
    doing,
    since,
    startedAt: entry?.startedAt ?? 0,
    context: snap.context,
    contextPercent: snap.contextPercent,
    output: snap.output,
    costUsd: snap.costUsd,
    source: isSelf ? 'this session' : 'live',
    // A peer's unnamed helpers by the names found for them, the ones still
    // being looked up left out until then.
    helpers: isSelf
      ? snap.helpers
      : snap.helpers
          .map(helper => named(snap.sessionId, helper))
          .filter(helper => !isUnnamed(helper) || helper.endedAt !== undefined || !isNamePending(snap.sessionId, helper.id, now)),
    phases: Array.isArray(snap.phases) ? snap.phases.filter(isPhaseSnap) : [],
  }
}

const rowOfPeek = (entry: Entry, now: number): Row => {
  const file = transcriptDirs.get(entry.sessionId)?.dir
  const peek = file ? peeks.get(join(file, `${entry.sessionId}.jsonl`)) : undefined
  let doing: Doing
  if (entry.status === 'waiting') doing = waitingDoing(entry)
  else if (entry.status === 'busy') doing = peek?.doing ?? THINKING
  else doing = idleDoing(entry.statusUpdatedAt, now)
  const helpers = (trails.get(entry.sessionId) ?? [])
    .map((trail): HelperSnap | undefined => {
      const seen = peeks.get(trail.path)
      const isQuiet = now - trail.writtenAt > 8_000
      const base = { id: trail.id, type: trail.type, label: trail.label, phase: trail.phase, model: seen?.model, startedAt: trail.startedAt, context: seen?.context }
      if (seen?.isFinished && isQuiet) {
        if (now - trail.writtenAt > HELPER_LINGER_MS) return undefined
        return { ...base, mood: 'done', detail: 'Finished', endedAt: trail.writtenAt }
      }
      const doing = seen?.doing ?? THINKING
      return { ...base, mood: doing.mood, detail: doing.detail }
    })
    .filter((helper): helper is HelperSnap => helper !== undefined)
  return {
    key: entry.sessionId,
    name: entry.name || folderName(entry.cwd ?? '') || 'Session',
    cwd: entry.cwd ?? '',
    isSelf: false,
    model: peek?.model,
    doing,
    since: entry.statusUpdatedAt,
    startedAt: entry.startedAt ?? 0,
    context: peek?.context,
    source: peek ? 'transcript' : 'registry',
    helpers,
    phases: [],
  }
}

// The animation each Clawd shows, by member key: a new mood takes over once
// the shown one has played SPRITE_HOLD_MS, at once when either is URGENT.
const URGENT = new Set<Mood>(['waiting', 'done', 'error'])
const shownMoods = new Map<string, { mood: Mood; since: number }>()

const spriteMood = (key: string, wanted: Mood, now: number) => {
  const shown = shownMoods.get(key)
  if (shown?.mood === wanted) return wanted
  const isDue = !shown || URGENT.has(wanted) || URGENT.has(shown.mood) || now - shown.since >= SPRITE_HOLD_MS
  if (!isDue) return shown.mood
  shownMoods.set(key, { mood: wanted, since: now })
  return wanted
}

const sessionMember = (row: Row, isConducting: boolean, now: number): CrewMember => {
  const facts = [
    [modelName(row.model), timeLine(row.doing.mood, row.since, now)].filter(Boolean).join(' · '),
    usageLine(row.context, row.contextPercent, row.output, row.costUsd),
  ].filter(Boolean)
  const extra = row.helpers.length - MAX_HELPERS_SHOWN
  if (extra > 0) facts.push(`+${extra} more helpers`)
  return {
    key: row.key,
    // Delegating to a workflow: up on a podium, conducting its crowd.
    mood: spriteMood(row.key, isConducting && row.doing.mood === 'delegating' ? 'rallying' : row.doing.mood, now),
    name: row.isSelf ? `${row.name} (this one)` : row.name,
    doing: doingLine(row.doing),
    facts,
    // The tooltip lives in the sprite, so it holds facts fixed for its life.
    tip: [row.name, row.cwd].filter(Boolean).join('\n'),
    tone: toneOf(row.doing.mood),
    isAgent: false,
    isSelf: row.isSelf,
  }
}

// What a helper goes by: a workflow's agent by the label its workflow gave
// it ("write:layout"), any other by its type and what it was asked to do.
const helperName = (helper: HelperSnap) => {
  const type = helper.type || 'helper'
  if (type === 'workflow-subagent') return helper.label || (helper.phase ? `${helper.phase} agent` : 'workflow agent')
  return helper.label ? `${type} · ${helper.label}` : type
}

const helperMember = (row: Row, helper: HelperSnap, now: number): CrewMember => {
  const time =
    helper.endedAt !== undefined && helper.endedAt > 0 ? `took ${elapsed(helper.endedAt - helper.startedAt)}` : `working ${elapsed(now - helper.startedAt)}`
  const facts = [[modelName(helper.model), time].filter(Boolean).join(' · '), usageLine(helper.context, undefined, helper.output, undefined)].filter(Boolean)
  const type = helper.type || 'helper'
  const key = `${row.key}:${helper.id}`
  const name = helperName(helper)
  const tip = type === 'workflow-subagent'
    ? [`Workflow agent of ${row.name}`, helper.phase ? `${helper.phase} phase` : ''].filter(Boolean).join('\n')
    : [`${type} helper of ${row.name}`, helper.label].filter(Boolean).join('\n')
  return {
    key,
    mood: spriteMood(key, helper.mood, now),
    name,
    doing: doingLine({ mood: helper.mood, detail: helper.detail }),
    facts,
    tip,
    tone: toneOf(helper.mood),
    isAgent: true,
    isSelf: row.isSelf,
  }
}

const LIMIT_ORDER = ['five_hour', 'seven_day']

const LIMIT_NAMES: [kind: string, name: string][] = [
  ['five_hour', '5-hour'],
  ['seven_day', 'Weekly'],
  ['spend_limit', 'Spend'],
]

const capitalized = (words: string) => words.replace(/\b[a-z]/g, letter => letter.toUpperCase())

// `five_hour` reads "5-hour", `seven_day_opus` "Weekly Opus".
const limitLabel = (kind: string) => {
  for (const [known, name] of LIMIT_NAMES) {
    if (kind === known) return name
    if (kind.startsWith(`${known}_`)) return `${name} ${capitalized(kind.slice(known.length + 1).replace(/_/g, ' '))}`
  }
  return capitalized(kind.replace(/_/g, ' '))
}

const limitTone = (left: number): CrewTone => (left > 50 ? 'done' : left > 20 ? 'wait' : 'error')

const crewLimit = (limit: Limit, now: number): CrewLimit => {
  // Past its reset the window is empty until the next prompt starts one.
  const isOver = limit.resetsAt !== undefined && limit.resetsAt <= now
  const left = isOver ? 100 : Math.min(100, Math.max(0, 100 - limit.used))
  return {
    key: limit.kind,
    label: limitLabel(limit.kind),
    left: left / 100,
    percent: `${Math.floor(left)}% left`,
    resets: isOver ? 'fresh window' : limit.resetsAt !== undefined ? `resets in ${roughly(limit.resetsAt - now)}` : '',
    tone: limitTone(left),
  }
}

const orderOf = (kind: string) => {
  const at = LIMIT_ORDER.indexOf(kind)
  return at === -1 ? LIMIT_ORDER.length : at
}

const totalsLine = ({ tokensIn, tokensOut, usd }: Totals, isReady: boolean) =>
  isReady
    ? [tokensIn ? `${shortCount(tokensIn)} in` : '', tokensOut ? `${shortCount(tokensOut)} out` : '', usd ? money(usd) : '']
        .filter(Boolean)
        .join(' · ') || 'nothing yet'
    : 'counting…'

// The lines above the Clawds: the account's usage limits, then what every
// session used today, this week and in all, closed ones included.
const headerOf = (rows: readonly Row[], now: number): CrewHeader => {
  const best = bestLimits(readings())
  const limits = [...best]
    .sort((a, b) => orderOf(a.kind) - orderOf(b.kind) || a.kind.localeCompare(b.kind))
    .map(limit => crewLimit(limit, now))
  const week = usageSince(startOfWeek(best, now))
  // Off a subscription no reading ever comes: no promise of one after a reply.
  const hasReplied = week.tokensOut > 0 || rows.some(row => (row.output ?? 0) > 0)
  return {
    limits,
    note: limits.length === 0 && !hasReplied ? 'shown after the first reply' : '',
    totals: [
      { label: 'Today', text: totalsLine(usageSince(startOfDay(now)), isUsageReady()) },
      { label: 'Week', text: totalsLine(week, isUsageReady()) },
      { label: 'Total', text: totalsLine(usageTotal(), isTotalReady()) },
    ],
  }
}

// At most `max` helpers, in the order they started: the ones at work get a
// place first, the ones that just finished take what is left.
const pickHelpers = (helpers: readonly HelperSnap[], max: number) => {
  if (helpers.length <= max) return helpers
  const working = helpers.filter(helper => helper.endedAt === undefined)
  const finished = helpers.filter(helper => helper.endedAt !== undefined)
  const kept = new Set([...working, ...finished].slice(0, max))
  return helpers.filter(helper => kept.has(helper))
}

// A workflow's agent, rather than a subagent the model started itself.
const isWorkflowHelper = (helper: HelperSnap) => helper.type === 'workflow-subagent' || helper.phase !== undefined || helper.run !== undefined

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// A phase's helpers, and the phase as its session published it, if it did.
type PhaseGroup = { key: string; title: string; snap?: PhaseSnap; helpers: HelperSnap[]; startedAt: number }

const groupTitle = (helper: HelperSnap) => helper.phase || (helper.type === 'workflow-subagent' ? 'Workflow' : 'Helpers')

// A phase's line: how many of its agents are at work, need you, are done or
// failed, how long it has run and the tokens it used. A phase that is over
// is checked off (crossed, with errors) and shows no agents of its own.
const phaseView = (row: Row, group: PhaseGroup, now: number): CrewPhase => {
  const { snap, helpers } = group
  const count = (test: (helper: HelperSnap) => boolean) => helpers.filter(test).length
  const waiting = count(helper => helper.mood === 'waiting')
  const working = snap ? Math.max(0, snap.working - waiting) : count(helper => helper.endedAt === undefined && helper.mood !== 'waiting')
  const done = snap ? snap.done : count(helper => helper.endedAt !== undefined && helper.mood !== 'error')
  const failed = snap ? snap.failed : count(helper => helper.mood === 'error')
  const isOver = snap?.endedAt !== undefined
  const ends = helpers.map(helper => helper.endedAt ?? now)
  const time = snap ? (snap.endedAt ?? now) - snap.startedAt : Math.max(...ends) - group.startedAt
  const tokens = snap ? snap.tokens : helpers.reduce((n, helper) => n + (helper.tokens ?? 0), 0)
  return {
    key: `${row.key}:${group.key}`,
    title: isOver ? `${failed ? '✗' : '✓'} ${group.title}` : group.title,
    summary: [
      working ? `${working} working` : '',
      waiting ? `${waiting} need${waiting === 1 ? 's' : ''} you` : '',
      done ? `${done} done` : '',
      failed ? plural(failed, 'error') : '',
      elapsed(time),
      tokens ? `${shortCount(tokens)} tok` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    tone: isOver ? (failed ? 'error' : 'done') : 'idle',
    isOver,
    chips: isOver
      ? []
      : helpers.map((helper): CrewChip => {
          const key = `${row.key}:${helper.id}`
          const worked = (helper.endedAt !== undefined && helper.endedAt > 0 ? helper.endedAt : now) - helper.startedAt
          return {
            key,
            mood: spriteMood(key, helper.mood, now),
            name: helperName(helper),
            doing: doingLine({ mood: helper.mood, detail: helper.detail }),
            fact: [briefly(worked), helper.tokens ? `${shortCount(helper.tokens)} tok` : ''].filter(Boolean).join(' · '),
            tone: toneOf(helper.mood),
          }
        }),
  }
}

// A session's workflow agents by phase, the phases in the order they began:
// the ones the session published, and any its agents name that it did not (a
// session on an older build); each agent a tiny Clawd beside its name, what
// it is doing, and how long it has worked with the tokens it used.
const crowdOf = (row: Row, helpers: readonly HelperSnap[], now: number): CrewCrowd => {
  const shown = pickHelpers(helpers, MAX_CHIPS)
  const groups = new Map<string, PhaseGroup>()
  for (const snap of row.phases) groups.set(snap.key, { key: snap.key, title: snap.title, snap, helpers: [], startedAt: snap.startedAt })
  for (const helper of shown) {
    const key = phaseKey(helper.run, helper.phase) ?? groupTitle(helper)
    const group = groups.get(key) ?? { key, title: groupTitle(helper), helpers: [], startedAt: helper.startedAt }
    group.helpers.push(helper)
    group.startedAt = Math.min(group.startedAt, helper.startedAt)
    groups.set(key, group)
  }
  return {
    phases: [...groups.values()].sort((a, b) => a.startedAt - b.startedAt).map(group => phaseView(row, group, now)),
    more: helpers.length - shown.length,
  }
}

export const buildView = (now: number, style: CrewStyle): CrewView => {
  const rows: Row[] = []
  if (me.sessionId) rows.push(rowOfSnap(registry.get(me.sessionId), selfSnap(now), true, now))
  const others: Row[] = []
  for (const entry of registry.values()) {
    if (entry.sessionId === me.sessionId) continue
    const snap = live.get(entry.sessionId)
    others.push(snap ? rowOfSnap(entry, snap, false, now) : rowOfPeek(entry, now))
  }
  // This session on top, whatever it is doing; the others oldest first, the
  // sleeping ones below every awake one.
  const isAsleep = (row: Row) => (row.doing.mood === 'sleeping' ? 1 : 0)
  others.sort((a, b) => isAsleep(a) - isAsleep(b) || a.startedAt - b.startedAt)
  rows.push(...others)

  const groups: CrewGroup[] = []
  let helpers = 0
  let needy = 0
  for (const row of rows) {
    // Its subagents a row each; its workflows' agents by phase, however
    // many or few.
    const regular = row.helpers.filter(helper => !isWorkflowHelper(helper))
    const workflow = row.helpers.filter(isWorkflowHelper)
    const isConducting = workflow.some(helper => helper.endedAt === undefined) || row.phases.some(phase => phase.endedAt === undefined)
    groups.push({
      key: row.key,
      head: sessionMember({ ...row, helpers: regular }, isConducting, now),
      helpers: pickHelpers(regular, MAX_HELPERS_SHOWN).map(helper => helperMember(row, helper, now)),
      ...(workflow.length > 0 || row.phases.length > 0 ? { crowd: crowdOf(row, workflow, now) } : {}),
    })
    if (row.doing.mood === 'waiting') needy += 1
    helpers += row.helpers.filter(helper => helper.endedAt === undefined).length
  }
  const present = new Set(
    groups.flatMap(group => [
      group.key,
      ...group.helpers.map(helper => helper.key),
      ...(group.crowd?.phases.flatMap(phase => phase.chips.map(chip => chip.key)) ?? []),
    ]),
  )
  for (const key of shownMoods.keys()) if (!present.has(key)) shownMoods.delete(key)
  const summary = [
    `${rows.length} session${rows.length === 1 ? '' : 's'}`,
    helpers > 0 ? `${helpers} helper${helpers === 1 ? '' : 's'}` : '',
    needy > 0 ? `${needy} need${needy === 1 ? 's' : ''} you` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return { header: headerOf(rows, now), groups, summary, style }
}
