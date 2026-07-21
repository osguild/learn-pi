# Exercises + reference materials — the real product

**Status:** Design note, 2026-07-21. Locks the reframe before any code. Supersedes the implicit "next_action is the load-bearing field" framing in `DESIGN.md` § core idea — `next_action` stays, but it is now *downstream* of the exercise loop, not the centerpiece.

## The reframe (one paragraph)

learn-pi's load-bearing mechanism is no longer just "next_action survives re-entry." It is: **every unit carries an exercise the learner implements by hand; the agent's job in a session is to generate tests for that exercise, run them against the learner's code, and review the diff without rewriting it.** `verify_command` stops being a shell string the learner writes once and becomes the per-exercise pass/fail signal the agent owns. The dashboard's job is to show exercise status; pi's job is to host the coding + review loop. This is Rustlings / `rust-rag-learn` / emulator-tracks as a first-class `Track` field, not a tutorial the learner reads.

The second half of the product, equally load-bearing: **synthesized reference materials per unit** — the minimum domain knowledge the learner needs to attempt the exercise. The vision is *learn the concept, then jump straight into hands-on work with an agent that pressure-tests your ability.* Exercises without reference are a wall; reference without exercises is a syllabus. The product is the pair.

## Why this, why now

The dashboard grew a glossary carousel, resources table, and template catalog — all valuable, all optimizing *reference and organization*, none of them touching *crossing edges*. The honest signal: the learner's actual workflow (before and during learn-pi) is "open Cursor, write code by hand, ask the agent to generate tests and review my diff." That workflow is the product. Everything else in the package exists to make that workflow start in &lt;30 seconds and close cleanly.

Completion is downstream of *this*. A track is "complete" when its exercises are passing and reviewed, not when its units are marked `done` by hand.

## Data model

`MaterialUnit` gains an optional `exercise` block and an optional `reference` block. Both are programming-only and per-unit; study tracks (rubric-based) are unaffected and keep using units without exercises.

```ts
interface MaterialUnit {
  // …existing fields…
  exercise?: Exercise;
  reference?: ReferenceMaterial;
}

interface Exercise {
  spec: string;              // what to build, plain text/markdown — the prompt
  starter_path?: string;     // file in work_dir to open (empty → from scratch)
  test_command: string;      // agent-owned verify, e.g. `pytest tests/test_stack.py`
  test_path?: string;        // where the agent writes/updates tests
  status: "todo" | "in_progress" | "passing" | "reviewing";
  last_run_at?: string;
}

interface ReferenceMaterial {
  summary: string;           // synthesized concept brief (markdown)
  sources: { title: string; url: string }[];  // citations that back the summary
  glossary_terms?: string[]; // term ids from track.glossary this unit teaches
}
```

Integrity rules added to `lib/track.ts`:
- A unit with `exercise` cannot be marked `done` unless `exercise.status === "passing"`.
- `exercise.test_command` is required if `exercise` is present; `spec` is required.
- `reference.summary` is required if `reference` is present.
- Mutators: `setUnitExercise`, `setUnitReference`, `setUnitExerciseStatus` — shared by CLI and dashboard PATCH.

## Session behavior (`/learn-start`)

`/learn-start` stops being a planning preamble. It becomes "open the active exercise and get out of the way."

1. Resolve active unit: first unit with `exercise.status === "in_progress"`, else first `active` unit with an exercise, else first `pending` unit with an exercise. If none, fall back to today's edge statement (study tracks, exercise-less units).
2. Print the **reference summary** for that unit first (the concept), then the **exercise spec** (the task).
3. Open `starter_path` in `work_dir` (or create an empty file).
4. Set the session frame for the agent:
   > Learner is hand-coding exercise `<id>`. Your role: when asked, generate or update tests at `<test_path>`, run `<test_command>`, report pass/fail with the failing assertion. On "review," read the diff and ask questions — do **not** rewrite the implementation. Do not write the implementation under any circumstance; the learner types every line.
5. Socratic stays on, scoped to *the exercise*, not the edge statement.
6. Timer starts from `process_contract.session_min` as today.

The agent contract during the session is the actual product surface:
- Learner writes code by hand.
- "test this" → agent generates/updates tests, runs `test_command`, reports the failing assertion.
- "review" → agent reads the diff, asks questions, does not rewrite.
- On green → agent offers to set `exercise.status = "passing"` and prompts `/learn-reflect`.

## `/learn-reflect` changes

Reflect gains one question: **"Which unit's exercise did you advance?"** The answer updates `exercise.status` and, if `passing`, advances the material graph (next unit → `active`). This is the missing link between the loop and the graph — units become load-bearing instead of decorative.

If no exercise was touched (study track, reading-only session), reflect skips this question and behaves as today.

## Dashboard role (Strategy B confirmed)

Dashboard plans; pi does. Concretely:
- Track page renders each unit's exercise status as a pill (`todo` / `in_progress` / `passing` / `reviewing`).
- Unit card shows the **reference summary** (read-only) and the **exercise spec** (read-only). Tests are **not** editable from the dashboard — agent-owned.
- "Start session" button copies `/learn-start <track>` to clipboard (deep-link later).
- Dashboard does **not** start agent sessions, does **not** run tests, does **not** mark exercises passing. Those are pi-side actions.

## Reference material synthesis

`reference.summary` is synthesized once per unit, at template-authoring time (curated templates) or on first session (custom tracks, agent-generated). It is **not** re-generated every session — it is part of the track, versioned with it, and editable via `/learn-plan reference <unit>` or the dashboard.

Sources are cited so the learner can go deeper. Glossary terms link the reference to the existing `track.glossary` so the carousel and the reference reinforce each other instead of duplicating.

This is the bounded, honest version of "RAG for learning": one curated summary per unit, human/agent-reviewable, persisted on the Track. Not a live retrieval step that becomes a yak.

## What this retires or demotes

- **Track-level `verify_command`** → demoted to fallback for exercise-less units. Per-unit `exercise.test_command` is the new default.
- **"Edge + next_action" as the hero** → still present, but the hero's *action* becomes "open exercise for unit X." The edge statement becomes the through-line; the exercise is the step.
- **`/learn-study`** → unaffected. Study tracks have no exercise; the rubric remains their verify. The exercise field is programming-only and optional per unit, so study templates still work unchanged.
- **Glossary / resources / materials curation** → explicitly *secondary*. They support exercises; they are not the loop. Dashboard features that optimize curation are paused until the exercise loop is wired.

## Template implications

Templates become much more valuable if they ship **exercises + reference**, not just unit titles. `python-cli-basics` today seeds 5 unit titles; under this reframe it seeds 5 units each with `{ spec, starter_path, test_command, reference.summary }`. That is a real authoring cost — but it is the cost of the product actually being the product. A template without exercises is a syllabus; a template with exercises is a track.

Authoring order for converting the existing 12 templates:
1. `dsa-practice-track` (cleanest exercise shape — each unit is one data structure with tests)
2. `python-cli-basics` (beginner, high leverage)
3. `rest-api-sqlite` (intermediate, proves the model on multi-file projects)
4. The rest follow.

## Out of scope for this note

- Full `/learn-ingest` RAG decomposition — still v1.1; this note does not change that.
- Spaced-repetition / retention features — still deferred per `DESIGN.md`.
- Gamification (streaks, XP) — explicitly rejected; contradicts "reward = showed up."
- Writable `/learn-tui` — duplicates dashboard.

## Next step

This note is the spec. The next move is the smallest end-to-end slice:
1. Extend `MaterialUnit` with `exercise` + `reference` in `lib/track.ts` (+ mutators).
2. Mirror the types in `dashboard/src/types.ts`.
3. Convert `dsa-practice-track` to ship exercises + reference.
4. Rewrite `/learn-start` to open the active exercise and set the agent frame.
5. Add the "which unit did you advance?" question to `/learn-reflect`.

No code until you say go.
