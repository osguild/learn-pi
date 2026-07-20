# learn-pi

A learning-completion harness for [pi](https://pi.dev) — a terminal coding agent. Built to help a self-directed learner with ADHD finish more learning tracks by enforcing the feedback loops that actually matter for *completion* (not retention): a per-track current edge, a pre-computed next action that survives re-entry, flow-shaped sessions, a cue/routine/reward habit loop, a scope guard that scaffolds required setup instead of blocking drift, and a reflection loop that keeps the whole thing alive across sessions.

The design is grounded in a collaborative research pass over learning/feedback-loop theory — see `research.md` for the verdict trail (which traditions were adopted, adapted, rejected) and `DESIGN.md` for the architecture that came out of it.

## The core idea

The package holds one `Track` record per learning track in `~/.pi/learn/tracks/<id>.json`. Every mechanism reads and writes that one record. The load-bearing field is `next_action` — a pre-computed, never-empty concrete first move that is rendered the moment pi opens, so re-entry is "execute the plan" not "figure out the plan." That single rule is the fix for the failure mode that killed prior abandoned tracks (executive dysfunction on re-entry).

## What's included

### Extensions

| Command | What it does |
|---------|--------------|
| `/learn-start [track] [energy]` | **Re-entry command.** Renders the track's edge + next_action as a widget, surfaces cue status, starts the timer, and kicks off a socratic session framed around the next action. |
| `/learn-reflect [track]` | **Loop-closer.** Structured 3-question reflection (crossed the edge? next action? any yaks to defer?) that updates the edge + next_action + yaks. Double-loop (Argyris) question surfaces only after N stalled sessions. |
| `/learn-plan [track] <sub>` | Forethought: set/revise edge, next action, outcome compass, verify command, session length, or manual material units. Socratic is OFF here (management, not learning). |
| `/learn-timer [start\|pause\|resume\|stop\|reset\|stats]` | Pomodoro + session-duration tracker. Default length comes from the active track's `process_contract.session_min`. |
| `/learn-scaffold [generic] <recipe\|goal> [dir]` | **v1's big feature.** Two paths. **Recipe:** `/learn-scaffold webgpu-rust` generates a project + Track from a curated recipe — eliminates required-but-painful setup that has no good tutorial. **Generic wizard:** `/learn-scaffold` (no arg) walks an open-ended goal ("ML fundamentals"), recommends a language + framework, gauges depth (`guided` / `standard` / `from-scratch`), synthesizes a skeleton, and pre-seeds the Track with a *suggested* first edge you accept or replace via `/learn-plan`. |
| `/learn-study [topic] [dir]` | **Study-track scaffolder** for any non-coding topic (music, languages, history, math, science). Emits a notes workspace + a self-assessment rubric (the non-coding analog of `cargo test`), seeds 3–5 sequenced material units, and pre-seeds a *suggested* first edge. The rubric is scored during `/learn-reflect` and feeds the stall counter the same way a failing verify command would. |
| `/learn-cue [set\|show\|test\|clear] [track]` | Hard cue: writes a launchd job (→ cron → ics fallback) that fires an OS notification carrying the current next_action when pi is closed. |
| `/learn-yaks [add\|resolve\|list\|all] [track]` | The deferred-yaks list. Tangential drift gets deferred here, not blocked. |
| `/learn-status [track]` | Cross-track overview, or detail for one track. Flags stalled tracks. |
| `/learn-web [status\|search\|fetch]` | Web tools status + direct (non-LLM) search/fetch. Registers `web_search` + `web_fetch` for the agent **unless** another extension already provides them — see [Web tools](#web-tools). |
| `/learn-migrate [path]` | One-shot migration from the `socrates-*` proto state to Track records. |
| `/learn-dashboard [start\|stop\|status\|open] [port]` | Local web dashboard — view and edit tracks at `127.0.0.1`. Polls `~/.pi/learn/` every few seconds. |
| `/learn-glossary [list\|add\|update\|remove\|scan] [track]` | Track-wide glossary of technical terms from course docs. Scan extracts terms from unit-guide markdown. |

### Agent-callable tools

| Tool | What it does |
|---|---|
| `web_search` | Query the web → titles + URLs + snippets. Backend: Brave Search API when `BRAVE_API_KEY` is set, else DuckDuckGo Instant Answers (zero-config fallback). |
| `web_fetch` | Fetch a URL → extracted text (HTML stripped, ~32KB cap, 15s timeout). Only http(s). |

These are core (not optional): the v1.1 `/learn-ingest` design is RAG-grounded (PathBuilder, ACL 2026 — see `research.md` literature verification), which requires fetching source material rather than free-generating from the training corpus. They're also what lets the learner ask "what does current research say about X?" and get a live answer. Enable Brave for real research (free tier ~2000 queries/mo): `export BRAVE_API_KEY=...` before starting pi.

### Web tools

learn-pi ships a built-in `web_search` + `web_fetch` (Brave if `BRAVE_API_KEY` is set, else DuckDuckGo Instant Answers) so the package works with zero configuration. **For a richer web surface, install [`pi-web-access`](https://github.com/nicobailon/pi-web-access)** — the de-facto community standard (~29K weekly downloads), with OpenAI/Exa/Tavily/Perplexity/Gemini search, GitHub repo cloning, PDF extraction, and YouTube/local-video understanding:

```bash
pi install npm:pi-web-access
```

**No conflict:** learn-pi defers its own tool registration at `session_start` if it detects that another extension has already registered `web_search` / `fetch_content` / `webfetch`. So if `pi-web-access` is installed, it owns the web surface and learn-pi's built-in tools step aside silently. Run `/learn-web status` to see which surface is active:

- `LLM tools: web_search, web_fetch (registered by learn-pi)` — no other web extension found; learn-pi's built-in tools are active.
- `LLM tools: deferred to existing "web_search" (registered by another extension)` — `pi-web-access` (or similar) is active; learn-pi's built-in tools are suppressed.

The `/learn-web search <q>` and `/learn-web fetch <url>` subcommands call learn-pi's own `lib/web.ts` directly (not the LLM tool surface), so they keep working as a zero-config human-facing fallback either way.

### Skills

- **`socratic-method`** — the tutor contract: ask before telling, one question at a time, escalate hints via a stuck ladder. Active during `/learn-start` sessions, `/learn-reflect`, and verify. **Off** during management commands.
- **`reflection-prompts`** — the end-of-session reflection contract: the three structured questions + the sparingly-triggered double-loop variant. Guides reflective conversation; `/learn-reflect` does the persistence.
- **`scope-guard`** — honest-mirror process guard. Distinguishes tangential drift (defer to yaks list) from required-but-painful setup (scaffold it). Never blocks.

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

State lives in `~/.pi/learn/` (hybrid storage — track metadata is centralized; the project working dir lives wherever the scaffolder created it):

| Path | Purpose |
|------|---------|
| `~/.pi/learn/tracks/<id>.json` | **The Track record** — single source of truth (edge, next_action, compass, process contract, yaks, material graph, glossary, log) |
| `~/.pi/learn/index.json` | Active track id + summary of all tracks |
| `~/.pi/learn/timer/state.json` | Running timer state (restored on next session) |
| `~/.pi/learn/timer/log.jsonl` | One JSON per completed/interrupted focus session |
| `~/.pi/learn/logs/sessions.jsonl` | Append-only session log (mirror of Track.log, for cross-track queries) |
| `~/.pi/learn/cue/<id>.{sh,plist,ics}` | Generated cue notifier script + launchd plist + ics fallback |
| `~/.pi/learn/scaffold-templates/<recipe>/` | Recipe manifests + skeletons (the `webgpu-rust` recipe is seeded on first `/learn-scaffold`) |

The package never writes learning-state files into your project repo. The project dir is a real git repo you work in; the package owns the track lifecycle, not the repo.

## Requirements

- [pi](https://pi.dev) installed
- macOS recommended for the hard cue (launchd). cron and ics fallbacks work elsewhere.
- `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` (provided by pi itself — listed as peer dependencies, no separate install needed)
- Optional: [`pi-web-access`](https://github.com/nicobailon/pi-web-access) for a richer web surface (multi-provider search, PDF/YouTube/repo extraction). learn-pi auto-defers its built-in `web_search`/`web_fetch` when this is present. See [Web tools](#web-tools).

## Quick start

```
# Curated recipe (known-painful stack, no good tutorial):
/learn-scaffold webgpu-rust
/learn-plan edge rust-webgpu "render a triangle via a wgpu render pipeline"
/learn-plan next rust-webgpu "open src/render.rs, declare the vertex buffer layout struct"
/learn-cue set                       # set a weekday 9:30 cue
/learn-start                         # re-enter: see edge + next action, start timer, begin socratic session
/learn-reflect                       # close the loop: update edge + next action + yaks

# Generic wizard (open-ended learning goal):
/learn-scaffold                      # then: state a goal, pick depth + language, optional framework search
/learn-plan                          # accept / revise / replace the wizard's suggested edge, set next action
/learn-start

# Study track (any non-coding topic):
/learn-study "music theory fundamentals"   # then: pick depth + domain family, optional source search
/learn-plan                                 # accept / revise the suggested edge, set next action
/learn-start
/learn-reflect                              # walk the rubric (your verify) + update edge + next action

# Dashboard (optional — visual track browser + inline edits):
/learn-dashboard start               # open http://127.0.0.1:7331 (or next free port)
/learn-glossary scan                 # seed glossary from unit-guide markdown
```

The wizard's suggested edge is **not** auto-accepted — `/learn-plan` surfaces it for you to own. That keeps the forethought step yours while removing the cold-start blank page. Study tracks work the same way, except `/learn-reflect` scores a rubric instead of asking a yes/no "did you cross the edge?" — the rubric is the non-coding analog of `cargo test`.

## Roadmap

- [x] Research pass + design (`research.md`, `DESIGN.md`)
- [x] Literature verification (2026-07-13) — every verdict checked against current research via live web search; 3 refinements recorded in `research.md`. The 2026 McLeod/Miller-Felton/Kim chapter on AI support for ADHD + SRL is a near-direct precedent.
- [x] v1: persistence layer, `/learn-start`, `/learn-timer`, `/learn-scaffold` (recipe + generic wizard), `/learn-study` (study-track scaffolder + rubric), `/learn-cue`, `/learn-yaks`, `/learn-reflect` (with folded rubric for study tracks), `/learn-plan`, `/learn-status`, `/learn-migrate`, `/learn-web` + `web_search` + `web_fetch` (with deferral to `pi-web-access` when installed), `/learn-dashboard` (writable local UI), `/learn-glossary` (track glossary + unit-guide scan)
- [ ] `/learn-ingest` (v1.1) — RAG-grounded auto-decomposition of external material into learnable units, sequenced against the edge, iteratively revised by the reflection loop (per PathBuilder ACL 2026 + Hierarchical KG-Augmented LLM ACM 2026). Plus related cross-track interleaving (Brunmair & Richter 2019; Li et al. 2024).
- [ ] Local install validation (`pi -e .` and `pi install .` end-to-end)
- [ ] Published to npm as `@osguild/learn-pi`
- [ ] Deferred past v1.1: spaced repetition, within-track interleaving, retention-oriented features (revisit only after the completion problem is solved)

## License

MIT
