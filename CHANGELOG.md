# Changelog

All notable changes to `@osguild/learn-pi` are documented here.

## [0.1.0-alpha.0] - 2026-07-22

First public alpha. Feature-complete for the v1 exercise loop; expect rough edges and API churn.

### Added

- Full `/learn-*` extension surface: start, reflect, plan, timer, scaffold, study, cue, yaks, status, web, migrate, dashboard, glossary
- Track record model with edge, next action, material graph, glossary, yaks, and session log
- Programming-track exercises + reference on all 9 starter templates (45 units)
- Writable local dashboard at `127.0.0.1` with docs and roadmap pages
- Skills: `socratic-method`, `reflection-prompts`, `scope-guard`
- Built-in `web_search` / `web_fetch` with deferral to `pi-web-access` when present

### Known gaps (see dashboard Roadmap page)

- Dashboard PATCH for exercise/reference authoring
- `/learn-plan exercise` and `/learn-plan reference` CLI subcommands
- "Start session" clipboard button in dashboard
- Green → passing → reflect line in `/learn-start` agent frame

[0.1.0-alpha.0]: https://github.com/osguild/learn-pi/releases/tag/v0.1.0-alpha.0
