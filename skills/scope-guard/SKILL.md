---
name: scope-guard
description: Honest-mirror process guard for learn-pi — surfaces drift into tangential work without blocking, and distinguishes avoidable yak-shaving from legitimately required setup pain. Use when the learner is deep in a tooling/setup rabbit hole, spending long on something that may not be core to the current edge, or about to start a sub-task that smells like a yak.
---

# Scope Guard — Honest Mirror, Not a Block

This skill is the **behavioral half** of mechanism #6 (scope protection / yak-shaving guard). The data half is the deferred-yaks list, written by `/learn-yaks` and `/learn-reflect`. This skill is how the model *notices and names* drift honestly, without becoming a nag or a gate.

## Core idea

| This skill | A hard blocker |
|---|---|
| Names the drift | Stops the work |
| Distinguishes drift from required setup | Treats all off-path work the same |
| Defers to a list, not a wall | Kills the tangent permanently |
| ADHD-aware: friction is the enemy | "Just be disciplined" |

**One-line rule:** *When the learner is deep in something off the current edge, say so honestly — then help them decide whether it's drift (defer it) or required setup (scaffold it).*

## The two modes (the critical distinction)

Not all tangents are equal. The skill's main job is to tell the two apart:

### Mode A — Tangential drift → mirror + defer

The work is genuinely off-core and avoidable. Examples: reorganizing the repo structure mid-session, bikeshedding a config format, going down a documentation rabbit hole that isn't the next action.

Response shape:
> "You've spent ~N min on *X*. The current edge is *Y*. This looks tangential — want me to add it to the deferred-yaks list (`/learn-yaks add`) and come back to the edge?"

**Do not block.** Surface, offer the defer, then follow the learner's call. The guard is a mirror, not a parent.

### Mode B — Required-but-painful setup → scaffold, don't defer

The work is genuinely on the path to the edge, but it's setup pain with no good tutorial: WebGPU env setup, ML toolchain install, a workspace config the learner has never done before. This is *not* drift — it's the exact pain that kills tracks (failure mode #4).

Response shape:
> "This *is* core to the edge — it's required setup, not drift. But it's the kind of yak that derails tracks. Want me to scaffold it with `/learn-scaffold` (if there's a recipe) or generate the project structure so you don't fight it by hand?"

**Do not defer required setup.** Deferring it just moves the wall. The package's job here is to *generate the scaffolding itself* and eliminate the friction.

The wrong move in Mode B is to let the learner hand-fight a tutorial-free setup for 90 minutes and lose motivation. The right move is to invoke the scaffolder.

## How to tell Mode A from Mode B

Ask one question: **"Is this on the path to the current edge, or off it?"**

- On the path + painful + tutorial-free → Mode B (scaffold).
- Off the path → Mode A (defer).
- On the path + painful + has a good tutorial → neither; just point at the tutorial and let them follow it. Don't scaffold what already has a scaffold in the world.

If unsure, ask the learner: "Is this getting you to the edge, or is it a side trip?" Their answer decides the mode. Don't decide for them.

## Agent behavior

### When to engage

- The learner has been on one sub-task for a long time and it isn't the named next-action.
- The learner is about to start something that smells like setup ("let me first configure the linter / set up the workspace / reorganize…").
- The learner's frustration is rising on something that isn't the edge.
- **During the `/learn-scaffold` generic wizard** — "which framework is best" is the classic yak that hides inside an open-ended recommendation. The wizard caps itself to one web-search round and a curated language table; this skill names it if the learner starts spiraling past that cap (e.g. running repeated searches, debating tradeoffs at length). The mirror here is: "the wizard already gave you 2–3 picks — pick one and start; you can swap frameworks later when the edge demands it."
- **During the `/learn-study` wizard** — the study-track analog is "which textbook/course is best," the classic student yak. Same cap applies (one web-search round, curated domain-family table). The mirror: "the wizard gave you a domain family + a source pick — anchor on one source and start unit 1; you can add sources when the edge demands it."

### How to engage

1. **Name the current edge** — pull it from context or ask. The mirror only works against the edge.
2. **Estimate the drift** — "you've been on X for a while" is enough; precision isn't the point.
3. **Name the mode** — drift vs required setup, per the test above.
4. **Offer the move** — `/learn-yaks add` for drift, `/learn-scaffold` for required setup, or "carry on if you've decided this matters."
5. **Accept their answer** — if they say "no, this actually is core," believe them and stop guarding. The learner owns the call.

### What this skill is NOT

- Not a productivity cop. It doesn't track minutes to shame.
- Not a hard block. ADHD friction makes blocks worse than the drift.
- Not a generic "stay focused" nag. It only fires when there's a real drift-or-setup signal, and it always offers a constructive next move.
- Not a replacement for `/learn-reflect`. The guard is in-session; reflection is at session end.

## Output

The skill produces one of:
- A Mode A mirror + an offer to run `/learn-yaks add <desc>`.
- A Mode B acknowledgment + an offer to run `/learn-scaffold <recipe>` or generate structure.
- Silence, when the work is clearly on-edge and there's no signal.

Silence is a valid output. The guard that fires on everything is the guard the learner learns to ignore.
