# learn-pi dashboard

Local web UI for your learning tracks in `~/.pi/learn/`. Start it with `/learn-dashboard start` — binds to `127.0.0.1` only.

The dashboard **polls every few seconds** while open and supports **inline editing** for most track fields. Changes write back to the Track record via `PATCH /api/tracks/:id`.

### Starter templates

The home page lists **starter templates** by tier (beginner / intermediate / advanced). Each template pre-seeds edge, next action, material units, resources, and glossary. Programming templates let you pick a language when multiple are supported; study templates may prompt for a topic. CLI equivalent: `/learn-scaffold` with no arguments.

## Layout

### Header

Shows the app title and, when a focus timer is running, a timer chip with mode (work/break), remaining time, and active track.

### Sidebar

Lists all tracks. The track with ▶ is the **active track** — the one pi commands like `/learn-start` default to. Click a track to see its detail in the main panel.

### Main panel

Organized into sections for the selected track:

| Section | Cards |
|---------|-------|
| **Hero** | Current edge + next action (largest visual weight) |
| **Forethought** | Outcome compass, track overview |
| **Process** | Process contract (cue, session length, reward) |
| **Materials** | Material graph, glossary, resources, deferred yaks |
| **History** | Session log |

## Core concepts

### Edge

The single skill or milestone you are working on *right now*. It should be concrete enough to know when you have crossed it. Updated together with the next action when you run `/learn-reflect`. Editable inline in the hero panel.

### Next action

A pre-computed, bite-sized first step for your next session — open this file, write this one function, run this test. Never empty on an active track; reflection must set the next one before closing a session. Shown prominently in the hero panel.

### Outcome compass

The long-term “why” for the track — what success looks like months from now. Read for motivation and direction only; it is not a progress bar and does not gate anything.

### Process contract

Your habit loop: cue → routine → reward. Keeps sessions repeatable without re-deciding each time.

### Cue

The trigger that reminds you to start a session — e.g. weekday mornings at 9:30. Set with `/learn-cue`; can install an OS reminder (launchd on macOS) so it fires even when pi is closed.

### Session length

Target minutes per session from the process contract (e.g. 25 or 45). Used by `/learn-start` to shape scope.

### Reward

What you do after a session to close the loop — e.g. “log + 5min decompression”. Logged in reflection; visible here for consistency.

### Stall counter

Increments when a session makes no edge progress and resolves no yak; resets when you cross the edge or resolve a yak. At 3+, reflection surfaces a double-loop question: is the goal or approach wrong?

## Track detail cards

### Material graph

Sequenced learning units for the track — chapters, exercises, or milestones. Each unit is a card showing status (pending, active, done, skipped), difficulty, prerequisites, notes, and per-unit resources. Built with `/learn-plan` or scaffold wizards.

### Glossary

Track-wide technical terms from course documentation — definitions keyed to unit guides and source docs. Lives on the Track record (`glossary[]`); visibility only, not gated on progress.

**Carousel view** — horizontal scroll of definition cards, each showing term, truncated definition, and unit. Supports:

- **Search** across term, definition, unit, and source
- **Unit filter** — all units, track-level, or a specific unit
- **Sort** — term A→Z, term Z→A, unit, or definition
- **Scroll** — drag/swipe the carousel or use ← → buttons

**Detail dialog** — click a card to open a modal with the full definition, inline editing for term/definition, unit and source metadata, and remove.

**Generate from unit guides** — scans local markdown unit guides attached to material units and adds new terms (deduped by term). Same logic as `/learn-glossary scan`.

Add entries manually with **+ add term** (`term | definition` format) or via `/learn-glossary add`.

### Track resources

Links to docs, repos, videos, and papers from both track-level and unit-level resources, aggregated into one table.

**Table features:**

- **Search** across title, URL, kind, note, and unit
- **Filters** — kind (article, doc, video, …) and scope (track-level, unit resources, unit guides)
- **Sort** — click column headers or use the toolbar sort control (title, unit, kind, URL, note)
- **Pagination** — 5 resources per page

Local markdown files (`file://…/*.md`) open in the in-dashboard viewer; other URLs open in a new tab. Unit guides are highlighted in the table.

Add track-level resources with **+ add resource** (select kind, enter title/URL).

### Deferred yaks

Side quests you explicitly parked so they do not derail the current edge. Add and resolve with `/learn-yaks` or inline in the dashboard.

### Session log

History of reflected sessions: minutes spent, whether the edge was crossed, notes, and yaks touched. Written by `/learn-reflect`. Read-only in the dashboard.

### Work dir & verify

`work_dir` is where you code or take notes. `verify_command` is the test or check that confirms edge progress (e.g. `cargo test -p …`). Editable via `/learn-plan`.

## Track types

### Programming track

Default kind. Edge progress is verified by running tests or commands in `work_dir`.

### Study track

Non-coding topics. Uses a rubric (self-assessment questions) instead of a verify command. Created with `/learn-study`.

## Common commands

| Command | Purpose |
|---------|---------|
| `/learn-dashboard start` | Boot the server and open the browser |
| `/learn-dashboard stop` | Stop the running server |
| `/learn-dashboard status` | Show whether the server is running |
| `/learn-dashboard open` | Open the browser for a running server |
| `/learn-start [track] [energy]` | Begin a session |
| `/learn-reflect` | Debrief and update edge + next action |
| `/learn-status` | Quick text overview of all tracks |
| `/learn-plan` | Edit material graph and edge |
| `/learn-glossary [list\|add\|update\|remove\|scan]` | Manage glossary entries |
| `/learn-cue` | Set or clear session reminders |
| `/learn-yaks` | Manage deferred side quests |

### Glossary CLI

| Subcommand | Example |
|------------|---------|
| `list` | `/learn-glossary` — list all terms A→Z |
| `add` | `/learn-glossary add qubit \| Basic unit of quantum information [--source=] [--unit=]` |
| `update` | `/learn-glossary update <id> [--term=] [--definition=] [--source=] [--unit=]` |
| `remove` | `/learn-glossary remove <id>` |
| `scan` | `/learn-glossary scan [--dry-run]` — extract terms from unit-guide markdown |

## Writable API

The dashboard writes through `PATCH /api/tracks/:id`. Supported operations:

**Scalars:** `edge`, `next_action`, `outcome_compass`, `verify_command`, `session_min`, `overview`

**Collections:** `add_unit`, `update_unit`, `add_resource`, `add_yak`, `resolve_yak`, `add_glossary`, `update_glossary`, `remove_glossary`, `scan_glossary`

All writes are atomic (tmp + rename) via the same mutators as the pi extensions.
