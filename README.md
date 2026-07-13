# learn-pi

A Socratic learning harness for [pi](https://pi.dev) — a terminal coding agent. Bundles a timer, session journal, start dashboard, and plan tracker, plus a Socratic-method skill that turns pi into a tutor that asks before it tells.

> **Status:** early. The four extensions currently hardcode three learning tracks (`rust-rag-learn`, `rust-webgpu`, `c`). A generalization pass to make tracks user-configurable is in progress. Until then, this package is most useful as a reference or as the basis for your own learning harness.

## What's included

### Extensions

| Command | What it does |
|---------|--------------|
| `/socrates-start` | Pick a track + energy level → lightweight recap → fresh session prompt |
| `/socrates-status` | Quick overview of all tracks |
| `/socrates-setup` | Set default learner state (track, energy, session length, focus) |
| `/socrates-timer` | Pomodoro + session-duration tracker (start, pause, resume, stop, stats) |
| `/socrates-journal` | End-of-session debrief — saves `.md`, syncs progress + plan |
| `/socrates-journal-last` | Show last journal entry for the current track |
| `/socrates-journal-today` | List today's entries |
| `/socrates-journal-all` | Browse all entries (optional track filter) |
| `/socrates-plan` | Edit progress plan → apply to PROGRESS.md + learner state |
| `/socrates-plan-view` | Show current plan (read-only) |

### Skill

- **`socratic-method`** — the tutor contract: ask before telling, one question at a time, escalate hints via a stuck ladder. Loaded on-demand by the model, or force-load with `/skill:socratic-method`.

## Install

From GitHub (once published):

```bash
pi install git:github.com/osguild/learn-pi
```

Try it locally without installing:

```bash
pi -e ~/gitrepos/learn-pi
```

## Runtime data

The extensions read and write to `.pi/` in your project:

| Path | Purpose |
|------|---------|
| `.pi/learner.json` | Default track, energy, session length, current focus |
| `.pi/timer/state.json` | Running timer state (restored on next session) |
| `.pi/timer/log.jsonl` | One JSON per completed/interrupted work session |
| `.pi/journal/sessions.jsonl` | One JSON per debriefed session |
| `.pi/journal/sessions/<track>/` | Per-session debrief markdown files |
| `.pi/plans/<track>.md` | Per-track progress plans |

## Requirements

- [pi](https://pi.dev) installed
- `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` (provided by pi itself — listed as peer dependencies, no separate install needed)

## Roadmap

- [ ] Configurable tracks via `.pi/tracks.json` (replace hardcoded `rust-rag-learn` / `rust-webgpu` / `c`)
- [ ] Configurable project structure (PROGRESS.md, docs/ paths)
- [ ] Prompt templates for session start / debrief / stuck-ladder invocations
- [ ] Published to npm as `@osguild/learn-pi`

## License

MIT
