/**
 * Path helpers for the learn-pi state root.
 *
 * State layout (per DESIGN.md, Fork A — hybrid):
 *   ~/.pi/learn/
 *     tracks/<track-id>.json     — the Track record (source of truth)
 *     index.json                 — { active_track_id, tracks: [{id,label,last_session_at}] }
 *     cue/<track-id>.plist       — generated launchd job (macOS)
 *     scaffold-templates/<recipe>/{skeleton/, manifest.json}
 *     logs/sessions.jsonl        — append-only session log (mirror of Track.log)
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const LEARN_ROOT: string = join(homedir(), ".pi", "learn");
export const TRACKS_DIR: string = join(LEARN_ROOT, "tracks");
export const INDEX_FILE: string = join(LEARN_ROOT, "index.json");
export const CUE_DIR: string = join(LEARN_ROOT, "cue");
export const SCAFFOLD_TEMPLATES_DIR: string = join(LEARN_ROOT, "scaffold-templates");
export const SESSIONS_LOG: string = join(LEARN_ROOT, "logs", "sessions.jsonl");

export function trackFile(trackId: string): string {
	return join(TRACKS_DIR, `${trackId}.json`);
}

export function cueFile(trackId: string): string {
	return join(CUE_DIR, `${trackId}.plist`);
}

export function scaffoldRecipeDir(recipe: string): string {
	return join(SCAFFOLD_TEMPLATES_DIR, recipe);
}

/** Slugify a free-form label into a track id. */
export function slugify(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64) || `track-${Date.now().toString(36)}`;
}

/**
 * Normalize a learner-entered goal/topic so the wizard's templated outputs
 * (compass, suggested edge, README heading, Track label, web-search query)
 * read naturally. Strips leading intent phrasings the learner tends to type
 * ("I want to learn X", "learn X", "how to X", "I'd like to learn X",
 * "I need to learn X") without altering the topic itself. Whitespace is
 * collapsed; trailing punctuation is trimmed.
 *
 * The normalized form replaces the raw input everywhere downstream — including
 * the Track `label` — so `/learn-status` reads "context engineering" rather
 * than "I want to learn context engineering". Returns the input unchanged
 * (after whitespace collapse) if no leading phrase matches, so topics like
 * "machine learning fundamentals" pass through untouched.
 */
export function normalizeGoal(input: string): string {
	const collapsed = input.trim().replace(/\s+/g, " ");
	// Order matters: longer prefixes first so "i want to learn" wins over "i want to".
	const prefixes = [
		"i want to learn",
		"i want to",
		"i'd like to learn",
		"i'd like to",
		"i need to learn",
		"i need to",
		"i have to learn",
		"i have to",
		"learn",      // bare leading "learn X"
		"how do i learn",
		"how do i",
		"how to learn",
		"how to",
		"teach me",
		"help me learn",
		"help me",
	];
	const lower = collapsed.toLowerCase();
	for (const p of prefixes) {
		if (lower.startsWith(p)) {
			const after = collapsed.slice(p.length).replace(/^[\s,.;:!?]+/, "").replace(/\s+$/, "");
			if (after) return after;
		}
	}
	return collapsed.replace(/[.;:!?]+$/, "");
}
