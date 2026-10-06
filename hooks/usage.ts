// What every session has used, closed ones included, read from the
// transcripts Claude Code keeps under <config>/projects: each API call's
// tokens, priced at Anthropic's list prices and counted once, even where a
// resumed session's transcript repeats the calls of the one it resumed. One
// session at a time (the leader) reads the transcripts, a little more each
// round as they grow, and shares 15-minute totals in
// <config>/clawd-crew/usage.json; the others read that file.

import type { Io } from './crew'

// [start, tokens in, tokens out, dollars]: a quarter hour's calls.
export type Slot = [start: number, tokensIn: number, tokensOut: number, usd: number]

export type Totals = { tokensIn: number; tokensOut: number; usd: number }

// Dollars per million tokens: input, 5-minute cache write, 1-hour cache
// write, cache read, output. From platform.claude.com/docs/en/about-claude/pricing
// as of 2026-10-05.
type Price = readonly [input: number, write5m: number, write1h: number, read: number, output: number]

const PRICES: Readonly<Record<string, Price>> = {
  'fable-5.1': [10, 12.5, 20, 0.25, 50],
  'mythos-5.1': [10, 12.5, 20, 0.25, 50],
  'fable-5': [10, 12.5, 20, 1, 50],
  'mythos-5': [10, 12.5, 20, 1, 50],
  'opus-5.5': [4, 5, 8, 0.2, 20],
  'opus-5': [5, 6.25, 10, 0.5, 25],
  'opus-4.8': [5, 6.25, 10, 0.5, 25],
  'opus-4.7': [5, 6.25, 10, 0.5, 25],
  'opus-4.6': [5, 6.25, 10, 0.5, 25],
  'opus-4.5': [5, 6.25, 10, 0.5, 25],
  'opus-4.1': [15, 18.75, 30, 1.5, 75],
  'opus-4': [15, 18.75, 30, 1.5, 75],
  'sonnet-5.5': [2, 2.5, 4, 0.2, 10],
  'sonnet-5': [2, 2.5, 4, 0.2, 10],
  'sonnet-4.6': [3, 3.75, 6, 0.3, 15],
  'sonnet-4.5': [3, 3.75, 6, 0.3, 15],
  'sonnet-4': [3, 3.75, 6, 0.3, 15],
  'haiku-4.5': [1, 1.25, 2, 0.1, 5],
  'haiku-3.5': [0.8, 1, 1.6, 0.08, 4],
}

// Fast mode doubles every rate of the models that offer it; US-only
// inference adds a tenth to any.
const FAST = new Set(['opus-5.5', 'opus-5', 'opus-4.8'])
const WEB_SEARCH_USD = 0.01

const SLOT_MS = 15 * 60_000
const DAY_MS = 24 * 60 * 60_000
// Today's and the week's totals reach no further back; older days live on
// as daily totals.
const WINDOW_MS = 8 * DAY_MS
// A leader that has not written for this long is gone: another takes over.
const STALE_MS = 150_000
const WALK_MS = 20_000
const BEAT_MS = 30_000
// What one scan prints before it stops for the next round: the engine keeps
// 4 MiB of a child's output.
const OUTPUT_BUDGET = 3_000_000
const SCAN_TIMEOUT_MS = 300_000
// After a read fails (no PowerShell or python3, say), the leader waits this
// long before it tries another.
const RETRY_MS = 60_000

const paths = { config: '', sep: '/', isWindows: false }

export const setUsagePaths = (config: string, sep: string, isWindows: boolean) => {
  paths.config = config
  paths.sep = sep
  paths.isWindows = isWindows
}

const join = (...parts: string[]) => parts.join(paths.sep)

const usageFile = () => join(paths.config, 'clawd-crew', 'usage.json')

// ------------------------------------------------------------- prices --

// `claude-opus-5-5` is "opus-5.5", `claude-haiku-4-5-20251001` "haiku-4.5",
// `claude-3-5-haiku-20241022` "haiku-3.5".
export const modelKey = (model: string) => {
  const at = model.indexOf('claude-')
  const parts = (at >= 0 ? model.slice(at + 7) : model).replace(/\[.*$/, '').split(/[-.]/)
  const family = parts.find(part => /^[a-z]+$/i.test(part))?.toLowerCase()
  const version = parts.filter(part => /^\d{1,2}$/.test(part)).join('.')
  return family ? `${family}-${version}` : undefined
}

// A version not listed yet is priced as its family's nearest one below it
// (a new Opus as the last Opus), or the family's oldest.
const priceOf = (key: string) => {
  const exact = PRICES[key]
  if (exact) return exact
  const [family = '', version = ''] = key.split('-')
  const wanted = Number(version) || 0
  const known = Object.keys(PRICES)
    .filter(name => name.startsWith(`${family}-`))
    .map(name => ({ name, version: Number(name.slice(family.length + 1)) || 0 }))
    .sort((a, b) => b.version - a.version)
  const near = known.find(entry => entry.version <= wanted) ?? known.at(-1)
  return near ? PRICES[near.name] : undefined
}

type Usage = {
  model: string
  speed: string
  geo: string
  input: number
  write5m?: number
  write1h?: number
  writes: number
  read: number
  output: number
  searches: number
}

export const costOf = (usage: Usage) => {
  const key = modelKey(usage.model)
  const price = key ? priceOf(key) : undefined
  if (!key || !price) return 0
  // Without the split, every cache write is a 5-minute one.
  const split = usage.write5m !== undefined || usage.write1h !== undefined
  const write5m = split ? (usage.write5m ?? 0) : usage.writes
  const write1h = split ? (usage.write1h ?? 0) : 0
  const scale = (usage.speed === 'fast' && FAST.has(key) ? 2 : 1) * (usage.geo === 'us' ? 1.1 : 1)
  const tokens = usage.input * price[0] + write5m * price[1] + write1h * price[2] + usage.read * price[3] + usage.output * price[4]
  return (tokens / 1e6) * scale + usage.searches * WEB_SEARCH_USD
}

// -------------------------------------------------------------- scans --

// Reads each file from an offset to its last whole line and prints one row
// per API call newer than the cutoff, the first time it meets its message
// id (a call's content blocks repeat its usage, line after line), then the
// offset it reached in each file. Its input is the cutoff, then a line of
// `offset<TAB>base64 path` per file. Old lines are told apart without being
// parsed, and so are lines of calls seen already.
const SCAN_PS = `$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Web.Extensions
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
$utf8 = New-Object System.Text.UTF8Encoding($false)
$idOf = [regex]'^"message":\\{"model":"[^"]*","id":"([^"]+)"'
$items = [Console]::In.ReadToEnd().Split([char]10)
$cut = $items[0].Trim()
$out = New-Object System.Text.StringBuilder
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$buf = New-Object byte[] 4194304
$tab = [char]9
$full = $false
for ($i = 1; $i -lt $items.Length -and -not $full; $i++) {
  $item = $items[$i].Trim()
  if ($item.Length -eq 0) { continue }
  $sep = $item.IndexOf($tab)
  $done = [long]$item.Substring(0, $sep)
  try {
    $s = [IO.File]::Open($utf8.GetString([Convert]::FromBase64String($item.Substring($sep + 1))), 'Open', 'Read', 'ReadWrite,Delete')
  } catch { continue }
  try {
    [void]$s.Seek($done, 'Begin')
    $held = New-Object System.IO.MemoryStream
    while (-not $full) {
      $k = $s.Read($buf, 0, $buf.Length)
      if ($k -le 0) { break }
      $at = 0
      while ($at -lt $k) {
        $nl = [Array]::IndexOf($buf, [byte]10, $at, $k - $at)
        if ($nl -lt 0) { $held.Write($buf, $at, $k - $at); break }
        if ($held.Length -gt 0) {
          $held.Write($buf, $at, $nl - $at)
          $size = $held.Length
          $line = $utf8.GetString($held.ToArray())
          $held.SetLength(0)
        } else {
          $size = $nl - $at
          $line = $utf8.GetString($buf, $at, $size)
        }
        $at = $nl + 1
        $done += $size + 1
        if ($line.IndexOf('"type":"assistant"') -lt 0) { continue }
        $t = $line.LastIndexOf('"timestamp":"')
        if ($t -lt 0 -or $t + 37 -gt $line.Length) { continue }
        if ([string]::CompareOrdinal($line.Substring($t + 13, 24), $cut) -lt 0) { continue }
        $m = $line.IndexOf('"message":{')
        if ($m -lt 0) { continue }
        $hit = $idOf.Match($line.Substring($m, [Math]::Min(400, $line.Length - $m)))
        if ($hit.Success -and $seen.Contains($hit.Groups[1].Value)) { continue }
        try { $o = $json.DeserializeObject($line) } catch { continue }
        if ($o -eq $null -or $o['type'] -ne 'assistant') { continue }
        $msg = $o['message']
        if ($msg -eq $null) { continue }
        $u = $msg['usage']
        $id = [string]$msg['id']
        if ($u -eq $null -or $id.Length -eq 0 -or -not $seen.Add($id)) { continue }
        $w5 = $null; $w1 = $null; $ws = 0
        $cc = $u['cache_creation']
        if ($cc -ne $null) { $w5 = $cc['ephemeral_5m_input_tokens']; $w1 = $cc['ephemeral_1h_input_tokens'] }
        $st = $u['server_tool_use']
        if ($st -ne $null -and $st['web_search_requests'] -ne $null) { $ws = $st['web_search_requests'] }
        [void]$out.Append('C').Append($tab).Append($id).Append($tab).Append($o['timestamp']).Append($tab).Append($msg['model']).Append($tab).Append($u['speed']).Append($tab).Append($u['inference_geo']).Append($tab).Append($u['input_tokens']).Append($tab).Append($w5).Append($tab).Append($w1).Append($tab).Append($u['cache_creation_input_tokens']).Append($tab).Append($u['cache_read_input_tokens']).Append($tab).Append($u['output_tokens']).Append($tab).Append($ws).Append([char]10)
        if ($out.Length -ge ${OUTPUT_BUDGET}) { $full = $true; break }
      }
    }
  } catch {}
  $s.Close()
  [void]$out.Append('F').Append($tab).Append($i - 1).Append($tab).Append($done).Append([char]10)
}
[Console]::Out.Write($out.ToString())
`

const SCAN_PY = `import base64, json, sys
items = sys.stdin.read().split('\\n')
cut = items[0].strip()
out = []
size = 0
seen = set()
full = False
def text(value):
    return '' if value is None else str(value)
for i, item in enumerate(items[1:]):
    item = item.strip()
    if not item:
        continue
    sep = item.find('\\t')
    done = int(item[:sep])
    try:
        f = open(base64.b64decode(item[sep + 1:]).decode('utf-8'), 'rb')
    except Exception:
        continue
    with f:
        f.seek(done)
        for raw in f:
            if not raw.endswith(b'\\n'):
                break
            done += len(raw)
            if b'"type":"assistant"' not in raw:
                continue
            t = raw.rfind(b'"timestamp":"')
            if t < 0 or raw[t + 13:t + 37].decode('ascii', 'replace') < cut:
                continue
            try:
                row = json.loads(raw)
            except Exception:
                continue
            msg = row.get('message') or {}
            u = msg.get('usage')
            mid = msg.get('id')
            if row.get('type') != 'assistant' or not u or not mid or mid in seen:
                continue
            seen.add(mid)
            cc = u.get('cache_creation') or {}
            st = u.get('server_tool_use') or {}
            line = '\\t'.join(['C', mid, text(row.get('timestamp')), text(msg.get('model')), text(u.get('speed')), text(u.get('inference_geo')), text(u.get('input_tokens')), text(cc.get('ephemeral_5m_input_tokens')), text(cc.get('ephemeral_1h_input_tokens')), text(u.get('cache_creation_input_tokens')), text(u.get('cache_read_input_tokens')), text(u.get('output_tokens')), text(st.get('web_search_requests') or 0)])
            out.append(line)
            size += len(line) + 1
            if size >= ${OUTPUT_BUDGET}:
                full = True
                break
    out.append('F\\t%d\\t%d' % (i, done))
    if full:
        break
sys.stdout.write('\\n'.join(out) + '\\n')
`

// PowerShell takes a script as base64 of its UTF-16 text, out of reach of
// the quoting a command line would put it through.
const encodedForPowerShell = (script: string) => {
  const bytes = new Uint8Array(script.length * 2)
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >> 8
  }
  return bytes.toBase64()
}

let scanArgv: string[] | undefined

const scannerArgv = () =>
  (scanArgv ??= paths.isWindows
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedForPowerShell(SCAN_PS)]
    : ['python3', '-c', SCAN_PY])

type Call = { id: string; ts: number; tokensIn: number; tokensOut: number; usd: number }

// The calls one scan found past each file's offset, made at `cut` (an ISO
// time; empty for all) or later, and the offsets reached.
const scan = async (io: Io, files: readonly (readonly [path: string, offset: number])[], cut: string) => {
  const encoder = new TextEncoder()
  const input = [cut, ...files.map(([path, offset]) => `${offset}\t${encoder.encode(path).toBase64()}`)]
  const { stdout } = await io.run(scannerArgv(), SCAN_TIMEOUT_MS, input.join('\n'))
  const calls: Call[] = []
  const reached = new Map<string, number>()
  for (const line of stdout.split(/\r?\n/)) {
    const field = line.split('\t')
    if (field[0] === 'F' && field.length === 3) {
      const file = files[Number(field[1])]
      if (file) reached.set(file[0], Number(field[2]))
      continue
    }
    if (field[0] !== 'C' || field.length !== 13) continue
    const ts = Date.parse(field[2]!)
    if (!Number.isFinite(ts)) continue
    const count = (at: number) => Number(field[at]) || 0
    const maybe = (at: number) => (field[at] === '' ? undefined : count(at))
    const usage: Usage = {
      model: field[3]!,
      speed: field[4]!,
      geo: field[5]!,
      input: count(6),
      write5m: maybe(7),
      write1h: maybe(8),
      writes: count(9),
      read: count(10),
      output: count(11),
      searches: count(12),
    }
    calls.push({ id: field[1]!, ts, tokensIn: usage.input + usage.writes + usage.read, tokensOut: usage.output, usd: costOf(usage) })
  }
  return { calls, reached }
}

// Every transcript written since `since`: each session's, and its subagents'
// under <session>/subagents and its workflows' folders beneath that.
const walk = async (io: Io, since: number) => {
  const found = new Map<string, { size: number; mtimeMs: number }>()
  const agents = async (folder: string, depth: number) => {
    for (const entry of await io.list(folder).catch(() => [])) {
      if (entry.kind === 'file' && /^agent-.+\.jsonl$/.test(entry.name) && entry.mtimeMs >= since) found.set(join(folder, entry.name), entry)
      else if (entry.kind === 'dir' && depth > 0 && (entry.name === 'workflows' || depth === 1)) await agents(join(folder, entry.name), depth - 1)
    }
  }
  const projects = join(paths.config, 'projects')
  for (const project of await io.list(projects).catch(() => [])) {
    if (project.kind !== 'dir') continue
    const dir = join(projects, project.name)
    const entries = await io.list(dir).catch(() => [])
    const folders = new Set(entries.filter(entry => entry.kind === 'dir').map(entry => entry.name))
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.jsonl') || entry.mtimeMs < since) continue
      found.set(join(dir, entry.name), entry)
      const session = entry.name.slice(0, -'.jsonl'.length)
      if (folders.has(session)) await agents(join(dir, session, 'subagents'), 2)
    }
  }
  return found
}

// ------------------------------------------------------------- leader --

const lead = {
  isLeader: false,
  // Reading every transcript there is, once, to start the daily history.
  isSeeding: false,
  // The daily history reaches back to the oldest transcript.
  isSeeded: false,
  // Every transcript found has been read to its end once.
  isCounted: false,
  files: new Map<string, { offset: number; size: number; mtimeMs: number }>(),
  calls: new Map<string, Call>(),
  // Each day's totals, as far back as they were ever counted.
  history: [] as Slot[],
  walkedAt: 0,
  sharedAt: 0,
  sharedText: '',
  pausedUntil: 0,
}

// What every session shows, as the leader last shared it: the quarter hours
// of the last week or so, and every day's totals.
let slots: Slot[] = []
let days: Slot[] = []
let isReady = false
let isSeeded = false
let isPolling = false

const isSlot = (value: unknown): value is Slot =>
  Array.isArray(value) && value.length === 4 && value.every(n => typeof n === 'number' && Number.isFinite(n))

const slotsIn = (value: unknown) => (Array.isArray(value) ? value.filter(isSlot) : [])

type Shared = { leader: string; heartbeat: number; isCounted: boolean; isSeeded: boolean; slots: Slot[]; days: Slot[] }

const readShared = async (io: Io): Promise<Shared | undefined> => {
  try {
    const kept = JSON.parse(await io.read(usageFile())) as Record<string, unknown>
    if (kept.v !== 1) return undefined
    return {
      leader: typeof kept.leader === 'string' ? kept.leader : '',
      heartbeat: typeof kept.heartbeat === 'number' ? kept.heartbeat : 0,
      isCounted: kept.isCounted === true,
      isSeeded: kept.isSeeded === true,
      slots: slotsIn(kept.slots),
      days: slotsIn(kept.days),
    }
  } catch {
    return undefined
  }
}

const writeShared = (io: Io, shared: Shared) => io.write(usageFile(), JSON.stringify({ v: 1, ...shared }))

// The calls since `from`, added up in spans of `size`.
const totalsBy = (size: number, from: number) => {
  const byStart = new Map<number, Slot>()
  for (const call of lead.calls.values()) {
    if (call.ts < from) continue
    const start = Math.floor(call.ts / size) * size
    const slot: Slot = byStart.get(start) ?? [start, 0, 0, 0]
    slot[1] += call.tokensIn
    slot[2] += call.tokensOut
    slot[3] += call.usd
    byStart.set(start, slot)
  }
  return [...byStart.values()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, tokensIn, tokensOut, usd]): Slot => [start, tokensIn, tokensOut, Math.round(usd * 1e6) / 1e6])
}

// A day's count only grows while its transcripts are kept, and drops when
// Claude Code deletes them: each day keeps the most it was ever counted at.
const mergeDays = (kept: readonly Slot[], counted: readonly Slot[]) => {
  const byStart = new Map<number, Slot>(kept.map(day => [day[0], [day[0], day[1], day[2], day[3]]]))
  for (const day of counted) {
    const held = byStart.get(day[0])
    byStart.set(day[0], held ? [day[0], Math.max(held[1], day[1]), Math.max(held[2], day[2]), Math.max(held[3], day[3])] : day)
  }
  return [...byStart.values()].sort((a, b) => a[0] - b[0])
}

// Reads what the transcripts gained since the last round: the folders now
// and then, then every file that grew, from where the last read stopped.
// Seeding reads them all, from their first line; after that, only the last
// week or so.
const count = async (io: Io, now: number) => {
  const since = lead.isSeeding ? 0 : now - WINDOW_MS
  if (lead.files.size === 0 || now - lead.walkedAt >= WALK_MS) {
    lead.walkedAt = now
    const found = await walk(io, since)
    for (const path of lead.files.keys()) if (!found.has(path)) lead.files.delete(path)
    for (const [path, { size, mtimeMs }] of found) {
      const held = lead.files.get(path)
      if (!held) lead.files.set(path, { offset: 0, size, mtimeMs })
      else {
        held.size = size
        held.mtimeMs = mtimeMs
        // Rewritten shorter: read it again; its calls are known by id.
        if (size < held.offset) held.offset = 0
      }
    }
  }
  // Oldest first: a call a resumed session repeats is met first where it was made.
  const due = [...lead.files]
    .filter(([, file]) => file.size > file.offset)
    .sort(([, a], [, b]) => a.mtimeMs - b.mtimeMs)
    .map(([path, file]) => [path, file.offset] as const)
  if (due.length > 0) {
    const { calls, reached } = await scan(io, due, lead.isSeeding ? '' : new Date(since).toISOString())
    for (const call of calls) {
      const held = lead.calls.get(call.id)
      if (!held || call.ts < held.ts) lead.calls.set(call.id, call)
    }
    for (const [path, offset] of reached) {
      const file = lead.files.get(path)
      if (file) file.offset = Math.max(file.offset, offset)
    }
  }
  if ([...lead.files.values()].every(file => file.offset >= file.size)) lead.isCounted = true
}

const share = async (io: Io, sessionId: string, now: number, previous: Shared | undefined) => {
  if (lead.isCounted) {
    lead.history = mergeDays(lead.history, totalsBy(DAY_MS, 0))
    if (lead.isSeeding) {
      // The history is whole: from now on only the last week or so is read.
      lead.isSeeded = true
      lead.isSeeding = false
      lead.walkedAt = 0
    }
    for (const [id, call] of lead.calls) if (call.ts < now - WINDOW_MS) lead.calls.delete(id)
  }
  const shared: Shared = {
    leader: sessionId,
    heartbeat: now,
    isCounted: lead.isCounted || previous?.isCounted === true,
    isSeeded: lead.isSeeded,
    slots: lead.isCounted ? totalsBy(SLOT_MS, now - WINDOW_MS) : (previous?.slots ?? []),
    days: lead.history,
  }
  const text = JSON.stringify([shared.isCounted, shared.isSeeded, shared.slots, shared.days])
  if (lead.isCounted) {
    slots = shared.slots
    days = shared.days
    isReady = true
    isSeeded = shared.isSeeded
  }
  if (text === lead.sharedText && now - lead.sharedAt < BEAT_MS) return
  lead.sharedText = text
  lead.sharedAt = now
  await writeShared(io, shared)
}

const stepDown = () => {
  lead.isLeader = false
  lead.isSeeding = false
  lead.isSeeded = false
  lead.isCounted = false
  lead.files.clear()
  lead.calls.clear()
  lead.history = []
  lead.sharedText = ''
  lead.pausedUntil = 0
}

// Every few seconds in every session: reads the shared totals; the leader
// (the session the file names while it keeps writing, or the first to find
// it silent) reads the transcripts on and shares the new totals.
export const pollUsage = async (io: Io, sessionId: string, now: number) => {
  if (isPolling || !paths.config || !sessionId) return
  isPolling = true
  try {
    const file = await readShared(io)
    if (file && !(lead.isLeader && lead.isCounted)) {
      slots = file.slots
      days = file.days
      isReady = file.isCounted
      isSeeded = file.isSeeded
    }
    const isMine = file?.leader === sessionId
    if (file && !isMine && now - file.heartbeat < STALE_MS) {
      if (lead.isLeader) stepDown()
      return
    }
    if (!lead.isLeader) {
      stepDown()
      lead.isLeader = true
      lead.isSeeded = file?.isSeeded === true
      lead.isSeeding = !lead.isSeeded
      lead.history = file?.days ?? []
    }
    // Claim the file before the first long read, so no one else starts one.
    if (!isMine) await share(io, sessionId, now, file)
    if (now >= lead.pausedUntil) {
      try {
        await count(io, now)
      } catch {
        lead.pausedUntil = now + RETRY_MS
      }
    }
    await share(io, sessionId, now, file)
  } catch {
    // A failed round is tried again on the next.
  } finally {
    isPolling = false
  }
}

// A leader leaving says so, and another session takes over at once.
export const releaseUsage = async (io: Io, sessionId: string) => {
  if (!lead.isLeader || !paths.config) return
  const file = await readShared(io)
  if (file?.leader === sessionId) await writeShared(io, { ...file, leader: '', heartbeat: 0 })
  stepDown()
}

// Today's and the week's totals are counted, and with them the history.
export const isUsageReady = () => isReady

// Whether this session reads the transcripts for every session.
export const isUsageLeader = () => lead.isLeader

export const isTotalReady = () => isReady && isSeeded

// Every session's use since `from`, within the last week or so.
export const usageSince = (from: number): Totals => {
  const totals = { tokensIn: 0, tokensOut: 0, usd: 0 }
  const first = Math.floor(from / SLOT_MS) * SLOT_MS
  for (const [start, tokensIn, tokensOut, usd] of slots) {
    if (start < first) continue
    totals.tokensIn += tokensIn
    totals.tokensOut += tokensOut
    totals.usd += usd
  }
  return totals
}

// Every session's use, as far back as transcripts were kept when the history
// began.
export const usageTotal = (): Totals => {
  const totals = { tokensIn: 0, tokensOut: 0, usd: 0 }
  for (const [, tokensIn, tokensOut, usd] of days) {
    totals.tokensIn += tokensIn
    totals.tokensOut += tokensOut
    totals.usd += usd
  }
  return totals
}
