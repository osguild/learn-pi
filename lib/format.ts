/**
 * Shared formatting helpers — clock, theme-aware line builders, truncation.
 * Kept dependency-light: callers pass the theme in so this module is pure.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { MaterialUnit, Resource } from "./track";

export function formatClock(sec: number): string {
	const s = Math.max(0, sec);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Truncate to a width with an ellipsis. Preserves ANSI styling in width math. */
export function truncatePlain(text: string, max: number): string {
	const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
	if (plain.length <= max) return text;
	return plain.slice(0, Math.max(0, max - 1)) + "…";
}

/** Wrap a long string into lines of ~width by word boundaries. */
export function wrapWords(text: string, width: number): string[] {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let cur = "";
	for (const w of words) {
		if (cur && (cur.length + 1 + w.length) > width) {
			lines.push(cur);
			cur = w;
		} else {
			cur = cur ? `${cur} ${w}` : w;
		}
	}
	if (cur) lines.push(cur);
	return lines.length ? lines : [""];
}

/** Render a Track dashboard as a widget line array (low cognitive load). */
export function renderTrackDashboard(
	ctx: ExtensionCommandContext,
	track: {
		label: string;
		outcome_compass: string;
		edge: { statement: string };
		next_action: string;
		stall_counter: number;
		process_contract: { session_min: number };
		resources?: Resource[];
		material_graph?: { units: MaterialUnit[] };
	},
	width: number,
): string[] {
	const theme = ctx.ui.theme;
	const innerWidth = Math.max(20, width - 4);
	const lines: string[] = [];
	lines.push(theme.fg("accent", `▶ ${track.label}`));
	const compass = track.outcome_compass || "(no outcome compass set)";
	for (const l of wrapWords(`compass: ${compass}`, innerWidth)) {
		lines.push(theme.fg("dim", `  ${l}`));
	}
	lines.push(theme.fg("warning", "  edge:") + ` ${truncatePlain(track.edge.statement, innerWidth - 8)}`);
	lines.push(theme.fg("success", "  next:") + ` ${truncatePlain(track.next_action, innerWidth - 8)}`);
	if (track.stall_counter > 0) {
		lines.push(theme.fg("muted", `  stall: ${track.stall_counter} session${track.stall_counter === 1 ? "" : "s"} without progress`));
	}
	appendResourcesSection(lines, track, theme, innerWidth);
	return lines;
}

/**
 * Surface resources relevant to *now*: track-level reading + resources on the
 * active material unit (if any). Stays silent when empty so the dashboard
 * stays clean for tracks that don't use resources.
 */
function appendResourcesSection(
	lines: string[],
	track: {
		resources?: Resource[];
		material_graph?: { units: MaterialUnit[] };
	},
	theme: ExtensionCommandContext["ui"]["theme"],
	innerWidth: number,
): void {
	const trackRes = track.resources ?? [];
	const activeUnit = track.material_graph?.units.find((u) => u.status === "active");
	const unitRes = activeUnit?.resources ?? [];
	if (trackRes.length === 0 && unitRes.length === 0) return;
	lines.push(theme.fg("dim", "  resources:"));
	for (const r of trackRes) {
		lines.push(theme.fg("dim", `    [track] ${truncatePlain(r.title, innerWidth - 12)}`));
	}
	if (activeUnit && unitRes.length > 0) {
		const tag = `[unit:${truncatePlain(activeUnit.title, 20)}]`;
		for (const r of unitRes) {
			lines.push(theme.fg("dim", `    ${tag} ${truncatePlain(r.title, innerWidth - 12 - tag.length)}`));
		}
	}
}
