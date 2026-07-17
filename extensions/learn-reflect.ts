/**
 * learn-reflect — the loop-closer (mechanism #8). Replaces socrates-journal.
 *
 * This is the feedback path that keeps #4 (edge) and #2/#7 (next_action) alive
 * across sessions. Without it, the pre-computed next-action goes stale and
 * re-entry breaks down again — the exact failure of socrates-plan.
 *
 * Uses structured dialogs (NOT a freeform journal — ADHD friction) to collect:
 *   (a) did you cross the edge? (yes/no)
 *   (b) what's the concrete first move next time? (text — becomes next_action)
 *   (c) any yaks to defer? (text — parsed into yak additions)
 * Plus, when stall_counter >= STALL_THRESHOLD, the double-loop question:
 *   "is the GOAL wrong, not just the approach?"
 *
 * applyReflection() enforces integrity rules 1 (next_action never empty),
 * 2 (edge + next_action move together), 4 (stall counter). Then persists +
 * appends the session log + logs the reward (completes #10).
 *
 * Command:
 *   /learn-reflect [track]   If [track] omitted, uses the active track.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	appendSessionLog,
	getActiveTrack,
	loadTrackOrThrow,
	applyReflection,
	saveTrack,
	trackExists,
	trackKind,
	STALL_THRESHOLD,
	type Track,
} from "../lib/track";

export default function learnReflect(pi: ExtensionAPI) {
	// Capture the last completed focus duration from the timer so /learn-reflect
	// can default the session minutes to the real elapsed time.
	let lastTimerMinutes: number | null = null;
	pi.events.on("learn:timer:stopped", (data) => {
		const d = (data ?? {}) as { minutes?: number };
		if (typeof d.minutes === "number") lastTimerMinutes = d.minutes;
	});

	pi.registerCommand("learn-reflect", {
		description: "End-of-session reflection: update edge + next_action + yaks (closes the SRL loop).",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});

	async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
		const trackId = args.trim().split(/\s+/)[0];
		const track = await resolveTrack(trackId, ctx);
		if (!track) return;

		const minutes = await collectMinutes(ctx);
		if (minutes === null) return; // cancelled

		const edgeBefore = track.edge.statement;
		const isStudy = trackKind(track) === "study";

		// Verify signal: programming tracks self-report yes/no; study tracks walk
		// the rubric (2–3 questions, 0–2 each) and derive edgeCrossed from the
		// average. The rubric is the study-track analog of `cargo test` — it
		// grounds the stall_counter in evidence, not vibes.
		let edgeCrossed: boolean;
		let rubricNote = "";
		if (isStudy && track.rubric?.length) {
			const { crossed, summary } = await collectRubric(track.rubric, edgeBefore, ctx);
			edgeCrossed = crossed;
			rubricNote = summary;
			if (!crossed) {
				ctx.ui.notify(
					`Rubric average below the bar — counting this session as no-progress (stall_counter will increment). The rubric is your verify; treat a low score as a signal to re-attack the same edge, not a failure.`,
					"info",
				);
			}
		} else {
			edgeCrossed = await ctx.ui.confirm(
				"Crossed the edge?",
				`Current edge: "${edgeBefore}"\nDid you cross it this session?`,
			);
		}

		let newEdge: string | null = null;
		if (edgeCrossed) {
			const ans = await ctx.ui.input(
				"New edge (the next thing just beyond what you can now do):",
				"",
			);
			newEdge = (ans ?? "").trim() || null;
		}

		const nextActionAfter = await ctx.ui.input(
			"Next concrete action (the first move next time — be specific):",
			track.next_action,
		);
		if (nextActionAfter === undefined) {
			ctx.ui.notify("Reflection cancelled — next_action unchanged.", "info");
			return;
		}
		if (!nextActionAfter.trim()) {
			ctx.ui.notify("next_action cannot be empty (integrity rule 1). Re-run /learn-reflect.", "warning");
			return;
		}

		const yaksInput = await ctx.ui.input(
			"Any yaks to defer? (comma-separated, or blank)",
			"",
		);
		const yaksAdded = (yaksInput ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((desc) => ({ id: `yak-${desc.slice(0, 8).replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36).slice(-4)}`, desc, added_at: new Date().toISOString(), resolved: false }));

		// Double-loop (Argyris) — only on sustained stall.
		let outcomeCompassRevised = false;
		let newOutcomeCompass: string | null = null;
		const willStall = !edgeCrossed && yaksAdded.length === 0;
		const projectedStall = willStall ? track.stall_counter + 1 : 0;
		if (projectedStall >= STALL_THRESHOLD) {
			ctx.ui.notify(
				`This will be ${projectedStall} sessions without progress. Double-loop check (Argyris):`,
				"warning",
			);
			const revise = await ctx.ui.confirm(
				"Is the GOAL wrong, not just the approach?",
				`Outcome compass: "${track.outcome_compass}"\nRevise the compass?`,
			);
			if (revise) {
				const revised = await ctx.ui.input("Revised outcome compass:", track.outcome_compass);
				if (revised && revised.trim()) {
					outcomeCompassRevised = true;
					newOutcomeCompass = revised.trim();
				}
			}
		}

		let note = await ctx.ui.input("One-line note (optional):", "");
		note = (note ?? "").trim();
		if (rubricNote) note = note ? `${note}  [${rubricNote}]` : rubricNote;
		const cued = track.last_session_at === null ? false : isCuedSession(track);

		const updated = applyReflection(track, {
			minutes,
			edgeBefore,
			edgeCrossed,
			newEdge,
			nextActionAfter: nextActionAfter.trim(),
			outcomeCompassRevised,
			newOutcomeCompass,
			yaksResolved: [],
			yaksAdded,
			cued,
			note: (note ?? "").trim(),
		});

		await saveTrack(updated);
		const lastEntry = updated.log[updated.log.length - 1];
		if (lastEntry) await appendSessionLog(lastEntry, updated.id);

		ctx.ui.notify(
			`Reflected on ${updated.label}. Edge ${edgeCrossed ? "crossed" : "held"}. Next: "${updated.next_action.slice(0, 80)}"`,
			"info",
		);
		// Reward half of #10 — showing up is the reward, surfaced honestly.
		ctx.ui.notify(`Reward logged: ${updated.process_contract.reward}`, "info");
		lastTimerMinutes = null;
	}

	async function resolveTrack(trackArg: string | undefined, ctx: ExtensionCommandContext): Promise<Track | null> {
		if (trackArg && await trackExists(trackArg)) return loadTrackOrThrow(trackArg);
		const active = await getActiveTrack();
		if (active) return active;
		ctx.ui.notify("No active track. Run /learn-start first, or /learn-reflect <track>.", "warning");
		return null;
	}

	async function collectMinutes(ctx: ExtensionCommandContext): Promise<number | null> {
		const fallback = 25;
		const defaultMin = lastTimerMinutes ?? fallback;
		const ans = await ctx.ui.input(
			`Session minutes${lastTimerMinutes ? " (from timer)" : ""}:`,
			String(defaultMin),
		);
		if (ans === undefined) return null;
		const n = Number.parseInt(ans, 10);
		if (!Number.isFinite(n) || n < 0) {
			ctx.ui.notify(`Invalid minutes "${ans}".`, "warning");
			return null;
		}
		return n;
	}

	function isCuedSession(track: Track): boolean {
		const cue = track.process_contract.cue;
		if (!cue || !track.last_session_at) return false;
		// Heuristic: if more than 4h passed since last session, treat as cued re-entry.
		const hours = (Date.now() - Date.parse(track.last_session_at)) / 3_600_000;
		return hours >= 4;
	}

	/**
	 * Walk the study-track rubric: each question scored 0 (no) / 1 (partly) / 2 (yes).
	 * `crossed` is true when the average is >= 1.5 (i.e. mostly "yes") — this is
	 * the evidence-grounded analog of a programming track's `cargo test` passing.
	 * The summary string is folded into the session note so the log records it.
	 */
	async function collectRubric(
		questions: string[],
		edge: string,
		ctx: ExtensionCommandContext,
	): Promise<{ crossed: boolean; summary: string }> {
		ctx.ui.notify(`Rubric for edge: "${edge}"\nScore each 0=no, 1=partly, 2=yes.`, "info");
		const scores: number[] = [];
		for (const q of questions) {
			const ans = await ctx.ui.select(q, ["0 — no", "1 — partly", "2 — yes"]);
			if (!ans) { scores.push(0); continue; }
			scores.push(Number.parseInt(ans, 10) || 0);
		}
		const total = scores.reduce((a, b) => a + b, 0);
		const max = questions.length * 2;
		const avg = max > 0 ? total / max : 0;
		return {
			crossed: avg >= 1.5,
			summary: `rubric ${total}/${max} (avg ${avg.toFixed(2)})`,
		};
	}
}
