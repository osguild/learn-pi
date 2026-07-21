# Handoff brief — exercises + reference materials implementation

**For:** Composer-2.5 (fresh agent, no prior conversation context).
**Spec:** read [`docs/exercises.md`](./exercises.md) first — it is the authoritative design note. This brief adds implementation context the spec doesn't repeat.
**Status:** design locked 2026-07-21. Code not started. Do not begin until the user says "go" — but if you're reading this, they did.

## What you are building (one sentence)

Extend `MaterialUnit` with an optional `exercise` block and an optional `reference` block, rewrite `/learn-start` to open the active exercise and set an agent frame that generates tests and reviews the learner's hand-written diff (never writes the implementation), add a "which unit did you advance?" question to `/learn-reflect`, and convert one template (`dsa-practice-track`) to ship exercises + reference.

The product is the pair: **synthesized reference material (the concept) → hands-on exercise (the test) → agent pressure-tests the learner's code**. Completion is downstream of exercises passing and being reviewed.

## Locked decisions (do not re-litigate)

- **Strategy B:** Dashboard plans, Pi does. Dashboard never runs tests, never marks exercises passing, never starts agent sessions.
- **`/learn-start` = jump straight into the active exercise**, not a planning preamble.
- **Agent contract during session:** generate/update tests at `test_path`, run `test_command`, report failing assertions, review the diff on request, **never write the implementation**. The learner types every line.
- **Track-level `verify_command` is demoted to fallback** for exercise-less units. Per-unit `exercise.test_command` is the new default.
- **Study tracks are unaffected** — `/learn-study`, rubrics, exercise-less units keep working. `exercise` and `reference` are programming-only and optional per unit.
- **Out of scope:** `/learn-ingest` RAG, retention/SRS, gamification, writable `/learn-tui`. See `docs/exercises.md` § "Out of scope."

## The five ordered steps (from the spec)

1. Extend `MaterialUnit` with `exercise` + `reference` in `lib/track.ts` (+ mutators + integrity rules).
2. Mirror the types in `dashboard/src/types.ts`.
3. Convert `dsa-practice-track` (in `lib/track-templates.ts`) to ship exercises + reference.
4. Rewrite `/learn-start` (`extensions/learn-start.ts`) to open the active exercise and set the agent frame.
5. Add the "which unit did you advance?" question to `/learn-reflect` (`extensions/learn-reflect.ts`).

## Key files (paths are repo-relative)

### Step 1 — data model + mutators
- `lib/track.ts` — `MaterialUnit` interface (~line 96). Add `exercise?` and `reference?`. Add interfaces `Exercise`, `ReferenceMaterial` per the spec. Add mutators at the end of the mutators section (search for `addGlossaryEntry` / `updateUnit` to find the pattern): `setUnitExercise`, `setUnitReference`, `setUnitExerciseStatus`. Add integrity rules: a unit with `exercise` cannot be `done` unless `exercise.status === "passing"`; `exercise.test_command` and `exercise.spec` required if `exercise` present; `reference.summary` required if `reference` present.
- `lib/track.ts` `normalizeTrack` / `freshTrack` — make sure new optional fields survive round-trip (they're optional, so mostly check `?? undefined` hygiene).

### Step 2 — dashboard type mirror
- `dashboard/src/types.ts` — `MaterialUnit` is mirrored here (search for `MaterialUnit`). Add the same `exercise?` / `reference?` + interfaces. **Keep in sync with `lib/track.ts`** — the dashboard builds standalone under Vite and does not import the lib (node-only).
- `dashboard/src/api.ts` `normalizeTrack` — if it maps units, make sure new fields pass through.

### Step 3 — convert `dsa-practice-track`
- `lib/track-templates.ts` — find the `dsa-practice-track` template (search for `id: "dsa-practice-track"`). Each of its 5 units (`u-stack`, `u-queue`, `u-hash`, `u-search`, `u-sort`) needs an `exercise` block (spec, starter_path, test_command, test_path, status: "todo") and a `reference` block (summary, sources, glossary_terms). The template seed type `TemplateUnitSeed` will need to accept these — extend it, and update `buildMaterialSeedFromTemplate` (or whatever builds units from the template) to pass them through.
- Authoring guidance: specs should be concrete ("Implement a Stack with `push`, `pop`, `peek`, `isEmpty` methods and a `size` getter. Throw on `pop`/`peek` when empty."). `test_command` should be a real command for the chosen language (`pytest tests/test_stack.py` for Python, `pnpm test tests/stack.test.ts` for TS). `starter_path` is relative to `work_dir` (e.g. `src/stack.py`).
- The template's existing `glossary` entries already link to units via `unit_id` — reuse those ids in `reference.glossary_terms`.

### Step 4 — rewrite `/learn-start`
- `extensions/learn-start.ts` — current flow resolves track, renders widget, surfaces cue, starts timer, hands off to socratic. Insert exercise resolution **before** the socratic handoff:
  1. Resolve active unit: first `exercise.status === "in_progress"`, else first `active` unit with an exercise, else first `pending` unit with an exercise. Fall back to today's edge statement if none (study tracks, exercise-less units).
  2. Print the unit's `reference.summary` (the concept), then the `exercise.spec` (the task).
  3. Open `exercise.starter_path` in `work_dir` (or create empty file). Use whatever file-open mechanism the existing extensions use (search for `work_dir` usage in `extensions/`).
  4. Set the agent frame as a system/context message before the socratic handoff. Exact frame text is in `docs/exercises.md` § "Session behavior" — use it verbatim, substituting `<id>`, `<test_path>`, `<test_command>`.
  5. Socratic stays on, scoped to the exercise.
- `lib/format.ts` (`renderTrackDashboard`) — the session_start widget. Consider showing the active exercise status alongside edge + next_action. Keep it compact.

### Step 5 — `/learn-reflect` question
- `extensions/learn-reflect.ts` — add one structured question after the existing 3: "Which unit's exercise did you advance?" Offer the active unit as default. On answer, call `setUnitExerciseStatus` and, if `passing`, advance the graph (next `pending` unit → `active`, current → `done`). Use existing mutators from `lib/track.ts` — do not write to the Track directly.
- If no exercise was touched (study track, reading-only session), skip this question.

## Conventions to follow (learned from the existing code)

- **Mutators live in `lib/track.ts`** and are the single write path. CLI extensions and the dashboard PATCH route both call them. Do not add a second write path.
- **All writes are atomic** (tmp + rename). The mutators return new Track records; the caller persists via `saveTrack`.
- **Dashboard types in `dashboard/src/types.ts` are duplicated, not imported** from `lib/track.ts` — the dashboard builds standalone under Vite. Keep them in sync.
- **PATCH allowlist** in `lib/dashboard.ts` (`validatePatchBody`) — if you add new collection ops for exercises/reference, add them to the allowlist and the validation function. Search for `add_glossary` to see the pattern.
- **`/learn-start` hands off to socratic via `pi.sendUserMessage`** with a kickoff string — search the existing file for the pattern.
- **Templates seed via `buildMaterialSeedFromTemplate`** (or similar) in `lib/track-templates.ts` — extend the seed type and the builder together.
- **No new runtime deps.** The package is dep-free at runtime; Vite is dev/build-only.

## Verification commands

```bash
# TypeScript (dashboard)
cd /Users/brandonly/gitrepos/learn-pi/dashboard && npx tsc --noEmit

# Dashboard build
cd /Users/brandonly/gitrepos/learn-pi && npm run dashboard:build

# Pi extension loads (restart pi, then)
/learn-status                    # should still render
/learn-scaffold template dsa-practice-track   # should seed exercises
/learn-start dsa-practice-track  # should open the first exercise
```

If `npx tsc --noEmit` passes and the dashboard builds, the type mirror is in sync.

## What "done" looks like for this slice

- `MaterialUnit` has `exercise?` and `reference?` in both `lib/track.ts` and `dashboard/src/types.ts`.
- `dsa-practice-track` ships 5 units, each with an exercise (spec + starter_path + test_command + test_path) and a reference (summary + sources + glossary_terms).
- `/learn-start dsa-practice-track` prints the reference summary, then the exercise spec, opens the starter file, and sets the agent frame.
- `/learn-reflect` asks "which unit did you advance?" and, on `passing`, advances the graph.
- `npx tsc --noEmit` and `npm run dashboard:build` both pass.
- Dashboard track page shows exercise status pills on each unit card (read-only).

## What to NOT do

- Do not build writable exercise editing in the dashboard (agent-owned).
- Do not auto-generate tests from the dashboard.
- Do not add new templates beyond converting `dsa-practice-track`.
- Do not touch `/learn-ingest`, retention, gamification, or `/learn-tui`.
- Do not change study-track behavior.
- Do not commit unless the user explicitly asks. (Repo convention: commits only on request.)
- Do not add comments that narrate what code does. Comments explain intent/trade-offs only.

## Open questions to confirm with the user before coding (only if blocking)

1. **Test runner choice for `dsa-practice-track`** — Python (`pytest`) or TypeScript (`vitest`/`pnpm test`)? The template supports both languages. Default proposal: Python (cleanest pytest shape, matches the spec's `pytest tests/test_stack.py` example).
2. **Agent frame delivery mechanism** — does the existing `/learn-start` use `pi.sendUserMessage` for the socratic handoff, or a different context-setting API? Confirm by reading `extensions/learn-start.ts` end-to-end before writing the frame injection.

Everything else is answerable from `docs/exercises.md` + this brief + the existing code.

## Reading order for Composer

1. `docs/exercises.md` (the spec)
2. This brief
3. `lib/track.ts` (mutators section, search `addGlossaryEntry`)
4. `extensions/learn-start.ts` (full)
5. `extensions/learn-reflect.ts` (full)
6. `lib/track-templates.ts` (`dsa-practice-track` entry + the seed/builder functions)
7. `dashboard/src/types.ts` + `dashboard/src/components/MaterialUnitCard.tsx` (for the status pill)
