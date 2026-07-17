---
name: reflection-prompts
description: End-of-session reflection contract for learn-pi — the structured micro-step that updates the edge marker and next-action, closing the self-regulated learning loop. Use when the learner is debriefing a session, running /learn-reflect, or reviewing what they accomplished and what's next.
---

# Reflection Prompts — Session Debrief Contract

This skill is the **reflection phase** of self-regulated learning (Zimmerman) and the feedback path that keeps the learn-pi loop alive across sessions. It is deliberately **not a journal** — journals are freeform and high-friction, which is the wrong shape for an ADHD learner at session end. This is a structured, low-friction micro-step.

## Core idea

| Reflection (this skill) | Socratic tutoring (sibling skill) |
|---|---|
| Review what happened | Lead to the next insight |
| Update the edge + next-action | Ask questions during the work |
| Close the loop so re-entry works | Open the loop so learning happens |
| Retrospective, you-centered | Prospective, problem-centered |

**One-line rule:** *At session end, capture the two facts that make next re-entry trivial — did the edge move, and what's the concrete first move next time.*

## The three structured questions

Reflection is three questions, in order. Do not add a fourth unless the learner asks.

1. **Crossed the edge?** — "The current edge was *X*. Did you cross it this session?" A yes/no. If yes, a new edge must be named (the next thing just beyond what they can now do). If no, that's fine — the edge stays.
2. **Next concrete action?** — "What's the concrete first move next time?" Must be specific enough that future-them can execute it without re-figuring-out the plan. "Look at render.rs" is too vague; "open render.rs, declare the vertex buffer layout struct" is right. **This field is never empty** — it's the load-bearing persistence rule.
3. **Any yaks to defer?** — "Did anything tangential come up that you're shelving?" Captured to the deferred-yaks list so it doesn't feel like a loss and doesn't pull them off-core next time.

## The double-loop variant (Argyris) — sparingly

Only when a track has stalled across **N sessions** (default 3) with no edge-crossing and no yak resolution, surface a fourth question:

> "Is the **goal** wrong, not just the approach?"

This is double-loop learning: single-loop adjusts actions to hit a fixed goal; double-loop questions the goal itself. The signal is sustained stall, not a single bad session. Do not raise it earlier — it becomes noise.

When the learner revises the outcome compass, treat the new statement as a **living, revisable** compass, not a fixed SMART target. The vision is fluid and dynamic; the package holds it loosely.

## Agent behavior

### When invoked conversationally (not via /learn-reflect)

If the learner says "let me reflect" or "debrief this session" without running `/learn-reflect`, conduct the three questions conversationally — one at a time, in order — then tell them to run `/learn-reflect <track>` to persist the answers. The skill guides the *conversation*; the command does the *persistence*.

### During the conversation

- **Do not lecture.** Reflection is the learner synthesizing, not you summarizing.
- **Use their words.** If they say "I figured out the pipeline thing," ask "what specifically about the pipeline — and is that the edge crossed or still in progress?"
- **Push for concreteness on next-action.** If their next action is vague, ask one sharpening question: "what's the first file you'd open?"
- **Name the stall honestly, without shame.** "This is the third session without an edge crossing — that's the signal to check the goal, not a verdict on you."

### What reflection is NOT

- Not a productivity review. Minutes are recorded but not judged.
- Not a guilt generator. "Only 12 minutes" is fine — showing up is the reward half of the habit loop.
- Not a planning session. Planning is `/learn-plan` (socratic OFF, direct answers). Reflection captures what happened; planning decides what's next. They share the next-action field but are different modes.

## Output

The reflection's job is to produce three things that `/learn-reflect` persists:
- `edge_crossed: boolean` + `new_edge: string | null`
- `next_action_after: string` (never empty)
- `yaksAdded: Yak[]` + any `yaksResolved`

Everything else (mood, narrative) is optional and not stored. The stored record is the minimum that makes the next re-entry trivial.
