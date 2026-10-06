import type { SessionRateLimit } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { ANIMATIONS, VARIANTS, framesOf } from '../hooks/sprites.js'

const HOME = 'C:\\Users\\tester'
const CONFIG = `${HOME}\\.claude`
const SESSIONS = `${CONFIG}\\sessions`
const LIVE = `${CONFIG}\\clawd-crew\\live`
const LIMITS = `${CONFIG}\\clawd-crew\\limits.json`
const USAGE = `${CONFIG}\\clawd-crew\\usage.json`
const SETTINGS = `${CONFIG}\\clawd-crew\\settings.json`
const ASKED = `${CONFIG}\\clawd-crew\\asked.json`
const PROJECTS = `${CONFIG}\\projects`
const NOW = 1_800_000_000_000
// When the account's current usage windows reset.
const FIVE_HOUR_RESET = NOW + ((2 * 60 + 14) * 60 + 30) * 1000
const WEEK_RESET = NOW + ((3 * 24 + 4) * 60 + 30) * 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const DAY = 24 * 60 * 60_000
const HOUR = 60 * 60_000
// What the one-token request answers.
const ANSWERED = { isAnswered: true, text: 'OK', usage: { input_tokens: 9, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as const
// Local midnight before NOW, as the mod finds it.
const MIDNIGHT = new Date(NOW).setHours(0, 0, 0, 0)

const SELF = '11111111-aaaa-4bbb-8ccc-000000000001'
const PEER = '22222222-aaaa-4bbb-8ccc-000000000002'
const QUIET = '33333333-aaaa-4bbb-8ccc-000000000003'
const NEWCOMER = '55555555-aaaa-4bbb-8ccc-000000000005'
// A session closed before this one started: only its transcript is left.
const CLOSED = '66666666-aaaa-4bbb-8ccc-000000000006'
const SITE = `${PROJECTS}\\C--work-site`
const AGENTS = `${SITE}\\${CLOSED}\\subagents`
// A session asleep for half an hour, though it started first of all.
const SLEEPY = '77777777-aaaa-4bbb-8ccc-000000000007'
// Where this session's workflow keeps its agents' transcripts and meta files.
const OWN_PROJECT = `${PROJECTS}\\C--work-clawd-mod`
const OWN_RUNS = `${OWN_PROJECT}\\${SELF}\\subagents\\workflows`
// And where the Website session's workflow keeps its.
const QUIET_AGENTS = `${SITE}\\${QUIET}\\subagents`
const QUIET_RUN = `${QUIET_AGENTS}\\workflows\\wf_q`
// Where the Weather app session's workflow keeps its agents.
const PEER_PROJECT = `${PROJECTS}\\C--work-weather`
const PEER_RUNS = `${PEER_PROJECT}\\${PEER}\\subagents\\workflows`
const QUIET_TRANSCRIPT = `${PROJECTS}\\C--work-site\\${QUIET}.jsonl`
const BODY = '#D97757'

const PANE = {
  plugin: 'clawd-crew',
  component: 'Pane',
  requestId: 'clawd-crew',
  props: { title: 'Clawd Crew', isFocused: false, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const registryRows = {
  '100.json': { pid: 100, sessionId: SELF, cwd: 'C:\\work\\clawd-mod', startedAt: NOW - 3_600_000, name: 'Clawd mod', status: 'busy', statusUpdatedAt: NOW - 5_000 },
  '200.json': {
    pid: 200,
    sessionId: PEER,
    cwd: 'C:\\work\\weather',
    startedAt: NOW - 7_200_000,
    name: 'Weather app',
    status: 'waiting',
    waitingFor: 'dialog open',
    statusUpdatedAt: NOW - 12_000,
  },
  '300.json': { pid: 300, sessionId: QUIET, cwd: 'C:\\work\\site', startedAt: NOW - 600_000, name: 'Website', status: 'busy', statusUpdatedAt: NOW - 90_000 },
  // Its process is gone: a file a crashed session left behind.
  '400.json': { pid: 400, sessionId: 'gone', cwd: 'C:\\old', startedAt: NOW - 9_000_000, name: 'Crashed one', status: 'idle' },
  // Started after the list of running processes was taken, so not in it yet.
  '500.json': { pid: 500, sessionId: NEWCOMER, cwd: 'C:\\work\\new', startedAt: NOW + 1_500, name: 'Newcomer', status: 'idle', statusUpdatedAt: NOW + 1_500 },
  '600.json': { pid: 600, sessionId: SLEEPY, cwd: 'C:\\work\\notes', startedAt: NOW - 36_000_000, name: 'Sleepy one', status: 'idle', statusUpdatedAt: NOW - 1_800_000 },
}

const peerLive = {
  v: 1,
  sessionId: PEER,
  cwd: 'C:\\work\\weather',
  model: 'claude-sonnet-5-5',
  mood: 'typing',
  detail: 'Editing forecast.py',
  since: NOW - 65_000,
  context: 120_000,
  output: 8_000,
  costUsd: 4.1,
  limits: [
    { kind: 'five_hour', used: 45, resetsAt: FIVE_HOUR_RESET },
    { kind: 'seven_day', used: 81, resetsAt: WEEK_RESET },
  ],
  helpers: [
    {
      id: 'a1',
      type: 'Explore',
      label: 'Map the forecast code',
      model: 'claude-haiku-4-5-20251001',
      mood: 'searching',
      detail: 'Searching for "forecast"',
      startedAt: NOW - 30_000,
      context: 15_000,
    },
  ],
  updatedAt: NOW,
}

// The calls the transcripts hold, as the scanner prints them: id, time,
// model, speed, region, input, 5-minute and 1-hour cache writes, all cache
// writes, cache reads, output, web searches.
const call = (id: string, at: number, model: string, fields: string) => `C\t${id}\t${iso(at)}\t${model}\t${fields}`
const transcriptCalls = [
  // Today: Opus 5.5 with 1-hour cache writes ($4.604), the same model in
  // fast mode ($0.408), Sonnet 5.5 with two web searches ($0.0212), and a
  // model not on the price list yet, priced as Opus 5.5 ($4).
  call('msg_a', NOW, 'claude-opus-5-5', 'standard\tnot_available\t1000\t0\t200000\t200000\t5000000\t100000\t0'),
  call('msg_d', NOW, 'claude-opus-5-5', 'fast\tnot_available\t1000\t\t\t0\t0\t10000\t0'),
  call('msg_e', NOW, 'claude-sonnet-5-5', 'standard\tnot_available\t100\t\t\t0\t0\t100\t2'),
  call('msg_f', NOW, 'claude-opus-6', 'standard\tnot_available\t1000000\t\t\t0\t0\t0\t0'),
  // A resumed session's copy of msg_a: counted once, at its first time.
  call('msg_a', NOW + 60_000, 'claude-opus-5-5', 'standard\tnot_available\t1000\t0\t200000\t200000\t5000000\t100000\t0'),
  // Yesterday, this week ($0.95).
  call('msg_b', MIDNIGHT - 3_600_000, 'claude-sonnet-5-5', 'standard\tnot_available\t0\t100000\t0\t100000\t1000000\t50000\t0'),
  // Five days ago, before the weekly limit's window opened ($7.50).
  call('msg_c', NOW - 5 * DAY, 'claude-opus-5', '\t\t1000000\t\t\t0\t0\t100000\t0'),
  // Twenty days ago: in the total only ($0.02).
  call('msg_g', NOW - 20 * DAY, 'claude-haiku-4-5-20251001', 'standard\tnot_available\t10000\t\t\t0\t0\t2000\t0'),
]

const quietTail = [
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'run the tests please' } }),
  JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-opus-5-5',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test', description: 'Run the test suite' } }],
      usage: { input_tokens: 2, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 1_000, output_tokens: 300 },
    },
  }),
].join('\n')

test('draws every running session and helper as a Clawd', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, { USERPROFILE: HOME, OS: 'Windows_NT' })

  const files = new Map<string, string>()
  for (const [name, row] of Object.entries(registryRows)) files.set(`${SESSIONS}\\${name}`, JSON.stringify(row))
  files.set(`${LIVE}\\${PEER}.json`, JSON.stringify(peerLive))
  files.set(QUIET_TRANSCRIPT, 'x')
  files.set(`${PEER_PROJECT}\\${PEER}.jsonl`, 'x')
  files.set(`${SITE}\\${CLOSED}.jsonl`, 'y'.repeat(5_000))
  files.set(`${AGENTS}\\agent-q1.jsonl`, 'z'.repeat(3_000))
  // What the transcript scanner was asked: its cutoff and files, each run.
  const scans: { cut: string; paths: string[] }[] = []
  files.set(`${QUIET_RUN}\\agent-q2.meta.json`, JSON.stringify({ agentType: 'workflow-subagent', description: 'verify:links', workflowPhase: 'Verify' }))
  // The Website session's workflow starts partway through.
  let isQuietFlowing = false
  // Kept from earlier: a 5-hour window since replaced, and a spend limit
  // whose window has reset since.
  files.set(
    LIMITS,
    JSON.stringify({
      v: 1,
      limits: [
        { kind: 'five_hour', used: 99, resetsAt: NOW - 3_600_000 },
        { kind: 'spend_limit', used: 90, resetsAt: NOW - 60_000 },
      ],
    }),
  )
  let agents: { id: string; description: string; type: string; status: string }[] = []
  let toolGate: (() => void) | undefined
  const ran: string[][] = []

  on('session.id', () => ({ value: SELF }))
  on('session.cwd', () => ({ value: 'C:\\work\\clawd-mod' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 3_600_000,
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 50, resetsAt: iso(FIVE_HOUR_RESET) },
        { kind: 'seven_day', percentUsed: 70, resetsAt: iso(WEEK_RESET) },
      ],
      cost: { usd: 1.23 },
    },
  }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  // It has readings of the limits from its own replies: it never asks.
  const asked: string[] = []
  on('model.complete', (_$, e) => {
    asked.push(e.model)
    return { value: ANSWERED }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('agent.list', () => ({ value: agents }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  let openedColumns = 0
  on('ui.open', (_$, e) => {
    openedColumns = e.columns ?? 0
    return { value: { isPlaced: true } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('fs.read', (_$, e) => (files.has(e.path) ? { value: files.get(e.path)! } : { deny: 'ENOENT' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  const lookups = new Map<string, number>()
  on('fs.exists', (_$, e) => {
    const name = e.path.split('\\').pop() ?? ''
    if (name.endsWith('.meta.json')) lookups.set(name, (lookups.get(name) ?? 0) + 1)
    return { value: files.has(e.path) }
  })
  on('fs.stat', (_$, e) => {
    if (e.path === QUIET_RUN) return { value: { kind: 'dir', size: 0, mtimeMs: NOW - 1_000, isLink: false } }
    return files.has(e.path) ? { value: { kind: 'file', size: files.get(e.path)!.length, mtimeMs: NOW - 1_000, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.list', (_$, e) => {
    if (e.path === SESSIONS) return { value: Object.keys(registryRows).reverse().map(name => ({ name, kind: 'file', size: 100, mtimeMs: NOW, isLink: false })) }
    // As the engine lists them: a time for a file, none for a folder.
    const entry = (name: string, kind: string, size = 0) => ({ name, kind, size, mtimeMs: kind === 'dir' ? 0 : NOW - 1_000, isLink: false })
    if (e.path === PROJECTS) return { value: [entry('C--work-site', 'dir')] }
    if (e.path === SITE) return { value: [entry(`${QUIET}.jsonl`, 'file', 1), entry(`${CLOSED}.jsonl`, 'file', 5_000), entry(CLOSED, 'dir')] }
    if (e.path === AGENTS) return { value: [entry('agent-q1.jsonl', 'file', 3_000)] }
    if (e.path === OWN_RUNS) return { value: [entry('wf_1', 'dir')] }
    if (e.path === PEER_RUNS) return { value: [entry('wf_p', 'dir')] }
    if (e.path === QUIET_AGENTS && isQuietFlowing) return { value: [entry('workflows', 'dir')] }
    if (e.path === `${QUIET_AGENTS}\\workflows`) return { value: [entry('wf_q', 'dir')] }
    if (e.path === QUIET_RUN) return { value: [entry('agent-q2.jsonl', 'file', 10), entry('agent-q2.meta.json', 'file', 10)] }
    return { deny: 'ENOENT' }
  })
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    if (e.argv.includes('-EncodedCommand')) {
      // The transcript scanner: every file read to its end, and the calls
      // printed on the first run only.
      const [cut = '', ...items] = (e.init?.stdin ?? '').split('\n')
      const paths = items.map(item => new TextDecoder().decode(Uint8Array.fromBase64(item.slice(item.indexOf('\t') + 1))))
      scans.push({ cut, paths })
      const reached = paths.map((path, i) => `F\t${i}\t${files.get(path)?.length ?? 0}`)
      const stdout = [...(scans.length === 1 ? transcriptCalls : []), ...reached].join('\n')
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (e.argv[0] === 'tasklist') {
      const csv = ['100', '200', '300', '600'].map(pid => `"claude.exe","${pid}","Console","1","1 K"`).join('\r\n')
      return { value: { exitCode: 0, stdout: csv, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    const tail = new TextEncoder().encode(quietTail).toBase64()
    return { value: { exitCode: 0, stdout: `@@${QUIET_TRANSCRIPT}@@${tail}\r\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', async () => {
    await new Promise<void>(resolve => {
      toolGate = resolve
    })
    return { result: 'ok', text: 'ok' }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'helper-1' }))
  // The slow agent's step thinks until the test lets it finish.
  let stepGate: (() => void) | undefined
  on('turn.step', async function* (_$, e) {
    yield { kind: 'thinking', index: 0, text: 'hmm' }
    if (e.agentId === 'slow') {
      await new Promise<void>(resolve => {
        stepGate = resolve
      })
    }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'tool_use',
      usage: { model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 12_000, cache_read_input_tokens: 70_000, cache_creation_input_tokens: 4_000 },
    }
  })

  await $.session.start({ cwd: 'C:\\work\\clawd-mod', surface: 'desktop', isInteractive: true })
  // The engine measures the 5-hour window at 50% used.
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 50, resetsAt: iso(FIVE_HOUR_RESET) }],
    changed: ['rateLimits'],
  })
  await clock.advance(1_000)
  await clock.advance(1_000)
  await clock.advance(1_000)

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(openedColumns).toBe(56)

  // The header: the best reading of each usage window among the sessions'
  // (this one's 50% over the peer's 45% of the same window), one kept from
  // before whose window has reset, and the tokens and cost of the crew.
  expect(texts).toContain('5-hour')
  expect(texts).toContain('50% left')
  expect(texts).toContain('· resets in 2h 14m')
  expect(texts).toContain('Weekly')
  expect(texts).toContain('19% left')
  expect(texts).toContain('· resets in 3d 4h')
  expect(texts).toContain('Spend')
  expect(texts).toContain('100% left')
  expect(texts).toContain('· fresh window')
  // What every session used, from the transcripts, the closed one's too:
  // today; since the weekly limit's window opened (yesterday in, five days
  // ago out); and in all.
  expect(texts).toContain('Today')
  expect(texts).toContain('6.2M in · 110k out · $9.03')
  expect(texts).toContain('Week')
  expect(texts).toContain('7.3M in · 160k out · $9.98')
  expect(texts).toContain('Total')
  expect(texts).toContain('8.3M in · 262k out · $17.50')
  expect(texts.indexOf('5-hour')).toBeLessThan(texts.indexOf('Weekly'))
  expect(texts.indexOf('Weekly')).toBeLessThan(texts.indexOf('Spend'))
  expect(texts.indexOf('Spend')).toBeLessThan(texts.indexOf('Today'))
  expect(texts.indexOf('Today')).toBeLessThan(texts.indexOf('Week'))
  expect(texts.indexOf('Week')).toBeLessThan(texts.indexOf('Total'))
  // The first read takes every transcript from its start, subagents' too,
  // and with no cutoff: it begins the daily history.
  expect(scans[0]?.cut).toBe('')
  expect(scans[0]?.paths.sort()).toEqual([`${AGENTS}\\agent-q1.jsonl`, `${SITE}\\${CLOSED}.jsonl`, `${SITE}\\${QUIET}.jsonl`].sort())
  const usage = JSON.parse(files.get(USAGE) ?? '{}')
  expect(usage).toMatchObject({ v: 1, leader: SELF, isCounted: true, isSeeded: true })
  expect(Math.round(usage.days.reduce((sum: number, day: number[]) => sum + day[3]!, 0) * 1e4) / 1e4).toBe(17.5032)
  // Half the 5-hour window is left: its bar is half full, in amber.
  const amber = (await desk.findAll({ type: 'Box' })).filter(found => found.props.backgroundColor === '#E5A33D')
  expect(amber.map(found => found.props.width)).toEqual([4])
  // The best readings are kept for sessions yet to start.
  expect(JSON.parse(files.get(LIMITS) ?? '{}').limits).toEqual([
    { kind: 'five_hour', used: 50, resetsAt: FIVE_HOUR_RESET },
    { kind: 'seven_day', used: 81, resetsAt: WEEK_RESET },
    { kind: 'spend_limit', used: 90, resetsAt: NOW - 60_000 },
  ])

  expect(texts).toContain('Crew')
  expect(texts).toContain('5 sessions · 1 helper · 1 needs you')
  // This session on top; the others oldest first, the sleeping one below
  // every awake one though it started first.
  const order = ['Clawd mod (this one)', 'Weather app', 'Website', 'Newcomer', 'Sleepy one'].map(name => texts.indexOf(name))
  expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]!))).toBe(true)
  expect(texts).toContain('Napping')
  expect(texts).toContain('Clawd mod (this one)')
  expect(texts).toContain('Weather app')
  expect(texts).toContain('Waiting for your OK')
  // A subagent the model started is a row of its own, a full-size helper.
  expect((await desk.find({ type: 'Client', key: `sprite:${PEER}:a1` }))?.props.props).toEqual({ mood: 'searching', size: 'helper' })
  expect(texts).toContain('Explore · Map the forecast code')
  expect(texts).toContain('Searching for "forecast"')
  expect(texts).toContain('Haiku 4.5 · working 33s')
  expect(texts).toContain('Website')
  expect(texts).toContain('Run the test suite')
  expect(texts).toContain('Opus 5.5 · working 1m 33s')
  // A session started after the list of running processes still shows; one
  // whose process is gone does not.
  expect(texts).toContain('Newcomer')
  expect(texts).not.toContain('Crashed one')
  expect(ran.some(argv => argv[0] === 'powershell.exe')).toBe(true)

  // On the desktop each Clawd is a surface module drawing boxes of color, so
  // nothing is a frame the app rebuilds; and no Box is a hover scope.
  expect(await desk.findAll({ type: 'Svg' })).toHaveLength(0)
  const clients = await desk.findAll({ type: 'Client' })
  expect(clients).toHaveLength(6)
  const own = `sprite:${SELF}`
  expect((await desk.find({ type: 'Client', key: own }))?.props.props).toEqual({ mood: 'thinking', size: 'session' })
  expect((await desk.findAll({ type: 'Box' })).filter(found => found.key !== undefined)).toHaveLength(0)
  const pixels = await desk.findAll({ in: own, type: 'Box' })
  expect(pixels.some(found => found.props.backgroundColor === BODY)).toBe(true)

  // The sprite steps through its frames on the surface's own clock.
  const firstFrame = JSON.stringify(await desk.drawn({ in: own }))
  await desk.advance(1_100)
  const laterFrame = JSON.stringify(await desk.drawn({ in: own }))
  expect(laterFrame).not.toBe(firstFrame)

  // This session takes a turn: thinks, then edits a file.
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
  for await (const _ of step) {
    // drain
  }
  const editing = $.tool.call({ tool: 'Edit', tool_use_id: 'toolu_edit', file_path: 'C:\\work\\clawd-mod\\app.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(1_000)
  let mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('Editing app.ts')
  expect(mine).toContain('Opus 5.5 · working 1s')
  expect(mine).toContain('74k ctx · 12k out')

  expect((await desk.find({ type: 'Client', key: own }))?.props.props).toEqual({ mood: 'typing', size: 'session' })
  toolGate?.()
  await editing

  // A helper starts, works, and finishes.
  await $.agent.spawn({ tool_use_id: 'toolu_agent', prompt: 'look around', description: 'Survey the repo', subagentType: 'Explore', background: true } as never)
  agents = [{ id: 'helper-1', description: 'Survey the repo', type: 'Explore', status: 'running' }]
  await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('Explore · Survey the repo')
  expect(mine).toContain('84k ctx (42%) · 12k out · $1.23')
  // The engine now reads the week at 70% used; the peer's 81% still stands.
  expect(mine).toContain('19% left')
  // Between steps, with the helper sent off, it waits on it: the words
  // follow at once, the animation holds a moment rather than flickering.
  expect(mine).toContain('Waiting on 1 helper')
  expect(mine).not.toContain('Thinking…')
  expect((await desk.find({ type: 'Client', key: own }))?.props.props).toEqual({ mood: 'typing', size: 'session' })

  await $.turn.complete({ answer: 'done', durationMs: 4_000, isAborted: false, turnId: 'h1', agentId: 'helper-1', reason: 'answer' })
  await $.turn.complete({ answer: 'all fixed', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('Done!')
  expect(mine).toContain('Finished')
  // Nothing new in the transcripts: the totals hold, read from where the
  // last read stopped, and no file is read again.
  expect(mine).toContain('6.2M in · 110k out · $9.03')
  expect(scans).toHaveLength(1)
  // Finishing is news: that animation switches at once.
  expect((await desk.find({ type: 'Client', key: own }))?.props.props).toEqual({ mood: 'done', size: 'session' })
  expect((await desk.find({ type: 'Client', key: `sprite:${SELF}:helper-1` }))?.props.props).toEqual({ mood: 'done', size: 'helper' })

  // What this session published for the others to read.
  const published = JSON.parse(files.get(`${LIVE}\\${SELF}.json`) ?? '{}')
  expect(published).toMatchObject({ v: 1, sessionId: SELF, model: 'claude-opus-5-5', mood: 'done' })

  // The SVG sprites stay one command away.
  await $.command.run({ command: 'clawds', args: 'style svg' })
  const svgs = await desk.findAll({ type: 'Svg' })
  expect(svgs.length).toBe(7)
  expect(String(svgs[0]?.props.source)).toContain('color-scheme:light dark')
  expect(await desk.findAll({ type: 'Client' })).toHaveLength(0)
  await $.command.run({ command: 'clawds', args: 'style pixels' })
  expect(await desk.findAll({ type: 'Client' })).toHaveLength(7)

  // A workflow's agent reaches this session as steps and tool calls only, so
  // no event names it; the meta file beside its transcript does.
  files.set(`${OWN_PROJECT}\\${SELF}.jsonl`, 'x')
  files.set(`${OWN_RUNS}\\wf_1\\agent-wf1.meta.json`, JSON.stringify({ agentType: 'workflow-subagent', description: 'write:layout', workflowPhase: 'Write' }))
  files.set(`${OWN_RUNS}\\wf_1\\agent-wf2.meta.json`, JSON.stringify({ agentType: 'workflow-subagent', description: 'write:refresh', workflowPhase: 'Write' }))
  for await (const _ of $.turn.step({ turnId: 'w1', index: 0, model: 'claude-opus-5-5', messageCount: 2, agentId: 'wf1' })) {
    // drain
  }
  // This one thinks and calls no tool: named, it shows all the same.
  for await (const _ of $.turn.step({ turnId: 'w2', index: 0, model: 'claude-opus-5-5', messageCount: 2, agentId: 'wf2' })) {
    // drain
  }
  const reading = $.tool.call({ tool: 'Read', tool_use_id: 'toolu_wf1', file_path: 'C:\\work\\clawd-mod\\layout.css', agentId: 'wf1' } as never)
  // Looked up on an even tick, drawn by the tick after.
  for (let i = 0; i < 3; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('write:layout')
  expect(mine).toContain('write:refresh')
  // A workflow's agents show in its view however few: a tiny Clawd each,
  // under their phase's line, with its time and tokens.
  expect((await desk.find({ type: 'Client', key: `sprite:${SELF}:wf1` }))?.props.props).toMatchObject({ size: 'tiny' })
  expect(mine).toContain('Write')
  expect(mine.some(text => /^2 working · \d+s · 172k tok$/.test(text))).toBe(true)
  expect(mine).not.toContain('helper')
  expect(JSON.parse(files.get(`${LIVE}\\${SELF}.json`) ?? '{}').helpers).toContainEqual(
    expect.objectContaining({ id: 'wf1', type: 'workflow-subagent', label: 'write:layout', phase: 'Write' }),
  )
  toolGate?.()
  await reading

  // A workflow's finished agent stays until its whole phase is done; then the
  // phase leaves a line of its own, checked off, with its time and tokens.
  await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: 'w2', agentId: 'wf2', reason: 'answer' })
  for (let i = 0; i < 15; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('write:refresh')
  expect(mine).toContain('Finished')
  await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: 'w1', agentId: 'wf1', reason: 'answer' })
  // Its workflow's last agent done.
  const writeOverAt = clock.now()
  for (let i = 0; i < 7; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).not.toContain('write:layout')
  expect(mine).not.toContain('write:refresh')
  expect(mine).toContain('✓ Write')
  expect(mine.some(text => /^2 done · \d+s · 172k tok$/.test(text))).toBe(true)
  const writePhase = (JSON.parse(files.get(`${LIVE}\\${SELF}.json`) ?? '{}').phases ?? []).find((phase: { title: string }) => phase.title === 'Write')
  expect(writePhase).toMatchObject({ key: 'wf_1:Write', run: 'wf_1', done: 2, working: 0, failed: 0, tokens: 172_020 })
  expect(typeof writePhase.endedAt).toBe('number')

  // Another session's workflow agent, seen in its transcripts, goes by its
  // name too.
  isQuietFlowing = true
  // One whole round of peeks, and a tick to draw what it found.
  for (let i = 0; i < 5; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('verify:links')
  expect(mine).not.toContain('workflow-subagent · verify:links')

  // A helper nothing names (it has no meta file) calls one tool, then thinks
  // through a single long step: on screen however long the step takes, then
  // taken for over two minutes after its last step, with no word it finished.
  const helperRows = async () => (await desk.findAll({ type: 'Text' })).filter(found => found.text === 'helper').length
  const quick = $.tool.call({ tool: 'Read', tool_use_id: 'toolu_slow', file_path: 'C:\\work\\clawd-mod\\notes.md', agentId: 'slow' } as never)
  await clock.advance(1_000)
  toolGate?.()
  await quick
  const thinking = (async () => {
    for await (const _ of $.turn.step({ turnId: 's1', index: 0, model: 'claude-opus-5-5', messageCount: 2, agentId: 'slow' })) {
      // drain
    }
  })()
  for (let i = 0; i < 90; i++) await clock.advance(1_000)
  expect(await helperRows()).toBe(1)
  stepGate?.()
  await thinking
  // Meanwhile this session's workflow is done: its phase keeps its line for
  // 3 minutes after the last of its agents finished, then goes.
  const thoughtAt = clock.now()
  while (clock.now() < writeOverAt + 175_000) await clock.advance(1_000)
  expect((await desk.findAll({ type: 'Text' })).map(found => found.text)).toContain('✓ Write')
  while (clock.now() < thoughtAt + 100_000) await clock.advance(1_000)
  expect((await desk.findAll({ type: 'Text' })).map(found => found.text)).not.toContain('✓ Write')
  expect(JSON.parse(files.get(`${LIVE}\\${SELF}.json`) ?? '{}').phases).toBeUndefined()
  expect(await helperRows()).toBe(1)
  for (let i = 0; i < 30; i++) await clock.advance(1_000)
  expect(await helperRows()).toBe(0)
  const slowLookups = lookups.get('agent-slow.meta.json') ?? 0
  expect(slowLookups).toBeGreaterThan(2)
  expect(slowLookups).toBeLessThanOrEqual(20)
  for (let i = 0; i < 10; i++) await clock.advance(1_000)
  expect(lookups.get('agent-slow.meta.json')).toBe(slowLookups)

  // More than 8 helpers: a crowd. In columns under their phases, each a tiny
  // Clawd beside its name, what it is doing, and how long it has worked with
  // the tokens it used; the session, delegating, conducts them.
  const crowd = (id: string, phase: string, isDone: boolean, at: number) => ({
    id,
    type: 'workflow-subagent',
    label: `${phase.toLowerCase()}:${id}`,
    phase,
    mood: isDone ? 'done' : id === 'c12' ? 'browsing' : 'thinking',
    detail: isDone ? 'Finished' : id === 'c12' ? 'Searching the web for "HTTP cache headers"' : '',
    run: 'wf_x',
    startedAt: at - (isDone ? 60_000 : 30_000),
    ...(isDone ? { endedAt: at - 2_000 } : {}),
    ...(id === 'c11' ? { tokens: 341_000 } : {}),
  })
  const crowdOf = (at: number) => [
    ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(id => crowd(id, 'Build', true, at)),
    ...['c11', 'c12', 'c13', 'c14'].map(id => crowd(id, 'Verify', false, at)),
  ]
  const publishPeer = (helpers: unknown[], phases?: unknown[]) =>
    files.set(
      `${LIVE}\\${PEER}.json`,
      JSON.stringify({ ...peerLive, mood: 'delegating', detail: 'Running a workflow', helpers, ...(phases ? { phases } : {}), updatedAt: clock.now() }),
    )
  // Its question answered, it is back at work.
  files.set(`${SESSIONS}\\200.json`, JSON.stringify({ ...registryRows['200.json'], status: 'busy', waitingFor: undefined, statusUpdatedAt: clock.now() }))
  publishPeer(crowdOf(clock.now()))
  for (let i = 0; i < 2; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  const names = [...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(id => `build:${id}`), ...['c11', 'c12', 'c13', 'c14'].map(id => `verify:${id}`)]
  expect(names.every(name => mine.includes(name))).toBe(true)
  expect(mine.indexOf('Build')).toBeLessThan(mine.indexOf('build:c1'))
  expect(mine.indexOf('build:c6')).toBeLessThan(mine.indexOf('Verify'))
  // An older build publishes no phases: each phase is counted from its
  // helpers, its time from the first start to the last end, or to now.
  expect(mine).toContain('6 done · 58s')
  expect(mine).toContain('4 working · 32s · 341k tok')
  expect((await desk.find({ type: 'Client', key: `sprite:${PEER}:c11` }))?.props.props).toEqual({ mood: 'thinking', size: 'tiny' })
  expect(mine).toContain('Thinking…')
  expect(mine).toContain('32s · 341k tok')
  // A long status is cut to its column (22 cells here: a 6-cell Clawd, a
  // space, 14 of text and one to spare), so it cannot run under its neighbor.
  expect(mine).toContain('Searching the…')
  expect(mine.some(text => text.startsWith('Searching the web'))).toBe(false)
  // Its lines sit in a column of that width, cut off at its edge.
  expect((await desk.findAll({ type: 'Box' })).some(found => found.props.width === 14 && found.props.overflow === 'hidden')).toBe(true)
  expect(mine).toContain('Finished')
  expect(mine).toContain('58s')
  expect((await desk.find({ type: 'Client', key: `sprite:${PEER}` }))?.props.props).toEqual({ mood: 'rallying', size: 'session' })

  // This build publishes its phases: one that is over shows only its line,
  // checked off, with its time and tokens; the one at work shows its agents.
  const phasesAt = clock.now()
  const research = 'Research the existing caches and when each expires'
  publishPeer(crowdOf(phasesAt), [
    { key: `wf_x:${research}`, run: 'wf_x', title: research, startedAt: phasesAt - 150_000, endedAt: phasesAt - 70_000, tokens: 90_000, working: 0, done: 3, failed: 0 },
    { key: 'wf_x:Build', run: 'wf_x', title: 'Build', startedAt: phasesAt - 60_000, endedAt: phasesAt - 2_000, tokens: 1_200_000, working: 0, done: 6, failed: 0 },
    { key: 'wf_x:Verify', run: 'wf_x', title: 'Verify', startedAt: phasesAt - 30_000, tokens: 341_000, working: 4, done: 0, failed: 0 },
  ])
  for (let i = 0; i < 2; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('✓ Build')
  expect(mine).toContain('6 done · 58s · 1.2M tok')
  expect(mine).not.toContain('build:c1')
  // A long title gives way to its figures, so the line fits the pane (44
  // cells here).
  expect(mine).toContain('✓ Research the ex…')
  expect(mine).toContain('3 done · 1m 20s · 90k tok')
  // Space between the phase that is over and the one showing its agents; the
  // two over, a line each, stay together.
  expect((await desk.findAll({ type: 'Box' })).filter(found => found.props.height === 0.6).length).toBe(1)
  expect(mine).toContain('Verify')
  expect(mine).toContain('4 working · 32s · 341k tok')
  expect(mine).toContain('verify:c11')
  // Its finished phase has put its agents away, leaving 4 on screen: still a
  // crowd while the run goes on, so the phase keeps its line.
  publishPeer(crowdOf(phasesAt).slice(6), [
    { key: 'wf_x:Build', run: 'wf_x', title: 'Build', startedAt: phasesAt - 60_000, endedAt: phasesAt - 2_000, tokens: 1_200_000, working: 0, done: 6, failed: 0 },
    { key: 'wf_x:Verify', run: 'wf_x', title: 'Verify', startedAt: phasesAt - 30_000, tokens: 341_000, working: 4, done: 0, failed: 0 },
  ])
  for (let i = 0; i < 2; i++) await clock.advance(1_000)
  expect((await desk.findAll({ type: 'Text' })).map(found => found.text)).toContain('✓ Build')
  expect((await desk.find({ type: 'Client', key: `sprite:${PEER}:c11` }))?.props.props).toEqual({ mood: 'thinking', size: 'tiny' })
  // Down to 7, then to 5: a workflow's agents keep their view however few.
  publishPeer(crowdOf(clock.now()).slice(3))
  for (let i = 0; i < 2; i++) await clock.advance(1_000)
  expect((await desk.findAll({ type: 'Text' })).map(found => found.text)).toContain('Verify')
  publishPeer(crowdOf(clock.now()).slice(5))
  for (let i = 0; i < 3; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('Verify')
  expect(mine).toContain('verify:c11')
  expect((await desk.find({ type: 'Client', key: `sprite:${PEER}:c11` }))?.props.props).toEqual({ mood: 'thinking', size: 'tiny' })
  expect((await desk.find({ type: 'Client', key: `sprite:${PEER}` }))?.props.props).toEqual({ mood: 'rallying', size: 'session' })

  // A peer on an older build publishes a workflow agent unnamed: this session
  // finds its name in the peer's folders, and shows nothing for it until then.
  files.set(`${PEER_RUNS}\\wf_p\\agent-old1.meta.json`, JSON.stringify({ agentType: 'workflow-subagent', description: 'write:legacy', workflowPhase: 'Write' }))
  publishPeer([
    ...crowdOf(clock.now()).slice(5),
    { id: 'old1', type: 'helper', label: '', mood: 'reading', detail: 'Reading cache.ts', startedAt: clock.now() - 5_000 },
  ])
  for (let i = 0; i < 4; i++) await clock.advance(1_000)
  mine = (await desk.findAll({ type: 'Text' })).map(found => found.text)
  expect(mine).toContain('write:legacy')
  expect(mine).not.toContain('helper')

  // The terminal draws the same crew with cell rasters.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.findAll({ type: 'Raster' })).length).toBeGreaterThan(3)
  const lines = (await term.findAll({ type: 'Text' })).map(found => found.text)
  expect(lines).toContain('Weather app')
  // Its usage bars are lines of box drawing, under a rule the pane's width.
  expect(lines).toContain('━━━━')
  expect(lines).toContain('────')
  expect(lines).toContain('━━━━━━━━')
  expect(lines).toContain('─'.repeat(46))

  await $.session.end({ reason: 'other', sessionId: SELF, resume: {} as never })
  expect(JSON.parse(files.get(`${LIVE}\\${SELF}.json`) ?? '{}')).toMatchObject({ ended: true })
  // Leaving, the leader hands the transcripts to whichever session comes next.
  expect(JSON.parse(files.get(USAGE) ?? '{}')).toMatchObject({ leader: '', heartbeat: 0, isSeeded: true })
  expect(asked).toEqual([])
})

// The same few sessions, for the tests below: this one and Weather app,
// which started an hour before it, each in the state a test gives it.
const pair = async (
  $: Parameters<Parameters<typeof test>[2]>[0],
  on: Parameters<Parameters<typeof test>[2]>[1],
  own: { status: string; statusUpdatedAt: number },
  { seed = {}, ticks = 3, answer = [], dirs = {} }: { seed?: Record<string, string>; ticks?: number; answer?: SessionRateLimit[]; dirs?: Record<string, string[]> } = {},
) => {
  const rows = {
    '200.json': { pid: 200, sessionId: PEER, cwd: 'C:\\work\\weather', startedAt: NOW - 7_200_000, name: 'Weather app', status: 'busy', statusUpdatedAt: NOW - 5_000 },
    '100.json': { pid: 100, sessionId: SELF, cwd: 'C:\\work\\clawd-mod', startedAt: NOW - 3_600_000, name: 'Clawd mod', ...own },
  }
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, { USERPROFILE: HOME, OS: 'Windows_NT' })
  const files = new Map<string, string>(Object.entries(seed))
  for (const [name, row] of Object.entries(rows)) files.set(`${SESSIONS}\\${name}`, JSON.stringify(row))
  on('session.id', () => ({ value: SELF }))
  on('session.cwd', () => ({ value: 'C:\\work\\clawd-mod' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  // No reading of the limits until the one-token request brings `answer`;
  // each request kept, with whether the asking was noted, at its time, before it.
  let rateLimits: SessionRateLimit[] = []
  const asked: { model: string; maxTokens?: number; wasNoted: boolean }[] = []
  on('session.usage', () => ({ value: { startedAt: NOW - 3_600_000, context: { tokens: 0, window: 200_000, percent: 0 }, rateLimits } }))
  on('model.complete', (_$, e) => {
    const note = JSON.parse(files.get(ASKED) ?? '{}') as { at?: number }
    asked.push({ model: e.model, maxTokens: e.maxTokens, wasNoted: note.at === clock.now() })
    rateLimits = answer
    return { value: ANSWERED }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('fs.read', (_$, e) => (files.has(e.path) ? { value: files.get(e.path)! } : { deny: 'ENOENT' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('fs.stat', (_$, e) => (files.has(e.path) ? { value: { kind: 'file', size: files.get(e.path)!.length, mtimeMs: NOW - 1_000, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.list', (_$, e) => {
    if (e.path === SESSIONS) return { value: Object.keys(rows).map(name => ({ name, kind: 'file', size: 100, mtimeMs: NOW, isLink: false })) }
    const folders = dirs[e.path]
    if (folders) return { value: folders.map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) }
    return { deny: 'ENOENT' }
  })
  on('process.run', (_$, e) => {
    const stdout = e.argv[0] === 'tasklist' ? ['100', '200'].map(pid => `"claude.exe","${pid}","Console","1","1 K"`).join('\r\n') : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: 'C:\\work\\clawd-mod', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < ticks; i++) await clock.advance(1_000)
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  return {
    texts: async () => (await desk.findAll({ type: 'Text' })).map(found => found.text),
    clock,
    desk,
    files,
    asked,
    opened,
    // A press, as a person makes one: apart from the last.
    press: async (key: string) => {
      await clock.advance(400)
      return desk.press({ key })
    },
  }
}

test('keeps this session on top while it sleeps', { timeoutMs: 30_000 }, async ($, on) => {
  const texts = await (await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 1_800_000 })).texts()
  expect(texts).toContain('Napping')
  expect(texts.filter(text => ['Clawd mod (this one)', 'Weather app'].includes(text))).toEqual(['Clawd mod (this one)', 'Weather app'])
})

test('a session at work in the background is not asleep', { timeoutMs: 30_000 }, async ($, on) => {
  // Its turn launched a workflow and ended; the registry still says busy, as
  // the workflow runs on, between phases with no agent at work.
  const session = await pair($, on, { status: 'busy', statusUpdatedAt: NOW - 1_800_000 })
  await $.turn.complete({ answer: 'started the workflow', durationMs: 2_000, isAborted: false, turnId: 't1', reason: 'answer' })
  for (let i = 0; i < 8; i++) await session.clock.advance(1_000)
  const texts = await session.texts()
  expect(texts).toContain('Working in the background')
  expect(texts).not.toContain('Napping')
})

test('asks for the usage limits when no session has them', { timeoutMs: 30_000 }, async ($, on) => {
  // A first start: no reply since the last reading's window reset, and the
  // last asking a week and more ago. The session reading the transcripts
  // notes the asking, sends a one-token request, and shows the windows its
  // answer brings at once.
  const seed = {
    [LIMITS]: JSON.stringify({ v: 1, limits: [{ kind: 'five_hour', used: 99, resetsAt: NOW - HOUR }] }),
    [ASKED]: JSON.stringify({ v: 1, at: NOW - 8 * DAY, found: false }),
  }
  const answer = [
    { kind: 'five_hour', percentUsed: 12, resetsAt: iso(FIVE_HOUR_RESET) },
    { kind: 'seven_day', percentUsed: 30, resetsAt: iso(WEEK_RESET) },
  ]
  const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 60_000 }, { seed, answer })
  for (let i = 0; i < 3; i++) await session.clock.advance(1_000)
  expect(session.asked).toEqual([{ model: 'haiku', maxTokens: 1, wasNoted: true }])
  const texts = await session.texts()
  expect(texts).toContain('88% left')
  expect(texts).toContain('70% left')
  expect(JSON.parse(session.files.get(ASKED) ?? '{}')).toMatchObject({ v: 1, found: true })
  // With the windows read, it asks no more.
  for (let i = 0; i < 65; i++) await session.clock.advance(1_000)
  expect(session.asked).toHaveLength(1)
})

// What keeps the request back: a reading of a window still open, an asking
// noted lately whose answer brought no windows, or another session reading
// the transcripts, which asks in this one's place.
for (const [why, seed] of [
  ['it has a reading', { [LIMITS]: JSON.stringify({ v: 1, limits: [{ kind: 'five_hour', used: 40, resetsAt: FIVE_HOUR_RESET }] }) }],
  ['the last asking, six hours ago, brought none', { [ASKED]: JSON.stringify({ v: 1, at: NOW - 6 * HOUR, found: false }) }],
  ['another session reads the transcripts', { [USAGE]: JSON.stringify({ v: 1, leader: PEER, heartbeat: NOW, slots: [], days: [] }) }],
] as const) {
  test(`does not ask for the usage limits when ${why}`, { timeoutMs: 30_000 }, async ($, on) => {
    const answer = [{ kind: 'five_hour', percentUsed: 12, resetsAt: iso(FIVE_HOUR_RESET) }]
    const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 60_000 }, { seed, answer })
    for (let i = 0; i < 40; i++) await session.clock.advance(1_000)
    expect(session.asked).toEqual([])
  })
}

test('each mood has two more animations, of five to fifteen seconds each', async () => {
  const moods = ANIMATIONS.filter(name => !name.includes('.'))
  expect(Object.keys(VARIANTS).sort()).toEqual([...moods].sort())
  for (const [mood, variants] of Object.entries(VARIANTS)) {
    expect(variants.map(([name]) => name)).toHaveLength(3)
    expect(variants[0]![0]).toBe(mood)
    for (const [name, label] of variants.slice(1)) {
      expect(name.startsWith(`${mood}.`)).toBe(true)
      expect(label.length).toBeLessThanOrEqual(9)
      // Its own frames, not the idle ones an unknown name falls back to.
      expect(framesOf(name)).not.toBe(framesOf('idle'))
      const { ms, frames } = framesOf(name)
      expect(ms * frames.length).toBeGreaterThanOrEqual(5_000)
      expect(ms * frames.length).toBeLessThanOrEqual(15_000)
    }
  }
})

test('a settings button picks the animation each mood is drawn with', { timeoutMs: 30_000 }, async ($, on) => {
  const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 5_000 })
  const own = async () => (await session.desk.find({ type: 'Client', key: `sprite:${SELF}` }))?.props.props
  expect(await own()).toMatchObject({ mood: 'idle' })
  // The button at the header's top right opens the settings in place of the
  // crew, three moods a page, each with its three animations playing and a
  // button under each: no more playing at once than a crew's worth.
  await session.press('settings')
  let texts = await session.texts()
  const previews = async () => (await session.desk.findAll({ type: 'Client' })).filter(found => String(found.key).startsWith('preview:'))
  expect(texts).toContain('Animations')
  expect(texts).toContain('1/6')
  expect(texts).toContain('Idle')
  expect(texts).not.toContain('Needs you')
  expect(texts).not.toContain('Weather app')
  expect(await previews()).toHaveLength(9)
  expect(await session.desk.find({ type: 'Client', key: 'preview:idle.coffee' })).toBeDefined()
  // A credit at the foot of the page, its name a link to the maker's profile.
  const credit = async () => {
    const link = await session.desk.find({ type: 'Link' })
    return { line: (await session.texts()).some(text => text.startsWith('Made by ')), href: link?.props.href, name: link?.children }
  }
  expect(await credit()).toEqual({ line: true, href: 'https://github.com/hudcolighting', name: ['hudcolighting'] })
  // Beside it, the Clawd Crew icon, drawn as each surface draws its Clawds:
  // boxes on the desktop, an SVG where the sprites are SVGs, cells on a
  // terminal.
  expect((await session.desk.find({ type: 'Client', key: 'icon' }))?.props).toMatchObject({ width: 10, height: 5 })
  await $.command.run({ command: 'clawds', args: 'style svg' })
  const iconSvg = (await session.desk.findAll({ type: 'Svg' })).find(found => found.props.alt === 'Clawd Crew')
  expect(String(iconSvg?.props.source)).toContain('fill="#F2C14E"')
  await $.command.run({ command: 'clawds', args: 'style pixels' })
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Raster', key: 'icon' }))?.props).toMatchObject({ columns: 14, rows: 13 })
  // The arrows turn the page, and stop at either end.
  await session.press('settings-back')
  expect(await session.texts()).toContain('1/6')
  for (let i = 0; i < 6; i++) await session.press('settings-next')
  texts = await session.texts()
  expect(texts).toContain('6/6')
  expect(texts).toContain('Hit an error')
  expect(texts).not.toContain('Idle')
  expect(await previews()).toHaveLength(6)
  expect((await credit()).href).toBe('https://github.com/hudcolighting')
  for (let i = 0; i < 5; i++) await session.press('settings-back')
  expect(await session.texts()).toContain('1/6')
  expect((await session.desk.find({ type: 'Button', key: 'pick:idle' }))?.props.variant).toBe('primary')
  // A pick: kept for every session, and drawn at once.
  await session.press('pick:idle.coffee')
  expect(JSON.parse(session.files.get(SETTINGS) ?? '{}')).toEqual({ v: 1, animations: { idle: 'idle.coffee' } })
  expect((await session.desk.find({ type: 'Button', key: 'pick:idle.coffee' }))?.props.variant).toBe('primary')
  expect((await session.desk.find({ type: 'Button', key: 'pick:idle' }))?.props.variant).toBeUndefined()
  await session.press('settings-done')
  texts = await session.texts()
  expect(texts).toContain('Weather app')
  expect(await own()).toMatchObject({ mood: 'idle.coffee' })
  // A pick made in another session's settings reaches this one too; one
  // that names no animation of that mood is passed over.
  session.files.set(SETTINGS, JSON.stringify({ v: 1, animations: { idle: 'idle.tune', thinking: 'idle.coffee' } }))
  for (let i = 0; i < 5; i++) await session.clock.advance(1_000)
  expect(await own()).toMatchObject({ mood: 'idle.tune' })
  // Picking a mood's own animation again takes its pick away.
  await session.press('settings')
  expect((await session.desk.find({ type: 'Button', key: 'pick:thinking' }))?.props.variant).toBe('primary')
  await session.press('pick:idle')
  expect(JSON.parse(session.files.get(SETTINGS) ?? '{}')).toEqual({ v: 1, animations: { thinking: 'idle.coffee' } })
  await session.press('settings')
  expect(await own()).toMatchObject({ mood: 'idle' })
})

test('the first click into the pane lands', { timeoutMs: 30_000 }, async ($, on) => {
  // Clicking into the pane gives it the focus, which draws it again while
  // the mouse button is down, and the desktop sends the click to the drawing
  // still on screen. So a Button keeps its press handle from drawing to
  // drawing, through a focus change and through what it shows ticking on.
  const session = await pair($, on, { status: 'busy', statusUpdatedAt: NOW - 5_000 })
  const handles = async () => {
    const found: Record<string, number> = {}
    const walk = (node: unknown) => {
      if (node === null || typeof node !== 'object') return
      const element = node as { type?: string; props?: { key?: string }; press?: { handle: number }; children?: unknown[] }
      if (element.type === 'Button' && element.props?.key && element.press) found[element.props.key] = element.press.handle
      for (const child of element.children ?? []) walk(child)
    }
    walk(await session.desk.drawn())
    return found
  }
  const before = await handles()
  const drawnBefore = JSON.stringify(await session.desk.drawn())
  expect(Object.keys(before)).toEqual(['settings'])
  await session.desk.redraw({ ...PANE.props, isFocused: true })
  for (let i = 0; i < 3; i++) await session.clock.advance(1_000)
  expect(JSON.stringify(await session.desk.drawn())).not.toBe(drawnBefore)
  expect(await handles()).toEqual(before)
  // The settings' own buttons too.
  await session.press('settings')
  const open = await handles()
  expect(Object.keys(open)).toContain('pick:idle.coffee')
  await session.desk.redraw({ ...PANE.props, isFocused: false })
  for (let i = 0; i < 3; i++) await session.clock.advance(1_000)
  expect(await handles()).toEqual(open)
})

test('a setting decides whether the pane opens by itself', { timeoutMs: 30_000 }, async ($, on) => {
  on('session.attach', (_$, e) => ({ clientId: e.clientId }))
  on('ui.close', () => undefined)
  on('command.run', () => ({ text: '' }))
  const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 5_000 })
  const reopened = async () => {
    const before = session.opened.length
    await $.session.attach({ surface: 'desktop', clientId: `desktop:${before}` })
    // The pane opens after the attach settles, not within it.
    await session.clock.advance(10)
    return session.opened.length > before
  }
  const setting = async () =>
    [await session.desk.find({ type: 'Button', key: 'opens-on' }), await session.desk.find({ type: 'Button', key: 'opens-off' })].map(found => found?.props.variant)
  // On at first: the session opened it as it started, and a client
  // attaching, as a reopened session's does, opens it again.
  expect(session.opened).toEqual(['clawd-crew'])
  expect(await reopened()).toBe(true)
  await session.press('settings')
  expect(await session.texts()).toContain('Opens by itself')
  expect(await setting()).toEqual(['primary', undefined])
  // Off: kept for every session, and nothing opens it unasked.
  await session.press('opens-off')
  expect(await setting()).toEqual([undefined, 'primary'])
  expect(await reopened()).toBe(false)
  // Opening it with /clawds leaves the setting as it is.
  await $.command.run({ command: 'clawds', args: '' })
  expect(await setting()).toEqual([undefined, 'primary'])
  expect(await reopened()).toBe(false)
  // On again.
  await session.press('opens-on')
  expect(await setting()).toEqual(['primary', undefined])
  expect(await reopened()).toBe(true)
  // /clawds hide turns it off, as it says.
  await $.command.run({ command: 'clawds', args: 'hide' })
  expect(await reopened()).toBe(false)
})

test('clicks in quick succession are one press', { timeoutMs: 30_000 }, async ($, on) => {
  const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 5_000 })
  const isOpen = async () => (await session.texts()).includes('Animations')
  // A double click on the gear opens the settings, rather than opening and
  // shutting them at once.
  await session.desk.press({ key: 'settings' })
  await session.desk.press({ key: 'settings' })
  expect(await isOpen()).toBe(true)
  // Anything within 300 ms of it is the same press; from then on, a new one.
  await session.clock.advance(299)
  await session.desk.press({ key: 'settings-done' })
  expect(await isOpen()).toBe(true)
  await session.clock.advance(1)
  await session.desk.press({ key: 'settings-done' })
  expect(await isOpen()).toBe(false)
})

test('a session waiting on its helpers delegates', { timeoutMs: 30_000 }, async ($, on) => {
  // Its turn goes on, but between steps with no tool of its own under way
  // it does nothing but wait on the helpers it sent off.
  let isHeld = false
  let stepGate: (() => void) | undefined
  let toolGate: (() => void) | undefined
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    yield { kind: 'thinking', index: 0, text: 'hmm' }
    if (isHeld && e.agentId === undefined) {
      await new Promise<void>(resolve => {
        stepGate = resolve
      })
    }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'tool_use',
      usage: { model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1_000, cache_creation_input_tokens: 0 },
    }
  })
  on('tool.call', async (_$, e) => {
    if (isHeld && e.tool === 'Read') {
      await new Promise<void>(resolve => {
        toolGate = resolve
      })
    }
    return { result: 'ok', text: 'ok' }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'bg1' }))
  const seed = {
    [`${OWN_PROJECT}\\${SELF}.jsonl`]: 'x',
    [`${OWN_RUNS}\\wf_1\\agent-wf1.meta.json`]: JSON.stringify({ agentType: 'workflow-subagent', description: 'write:layout', workflowPhase: 'Write' }),
  }
  const session = await pair($, on, { status: 'busy', statusUpdatedAt: NOW - 5_000 }, { seed, dirs: { [OWN_RUNS]: ['wf_1'] } })
  const own = async () => (await session.desk.find({ type: 'Client', key: `sprite:${SELF}` }))?.props.props
  const published = () => JSON.parse(session.files.get(`${LIVE}\\${SELF}.json`) ?? '{}')
  // What its own row says it is doing, after the pane has caught up.
  const settle = async () => {
    for (let i = 0; i < 3; i++) await session.clock.advance(1_000)
    const texts = await session.texts()
    return texts[texts.indexOf('Clawd mod (this one)') + 1]
  }
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 2 })) {
    // drain
  }
  // It sends a subagent off into the background and waits for it.
  await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_bg', prompt: 'look around', description: 'Survey the repo', subagent_type: 'Explore', run_in_background: true } as never)
  await $.agent.spawn({ tool_use_id: 'toolu_bg', prompt: 'look around', description: 'Survey the repo', subagentType: 'Explore', background: true } as never)
  expect(await settle()).toBe('Waiting on 1 helper')
  expect(await session.texts()).toContain('Explore · Survey the repo')
  expect(await own()).toMatchObject({ mood: 'delegating' })
  expect(published()).toMatchObject({ mood: 'delegating', detail: 'Waiting on 1 helper' })
  // While a step of its own runs, it is thinking, helpers or not.
  isHeld = true
  const slow = (async () => {
    for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'claude-opus-5-5', messageCount: 4 })) {
      // drain
    }
  })()
  expect(await settle()).toBe('Thinking…')
  stepGate?.()
  await slow
  expect(await settle()).toBe('Waiting on 1 helper')
  // A tool call of its own comes first.
  const reading = $.tool.call({ tool: 'Read', tool_use_id: 'toolu_read', file_path: 'C:\\work\\clawd-mod\\app.ts' })
  expect(await settle()).toBe('Reading app.ts')
  toolGate?.()
  await reading
  isHeld = false
  expect(await settle()).toBe('Waiting on 1 helper')
  // The helper done, with nothing left to wait on, it thinks again.
  await $.turn.complete({ answer: 'found it', durationMs: 5_000, isAborted: false, turnId: 'h1', agentId: 'bg1', reason: 'answer' })
  expect(await settle()).toBe('Thinking…')
  // A workflow's agent at work: it waits as the one leading the crowd.
  for await (const _ of $.turn.step({ turnId: 'w1', index: 0, model: 'claude-opus-5-5', messageCount: 2, agentId: 'wf1' })) {
    // drain
  }
  for (let i = 0; i < 2; i++) await session.clock.advance(1_000)
  expect(await settle()).toBe('Waiting on 1 helper')
  expect(await session.texts()).toContain('write:layout')
  expect(await own()).toMatchObject({ mood: 'rallying' })
})

test('surfaces without modules draw the Clawds as SVGs', { timeoutMs: 30_000 }, async ($, on) => {
  // The desktop draws each Clawd as a surface module; the phone and the
  // editor draw no modules, so they get the SVG sprites, the icon too.
  const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 5_000 })
  expect(await session.desk.find({ type: 'Client', key: `sprite:${SELF}` })).toBeDefined()
  for (const surface of ['mobile', 'vscode'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect(await pane.findAll({ type: 'Client' })).toEqual([])
    expect((await pane.findAll({ type: 'Svg' })).map(found => found.props.alt)).toContain('Weather app')
    await pane.unmount()
  }
})

test('a pick kept from before is drawn from the start', { timeoutMs: 30_000 }, async ($, on) => {
  const seed = { [SETTINGS]: JSON.stringify({ v: 1, animations: { idle: 'idle.tune' } }) }
  const session = await pair($, on, { status: 'idle', statusUpdatedAt: NOW - 5_000 }, { seed, ticks: 1 })
  expect((await session.desk.find({ type: 'Client', key: `sprite:${SELF}` }))?.props.props).toMatchObject({ mood: 'idle.tune' })
})
