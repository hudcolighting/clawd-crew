// How a session's activity reads: which animation a tool call plays and the
// short line under the Clawd, model ids as people say them, and durations and
// token counts that fit a narrow pane.

export type Mood =
  | 'idle'
  | 'sleeping'
  | 'thinking'
  | 'responding'
  | 'typing'
  | 'reading'
  | 'searching'
  | 'running'
  | 'browsing'
  | 'delegating'
  | 'rallying'
  | 'planning'
  | 'tooling'
  | 'waiting'
  | 'done'
  | 'error'
  | 'compacting'

export type Doing = { mood: Mood; detail: string }

export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const fileName = (path: unknown) => {
  if (typeof path !== 'string' || path === '') return 'a file'
  return path.split(/[\\/]/).pop() || path
}

const hostOf = (url: unknown) => {
  if (typeof url !== 'string' || url === '') return 'a page'
  try {
    return new URL(url).host
  } catch {
    return clip(url, 40)
  }
}

const isUuid = (text: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text)

// The animation and line for a tool call; `input` may be empty while the
// model is still streaming the call's arguments.
export const describeTool = (tool: string, input: unknown): Doing => {
  const args = (input !== null && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = (key: string) => (typeof args[key] === 'string' ? oneLine(args[key] as string) : '')
  switch (tool) {
    case 'Edit':
    case 'MultiEdit':
      return { mood: 'typing', detail: `Editing ${fileName(args.file_path)}` }
    case 'Write':
      return { mood: 'typing', detail: `Writing ${fileName(args.file_path)}` }
    case 'NotebookEdit':
      return { mood: 'typing', detail: `Editing ${fileName(args.notebook_path)}` }
    case 'Read':
      return { mood: 'reading', detail: `Reading ${fileName(args.file_path)}` }
    case 'Grep':
      return { mood: 'searching', detail: text('pattern') ? `Searching for "${clip(text('pattern'), 40)}"` : 'Searching the code' }
    case 'Glob':
      return { mood: 'searching', detail: text('pattern') ? `Finding ${clip(text('pattern'), 40)}` : 'Finding files' }
    case 'ToolSearch':
      return { mood: 'searching', detail: 'Looking up tools' }
    case 'Bash':
    case 'PowerShell': {
      const what = text('description') || (text('command') ? `$ ${text('command')}` : 'Running a command')
      return { mood: 'running', detail: clip(what, 90) }
    }
    case 'BashOutput':
    case 'TaskOutput':
    case 'Monitor':
      return { mood: 'running', detail: 'Watching a background job' }
    case 'WebFetch':
      return { mood: 'browsing', detail: `Fetching ${hostOf(args.url)}` }
    case 'WebSearch':
      return { mood: 'browsing', detail: text('query') ? `Searching the web for "${clip(text('query'), 40)}"` : 'Searching the web' }
    case 'Agent':
    case 'Task':
      return { mood: 'delegating', detail: text('description') ? `Delegating: ${clip(text('description'), 60)}` : 'Starting a helper' }
    case 'SendMessage':
      return { mood: 'delegating', detail: 'Messaging a teammate' }
    case 'Workflow':
      return { mood: 'delegating', detail: 'Running a workflow' }
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':
      return { mood: 'planning', detail: 'Updating the plan' }
    case 'EnterPlanMode':
      return { mood: 'planning', detail: 'Making a plan' }
    case 'ExitPlanMode':
      return { mood: 'waiting', detail: 'Waiting for plan approval' }
    case 'AskUserQuestion':
      return { mood: 'waiting', detail: 'Asking you a question' }
    case 'Skill':
      return { mood: 'tooling', detail: text('skill') ? `Using skill ${clip(text('skill'), 40)}` : 'Using a skill' }
  }
  if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__')
    const action = name.replace(/_/g, ' ')
    if (/browser|chrome|playwright|puppeteer/i.test(server)) return { mood: 'browsing', detail: `Browsing: ${action}` }
    return { mood: 'tooling', detail: `${isUuid(server) ? 'Connector' : clip(server.replace(/_/g, ' '), 24)}: ${action}` }
  }
  return { mood: 'tooling', detail: `Using ${tool}` }
}

const MOOD_WORDS: Record<Mood, string> = {
  idle: 'Idle',
  sleeping: 'Napping',
  thinking: 'Thinking…',
  responding: 'Writing a reply…',
  typing: 'Writing code…',
  reading: 'Reading…',
  searching: 'Searching…',
  running: 'Running a command…',
  browsing: 'Browsing…',
  delegating: 'Managing helpers',
  rallying: 'Leading a crowd of helpers',
  planning: 'Planning…',
  tooling: 'Using tools…',
  waiting: 'Needs you',
  done: 'Done!',
  error: 'Hit a snag',
  compacting: 'Compacting context…',
}

export const doingLine = ({ mood, detail }: Doing) => detail || MOOD_WORDS[mood]

export const isWorkMood = (mood: Mood) => !['idle', 'sleeping', 'waiting', 'done', 'error'].includes(mood)

// `claude-opus-5-5` reads "Opus 5.5", `claude-haiku-4-5-20251001` "Haiku 4.5".
export const modelName = (id: string | undefined) => {
  if (!id) return ''
  const at = id.indexOf('claude-')
  const bare = (at >= 0 ? id.slice(at + 7) : id).replace(/\[1m\]$/i, '')
  const parts = bare.split(/[-.]/)
  const family = parts.find(part => /^[a-z]+$/i.test(part))
  if (!family) return id
  const version = parts.filter(part => /^\d{1,2}$/.test(part)).join('.')
  const name = `${family[0]!.toUpperCase()}${family.slice(1)}${version ? ` ${version}` : ''}`
  return /\[1m\]$/i.test(id) ? `${name} (1M)` : name
}

export const tokenCount = (n: number | undefined) => {
  if (n === undefined || !Number.isFinite(n)) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return `${Math.round(n)}`
}

// "$4.10"; whole dollars from $1,000 on.
export const money = (usd: number) => (usd >= 1000 ? `$${Math.round(usd).toLocaleString('en-US')}` : `$${usd.toFixed(2)}`)

export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

// As short as can be, for a crowd's narrow columns: "45s", "12m", "1h 02m".
export const briefly = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// Minute-grained, for things that change slowly (idle time, session age).
export const roughly = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / 60000)
  if (m < 1) return 'under a minute'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
