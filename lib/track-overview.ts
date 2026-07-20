/**
 * Track overview — learner context + high-level lesson plan captured at
 * scaffold/plan time. Visibility only (like outcome_compass); not gated on.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TrackOverview } from "./track";

export type { TrackOverview };

export interface TrackOverviewHints {
	goal: string;
	depth?: string;
	stack?: string[];
}

export function buildOverviewSummary(hints: TrackOverviewHints, parts: Pick<TrackOverview, "learner_context" | "approach" | "learning_path">): string {
	const stack = hints.stack?.length ? hints.stack.join(" + ") : undefined;
	const depth = hints.depth ? ` (${hints.depth} depth` + (stack ? `, ${stack}` : "") + ")" : stack ? ` (${stack})` : "";
	const lead = `Learn ${hints.goal}${depth}.`;
	const bits = [parts.learner_context, parts.approach, parts.learning_path].filter(Boolean);
	if (bits.length === 0) return lead;
	return `${lead} ${bits.join(" ")}`;
}

/** Wizard / plan prompts — direct answers, not socratic. */
export async function collectTrackOverview(
	ctx: ExtensionCommandContext,
	hints: TrackOverviewHints,
	existing?: TrackOverview | null,
): Promise<TrackOverview> {
	const learner_context = (
		await ctx.ui.input(
			"Your background for this track (experience, gaps):",
			existing?.learner_context ?? "e.g. software engineer; superficial quantum knowledge",
		)
	)?.trim();

	const approach = (
		await ctx.ui.input(
			"How do you want to learn?",
			existing?.approach ?? "e.g. learn by writing code with theory interleaved",
		)
	)?.trim();

	const learning_path = (
		await ctx.ui.input(
			"High-level learning path (what you'll cover, in order):",
			existing?.learning_path ?? "e.g. qubits → measurement → Hadamard → small circuits in Rust",
		)
	)?.trim();

	const parts = {
		learner_context: learner_context || undefined,
		approach: approach || undefined,
		learning_path: learning_path || undefined,
	};

	const autoSummary = buildOverviewSummary(hints, parts);
	const summaryAns = await ctx.ui.input(
		"Track summary (one paragraph — edit if needed):",
		existing?.summary ?? autoSummary,
	);
	const summary = (summaryAns?.trim() || autoSummary).trim();
	const now = new Date().toISOString();

	return {
		summary,
		...parts,
		set_at: existing?.set_at ?? now,
		revised_at: existing ? now : undefined,
	};
}

export function formatTrackOverview(overview: TrackOverview | null | undefined): string[] {
	if (!overview) return ["overview: (unset — run /learn-plan overview edit)"];
	const lines = [`overview: ${overview.summary}`];
	if (overview.learner_context) lines.push(`  background: ${overview.learner_context}`);
	if (overview.approach) lines.push(`  approach:   ${overview.approach}`);
	if (overview.learning_path) lines.push(`  path:       ${overview.learning_path}`);
	return lines;
}
