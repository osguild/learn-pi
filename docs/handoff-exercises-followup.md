# Handoff brief — exercises + reference: authoring surface & template conversion

**For:** a fresh agent (no prior conversation context).
**Spec:** [`docs/exercises.md`](./exercises.md) is the authoritative design note; [`docs/handoff-composer.md`](./handoff-composer.md) is the prior handoff that landed the v1 slice. Read both first. This brief covers the gaps left after that slice shipped.
**Status:** 2026-07-21. The 5-item "Next step" slice in `docs/exercises.md` is done and integrity rules hold. What remains is the authoring/editing surface around it plus bulk template conversion. Do not begin until the user says "go" — but if you're reading this, they did.

## What you are building (one sentence)

Make exercises + reference *authorable* from the dashboard and from `/learn-plan`, surface a one-click "Start session" entry from the dashboard into `/learn-start`, and close the green→reflect loop inside the agent frame. (Template conversion — Gap 5 — is already done; see that section.)

## Status (2026-07-21)

Gap 5 (all 8 remaining programming templates) is **complete**. Gaps 1-4 (dashboard PATCH, `/learn-plan exercise`/`reference` CLI, "Start session" button, green→reflect frame line) are **still open** — that is the remaining work.

## Audit snapshot (what's already done — do not redo)

- `lib/track.ts`: `Exercise`, `ReferenceMaterial`, `ExerciseStatus` types; mutators `setUnitExercise`, `setUnitReference`, `setUnitExerciseStatus`, `resolveActiveExerciseUnit`, `unitsWithExercises`, `advanceGraphAfterExercisePass`. Integrity: `assertUnitCanBeDone` (blocks `done` unless `exercise.status === "passing"`), `validateExercise` (spec + test_command required), `validateReference` (summary required).
- `dashboard/src/types.ts`: mirrors the new types.
- `lib/track-templates.ts`: `dsa-practice-track` ships all 5 units with exercise + reference (stack, queue, hashmap, binary search, sort).
- `extensions/learn-start.ts`: resolves active unit (in_progress → active → pending), prints reference then spec, ensures starter file, sets socratic agent frame, starts timer.
- `extensions/learn-reflect.ts`: `collectExerciseAdvancement` + `setUnitExerciseStatus` (lines ~122-130, ~228-255).
- `dashboard/src/components/MaterialUnitCard.tsx`: read-only exercise status pill + spec/reference render (lines ~98-130).
- `lib/format.ts`: `renderTrackDashboard` shows active exercise line (lines ~69-83).
- `scripts/backfill-exercises.ts`: one-shot retro-fit for existing on-disk tracks (rust-rag-learn, c-emulator, rust-webgpu, context-engineering, + generic guide parser).

## Locked decisions (do not re-litigate)

- **Strategy B:** Dashboard plans, Pi does. Dashboard **never** runs tests, **never** marks exercises passing, **never** starts agent sessions.
- Therefore `setUnitExerciseStatus` stays **dashboard-blocked** — only `/learn-reflect` (and the agent offering it via the frame) may flip to `passing`. Dashboard PATCH may author `exercise.spec` / `exercise.test_command` / `exercise.test_path` / `exercise.starter_path` and `reference.*`, but **not** `exercise.status`.
- `/learn-start` jumps straight into the active exercise; it is not a planning preamble.
- Agent contract during session: generate/update tests at `test_path`, run `test_command`, report failing assertions, review the diff on request, **never write the implementation**. The learner types every line.
- Study tracks are unaffected — exercise/reference are programming-only and optional per unit.
- Out of scope (per `docs/exercises.md`): `/learn-ingest` RAG, retention/SRS, gamification, writable `/learn-tui`.

## The five ordered gaps

### Gap 1 — Dashboard PATCH exposes exercise/reference authoring

**Why first:** it unblocks editing existing tracks' exercises without re-running the one-shot backfill script. Authoring is the long pole; CLI (Gap 2) and the dashboard both call the same `lib/track.ts` mutators, so wiring PATCH first proves the mutator surface is right.

**Files:**
- `lib/dashboard.ts`:
  - `PatchTrackBody` type (search near line 440) — add `set_unit_exercise?`, `set_unit_reference?`. Do **not** add `set_unit_exercise_status` (Strategy B).
  - `validatePatchBody` (~line 449) — extend the `known` set with the two new keys; add validation blocks mirroring the existing `update_unit` shape. Reject `exercise.status` if present in the payload.
  - Find the PATCH handler switch (search for `update_unit` in the apply section) and add cases that call `setUnitExercise` / `setUnitReference` from `lib/track.ts`, then persist via the existing save path.
- `dashboard/src/types.ts`: extend the dashboard-side `PatchTrackBody` mirror if one exists (search for `PatchTrackBody`); otherwise the dashboard posts raw JSON and only the server type matters.
- `dashboard/src/components/MaterialUnitCard.tsx`: the card already renders exercise/reference read-only. Add edit affordances (an "Edit exercise" / "Edit reference" toggle or modal) that POST the new PATCH keys. Reuse the existing `patchTrack` helper in `dashboard/src/api.ts`.

**Acceptance:**
- PATCH `/api/tracks/:id` with `{"set_unit_exercise": {"unit_id": "...", "spec": "...", "test_command": "...", "test_path": "...", "starter_path": "..."}}` updates the unit and persists.
- Same for `set_unit_reference` with `{"unit_id", "summary", "sections"?}`.
- PATCH with `set_unit_exercise_status` returns 400 with a Strategy-B message.
- Dashboard UI round-trips: edit, save, reload shows new content.

### Gap 2 — `/learn-plan exercise` and `/learn-plan reference` CLI subcommands

**Why:** CLI parity with the dashboard. Some learners will never open the dashboard; the CLI is the lowest-friction authoring path.

**Files:**
- `extensions/learn-plan.ts`:
  - Extend the `run()` dispatch (currently branches on `sub` around lines 60-135) with `exercise` and `reference` subcommands.
  - Suggested shapes (mirror existing `edge`/`next`/`verify` patterns and reuse `withTrackAndRest`):
    - `/learn-plan exercise [track] <unit_id> <spec...>` — sets spec. test_command/test_path/starter_path via follow-up prompts if not given (use `ctx.ui.input`).
    - `/learn-plan exercise [track] <unit_id> --clear` — removes the exercise block.
    - `/learn-plan reference [track] <unit_id> <summary...>` — sets reference.summary; sections via prompt.
    - `/learn-plan reference [track] <unit_id> --clear` — removes reference.
  - Import `setUnitExercise`, `setUnitReference` from `lib/track.ts`.
  - Update the `cmdShow` help line and the unknown-subcommand message to list `exercise` and `reference`.
- `extensions/index.ts`: no change needed unless command registration metadata lists subcommands.

**Acceptance:**
- `/learn-plan exercise <unit> <spec>` on the active track sets the spec; reload via `/learn-plan show` shows it.
- `/learn-plan reference <unit> <summary>` round-trips.
- Clear flags remove the blocks and `assertUnitCanBeDone` re-locks `done`.

### Gap 3 — "Start session" button in the dashboard

**Why:** the spec calls out a one-click entry from the dashboard into `/learn-start`. Currently the dashboard has zero clipboard usage (`rg clipboard dashboard/src` → no matches).

**Files:**
- `dashboard/src/components/TrackDetail.tsx`: add a "Start session" button that calls `navigator.clipboard.writeText('/learn-start <track-id>')` and surfaces a toast/tooltip confirming the copy. Disable when no exercise unit exists (`unitsWithExercises(track).length === 0` — mirror the lib helper in `dashboard/src/utils` if not already present, since the dashboard cannot import the lib).
- `dashboard/src/utils/trackResources.ts` or a new `trackExercises.ts`: add a `unitsWithExercises` pure helper (mirror of the lib's) so the button can be conditionally rendered.

**Acceptance:**
- Button visible only when the track has at least one unit with an exercise.
- Click copies `/learn-start <track-id>` to clipboard; learner pastes into pi and the existing `learn-start` extension picks it up.
- No new server route (Strategy B — dashboard does not start sessions).

### Gap 4 — Green→passing→reflect line in the agent frame

**Why:** the loop closure is currently left to agent judgment. The spec line "On green → offer to set `exercise.status = "passing"` and prompt `/learn-reflect`" belongs in the frame so every session closes the same way.

**Files:**
- `extensions/learn-start.ts` `kickoffExerciseSession` (lines ~175-200): append a line to the `kickoff` array, after the socratic-mode line, e.g.:
  > On green (all tests passing) → offer to set `exercise.status = "passing"` via `setUnitExerciseStatus`, then prompt the learner to run `/learn-reflect` to close the loop. Do not auto-flip status without the learner's confirmation.

**Acceptance:**
- The kickoff message sent via `api.sendUserMessage` includes the green→passing→reflect instruction.
- A dry-run (or reading the rendered kickoff string) confirms the line is present.

### Gap 5 — Convert the remaining 8 programming templates

**Status: DONE in this pass (2026-07-21).** All 8 templates now ship exercises + reference. Verified by `scripts/verify-templates.ts` (45 programming units across 9 templates, all with valid `exercise.spec`/`test_command` and `reference.summary`/`sources`). The notes below are kept for reference and for anyone re-checking the work.

**Why:** the spec's authoring order lists 12 templates; only `dsa-practice-track` ships exercises + reference. This is the bulk of remaining authoring cost and the highest-value forward work.

**Actual templates to convert (8 — the only programming templates besides `dsa-practice-track`):**
1. `python-cli-basics` (beginner, python)
2. `js-node-first-steps` (beginner, javascript)
3. `web-fundamentals` (beginner, javascript)
4. `rest-api-sqlite` (intermediate, python/javascript/typescript — author against python+fastapi primary)
5. `cli-tool-rust` (intermediate, rust + clap)
6. `webgpu-rust` (advanced, recipe track — no `extraSkeletonFiles`, exercises point at recipe-emitted paths)
7. `interpreter-mini` (advanced, python/rust — author against python primary)
8. `ml-from-scratch` (advanced, python + numpy)

The 3 `study-*` templates are **out of scope** — exercise/reference are programming-only per the spec.

**Files:**
- `lib/track-templates.ts`: for each template, replace the unit-title-only seeds with full `MaterialUnit` objects carrying `exercise` (spec, test_command, test_path, starter_path) and `reference` (summary, sources). Follow the `dsa-practice-track` shape as the canonical example.
- For non-recipe templates, add `extraSkeletonFiles` emitting starter stubs + test scaffolding (and a `verifyCommand`). For recipe tracks (`webgpu-rust`), the recipe owns the files — only replace the `units` array.
- Keep the existing tier → `Depth` mapping; do not change template metadata.

**Multi-language convention:** for templates supporting multiple languages (`rest-api-sqlite`, `interpreter-mini`), author `test_command`/`starter_path` against the primary (first-listed) language. JS/TS learners get the same behavior-focused specs; only the test runner command differs. This matches the existing `dsa-practice-track` convention (python+typescript, authored against python). Multi-language per-exercise commands are a known v1 gap.

**Process note:** this is the only gap that is mostly *content authoring*, not wiring. Consider doing it in template-sized commits so a reviewer (or the user) can spot-check one track at a time. If the user wants to ship Gaps 1-4 first and defer Gap 5 to a second pass, that's a legitimate split — confirm before grinding through all 8.

**Acceptance (per template):**
- Every programming unit has both `exercise` and `reference`.
- `exercise.spec` is a concrete prompt (not "implement a queue" — but "implement `push`/`pop`/`peek` returning `Option<T>`…").
- `exercise.test_command` is a runnable shell string; `test_path` and `starter_path` are repo-relative under the track's `work_dir`.
- `reference.summary` is the minimum the learner needs to attempt the exercise; sections optional but encouraged for harder units.
- `validateExercise` / `validateReference` pass on every unit (the mutators enforce this — if you build templates by calling the mutators in a scratch script, you get this for free; if you hand-write JSON, run the validator).

## Suggested commit order

1. Gap 4 (one-line frame tweak) — smallest, ships the loop closure.
2. Gap 1 (dashboard PATCH) — proves the mutator surface.
3. Gap 2 (CLI subcommands) — mirrors Gap 1.
4. Gap 3 (Start session button) — small UI on top of the patched types.
5. Gap 5 (template conversion) — bulk authoring; can be split across multiple commits or PRs.

## Test plan (handoff agent runs before declaring done)

- `node --import tsx/esm scripts/backfill-exercises.ts` still runs clean against a scratch track dir (or is now a no-op on already-backfilled tracks — confirm which).
- A new track from each converted template passes `validateExercise` on every unit.
- Manual: create a track from `dsa-practice-track` via the dashboard, click "Start session", paste into pi, run `/learn-start`, watch the agent frame include the green→reflect line.
- Manual: PATCH a track's `set_unit_exercise` from the dashboard; reload; confirm persistence. PATCH `set_unit_exercise_status` and confirm it's rejected.
- Manual: `/learn-plan exercise <unit> <spec>` then `/learn-plan show` round-trips.

## Out of scope for this handoff

- `/learn-ingest` auto-decomposition (still v1.1).
- Retention / SRS, gamification, writable `/learn-tui`.
- Any change to study-track rubrics or `/learn-study`.
- Re-running `scripts/backfill-exercises.ts` against the user's real `~/.pi/learn/tracks` — that's a one-shot already executed; only re-run if the user explicitly asks.
