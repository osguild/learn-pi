/**
 * Hard-cue generation — launchd on macOS, with cron and ical fallbacks.
 *
 * Per DESIGN.md Fork E: the cue must fire when pi is CLOSED (failure mode #3
 * is "not opening pi"). A soft cue that only fires once pi is open doesn't
 * solve it. So /learn-cue writes OS-level reminders that carry the current
 * next_action (read fresh from the Track file at fire time).
 *
 * Files written for the launchd path:
 *   ~/.pi/learn/cue/<track-id>.sh     — notifier script (reads Track, calls osascript)
 *   ~/.pi/learn/cue/<track-id>.plist  — launchd job pointing at the .sh
 *
 * Fallback chain (implement in order, stop at first that loads):
 *   1. launchd + osascript (macOS native)
 *   2. crontab entry (merge into user crontab)
 *   3. .ics file (manual calendar import)
 */

import { execSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { cueFile, CUE_DIR } from "./paths";
import type { CueConfig, Track } from "./track";

const LAUNCHD_LABEL_PREFIX = "dev.pi.learn";

export function cueScriptPath(trackId: string): string {
	return join(CUE_DIR, `${trackId}.sh`);
}

export function cueIcsPath(trackId: string): string {
	return join(CUE_DIR, `${trackId}.ics`);
}

/** Parse "HH:MM" into { hour, minute }. Returns null on invalid input. */
export function parseTime(time: string): { hour: number; minute: number } | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	if (!m) return null;
	const hour = Number(m[1]);
	const minute = Number(m[2]);
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
	return { hour, minute };
}

const WEEKDAY_TO_LAUNCHD: Record<string, number> = {
	sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7,
};

/** Generate the notifier shell script that reads the Track and calls osascript. */
export function generateNotifierScript(trackId: string): string {
	const trackFile = join(homedir(), ".pi", "learn", "tracks", `${trackId}.json`);
	return [
		`#!/bin/bash`,
		`# learn-pi cue notifier for track "${trackId}".`,
		`# Reads the Track fresh at fire time so the notification carries the current next_action.`,
		`set -euo pipefail`,
		`TRACK_FILE="${trackFile}"`,
		`if [[ ! -f "$TRACK_FILE" ]]; then exit 0; fi`,
		`NEXT=$(python3 -c "import json; d=json.load(open('$TRACK_FILE')); print((d.get('next_action') or '')[:180])" 2>/dev/null || echo "")`,
		`LABEL=$(python3 -c "import json; d=json.load(open('$TRACK_FILE')); print(d.get('label','learn-pi'))" 2>/dev/null || echo "learn-pi")`,
		`EDGE=$(python3 -c "import json; d=json.load(open('$TRACK_FILE')); print((d.get('edge',{}).get('statement') or '')[:120])" 2>/dev/null || echo "")`,
		`BODY="next: $NEXT  |  edge: $EDGE"`,
		`osascript -e "display notification \\"$BODY\\" with title \\"learn-pi: $LABEL\\" sound name \\"glass\\"" 2>/dev/null || true`,
		``,
	].join("\n");
}

/** Generate a launchd plist for the given cue config. */
export function generateLaunchdPlist(trackId: string, cue: CueConfig): string {
	const scriptPath = cueScriptPath(trackId);
	const label = `${LAUNCHD_LABEL_PREFIX}.${trackId}`;
	const { hour, minute } = parseTime(cue.time) ?? { hour: 9, minute: 30 };

	const calendar: string[] = [];
	if (cue.kind === "daily") {
		calendar.push("  <key>StartCalendarInterval</key>");
		calendar.push("  <dict>");
		calendar.push(`    <key>Hour</key><integer>${hour}</integer>`);
		calendar.push(`    <key>Minute</key><integer>${minute}</integer>`);
		calendar.push("  </dict>");
	} else if (cue.kind === "weekday") {
		const days = (cue.days ?? ["mon", "tue", "wed", "thu", "fri"])
			.map((d) => WEEKDAY_TO_LAUNCHD[d.toLowerCase()] ?? null)
			.filter((n): n is number => n !== null);
		const unique = Array.from(new Set(days)).sort((a, b) => a - b);
		calendar.push("  <key>StartCalendarInterval</key>");
		if (unique.length === 1) {
			calendar.push("  <dict>");
			calendar.push(`    <key>Hour</key><integer>${hour}</integer>`);
			calendar.push(`    <key>Minute</key><integer>${minute}</integer>`);
			calendar.push(`    <key>Weekday</key><integer>${unique[0]}</integer>`);
			calendar.push("  </dict>");
		} else {
			calendar.push("  <array>");
			for (const w of unique) {
				calendar.push("    <dict>");
				calendar.push(`      <key>Hour</key><integer>${hour}</integer>`);
				calendar.push(`      <key>Minute</key><integer>${minute}</integer>`);
				calendar.push(`      <key>Weekday</key><integer>${w}</integer>`);
				calendar.push("    </dict>");
			}
			calendar.push("  </array>");
		}
	} else {
		// "once" — use StartInterval with a future-ish approach: launchd doesn't do
		// one-shot ISO datetimes cleanly; fall back to StartCalendarInterval with
		// the parsed date, which fires once when that calendar moment next occurs.
		const at = cue.at ? new Date(cue.at) : new Date(Date.now() + 60_000);
		calendar.push("  <key>StartCalendarInterval</key>");
		calendar.push("  <dict>");
		calendar.push(`    <key>Hour</key><integer>${at.getHours()}</integer>`);
		calendar.push(`    <key>Minute</key><integer>${at.getMinutes()}</integer>`);
		calendar.push(`    <key>Day</key><integer>${at.getDate()}</integer>`);
		calendar.push(`    <key>Month</key><integer>${at.getMonth() + 1}</integer>`);
		calendar.push("  </dict>");
	}

	return [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
		`<plist version="1.0">`,
		`<dict>`,
		`  <key>Label</key><string>${label}</string>`,
		`  <key>ProgramArguments</key>`,
		`  <array>`,
		`    <string>/bin/bash</string>`,
		`    <string>${scriptPath}</string>`,
		`  </array>`,
		...calendar,
		`  <key>StandardOutPath</key><string>/tmp/${label}.out.log</string>`,
		`  <key>StandardErrorPath</key><string>/tmp/${label}.err.log</string>`,
		`</dict>`,
		`</plist>`,
		``,
	].join("\n");
}

/** Generate a portable .ics file for the calendar-import fallback. */
export function generateIcs(trackId: string, trackLabel: string, cue: CueConfig): string {
	const { hour, minute } = parseTime(cue.time) ?? { hour: 9, minute: 30 };
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, "0");
	const dtStart = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(hour)}${pad(minute)}00`;
	const summary = `learn-pi: ${trackLabel}`;
	const desc = `Cue for track ${trackId}. Open pi and run /learn-start ${trackId}.`;
	const byday = (cue.kind === "weekday" ? (cue.days ?? ["mon", "tue", "wed", "thu", "fri"]) : ["mo", "tu", "we", "th", "fr"])
		.map((d) => d.toUpperCase().slice(0, 2))
		.join(",");
	const rrule = cue.kind === "once" ? "" : `RRULE:FREQ=WEEKLY;BYDAY=${byday};`;
	return [
		`BEGIN:VCALENDAR`,
		`VERSION:2.0`,
		`PRODID:-//learn-pi//cue//EN`,
		`BEGIN:VEVENT`,
		`UID:${trackId}@learn-pi`,
		`DTSTAMP:${dtStart}Z`,
		`DTSTART:${dtStart}`,
		`${rrule}`,
		`SUMMARY:${summary}`,
		`DESCRIPTION:${desc}`,
		`BEGIN:VALARM`,
		`TRIGGER:-PT0S`,
		`ACTION:DISPLAY`,
		`DESCRIPTION:${summary}`,
		`END:VALARM`,
		`END:VEVENT`,
		`END:VCALENDAR`,
		``,
	].filter(Boolean).join("\r\n");
}

export interface CueInstallResult {
	method: "launchd" | "crontab" | "ics" | "none";
	message: string;
}

/**
 * Write the cue assets and load them. Tries launchd first, then crontab,
 * then falls back to writing an .ics file the user imports manually.
 */
export async function installCue(track: Track): Promise<CueInstallResult> {
	const cue = track.process_contract.cue;
	if (!cue) return { method: "none", message: "No cue configured on this track." };

	await mkdir(CUE_DIR, { recursive: true });
	const scriptPath = cueScriptPath(track.id);
	const plistPath = cueFile(track.id);
	await writeFile(scriptPath, generateNotifierScript(track.id), "utf8");
	await chmod(scriptPath, 0o755);
	await writeFile(plistPath, generateLaunchdPlist(track.id, cue), "utf8");

	// 1. launchd
	try {
		execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
		execSync(`launchctl load "${plistPath}"`);
		return { method: "launchd", message: `Loaded launchd job ${LAUNCHD_LABEL_PREFIX}.${track.id}` };
	} catch (err) {
		// fall through to cron
		void err;
	}

	// 2. crontab
	try {
		const existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf8" });
		const cleaned = existing
			.split("\n")
			.filter((l) => !l.includes(`# learn-pi:${track.id}`) && !l.includes(scriptPath));
		const { hour, minute } = parseTime(cue.time) ?? { hour: 9, minute: 30 };
		const dow = cue.kind === "weekday"
			? (cue.days ?? ["mon", "tue", "wed", "thu", "fri"]).map((d) => CRON_DOW[d.toLowerCase()] ?? "*").join(",")
			: "*";
		const entry = `${minute} ${hour} * * ${dow} /bin/bash "${scriptPath}" # learn-pi:${track.id}`;
		const merged = [...cleaned.filter(Boolean), entry].join("\n") + "\n";
		execSync("crontab -", { input: merged, encoding: "utf8" });
		return { method: "crontab", message: `Installed crontab entry for ${track.id}` };
	} catch (err) {
		void err;
	}

	// 3. ics fallback
	try {
		const icsPath = cueIcsPath(track.id);
		await writeFile(icsPath, generateIcs(track.id, track.label, cue), "utf8");
		return {
			method: "ics",
			message: `Wrote ${icsPath} — import it into Calendar.app for the cue (launchd and crontab both failed).`,
		};
	} catch (err) {
		return { method: "none", message: `All cue install methods failed: ${(err as Error).message}` };
	}
}

/** Unload and remove cue assets for a track. */
export async function uninstallCue(trackId: string): Promise<string> {
	const plistPath = cueFile(trackId);
	let msg = "";
	if (existsSync(plistPath)) {
		try {
			execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
		} catch {
			// best effort
		}
		try {
			execSync("crontab -l 2>/dev/null", { encoding: "utf8" });
			const existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf8" });
			const cleaned = existing
				.split("\n")
				.filter((l) => !l.includes(`# learn-pi:${trackId}`))
				.join("\n");
			execSync("crontab -", { input: cleaned, encoding: "utf8" });
		} catch {
			// best effort
		}
		msg = `Unloaded cue for ${trackId}.`;
	} else {
		msg = `No cue installed for ${trackId}.`;
	}
	return msg;
}

const CRON_DOW: Record<string, string> = {
	sun: "0", mon: "1", tue: "2", wed: "3", thu: "4", fri: "5", sat: "6",
};

void dirname;
