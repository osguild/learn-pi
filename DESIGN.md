# learn-pi design

**Status:** Design phase — converged 2026-07-13. Input: `research.md` (11 load-bearing mechanisms + 4 open architecture questions). Output: a buildable spec for `@osguild/learn-pi`.

This doc freezes the fork decisions and turns the 11 mechanisms into a concrete pi-package design: data model, storage layout, tool surface, skills, background events, v1 scope, and the cue mechanism. Implementation questions that survived the design phase are listed at the end.

## Converged fork decisions

| Fork | Decision | Rationale |
|---|---|---|
| Strawman frame | **adopt** | One central `Track` record; three-layer tool/skill/background split. |
| A — state location | **(c) hybrid** | Track metadata + plan + reflection live in `~/.pi/learn/`; the project working dir lives wherever the learner points (scaffolder creates it). Package owns the track lifecycle without owning the repo. |
| B — socratic skill boundary | **adopt** | Socratic-method active during `/learn-start` sessions, `/learn-reflect`, and verify. **Off** during management commands (`/learn-ingest`, `/learn-scaffold`, `/learn-plan`, `/learn-cue`, `/learn-yaks`) — those want direct answers, not questions. |
| C — reflection skill | **separate** | New `reflection-prompts` skill, distinct from `socratic-method`. Reflection is a different mode (reviewing, not being quizzed) and revisable independently. |
| D — v1 scope of big features | **scaffolder first** | Build `/learn-scaffold` (#6 Mode B) fully for v1. Stub ingestion (#11) behind manual `/learn-plan` unit entry — the agent can hand-enter learnable units and sequence them against the edge, but no auto-decomposition of external material yet. Rationale: Round 2's felt-absence put the scaffolder as the strongest signal; unblocks the most tracks first. Ingestion is v1.1. |
| E — cue mechanism | **hard cue** | `/learn-cue` writes an OS-level reminder (launchd on macOS, cron fallback, ical as a portable option) that actually pushes when pi is closed. Failure mode #3 is *not opening pi* — a soft cue that only fires once pi is open doesn't solve it. Revisit soft-cue fallback only if hard-cue proves materially harder than estimated for low benefit. |

## Data model — the `Track` record

Every mechanism reads/writes one record. This is what `socrates-plan` failed to keep alive; the record *is* the persistence strategy.

```jsonc
// ~/.pi/learn/tracks/<track-id>.json
{
  "id": "rust-webgpu",
  "label": "Rust WebGPU",
  "outcome_compass": "A Rust WebGPU app that turns into a game engine people might use.",
  "outcome_compass_revised_at": "2026-07-13T19:00:00Z",
  "process_contract": {
    "cue": { "kind": "weekday", "time": "09:30", "days": ["mon","tue","wed","thu","fri"] },
    "session_min": 45,
    "reward": "log + 5min decompression"
  },
  "work_dir": "/Users/brandonly/gitrepos/rust-webgpu",
  "verify_command": "cargo test -p rust-webgpu",
  "edge": {
    "statement": "Render a triangle via a wgpu render pipeline, specifying vertex buffer layout by hand.",
    "set_at": "2026-07-13T19:00:00Z",
    "sessions_at_edge": 0
  },
  "next_action": "Open src/render.rs. Declare the vertex buffer layout struct. Do not write the pipeline yet.",
  "next_action_set_at": "2026-07-13T19:00:00Z",
  "deferred_yaks": [
    { "id": "yak-1", "desc": "Investigate wgpu-hal vs wgpu core API split", "added_at": "...", "resolved": false }
  ],
  "material_graph": {
    "source": null,
    "units": [],
    "revised_at": null
  },
  "log": [
    {
      "id": "sess-1",
      "at": "2026-07-13T19:00:00Z",
      "minutes": 42,
      "edge_before": "...",
      "edge_crossed": true,
      "new_edge": "...",
      "next_action_after": "...",
      "outcome_compass_revised": false,
      "yaks": ["yak-1"],
      "note": "Got the window open; render pass is next."
    }
  ],
  "stall_counter": 0,
  "last_session_at": "2026-07-13T19:00:00Z",
  "created_at": "2026-07-13T18:00:00Z"
}
```

**Field → mechanism map:**

| Field | Mechanism(s) |
|---|---|
| `outcome_compass` + `outcome_compass_revised_at` | #9 (compass, revisable by #8) |
| `process_contract` | #10 (cue/routine/reward) |
| `edge` | #4 (current-edge marker), #3 (flow calibrated difficulty), #8 (reflection updates it) |
| `next_action` + `next_action_set_at` | #2/#7 (always-on pre-computed action), #8 (reflection replans it) |
| `verify_command` | #4 retrieval-shaped verify property, #3 immediate feedback |
| `deferred_yaks` | #6 Mode A |
| `material_graph` | #11 (stubbed in v1 — `units` populated manually via `/learn-plan`) |
| `log` | #8 reflection record, #10 reward log, #1 cross-track variety signal |
| `stall_counter` | #8 double-loop trigger (Argyris) |
| `work_dir` | #6 Mode B (scaffolder creates + points here), #2 next-action executes here |

**Integrity rules (enforced by the tools, never by hand):**
1. `next_action` is **never empty** for an active track. `/learn-reflect` cannot close a session without setting the next one. This is the single rule that prevents the `socrates-plan` failure.
2. `edge.statement` and `next_action` are updated **together** in `/learn-reflect` — you can't move the edge without replanning the next move.
3. `outcome_compass` is **never gated on** — it's read for visibility only, never compared to a progress percentage.
4. `stall_counter` increments when a session logs no edge-crossing AND no deferred-yak resolution; resets on either. At `stall_counter >= N` (default 3), `/learn-reflect` surfaces the double-loop question.

## Storage layout (Fork A — hybrid)

```
~/.pi/learn/
  tracks/
    <track-id>.json          # the Track record (above)
  index.json                 # { active_track_id, tracks: [{id,label,last_session_at}] }
  cue/
    <track-id>.plist         # generated launchd job (macOS) — written by /learn-cue
  scaffold-templates/        # project scaffolding recipes used by /learn-scaffold
    webgpu-rust/
      skeleton/              # the file tree to emit
      manifest.json          # vars, post-create commands, verify_command
  logs/
    sessions.jsonl           # append-only session log (mirror of Track.log, for cross-track queries)
```

The **project working dir** (`work_dir` in the Track) lives wherever the learner points — by default `~/gitrepos/<track-id>/` or wherever the scaffolder created it. The package never writes learning-state files into the project repo. This is the break from the proto: state is centralized in `~/.pi/learn/`, not scattered across `.pi/learner.json` + `PROGRESS.md` + `.pi/plans/`.

**Why hybrid over (a) co-located:** the scaffolder (#6 Mode B) creates new project repos — there's no existing repo to co-locate into at track-creation time. State must outlive any single project dir (a track can move its `work_dir`). **Why hybrid over (b) full-ownership:** the project dir is still a real git repo the learner works in; the package shouldn't own the project, just the track lifecycle.

## Tool surface (the verbs)

All commands are slash-commands exposed via the package's extensions. Naming: `/learn-*` replaces the proto's `/socrates-*` to signal the broadened scope (socratic is now one mode, not the whole package).

| Command | Mechanism | Socratic on? | Replaces |
|---|---|---|---|
| `/learn-start [track] [energy]` | #10 routine, #2 re-entry, #3 flow-shape, #1 cross-track variety | **yes** | `socrates-start` |
| `/learn-reflect` | #8 reflection, #4 edge update, #2 next-action replan, #9 compass revision | **yes** (via `reflection-prompts`) | `socrates-journal` |
| `/learn-plan [track]` | #2 forethought, #11 stub (manual unit entry + edge sequencing) | **no** | `socrates-plan` |
| `/learn-timer <subcmd>` | #10 routine half | no (operational) | `socrates-timer` |
| `/learn-cue <subcmd>` | #10 cue half (writes OS reminder) | no | NEW |
| `/learn-scaffold <recipe> [dir]` | #6 Mode B (generates project structure) | no | NEW |
| `/learn-yaks <subcmd>` | #6 Mode A (deferred-yaks list: add/list/resolve) | no | NEW |
| `/learn-status` | cross-track view, edge + next-action for all tracks | no | `socrates-status` |
| `/learn-ingest <source>` | #11 (STUBBED in v1 — prints "coming in v1.1, use /learn-plan to enter units manually") | no | NEW (stub) |

**`/learn-start` is the centerpiece.** On invoke:
1. Reads the Track record (or `index.json` to pick a track if none specified — #1 cross-track variety: if a cue fired for a different track than last session, offer it).
2. Renders a low-cognitive-load dashboard: outcome-compass (visible, never gated), current edge, the waiting `next_action` (the single most important field — this is what `socrates-plan` failed to surface at re-entry), today's cue status.
3. Starts the timer (routine half of #10), marks the reward as pending.
4. Hands control to the socratic-method skill for the session itself.

**`/learn-reflect` is the loop-closer.** On invoke (typically at session end, or via `session_shutdown` event):
1. Asks 3 structured questions via `reflection-prompts` skill: (a) did you cross the edge? (b) what's the concrete first move next time? (c) any yaks to defer? If `stall_counter >= N`, additionally: "is the *goal* wrong, not just the approach?" (double-loop).
2. Writes the updated `edge`, `next_action`, `deferred_yaks`, `log` entry to the Track.
3. If `outcome_compass` was revised, bumps `outcome_compass_revised_at`.
4. Logs the reward (completes the #10 loop).

## Skills (the prompt contracts)

| Skill | Mechanism | Active during | New? |
|---|---|---|---|
| `socratic-method` | the questioning frame for learning interactions | `/learn-start` sessions, verify | exists (carried forward) |
| `reflection-prompts` | the structured end-of-session micro-step (3 questions + double-loop variant) | `/learn-reflect` | **NEW** |
| `scope-guard` | #6 Mode A honest-mirror behavior — surfaces core-vs-tangential drift without blocking | session-time `tool_result` watching for drift signals | **NEW** |

The `scope-guard` skill is the behavioral half of #6 Mode A. The data half is the `deferred_yaks` list (written by `/learn-yaks` and by `/learn-reflect`). The skill instructs the model to *notice* drift and surface it honestly; the tool is what captures the deferred yak. Splitting behavior (skill) from state (tool) keeps each revisable independently.

## Background events

| Event | Trigger | Behavior | Mechanism |
|---|---|---|---|
| `session_start` | pi session opens | Render the active track's edge + `next_action` immediately as a widget. **This is the fix for `socrates-plan`'s failure** — the waiting move is visible the moment you open pi, before any command is run. | #2 re-entry |
| `session_shutdown` | pi session closes without `/learn-reflect` | Prompt: "session ending — 30-second reflection?" If yes, run `/learn-reflect`; if no, persist timer state, leave `next_action` as-is (integrity rule 1 holds). | #8 |
| `tool_result` (verify) | `verify_command` runs in a session | Parse pass/fail, surface as immediate feedback (#3), feed into `/learn-reflect`'s edge-crossing question. | #4 retrieval-shaped verify, #3 flow |
| `tool_result` (drift heuristic) | long-running tool_result not obviously core | `scope-guard` skill surfaces "you've spent N min on X; the current edge is Y — core, or defer to yaks?" | #6 Mode A |
| stall-detector | `stall_counter >= N` at `/learn-reflect` time | Inject the double-loop question. | #8 Argyris |

## v1 scope (Fork D — scaffolder first)

**In v1:**
- `/learn-scaffold` — full. Recipes live in `~/.pi/learn/scaffold-templates/`. v1 ships one recipe (`webgpu-rust`) as the proof case (directly addresses the Round 2 felt-absence quote about WebGPU setup). The recipe manifest specifies: skeleton file tree, template variables, post-create commands (e.g. `cargo init`, `cargo add wgpu`), and the default `verify_command`. `/learn-scaffold webgpu-rust` creates the dir, runs the recipe, writes the Track with `work_dir` pointed at it, and hands off to `/learn-start`.
- `/learn-ingest` — **stubbed.** Prints "v1.1 feature. For now, use `/learn-plan` to enter learnable units manually." The `material_graph` field exists in the Track schema (forward-compat) but `units` is populated by hand via `/learn-plan` in v1.

**In v1.1 (after v1 ships and the scaffolder proves out):**
- `/learn-ingest` — full. Decompose external material into `material_graph.units`, sequence against edge. Iterative per Round 3 reshape (reflection loop re-runs sequencing).

**Deferred past v1.1** (from research.md): spaced repetition (#1, full retrieval), within-track interleaving, retention-oriented features. Revisit only after the completion problem is solved.

## Cue mechanism (Fork E — hard cue)

`/learn-cue` subcommands: `set`, `show`, `clear`, `test`.

**macOS (primary target — learner is on darwin):** writes a launchd `.plist` to `~/.pi/learn/cue/<track-id>.plist` and loads it via `launchctl load`. The job fires `osascript -e 'display notification ...'` (or a small notifier binary) at the configured time. The notification body includes the track label + the current `next_action` (read from the Track file at fire time, so it's always current — the cue *carries* the waiting move, which is the whole point).

**Fallback chain (implement in this order, stop at first that works):**
1. launchd + `osascript` notification (macOS native).
2. If launchd load fails: write a user-crontab entry (`crontab -l` → merge → `crontab -`) that runs the same notifier.
3. If neither: write an `.ics` file to `~/.pi/learn/cue/<track-id>.ics` and print "import this into Calendar for the cue" — portable but manual.

**Revisit trigger (per the fork verdict):** if hard-cue proves materially harder than estimated for low benefit, fall back to soft-cue — a `session_start` check that surfaces "your cue fired N hours ago" when a configured cue time has passed since last session. Soft-cue is strictly weaker (only fires once pi is open, which is the failure mode #3 case) so it's a downgrade, not a peer.

**Reward half of #10:** the cue fires → learner opens pi → `session_start` shows the edge+next-action → `/learn-start` runs the routine → at `/learn-reflect` the reward is logged ("showed up on cue"). The reward is *showing up*, surfaced honestly — not a gamification badge. The `log` entry records `cued: true/false`.

## Persistence strategy (the hardest problem)

The proto's failure: `socrates-plan` wrote state that didn't survive to the re-entry moment. The design's response:

1. **One file per track, JSON, in `~/.pi/learn/tracks/`.** No sync across multiple files. No `PROGRESS.md` mirror. The Track file is the source of truth; anything else is a derived view.
2. **Atomic writes** — write to `<track-id>.json.tmp`, `rename` to `<track-id>.json`. Never partial state on disk.
3. **`session_start` reads the Track before any command runs** and renders `next_action` immediately. The waiting move is visible by default, not behind a command. This is the architectural fix for the `socrates-plan` failure: persistence is useless if the re-entry moment doesn't *show* what was persisted.
4. **Integrity rule 1 (next_action never empty)** is enforced in `/learn-reflect` — you cannot end a session without setting the next move. This is the rule that keeps the loop closed across sessions.
5. **No network, no cloud, no sync in v1.** Local files only. The learner's machine is the only state store.

## Migration from the proto

The existing `extensions/socrates-*.ts` and `skills/socratic-method/` are the proto. Migration plan:

1. **Keep `socrates-timer.ts`** — rename to `learn-timer.ts`, adapt to read session length from the Track's `process_contract.session_min` instead of `.pi/learner.json`. Timer logic is sound; only the state source changes.
2. **Keep `socratic-method/SKILL.md`** as-is (it's the learning-mode contract; design honors it).
3. **Rewrite `socrates-start.ts` → `learn-start.ts`** — reads from Track file, renders edge+next_action, starts timer, activates socratic skill. Drops the `.pi/learner.json` recap path.
4. **Rewrite `socrates-plan.ts` → `learn-plan.ts`** — edits the Track's `edge` + `next_action` + `material_graph.units` (manual in v1). Drops the `PROGRESS.md` sync entirely.
5. **Rewrite `socrates-journal.ts` → `learn-reflect.ts`** — structured 3-question reflection via `reflection-prompts` skill, writes to Track.log, updates edge+next_action. Drops the freeform journal.
6. **New: `learn-cue.ts`, `learn-scaffold.ts`, `learn-yaks.ts`** — the three new tools.
7. **New skills: `reflection-prompts/SKILL.md`, `scope-guard/SKILL.md`.**
8. **Delete `.session-handoff.md`** (already marked stale in research.md).

The proto's track set (`rust-rag-learn`, `rust-webgpu`, `c`) migrates into `~/.pi/learn/tracks/` as Track records on first run of the new package — a one-shot migration command (`/learn-migrate`) reads the old `.pi/learner.json` + `.pi/plans/*.md` and emits Track files.

## Open implementation questions (survived the design phase)

These are build-time questions, not design-fork questions — they don't change the architecture, just the implementation:

1. **Widget rendering for `session_start`** — the proto uses `@earendil-works/pi-tui` `Box`/`Container`/`Text`. The edge+next-action widget needs to be compact (low cognitive load — #3 flow) and persistent below the editor. Confirm the TUI supports a always-visible footer widget vs a transient one.
2. **launchd plist generation** — hand-write the plist template vs use a library. Lean hand-write (one template, well-known shape) to avoid a dep.
3. **Scaffold recipe format** — `manifest.json` schema for variables + post-create commands. Need to decide: are post-create commands shell strings, or a small JS hook? Lean shell strings for v1 (recipes stay declarative and inspectable).
4. **`scope-guard` drift heuristic** — what's the signal that triggers the mirror? Time-since-last-verify? Tool-result content patterns? Lean time-based + a manual `/learn-yaks add` escape hatch — the auto-detection is a best-effort convenience, not a load-bearing path.
5. **Stall counter N** — default 3 (three sessions with no edge-crossing and no yak resolution). Confirm with learner in first use; this is a tunable, not a design constraint.

## Next step

`DESIGN.md` is the spec. The next move is implementation — starting with the persistence layer (`~/.pi/learn/` layout + Track read/write helpers) and `/learn-start` (the centerpiece that proves the persistence fix), then migrating the timer, then the three new tools in v1-scope order: `/learn-scaffold` (the big feature), `/learn-cue`, `/learn-yaks`.
