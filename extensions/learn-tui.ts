/**
 * learn-tui — k9s-style read-only TUI for learn-pi state.
 *
 * Opens a full-screen interactive view over ~/.pi/learn. Read-only in v1.
 *
 * Command:
 *   /learn-tui
 *
 * Keys (home):
 *   t tracks · m material · l log · y yaks · r resources · ? help
 *   shift+r refresh · esc/q quit
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { LearnTuiApp } from "../lib/tui/app";
import { loadLearnTuiSnapshot } from "../lib/tui/data";

export default function learnTui(pi: ExtensionAPI) {
	void pi;
	pi.registerCommand("learn-tui", {
		description: "Interactive TUI for learn-pi tracks (read-only)",
		handler: async (_args, ctx) => {
			await run(ctx);
		},
	});
}

async function run(ctx: ExtensionCommandContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("learn-tui requires interactive pi (not rpc/json mode).", "error");
		return;
	}

	let snapshot;
	try {
		snapshot = await loadLearnTuiSnapshot();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`Failed to load learn state: ${msg}`, "error");
		return;
	}

	await ctx.ui.custom((tui, theme, _keybindings, done) => {
		return new LearnTuiApp(tui, theme, done, snapshot);
	});
}
