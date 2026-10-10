// What the Clawd Crew pane draws: one group per session, its own row then
// one row per helper, already worded, so a drawing is a pure function of it.

export type CrewTone = 'work' | 'wait' | 'idle' | 'done' | 'error'

export type CrewMember = {
  /** Stable across redraws: the session id, or `<session id>:<agent id>`. */
  key: string
  /** The animation Clawd plays (sprites.js `ANIMATIONS`), held a few
   * seconds between changes: each change reloads the sprite. */
  mood: string
  name: string
  doing: string
  /** Dim lines under `doing`: model and time, then token usage. */
  facts: string[]
  /** The sprite's hover tooltip: only facts fixed for the member's life. */
  tip: string
  tone: CrewTone
  isAgent: boolean
  isSelf: boolean
  /** Its detail, once opened: its task or folder, model and times, tokens,
   * and its last few steps. Only the member opened has one. */
  detail?: string[]
}

/** A helper in a crowd: a tiny Clawd beside three short lines. */
export type CrewChip = {
  /** As a helper's `CrewMember` key: `<session id>:<agent id>`. */
  key: string
  /** The animation its Clawd plays, as `CrewMember.mood`. */
  mood: string
  name: string
  /** What it is doing: "Reading layout.css", "Finished". */
  doing: string
  /** How long it has worked and the tokens it used: "2m · 341k tok". */
  fact: string
  tone: CrewTone
  /** Its detail, once opened, as a `CrewMember`'s. */
  detail?: string[]
}

/** One workflow phase (or the helpers of no phase). */
export type CrewPhase = {
  key: string
  /** "Verify", or checked off once over: "✓ Research", "✗ Verify". */
  title: string
  /** "3 working · 2 done · 6m 41s · 1.4M tok". */
  summary: string
  /** `done` or `error` once over; `idle` (no color) while it runs. */
  tone: CrewTone
  isOver: boolean
  /** Its agents, finished ones too, until it is over; none after. */
  chips: CrewChip[]
}

/** One workflow run: its name and how far it has got, over its phases. */
export type CrewRun = {
  key: string
  /** The workflow's name ("review-changes"), "Workflow" when unknown, or
   * empty for helpers of no run, which draw no line of their own. */
  title: string
  /** "phase 2 of 4 · 7 of 12 agents done". */
  summary: string
  phases: CrewPhase[]
}

/** A session's workflow agents, by run and phase, however many or few. */
export type CrewCrowd = {
  runs: CrewRun[]
  /** Helpers left out past the most a crowd shows. */
  more: number
}

export type CrewGroup = {
  key: string
  head: CrewMember
  helpers: CrewMember[]
  /** Its workflows' agents and phases, under its other helpers' rows. */
  crowd?: CrewCrowd
}

/** How the desktop draws the Clawds: boxes of color stepped by a surface
 * module (`pixels`), or SVG frames the app rebuilds on every redraw (`svg`). */
export type CrewStyle = 'pixels' | 'svg'

/** One of the account's usage-limit windows, as the header shows it. */
export type CrewLimit = {
  /** The window as the API names it: `five_hour`, `seven_day`, … */
  key: string
  /** "5-hour", "Weekly". */
  label: string
  /** How much of the window is left, 0 to 1: the bar's fill. */
  left: number
  /** "62% left". */
  percent: string
  /** "resets in 2h 14m"; empty when the API gave no reset time. */
  resets: string
  tone: CrewTone
  /** "out in 1h 40m at this pace" when the recent pace uses the window up
   * before it resets; empty otherwise. */
  pace: string
}

/** What every session used over a stretch of time, closed ones included. */
export type CrewTotal = {
  /** "Today", "Week", "Total". */
  label: string
  /** "12.3M in · 140k out · $38.20", or "counting…" until counted. */
  text: string
}

/** The cost of every session's calls over the last day, a quarter hour at a
 * time, for a sparkline. */
export type CrewTrend = {
  /** "24h". */
  label: string
  /** Dollars in each quarter hour, oldest first: 96 of them. */
  values: number[]
  /** What they come to: "$12.40". */
  text: string
}

/** The lines above the Clawds. */
export type CrewHeader = {
  /** The best reading any session has had of each window. */
  limits: CrewLimit[]
  /** Said in place of the limits until a first reading comes. */
  note: string
  /** Today's use, the weekly limit window's, and all of it. */
  totals: CrewTotal[]
  /** The last day's use, once counted and when there was any. */
  trend?: CrewTrend
}

export type CrewView = {
  header: CrewHeader
  groups: CrewGroup[]
  /** How many sessions, how many helpers at work, how many need you. */
  summary: string
  style: CrewStyle
  /** The animation each mood is drawn with, where the person picked one not its own. */
  animations?: Record<string, string>
  /** Whether the pane shows its settings in place of the crew. */
  isSetting?: boolean
  /** Whether new and reopened sessions open the pane by themselves. */
  opensItself?: boolean
  /** Which page of the settings it shows, from 0. */
  settingsPage?: number
  /** Whether every session pins a line of the crew under its prompt. */
  showsStatus?: boolean
  /** The key of the member or chip whose detail is open. */
  expanded?: string
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-crew': {
      view: Shaped<CrewView>
    }
  }
}
