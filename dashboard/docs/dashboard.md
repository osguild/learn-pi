# learn-pi dashboard

Read-only view of your learning tracks in `~/.pi/learn/`. The dashboard refreshes every few seconds while open.

## Layout

### Header

Shows the app title and, when a focus timer is running, a timer chip with mode (work/break), remaining time, and active track.

### Sidebar

Lists all tracks. The track with ▶ is the **active track** — the one pi commands like `/learn-start` default to. Click a track to see its detail in the main panel.

### Main panel

Shows cards for the selected track: compass, edge, next action, process contract, material graph, resources, deferred yaks, and session log.

## Core concepts

### Edge

The single skill or milestone you are working on *right now*. It should be concrete enough to know when you have crossed it. Updated together with the next action when you run `/learn-reflect`.

### Next action

A pre-computed, bite-sized first step for your next session — open this file, write this one function, run this test. Never empty on an active track; reflection must set the next one before closing a session.

### Outcome compass

The long-term “why” for the track — what success looks like months from now. Read for motivation and direction only; it is not a progress bar and does not gate anything.

### Process contract

Your habit loop: cue → routine → reward. Keeps sessions repeatable without re-deciding each time.

### Cue

The trigger that reminds you to start a session — e.g. weekday mornings at 9:30. Set with `/learn-cue`; can install an OS reminder (launchd on macOS) so it fires even when pi is closed.

### Session length

Target minutes per session from the process contract (e.g. 25 or 45). Used by `/learn-start` to shape scope.

### Reward

What you do after a session to close the loop — e.g. “log + 5min decompression”. Logged in reflection; visible here for consistency.

### Stall counter

Increments when a session makes no edge progress and resolves no yak; resets when you cross the edge or resolve a yak. At 3+, reflection surfaces a double-loop question: is the goal or approach wrong?

## Track detail cards

### Material graph

Sequenced learning units for the track — chapters, exercises, or milestones. Each unit has a status (pending, active, done, skipped) and optional resources. Built with `/learn-plan` or scaffold wizards.

### Track resources

Links to docs, repos, videos, and papers. Local markdown files (`file://…/*.md`) open in the in-dashboard viewer; other URLs open in a new tab.

### Deferred yaks

Side quests you explicitly parked so they do not derail the current edge. Add and resolve with `/learn-yaks`.

### Session log

History of reflected sessions: minutes spent, whether the edge was crossed, notes, and yaks touched. Written by `/learn-reflect`.

### Work dir & verify

`work_dir` is where you code or take notes. `verify_command` is the test or check that confirms edge progress (e.g. `cargo test -p …`).

## Track types

### Programming track

Default kind. Edge progress is verified by running tests or commands in `work_dir`.

### Study track

Non-coding topics. Uses a rubric (self-assessment questions) instead of a verify command. Created with `/learn-study`.

## Common commands

| Command | Purpose |
|---------|---------|
| `/learn-dashboard start` | Run this server |
| `/learn-start [track] [energy]` | Begin a session |
| `/learn-reflect` | Debrief and update edge + next action |
| `/learn-status` | Quick text overview of all tracks |
| `/learn-plan` | Edit material graph and edge |
| `/learn-cue` | Set or clear session reminders |
| `/learn-yaks` | Manage deferred side quests |
