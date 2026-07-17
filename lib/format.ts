/**
 * Shared formatting helpers — clock, theme-aware line builders, truncation.
 * Kept dependency-light: callers pass the theme in so this module is pure.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

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
	return lines;
}
