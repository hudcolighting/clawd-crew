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

/** A session's workflow agents, by phase, however many or few. */
export type CrewCrowd = {
  phases: CrewPhase[]
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
}

/** What every session used over a stretch of time, closed ones included. */
export type CrewTotal = {
  /** "Today", "Week", "Total". */
  label: string
  /** "12.3M in · 140k out · $38.20", or "counting…" until counted. */
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
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-crew': {
      view: Shaped<CrewView>
    }
  }
}
