/**
 * learn-status — cross-track overview. Replaces socrates-status.
 *
 * Lists every track with its edge + next_action (truncated), marks the active
 * one, and flags stalled tracks (stall_counter >= STALL_THRESHOLD → double-loop
 * territory). Cross-track interleaving (#9 adapt) is supported here: if the
 * active track is stalled, the learner can see alternatives at a glance.
 *
 * Command:
 *   /learn-status            All tracks, active marked.
 *   /learn-status <track>    Detail view of one track.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	loadIndex,
	loadTrack,
	loadTrackOrThrow,
	trackExists,
	STALL_THRESHOLD,
	type Track,
} from "../lib/track";
import { truncatePlain } from "../lib/format";

export default function learnStatus(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-status", {
		description: "Cross-track overview, or detail for one track.",
		handler: async (args, ctx) => {
			await run(args, ctx);
		},
	});
}

async function run(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const arg = args.trim().split(/\s+/)[0];
	if (arg && await trackExists(arg)) {
		await detail(await loadTrackOrThrow(arg), ctx);
		return;
	}
	await overview(ctx);
}

async function overview(ctx: ExtensionCommandContext): Promise<void> {
	const index = await loadIndex();
	if (index.tracks.length === 0) {
		ctx.ui.notify("No tracks yet. Create one with /learn-scaffold, /learn-study, or /learn-plan.", "info");
		return;
	}
	const lines: string[] = ["Tracks:"];
	for (const t of index.tracks) {
		const track = await loadTrack(t.id);
		if (!track) continue;
		const mark = track.id === index.active_track_id ? "▶" : " ";
		const stall = track.stall_counter >= STALL_THRESHOLD ? " ⚠stalled" : "";
		const kind = (track.track_kind ?? "programming") === "study" ? " [study]" : "";
		const next = truncatePlain(track.next_action, 60);
		lines.push(`${mark} ${track.label.padEnd(22)}${kind} edge: ${truncatePlain(track.edge.statement, 40)}`);
		lines.push(`    next: ${next}${stall}`);
	}
	ctx.ui.notify(lines.join("\n"), "info");
}

async function detail(track: Track, ctx: ExtensionCommandContext): Promise<void> {
	const openYaks = track.deferred_yaks.filter((y) => !y.resolved);
	const isStudy = (track.track_kind ?? "programming") === "study";
	const lines = [
		`${track.label} (${track.id}) — ${track.status}${isStudy ? "  [study]" : ""}`,
		`work_dir: ${track.work_dir || "(unset)"}`,
		`verify:   ${isStudy ? "(rubric — surfaced in /learn-reflect)" : (track.verify_command ?? "(unset)")}`,
		`compass:  ${track.outcome_compass || "(unset)"}`,
	];
	if (isStudy && track.study_depth) {
		lines.push(`depth:    ${track.study_depth}${track.domain_family ? `  family: ${track.domain_family}` : ""}`);
	} else if (track.depth) {
		lines.push(`depth:    ${track.depth}${track.recommended_stack?.length ? `  stack: ${track.recommended_stack.join(" + ")}` : ""}`);
	}
	if (track.edge_suggested) lines.push(`edge:     ${track.edge.statement}  ⚠ wizard suggestion (not yet accepted)`);
	else lines.push(`edge:     ${track.edge.statement}  (at edge for ${track.edge.sessions_at_edge} session${track.edge.sessions_at_edge === 1 ? "" : "s"})`);
	lines.push(
		`next:     ${track.next_action}`,
		`session:  ${track.process_contract.session_min}m  cue: ${track.process_contract.cue ? "set" : "(none)"}`,
		`units:    ${track.material_graph.units.length}`,
		`yaks:     ${openYaks.length} open / ${track.deferred_yaks.length - openYaks.length} resolved`,
		`stall:    ${track.stall_counter}${track.stall_counter >= STALL_THRESHOLD ? " (double-loop: is the goal wrong?)" : ""}`,
		`last:     ${track.last_session_at ?? "(never)"}`,
	);
	if (isStudy && track.rubric?.length) {
		lines.push(`rubric:   ${track.rubric.length} questions (answered in /learn-reflect)`);
	}
	ctx.ui.notify(lines.join("\n"), "info");
}
