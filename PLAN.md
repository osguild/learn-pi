# learn-pi plan

**Status:** Research phase (pre-architecture). Replaces the next-actions section of `.session-handoff.md`, which is now stale.

## Long-term goal

A pi package (`@osguild/learn-pi`) that helps **me** finish more self-directed learning tracks than I would have without it, by enforcing the socratic method, scaffolding per-track progress, and bundling the workflow into one integrated loop — built so it can grow into a real public tool later without a rewrite.

## Synthesis of the grilling (2026-07-13)

| Question | Answer | Architectural implication |
|---|---|---|
| Who is the customer? | Me now → others later | Optimize for my real process; hold the door open for public DX later. No features built solely for strangers yet. |
| Core value | Socratic method + track scaffolding + workflow loop, integrated | The package's reason to exist is the integration. None of the three alone justifies it. |
| Success in 12mo | I finished more tracks | Primary success metric is personal completion, not adoption. Adoption is a possible future, not the bar. |
| What is a "track"? | Presets + custom | Ship opinionated preset tracks AND let users declare their own. Presets become part of the published surface. |
| Who is the customer (tension)? | Me now → others later | Resolved: personal tool, OSS-by-default, growth path preserved. |
| Research vs build? | Research first, then build | The current four extensions are a first guess, not canonical. Survey learning/feedback-loop theory before locking architecture. |
| Loop shape? | Provisional | The four-command cycle (start→timer→journal→plan) is NOT canonical. Architecture must not bake it in. |
| Research form? | Collaborative, live | Assistant surfaces concepts; user reacts to which match how they actually learn; converge together. |
| Scope of generalization? | Decide after research | Don't commit now to "config-driven tracks" vs "full extensibility." Let research dictate. |
| Research timebox? | A few sessions | Deep enough to cover multiple traditions; not a single rushed hour. |

## Guiding principles (non-negotiable)

1. **Research before architecture.** No generalization refactor until the research pass produces a defensible picture of what feedback loops the package should support.
2. **The loop is provisional.** Any architecture must let tools be added/removed/reordered without re-architecting. The four current extensions are v0, not v1.
3. **Me as customer, public-ready.** Build for my real process first; but every design choice must answer "can this grow into a public tool without a rewrite?" If the answer is no, pick a different design.
4. **Integration is the value.** A pile of independent tools is not the product. The architecture must preserve the integrated workflow even as the loop shape changes.
5. **No hardcoded track names ship in the package's core.** Presets are shipped data, not baked-in code. Track names like `rust-rag-learn`/`rust-webgpu`/`c` are my personal tracks, not the package's.

## Revised roadmap

### Phase 0 — Research (current)
Collaborative live research pass on learning/feedback-loop theory. A few sessions. Output: `research.md` mapping findings to candidate tools/mechanisms + a proposed architecture shape. **Scope of the generalization is decided at the end of this phase, not now.**

### Phase 1 — Architecture (DONE, 2026-07-13)
Design doc produced: `DESIGN.md`. Covers the `Track` record data model, hybrid storage layout (`~/.pi/learn/` + project `work_dir`), the `/learn-*` tool surface, three skills (`socratic-method`, `reflection-prompts`, `scope-guard`), background events, v1 scope (scaffolder first, ingestion stubbed), and the hard-cue mechanism. Fork decisions A–E converged with the learner. See `DESIGN.md` for the spec and `research.md` for the verdict trail that produced it.

### Phase 2 — Generalization build (current)
Execute the `DESIGN.md` spec. Build order per the design's "Next step": persistence layer (`~/.pi/learn/` + Track read/write helpers) → `/learn-start` (proves the persistence fix) → migrate `socrates-timer` → `/learn-scaffold` (v1's big feature) → `/learn-cue` → `/learn-yaks` → `/learn-reflect` + `reflection-prompts` + `scope-guard` skills → `/learn-migrate` (one-shot proto migration). The current four `socrates-*` extensions get refactored or replaced per `DESIGN.md`'s migration section. Track hardcoding is removed in favor of the `Track` record.

### Phase 3 — Local install validation
`pi -e .` and `pi install .` end-to-end against a real learning project.

### Phase 4 — README + AGENTS.md finalization
AGENTS.md is a **contributor** guide (tool repo, not a learning repo). Written after generalization so it documents the real configurable shape.

### Deferred
- GitHub repo `github.com/osguild/learn-pi` creation — after first generalization commit.
- npm publish — after local install validation.
- Public-DX investment (graceful failure for strangers, full docs) — only when "others later" becomes real.

## Research pass — how it will run

**Mode:** Collaborative, live, across a few sessions.
**Roles:** Assistant surfaces concepts from the literature; user reacts to which resonate with how they actually learn; we converge on which feedback loops the package should support.
**Output:** `research.md` in the repo, structured as: concept → source tradition → what it implies for a learning tool → user's verdict (adopt / adapt / reject) → candidate mechanism in the package.

### Traditions to cover (starting list, not exhaustive)
- **Spaced repetition** — memory decay curves, review scheduling.
- **Retrieval practice** — testing as learning, not just assessment.
- **Deliberate practice** — feedback at the edge of ability, targeted weakness work.
- **Mastery learning** — gating progression on demonstrated competence (the current `verifyCommand` is a naive version of this).
- **Reflection / journaling loops** — experiential learning cycle (Kolb), double-loop learning (Argyris).
- **Goal-setting & feedback** — SMART/OKR, feedback timing, process vs outcome goals.
- **Self-regulated learning** — Zimmerman's phases: forethought, performance, reflection.
- **Flow** — challenge-skill balance, clear immediate feedback.
- **Interleaving / varied practice** — vs blocked practice.
- **Commitment devices & habit loops** — Cue-Routine-Reward, implementation intentions.

### Open questions to resolve during research (the live grilling agenda)
1. Which of these traditions actually match how **I** learn? (Reject the ones that sound good but don't fit my real behavior.)
2. What feedback am I currently missing that would have prevented past abandoned tracks?
3. Is the socratic method (the skill) the *frame* for everything else, or one tool among many?
4. Where does the package's role end and the learner's discipline begin? (Tool can't do the reps for you.)
5. What's the minimal loop that, if I do nothing else, still increases completion?

## Repo state (as of 2026-07-13)

- Two commits on `main`: `initial commit` (skeleton) + `add gitignore and pnpm lock`.
- `extensions/`: four hardcoded extensions (start, timer, journal, plan) — unchanged, awaiting Phase 2.
- `skills/socratic-method/SKILL.md`: ported, unchanged.
- `package.json`: `@osguild/learn-pi`, pnpm, peer deps only.
- No `_tracks.ts`, no config schema — Phase 1/2 work, not started.
- `.session-handoff.md`: stale (claims "no commits yet" and prescribes the now-paused slice 1). Superseded by this file.

## What is NOT happening this phase

- No `_tracks.ts` loader, no `tracks.json` schema, no timer generalization. The original handoff's "slice 1, substeps 1–3" are **paused**. Substep 1 (the hardcoded-assumption inventory) was completed on 2026-07-13 and is recorded in conversation; it remains valid input for Phase 1 design.
- No new extensions written yet.
- No GitHub repo, no npm publish.
