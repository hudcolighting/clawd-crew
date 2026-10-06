# Clawd Crew

A Claude Code mod that shows every running Claude Code session, and every subagent they start, as a little animated Clawd in a pane docked beside your conversation. Under each Clawd you see what it is doing, its model, how long it has been working, and the tokens it has used. Above them, a header shows how much of your plan's usage limits is left and what all your sessions have used, closed ones included.

<img src="media/pane.png" width="465" alt="The Clawd Crew pane: usage limits and totals above three sessions, one of them running a workflow of twelve agents">

An unofficial fan project, not made by or affiliated with Anthropic ([disclaimer](#disclaimer)).

## Install

**You need** Claude Code with hooks modules, the early-access part of its plugin system this mod is built on (it is made against Claude Code 2.1.286, and a later release may change that system). It runs in the desktop app, where the pane docks on the right, and in a terminal. On Windows nothing else is needed. On macOS and Linux, the usage totals need `python3`. It is written for all three and tested on Windows.

**From the marketplace**, in a terminal:

```bash
claude plugin marketplace add hudcolighting/clawd-crew
```

```bash
claude plugin install clawd-crew@clawd-crew
```

or in Claude Code itself, `/plugin marketplace add hudcolighting/clawd-crew` and then `/plugin install clawd-crew@clawd-crew`. Sessions started after that load the mod.

**From a clone**:

```bash
git clone https://github.com/hudcolighting/clawd-crew
```

then put the folder in `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (on macOS or Linux, a path like `/home/you/clawd-crew`):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\path\\to\\clawd-crew"
  }
}
```

To try it in one session only, start that session with `claude --plugin-dir <folder>`. Install it one way, not both, or every session loads two copies.

**If the pane never appears**, hooks modules may be switched off for your account. Turn them on with `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` in the same `env` block, and start a new session. In a terminal the pane opens by itself only after you have run `/clawds` once.

**To uninstall**, run `claude plugin uninstall clawd-crew@clawd-crew` (or take the folder out of `CLAUDE_CODE_PLUGIN_DIRS`), then delete `~/.claude/clawd-crew`, where the mod keeps its files.

## The crew

Every session is a Clawd with three or four lines beside it: its name, what it is doing, its model and how long it has been working (or idle), and its context, output tokens and cost. The session whose pane you are looking at is always on top. Below it come the others, oldest first, with sleeping ones (idle for more than 10 minutes) below all the awake ones.

- **Subagents** show as smaller Clawds under the session that started them, with their type and task ("Explore · Map the theme tokens"), at most 8 at a time. Each stays 12 seconds after it finishes.
- **Workflows** get a view of their own: their agents in two columns under the workflow's phases, each a tiny Clawd beside its name, what it is doing and the tokens it has used. Each phase has a line with its agents' counts, its time and its tokens. A finished phase folds into one line, checked off in green or crossed off in red, and the phase lines go 3 minutes after the workflow's last agent finishes. While a session runs a workflow, its Clawd conducts the crowd from a podium.
- **A session at work in the background**, such as a workflow running between phases, shows "Working in the background" rather than napping.

## The Clawds

Each mood has three animations: its own (Classic) and two more. Pick any of them in the [settings](#commands-and-settings), three moods a page. A pick shows at once, and in your other sessions within a few seconds.

| Mood | Classic | | |
| --- | :---: | :---: | :---: |
| **Idle**<br><sub>Waiting for a prompt</sub> | <img src="media/clawd-idle.gif" width="112" alt="Breathing, glancing around, shuffling, stretching"><br>Classic | <img src="media/clawd-idle-coffee.gif" width="112" alt="Sips from a steaming mug"><br>Coffee | <img src="media/clawd-idle-humming.gif" width="112" alt="Sways to a tune, notes drifting off"><br>Humming |
| **Asleep**<br><sub>Idle for 10 minutes</sub> | <img src="media/clawd-sleeping.gif" width="112" alt="Asleep under rising Z's, twitching and shifting over"><br>Classic | <img src="media/clawd-sleeping-tucked-in.gif" width="112" alt="Under a striped blanket, beneath the moon and stars"><br>Tucked in | <img src="media/clawd-sleeping-dozing.gif" width="112" alt="Nods off on his feet and startles awake"><br>Dozing |
| **Thinking**<br><sub>Before a reply</sub> | <img src="media/clawd-thinking.gif" width="112" alt="Hand on chin under a filling thought cloud"><br>Classic | <img src="media/clawd-thinking-pacing.gif" width="112" alt="Paces, scratches his head, and the bulb lights"><br>Pacing | <img src="media/clawd-thinking-cube.gif" width="112" alt="Turns a puzzle cube until it is solved"><br>Cube |
| **Replying**<br><sub>Writing a reply</sub> | <img src="media/clawd-responding.gif" width="112" alt="Talking with his hands while a speech bubble fills"><br>Classic | <img src="media/clawd-responding-letter.gif" width="112" alt="Writes the reply out on a sheet of paper"><br>Letter | <img src="media/clawd-responding-board.gif" width="112" alt="Draws it on a whiteboard and explains"><br>Board |
| **Editing**<br><sub>Edit, Write</sub> | <img src="media/clawd-typing.gif" width="112" alt="Typing at a laptop, pausing to read and think"><br>Classic | <img src="media/clawd-typing-matrix.gif" width="112" alt="Hacker mode, in dark glasses under green code rain"><br>Matrix | <img src="media/clawd-typing-desk.gif" width="112" alt="Types at a keyboard, code scrolling up a monitor"><br>Desk |
| **Reading**<br><sub>Read</sub> | <img src="media/clawd-reading.gif" width="112" alt="Peeking over the top of a book, turning its pages"><br>Classic | <img src="media/clawd-reading-paper.gif" width="112" alt="Reads a newspaper and turns the page"><br>Paper | <img src="media/clawd-reading-tablet.gif" width="112" alt="Reads a tablet held toward him, its back to us"><br>Tablet |
| **Searching**<br><sub>Grep, Glob</sub> | <img src="media/clawd-searching.gif" width="112" alt="Raising and lowering a magnifying glass"><br>Classic | <img src="media/clawd-searching-torch.gif" width="112" alt="Sweeps a flashlight's beam"><br>Torch | <img src="media/clawd-searching-binocs.gif" width="112" alt="Scans with binoculars and spots something"><br>Binocs |
| **Running**<br><sub>Bash, shells</sub> | <img src="media/clawd-running.gif" width="112" alt="Running beside a terminal"><br>Classic | <img src="media/clawd-running-treadmill.gif" width="112" alt="Runs on a treadmill"><br>Treadmill | <img src="media/clawd-running-progress.gif" width="112" alt="Watches a progress bar fill, and cheers"><br>Progress |
| **Browsing**<br><sub>On the web</sub> | <img src="media/clawd-browsing.gif" width="112" alt="Pointing at and reaching for a spinning globe"><br>Classic | <img src="media/clawd-browsing-surfing.gif" width="112" alt="Rides a big swell, catching air off the crests"><br>Surfing | <img src="media/clawd-browsing-browser.gif" width="112" alt="Watches a page load in a browser window"><br>Browser |
| **Delegating**<br><sub>Subagents</sub> | <img src="media/clawd-delegating.gif" width="112" alt="Giving orders to two small Clawds"><br>Classic | <img src="media/clawd-delegating-hand-off.gif" width="112" alt="Small Clawds take crates from him and carry them off"><br>Hand-off | <img src="media/clawd-delegating-tower.gif" width="112" alt="Small Clawds stack up to grab a star he points at"><br>Tower |
| **Rallying**<br><sub>Workflows</sub> | <img src="media/clawd-rallying.gif" width="112" alt="Up on a podium, conducting a crowd of small Clawds"><br>Classic | <img src="media/clawd-rallying-line.gif" width="112" alt="An endless file of small Clawds marching off at his orders"><br>Line | <img src="media/clawd-rallying-horde.gif" width="112" alt="A horde of small Clawds piles onto him until he bursts free"><br>Horde |
| **Planning**<br><sub>Todos, plan mode</sub> | <img src="media/clawd-planning.gif" width="112" alt="Ticking off a clipboard held at his side"><br>Classic | <img src="media/clawd-planning-map.gif" width="112" alt="Traces a route across a map to an X"><br>Map | <img src="media/clawd-planning-stickies.gif" width="112" alt="Puts sticky notes up on a cork board"><br>Stickies |
| **Tooling**<br><sub>Other tools</sub> | <img src="media/clawd-tooling.gif" width="112" alt="Turning a gear with a wrench"><br>Classic | <img src="media/clawd-tooling-hammer.gif" width="112" alt="Hammers a nail into a block"><br>Hammer | <img src="media/clawd-tooling-toolbox.gif" width="112" alt="Rummages in a toolbox for the right tool"><br>Toolbox |
| **Waiting**<br><sub>Needs you</sub> | <img src="media/clawd-waiting.gif" width="112" alt="Waving and hopping under a question mark"><br>Classic | <img src="media/clawd-waiting-sign.gif" width="112" alt="Pumps a question mark sign up and down"><br>Sign | <img src="media/clawd-waiting-bell.gif" width="112" alt="Taps a desk bell"><br>Bell |
| **Done**<br><sub>Finished a turn</sub> | <img src="media/clawd-done.gif" width="112" alt="Jumping with sparkles"><br>Classic | <img src="media/clawd-done-trophy.gif" width="112" alt="Holds a trophy high"><br>Trophy | <img src="media/clawd-done-dance.gif" width="112" alt="Dances under falling confetti"><br>Dance |
| **Error**<br><sub>The turn failed</sub> | <img src="media/clawd-error.gif" width="112" alt="Shaken under a red double exclamation mark, then dizzy"><br>Classic | <img src="media/clawd-error-smoke.gif" width="112" alt="Smoke pours off him while he coughs and fans it"><br>Smoke | <img src="media/clawd-error-rain.gif" width="112" alt="A rain cloud of his own, and lightning strikes him"><br>Rain |
| **Compacting**<br><sub>Context full</sub> | <img src="media/clawd-compacting.gif" width="112" alt="Flattened by a hydraulic press, then popping back up"><br>Classic | <img src="media/clawd-compacting-squeeze.gif" width="112" alt="Squishes himself flat and springs back up"><br>Squeeze | <img src="media/clawd-compacting-vacuum.gif" width="112" alt="Vacuums up the bits on the floor"><br>Vacuum |

A Clawd keeps an animation at least 2 seconds before showing the next, so it doesn't flicker between two activities; needing you, finishing and errors switch at once.

## Usage limits and totals

The header has six lines:

- **5-hour** and **Weekly**: how much of your plan's usage limits is left, and how long until each resets. The bar drains as you use the window: green while more than half is left, amber at half or less, red at a fifth or less.
- **Today**, **Week** and **Total**: the input tokens (cached and not), output tokens and cost of every model call in every session, subagents and closed sessions included. Today starts at your local midnight. Week starts when the weekly limit's window opened, so it lines up with the Weekly bar (with no weekly reading, it covers the last 7 days). Total goes back to your oldest transcript.
- **Crew**: how many sessions there are, how many helpers are working, and how many sessions need you.

### Getting them

There is nothing to set up, but each kind arrives its own way:

1. **The limits** need a Claude subscription. Claude Code reads them from every reply, and the mod shows the freshest reading any session has, keeping it in `~/.claude/clawd-crew/limits.json` so a new session shows them at once. On the very first start there is no reading yet, so rather than wait for your first reply, the mod asks for one itself with a one-token request ([below](#what-it-does-on-your-machine)). Signed in with an API key there are no limits, and the two lines stay hidden.
2. **The totals** are counted from the transcripts Claude Code keeps in `~/.claude/projects`, which record every call's tokens. The first time, one session reads every transcript you have, which takes a minute or so for a long history; until then the lines say "counting…". After that they keep up within about 20 seconds.
3. **If a line stays empty**: "counting…" for more than a few minutes on macOS or Linux means `python3` is missing from your PATH. No 5-hour or Weekly lines on a subscription means no reading came yet: send any message and they show after its reply.

How the totals are counted:

- Cost is priced at Anthropic's API list prices, which are built into the mod (`PRICES` in `hooks/usage.ts`): per model, with cache writes and reads, fast mode, US-only inference and web searches. On a subscription it is what the same use would cost on the API. A model newer than the list is priced as the nearest older model of its family.
- Each call is counted once: a resumed session's transcript repeats the calls of the one it resumed, and the repeats are skipped. Calls that never reach a transcript, such as the page summaries WebFetch makes, are missed.
- Claude Code deletes transcripts after 30 days (its `cleanupPeriodDays` setting), so the mod keeps a total for each day, and Total doesn't drop when old transcripts go.
- One session at a time does the counting and shares the totals in `~/.claude/clawd-crew/usage.json`; the others read that file. When it closes, another takes over.

## What it does on your machine

The mod has no network code of its own, and nothing it reads leaves your computer. The one request it can make, described below, goes through Claude Code's own connection like any reply. `claude plugin validate .claude-plugin/plugin.json`, run in the mod's folder, lists every Claude Code call the mod makes.

**What it reads**

- `~/.claude/sessions/`: Claude Code's list of running sessions (each one's name, folder and status).
- The transcripts in `~/.claude/projects/`. For the totals, it takes each model call's model, token counts and time, and nothing else. For a session without the mod, it reads the last 160 KB of its transcript to see its model, context size and current tool. For a workflow, it reads each agent's meta file for the agent's name.
- Its own files in `~/.claude/clawd-crew/`.

What reaches the pane is session names, models, and a few words on what each is doing: a file name, a search pattern, a command's description, a subagent's task. It is shown in your pane and goes nowhere else.

**What it writes**, all in `~/.claude/clawd-crew/`:

- `live/<session id>.json`: each session's state, for the other sessions to show (status, model, tokens, cost, subagents and the latest limit readings).
- `usage.json`: the totals, by quarter hour for the last week and by day, and which session is counting them.
- `limits.json`: the best reading of the usage limits.
- `asked.json`: when a session last asked for the limits, and whether the answer had them.
- `settings.json`: your animation picks.

Three preferences go in Claude Code's own plugin storage: whether the pane opens by itself, the drawing style, and whether you have asked for it in a terminal.

**What it runs**: a few of the system's own programs, for what Claude Code's plugin API doesn't offer: a list of running processes, and reading files past the API's 4 MiB limit (transcripts run much longer). These are the only commands it runs:

- On Windows: `tasklist /FO CSV /NH`, to see which sessions are still running; `powershell.exe -NoProfile -NonInteractive -Command <script>`, whose script (`readTails` in `hooks/crew.ts`) reads the end of other sessions' transcripts; and `powershell.exe -NoProfile -NonInteractive -EncodedCommand <script>`, which counts the totals. The counting script is long, so it is passed as base64 text, PowerShell's way of taking a script whole. Malware uses the same switch to hide what it runs, so here is where to read it in plain text: `SCAN_PS` in `hooks/usage.ts`.
- On macOS and Linux: `ps -A -o pid=`; `sh -c` running `tail` and `base64` over the transcripts' paths; and `python3 -c <script>` (`SCAN_PY` in `hooks/usage.ts`).

Each is handed file paths and reads the files itself, and what it prints comes back to the mod and goes nowhere else. No conversation text is handed to any of them.

**What it asks the model**: one tiny request, and only when it is needed. When no session has a reading of the usage limits, as on a first start, the session doing the counting sends Haiku a one-line request capped at one output token, and reads the limits from the answer as from any reply. The asking is noted in `asked.json`, and no session asks again within five hours, or within a week if the answer had no limits (as with an API key). It costs a few dozen input tokens, which show in `/cost`. Nothing else is sent to a model.

**What it hooks**: Claude Code's events about each session (its start, attach and end; each turn and its steps; tool calls; subagents starting; compaction; usage), only to see what the session is doing. Every one of those hooks passes its event on unchanged and returns what Claude Code answers, so it changes no tool call, permission, agent or prompt. It answers just two things itself, both its own: the `/clawds` command, and the drawing of its own pane.

**What it never does**: call a tool, start an agent, run a slash command, fetch anything from the network on its own, or write a build, start-up, settings or instructions file of any program. Its `settings.json` holds only its animation picks, in its own folder. It reads no credential: where the code says "token", it means the token counts of model calls. The engine tests in `tests/` stand in for Claude Code to check the mod, so they call tools, start agents and answer process calls themselves; Claude Code never loads them.

## Commands and settings

- `/clawds` opens the pane, for example after you closed it or in a narrow terminal.
- `/clawds hide` closes it and turns "Opens by itself" off.
- `/clawds style pixels` (the default) or `/clawds style svg` picks how the desktop app draws the Clawds.

The ⚙ at the top right of the pane opens the settings, for every session:

- **Opens by itself**: whether new and reopened sessions open the pane without being asked. Closing the pane closes it in that session only.
- **Animations**: the animation each mood is drawn with, three moods a page.

In the desktop app, each Clawd is drawn as small boxes of color by a module that runs on the app's side and steps the animation itself, so the pane's once-a-second redraws never restart it. `/clawds style svg` draws animated SVGs instead, which restart each time the pane redraws.

## Development

```bash
claude plugin validate .claude-plugin/plugin.json
```

```bash
claude plugin test .
```

`validate` reads the manifest and the hooks module as Claude Code will, and lists what the module hooks and calls (`claude plugin validate .` checks the marketplace manifest instead). `test` runs `tests/crew.test.ts` against Claude Code's own engine. Claude Code writes its plugin API's type declarations into `.claude-plugin/types/` whenever it loads the mod from your folder (git ignores them), and `tsconfig.json` builds on them, so an editor type-checks the code once the mod has loaded.

To see every animation in a browser, serve the folder over HTTP (for example `python3 -m http.server`) and open `/preview/`; `/preview/pane.html` shows a sample pane, and `pane.html?sample=pane-settings.json` the settings.

- `hooks/register.tsx`: the hooks: events, the once-a-second tick, the `/clawds` command and the pane drawing.
- `hooks/crew.ts`: tracking this session, reading the others, and wording each row.
- `hooks/usage.ts`: the totals: the price list, the transcript reader, and which session counts.
- `hooks/words.ts`: tool calls to moods and labels; model names, durations, token counts.
- `hooks/sprites.js`: the pixel art, built from parts (body, eyes, arms, legs and props), and the animations each mood offers.
- `hooks/sprite-client.tsx`: the desktop's Clawd, drawn as boxes of color and animated on the app's side.
- `hooks/svg.js`: the same art as animated SVG, for `/clawds style svg` and the mobile and VS Code surfaces.
- `hooks/cells.ts`: the terminal's version, in quadrant-block cells.
- `hooks/icon.js` and `hooks/icon-client.tsx`: the Clawd Crew icon as pixels, and the desktop's drawing of it under the settings.
- `media/`: the icon, the pane picture, and a 512 x 512 GIF of every animation.

## License

Clawd Crew is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).

## Disclaimer

Clawd Crew is an unofficial fan project. It is not made, endorsed or supported by Anthropic. Claude, Claude Code and Clawd are Anthropic's; the license above covers this project's own code and drawings, and grants no rights in Anthropic's names or characters.

<p align="center"><img src="media/icon.png" width="128" alt="The Clawd Crew icon: Clawd lifting a stage light over his head, its beams fanning out"></p>
