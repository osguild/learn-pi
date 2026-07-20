/**
 * learn-pi — entry point. Composes all sub-extensions and registers the
 * session_start widget that renders the active track's edge + next_action
 * before any command runs.
 *
 * This is the architectural fix for the socrates-plan failure: persistence is
 * useless if the re-entry moment doesn't SHOW what was persisted. The widget
 * below renders the waiting next_action the moment pi opens, so re-entry is
 * "execute" not "figure out."
 *
 * Loaded via package.json: "pi": { "extensions": ["./extensions/index.ts"] }
 * Sub-modules are imported here (not auto-discovered) and each registers its
 * own commands/events against the shared `pi` instance.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getActiveTrack } from "../lib/track";
import { ensureLearnRoot } from "../lib/track";
import { renderTrackDashboard } from "../lib/format";
import learnStart from "./learn-start";
import learnTimer from "./learn-timer";
import learnReflect from "./learn-reflect";
import learnPlan from "./learn-plan";
import learnScaffold from "./learn-scaffold";
import learnStudy from "./learn-study";
import learnCue from "./learn-cue";
import learnYaks from "./learn-yaks";
import learnResources from "./learn-resources";
import learnGlossary from "./learn-glossary";
import learnStatus from "./learn-status";
import learnMigrate from "./learn-migrate";
import learnWeb from "./learn-web";
import learnDashboard from "./learn-dashboard";
import learnTui from "./learn-tui";

const DASHBOARD_WIDGET = "learn-start";
const DASHBOARD_WIDTH = 80;

export default function learnPi(pi: ExtensionAPI) {
	// Compose every sub-extension. Each takes the shared `pi` and registers
	// its own commands/events.
	learnTimer(pi);
	learnStart(pi);
	learnReflect(pi);
	learnPlan(pi);
	learnScaffold(pi);
	learnStudy(pi);
	learnCue(pi);
	learnYaks(pi);
	learnResources(pi);
	learnGlossary(pi);
	learnStatus(pi);
	learnMigrate(pi);
	learnWeb(pi);
	learnDashboard(pi);
	learnTui(pi);

	// The persistence fix: on session_start, render the active track's
	// edge + next_action as a widget immediately. No command required.
	// This is what socrates-plan failed to do.
	pi.on("session_start", async (_event, ctx) => {
		await ensureLearnRoot();
		const track = await getActiveTrack();
		if (!track) {
			if (ctx.hasUI) ctx.ui.setWidget(DASHBOARD_WIDGET, undefined);
			return;
		}
		if (!ctx.hasUI) return;
		const lines = renderTrackDashboard(ctx, track, DASHBOARD_WIDTH);
		ctx.ui.setWidget(DASHBOARD_WIDGET, lines, { placement: "belowEditor" });
	});

	// On shutdown, offer a lightweight reflection if the learner is leaving
	// without having run /learn-reflect. Non-blocking; the learner can decline.
	pi.on("session_shutdown", async (_event, ctx) => {
		const track = await getActiveTrack();
		if (!track || !ctx.hasUI) return;
		// Heuristic: if the last session log entry was within the last 30 minutes,
		// they already reflected — don't nag.
		const last = track.last_session_at ? Date.parse(track.last_session_at) : null;
		if (last !== null && Date.now() - last < 30 * 60_000) return;
		// Best-effort prompt; in non-interactive shutdown paths this is a no-op.
		try {
			const reflect = await ctx.ui.confirm(
				"Session ending — 30-second reflection?",
				`Track: ${track.label}\nNext action: ${track.next_action}`,
				{ timeout: 8000 },
			);
			if (reflect) {
				// Reflection is a command and requires the command context; emit a
				// user message that queues /learn-reflect for the next session start.
				pi.sendUserMessage("/learn-reflect", { deliverAs: "followUp" });
			}
		} catch {
			// Shutdown paths may not support confirm — that's fine.
		}
	});
}
