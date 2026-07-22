# learn-pi roadmap

What's done, what's in the works, and what's deliberately out of scope. Updated 2026-07-22.

The authoritative design note is [`docs/exercises.md`](../../docs/exercises.md) (author-facing). This page is the learner-facing summary.

## Done

### v1 slice — exercises + reference (2026-07-21)

The load-bearing reframe shipped: every programming unit can carry an **exercise** (spec, test_command, starter_path) and a **reference** block (summary, sources). The agent's job in a session is to generate tests, run them, and review the learner's hand-written diff — never write the implementation.

- `MaterialUnit.exercise` + `MaterialUnit.reference` types and mutators in `lib/track.ts`, mirrored in `dashboard/src/types.ts`.
- Integrity rules enforced: a unit with an exercise cannot be marked `done` until `exercise.status === "passing"`; `spec` / `test_command` / `summary` must be non-empty.
- `/learn-start` rewritten to resolve the active exercise unit (in_progress → active → pending), print reference then spec, ensure the starter file exists, and hand off to a socratic agent frame that generates tests and reviews diffs.
- `/learn-reflect` gained a "which unit did you advance?" prompt that calls `setUnitExerciseStatus`.
- Dashboard renders the exercise status pill + spec + reference read-only on each material unit card, plus an active-exercise line in the TUI widget.
- `scripts/backfill-exercises.ts` retro-fits exercise + reference blocks onto existing on-disk tracks.

### Template conversion — all 9 programming templates (2026-07-22)

Every programming template now ships exercises + reference on every unit. Verified by `scripts/verify-templates.ts` (45 programming units across 9 templates, all with valid `exercise.spec` / `test_command` and `reference.summary` / `sources`).

| Template | Units | Test runner |
|---|---|---|
| `dsa-practice-track` | 5 | `cargo test` |
| `python-cli-basics` | 5 | `pytest` |
| `js-node-first-steps` | 5 | `node --test` |
| `web-fundamentals` | 5 | `node --test` |
| `rest-api-sqlite` | 5 | `pytest` (fastapi) |
| `cli-tool-rust` | 5 | `cargo test` |
| `webgpu-rust` | 5 | `cargo build` (recipe) |
| `interpreter-mini` | 5 | `pytest` |
| `ml-from-scratch` | 5 | `pytest` (numpy) |

Multi-language templates (`rest-api-sqlite`, `interpreter-mini`) are authored against their primary language; JS/TS learners get the same behavior-focused specs. Per-exercise per-language commands are a known v1 gap.

## In the works

Four wiring gaps remain around the v1 slice. They are tracked in [`docs/handoff-exercises-followup.md`](../../docs/handoff-exercises-followup.md) and ordered smallest-first.

### Gap 1 — Dashboard PATCH for exercise/reference authoring

Today the dashboard can *read* exercise/reference blocks but cannot *edit* them. PATCH `/api/tracks/:id` does not yet accept `set_unit_exercise` or `set_unit_reference`. Editing currently requires re-running the one-shot backfill script or hand-editing the track JSON.

**Planned:** extend `validatePatchBody` in `lib/dashboard.ts` with the two new keys (but **not** `set_unit_exercise_status` — that stays dashboard-blocked per Strategy B). Add edit affordances in `MaterialUnitCard.tsx`.

### Gap 2 — `/learn-plan exercise` and `/learn-plan reference` CLI subcommands

CLI parity with the dashboard. Some learners never open the dashboard; the CLI is the lowest-friction authoring path.

**Planned:** extend `extensions/learn-plan.ts` with `exercise` and `reference` subcommands mirroring the existing `edge` / `next` / `verify` patterns. `--clear` flags remove the blocks.

### Gap 3 — "Start session" button in the dashboard

The spec calls for a one-click entry from the dashboard into `/learn-start`. Currently the dashboard has zero clipboard usage.

**Planned:** a "Start session" button in `TrackDetail.tsx` that copies `/learn-start <track-id>` to the clipboard. Visible only when the track has at least one unit with an exercise. No new server route — the dashboard does not start sessions (Strategy B).

### Gap 4 — Green → passing → reflect line in the agent frame

The loop closure is currently left to agent judgment. The spec line "On green → offer to set `exercise.status = "passing"` and prompt `/learn-reflect`" belongs in the kickoff frame so every session closes the same way.

**Planned:** append one line to `kickoffExerciseSession` in `extensions/learn-start.ts`. Smallest gap — a one-liner.

## Future (out of scope for the current reframe)

These are explicitly deferred per `docs/exercises.md` § "Out of scope." Not started, not promised for a specific release.

- **`/learn-ingest` auto-decomposition** — RAG-assisted breakdown of a source into material units. v1.1.
- **Retention / spaced-repetition (SRS)** — surfacing units due for review based on a forgetting curve.
- **Gamification** — streaks, badges, leaderboards. The product is the exercise loop, not the wrapper.
- **Writable `/learn-tui`** — the TUI dashboard is currently read-only. Making it writable would duplicate the dashboard PATCH surface.
- **Study-track rubrics with exercises** — exercise/reference are programming-only by design. Study tracks keep using rubric-based self-assessment.
- **Per-language exercise commands on multi-language templates** — today `rest-api-sqlite` and `interpreter-mini` ship one `test_command` per unit (authored against the primary language). A learner picking the secondary language has to translate the command by hand.

## How to help

If you hit one of the gaps above and want to land it, the handoff brief at [`docs/handoff-exercises-followup.md`](../../docs/handoff-exercises-followup.md) has file paths, line anchors, and acceptance criteria for each. Read the spec (`docs/exercises.md`) and the brief before starting — both are kept in sync with the codebase.
