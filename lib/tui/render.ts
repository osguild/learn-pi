/**
 * Line renderers for learn-tui screens.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { formatClock, truncatePlain, wrapWords } from "../format";
import { STALL_THRESHOLD, type MaterialUnit, type Track } from "../track";
import { computeTimerRemaining, type LearnTuiSnapshot } from "./data";

const UNIT_GLYPH: Record<MaterialUnit["status"], string> = {
	pending: "○",
	active: "▶",
	done: "✓",
	skipped: "⊘",
};

export function renderStatusBar(
	theme: Theme,
	snapshot: LearnTuiSnapshot,
	viewTrack: Track | null,
	width: number,
): string {
	const parts: string[] = [theme.fg("accent", theme.bold("learn-pi"))];
	if (viewTrack) {
		const active = viewTrack.id === snapshot.index.active_track_id;
		const mark = active ? "▶ " : "";
		parts.push(`${mark}${viewTrack.label}`);
	}
	if (snapshot.timer && snapshot.timer.mode !== "idle") {
		const t = snapshot.timer;
		const rem = formatClock(computeTimerRemaining(t));
		const mode = t.paused ? `${t.mode} (paused)` : t.mode;
		parts.push(theme.fg("warning", `${mode} ${rem}`));
	}
	const line = parts.join(theme.fg("dim", " · "));
	return padLine(line, width);
}

export function renderHomeBody(theme: Theme, track: Track, width: number): string[] {
	const inner = Math.max(20, width - 2);
	const lines: string[] = [];

	lines.push("");
	lines.push(theme.fg("success", theme.bold("NEXT")));
	for (const l of wrapWords(track.next_action || "(unset)", inner)) {
		lines.push(`  ${l}`);
	}

	lines.push("");
	const edgeLabel = track.edge_suggested
		? `EDGE · ${track.edge.sessions_at_edge} sessions · wizard suggestion`
		: `EDGE · ${track.edge.sessions_at_edge} session${track.edge.sessions_at_edge === 1 ? "" : "s"} at edge`;
	lines.push(theme.fg("warning", theme.bold(edgeLabel)));
	for (const l of wrapWords(track.edge.statement || "(unset)", inner)) {
		lines.push(`  ${l}`);
	}

	lines.push("");
	lines.push(theme.fg("dim", theme.bold("COMPASS")));
	const compass = track.outcome_compass || "(unset)";
	for (const l of wrapWords(compass, inner)) {
		lines.push(theme.fg("dim", `  ${l}`));
	}

	lines.push("");
	const isStudy = (track.track_kind ?? "programming") === "study";
	const verify = isStudy
		? "rubric — /learn-reflect"
		: (track.verify_command ?? "(unset)");
	lines.push(
		theme.fg("dim", `session ${track.process_contract.session_min}m · verify: ${truncatePlain(verify, inner - 24)}`),
	);
	if (track.stall_counter > 0) {
		const stalled = track.stall_counter >= STALL_THRESHOLD;
		const stallText = `stall ${track.stall_counter}${stalled ? " · double-loop?" : ""}`;
		lines.push(theme.fg(stalled ? "warning" : "dim", stallText));
	}

	const activeUnit = track.material_graph.units.find((u) => u.status === "active");
	if (activeUnit) {
		lines.push("");
		lines.push(theme.fg("dim", `active unit: ${truncatePlain(activeUnit.title, inner - 14)}`));
	}

	return lines;
}

export function renderMaterialBody(theme: Theme, track: Track, width: number): string[] {
	const inner = Math.max(20, width - 4);
	const lines: string[] = [""];
	const units = track.material_graph.units;
	if (units.length === 0) {
		lines.push(theme.fg("dim", "  (no units — /learn-plan or /learn-scaffold)"));
		return lines;
	}
	for (const u of units) {
		const glyph = UNIT_GLYPH[u.status];
		const title = truncatePlain(u.title, inner - 12);
		const diff = theme.fg("dim", ` · ${u.difficulty}`);
		const statusColor = u.status === "active" ? "accent" : u.status === "done" ? "success" : "dim";
		lines.push(
			`  ${theme.fg(statusColor, glyph)} ${title}${diff}`,
		);
		if (u.prerequisites?.length) {
			lines.push(theme.fg("dim", `      needs: ${u.prerequisites.join(", ")}`));
		}
		if (u.notes) {
			for (const l of wrapWords(u.notes, inner - 6)) {
				lines.push(theme.fg("dim", `      ${l}`));
			}
		}
	}
	return lines;
}

export function renderLogBody(theme: Theme, track: Track, width: number): string[] {
	const inner = Math.max(20, width - 2);
	const lines: string[] = [""];
	const entries = [...track.log].reverse().slice(0, 20);
	if (entries.length === 0) {
		lines.push(theme.fg("dim", "  (no session log entries yet)"));
		return lines;
	}
	for (const e of entries) {
		const date = e.at ? e.at.slice(0, 10) : "?";
		const progress = e.edge_crossed ? theme.fg("success", " ✓") : theme.fg("dim", " ·");
		const summary = truncatePlain(e.note || e.next_action_after || "(no note)", inner - 14);
		lines.push(`${theme.fg("dim", date)}${progress} ${summary}`);
		lines.push(
			theme.fg("dim", `         ${e.minutes}m · edge crossed: ${e.edge_crossed ? "yes" : "no"}`),
		);
	}
	return lines;
}

export function renderYaksBody(theme: Theme, track: Track, width: number): string[] {
	const inner = Math.max(20, width - 2);
	const lines: string[] = [""];
	const open = track.deferred_yaks.filter((y) => !y.resolved);
	if (open.length === 0) {
		lines.push(theme.fg("dim", "  (no open yaks)"));
		return lines;
	}
	for (const y of open) {
		for (const l of wrapWords(y.desc, inner - 4)) {
			lines.push(`  ${theme.fg("warning", "⚑")} ${l}`);
		}
	}
	return lines;
}

export function renderResourcesBody(theme: Theme, track: Track, width: number): string[] {
	const inner = Math.max(20, width - 2);
	const lines: string[] = [""];
	const resources = track.resources ?? [];
	if (resources.length === 0) {
		lines.push(theme.fg("dim", "  (no track resources)"));
		return lines;
	}
	for (const r of resources) {
		const kind = r.kind ? theme.fg("dim", `[${r.kind}] `) : "";
		lines.push(`  ${kind}${truncatePlain(r.title, inner - 8)}`);
		lines.push(theme.fg("dim", `    ${truncatePlain(r.url, inner - 4)}`));
	}
	return lines;
}

export function renderHelpBody(theme: Theme, width: number): string[] {
	const inner = Math.max(20, width - 2);
	const rows = [
		["t", "track picker"],
		["m", "material units"],
		["l", "session log"],
		["y", "deferred yaks"],
		["r", "resources"],
		["?", "this help"],
		["R", "refresh data"],
		["esc", "back / quit from home"],
		["q", "quit"],
	];
	const lines: string[] = [""];
	for (const [key, desc] of rows) {
		lines.push(`  ${theme.fg("accent", key.padEnd(5))} ${truncatePlain(desc, inner - 8)}`);
	}
	return lines;
}

export function renderScreenTitle(theme: Theme, title: string, width: number): string {
	return padLine(theme.fg("accent", theme.bold(title)), width);
}

export function renderFooter(theme: Theme, screen: string, width: number): string[] {
	const hints: Record<string, string> = {
		home: "t tracks · m material · l log · y yaks · r resources · ? help · R refresh · q quit",
		tracks: "↑↓ navigate · enter select · esc back",
		material: "esc home · q quit",
		log: "esc home · q quit",
		yaks: "esc home · q quit",
		resources: "esc home · q quit",
		help: "esc home · q quit",
	};
	const text = hints[screen] ?? hints.home;
	return [
		theme.fg("border", "─".repeat(Math.max(0, width))),
		padLine(theme.fg("dim", text), width),
	];
}

export function renderEmptyState(theme: Theme, width: number): string[] {
	return [
		"",
		padLine(theme.fg("dim", "No tracks yet."), width),
		padLine(theme.fg("dim", "Create one with /learn-scaffold, /learn-study, or /learn-plan."), width),
	];
}

function padLine(line: string, width: number): string {
	const plain = line.replace(/\u001b\[[0-9;]*m/g, "");
	if (plain.length >= width) return line;
	return line + " ".repeat(width - plain.length);
}
