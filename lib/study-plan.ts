/**
 * Study-plan machinery for the `/learn-study` extension.
 *
 * The programming wizard (`lib/scaffold.ts`) emits a *project skeleton*
 * (Cargo.toml, main.py) and a `verify_command` that's a shell test. The study
 * wizard is the non-coding analog: it emits a *notes workspace* and a
 * *self-assessment rubric* that replaces the compiler as the verify signal.
 *
 * Three pieces:
 *   1. APPROACHES — a curated table keyed by domain family (language, music,
 *      history/humanities, math, science). Bounded + inspectable, the analog
 *      of `LANGUAGE_SKELETONS`. Each entry carries a notes-subfolder name, a
 *      default rubric shape, and a sequencer that turns goal+depth into 3–5
 *      starter `MaterialUnit`s. An LLM-authored approach is the v1.1 escape
 *      hatch for a domain family not in the table (parallel to the programming
 *      wizard's v1.1 agent-authored-skeleton escape hatch).
 *   2. Notes-workspace emitter — README + notes/ + one domain-named practice
 *      folder. The agent reads/writes here during `/learn-start` so study
 *      sessions are grounded (the socratic method needs something concrete to
 *      drill against; an empty dir is the cold-start blank page this package
 *      exists to prevent).
 *   3. Rubric generator — 2–3 self-assessment questions for the current edge,
 *      answered 0–2 (no / partly / yes) during `/learn-reflect`, feeding
 *      stall_counter the same way a failing `cargo test` would. Regenerated
 *      whenever the edge changes.
 *
 * Per DESIGN.md Fork B asterisk (extended): the study wizard is
 * conversational-but-direct, not socratic. `scope-guard` is active during it
 * and the web-search step is capped to one round so "which textbook is best"
 * doesn't become a yak (the classic study-track failure mode).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import type { MaterialUnit, StudyDepth } from "./track";

// --- Domain family table ----------------------------------------------------

export type DomainFamily = "language" | "music" | "history" | "math" | "science";

export interface Approach {
	/** Key used in selects. */
	family: DomainFamily;
	/** Display label. */
	label: string;
	/** Name of the practice subfolder emitted in the notes workspace. */
	practiceFolder: string;
	/** One-line description shown in the wizard. */
	blurb: string;
	/** Recommended interleaved approach (written into the README + Track.approach). */
	approach: string;
	/** Default session length for tracks in this family. */
	defaultSessionMin: number;
	/**
	 * Turn a goal + depth into 3–5 sequenced starter units. Prerequisites chain
	 * forward (unit[i] depends on unit[i-1]) so the sequencer produces a real
	 * linear path, not a bucket.
	 */
	sequenceUnits: (goal: string, depth: StudyDepth) => MaterialUnit[];
	/** Default rubric questions for a fresh edge in this family. */
	rubricShape: (edge: string) => string[];
}

export const APPROACHES: Record<DomainFamily, Approach> = {
	language: {
		family: "language",
		label: "Foreign language",
		practiceFolder: "drills",
		blurb: "Spaced-repetition vocab + grammar drills + conversation practice, interleaved.",
		approach: "Interleave spaced-repetition vocabulary (Anki/physical cards), grammar pattern drills, and conversation/production practice. Don't queue months of vocab before speaking — produce from week one, even badly.",
		defaultSessionMin: 30,
		sequenceUnits: (_goal, depth) => {
			const base = [
				"Phonetics + sound inventory: learn the writing system and produce every sound",
				"Core 200 highest-frequency words (Anki deck, daily reviews)",
				"Present-tense sentence patterns (SVO / case markers / agreement)",
				"First conversation: 5-minute exchange using only what you know",
				"Past + future tense; expand to 600 words",
			];
			if (depth === "appreciation") base.splice(4, 0, "Read a graded reader chapter and summarize in L1");
			if (depth === "mastery") base.push("Idiom + register: read a native essay, rewrite it in your own words");
			return toUnits(base);
		},
		rubricShape: (edge) => [
			`Can you produce the target of "${edge}" without looking it up? (0=no, 1=with hints, 2=yes)`,
			`Can you give one example beyond the drill material? (0=no, 1=one, 2=multiple)`,
			`Could you explain this to a beginner in the target language? (0=no, 1=partly, 2=yes)`,
		],
	},
	music: {
		family: "music",
		label: "Music (theory / ear training / instrument)",
		practiceFolder: "practice",
		blurb: "Ear training + theory text + instrument practice, interleaved.",
		approach: "Interleave ear training (sing/identify intervals), theory text (write out the construct), and instrument practice (play it). Theory without ear training is just labels; ear training without an instrument has no output.",
		defaultSessionMin: 45,
		sequenceUnits: (goal, depth) => {
			const base = [
				`Name every note in the ${goal} domain; map the staff/fretboard/keyboard`,
				"Major scale construction: write out intervals, sing the scale",
				"Intervals: identify by ear up to a fifth, then an octave",
				"Diatonic triads in a major key: build + play I–IV–V",
				"Apply: play or write a short phrase using the above",
			];
			if (depth === "appreciation") base.splice(3, 0, "Listen to 3 pieces and label the scales/chords by ear");
			if (depth === "mastery") base.push("Secondary dominants + modulation: analyze a real tune");
			return toUnits(base);
		},
		rubricShape: (edge) => [
			`Can you perform or write out the target of "${edge}"? (0=no, 1=slowly, 2=fluently)`,
			`Can you identify it by ear when someone else plays it? (0=no, 1=sometimes, 2=reliably)`,
			`Can you connect it to what you learned last week? (0=no, 1=vaguely, 2=clearly)`,
		],
	},
	history: {
		family: "history",
		label: "History / humanities",
		practiceFolder: "essays",
		blurb: "Read → timeline → argue. Source first, synthesis last.",
		approach: "For each unit: read the primary/secondary source, build a timeline of causal events, then write a short argumentative response (one claim, two pieces of evidence). Reading without writing produces the illusion of learning; the essay is the verify.",
		defaultSessionMin: 50,
		sequenceUnits: (goal, depth) => {
			const base = [
				`Orient: map the scope of "${goal}" — geography, actors, time span`,
				"Read one primary source from the period; note what it does and doesn't claim",
				"Build a 10-event causal timeline",
				"Read one secondary source; note where it disagrees with the primary",
				"Write a 300-word argument: one claim, two evidence citations",
			];
			if (depth === "appreciation") base.splice(3, 0, "Listen to a lecture series episode; add 3 events to the timeline");
			if (depth === "mastery") base.push("Historiography: compare two scholars' framings of the same event");
			return toUnits(base);
		},
		rubricShape: (edge) => [
			`Can you state the target of "${edge}" with one piece of evidence? (0=no, 1=one, 2=two+)`,
			`Can you name a source that disagrees with your reading? (0=no, 1=can name it, 2=can state its claim)`,
			`Could you teach this in 2 minutes to someone who hasn't read it? (0=no, 1=partly, 2=yes)`,
		],
	},
	math: {
		family: "math",
		label: "Mathematics",
		practiceFolder: "problems",
		blurb: "Read definition → reproduce proof → do problems. No watching without doing.",
		approach: "For each unit: read the definition, reproduce the proof from memory (not copy), then do 3–5 problems without the solution. Watching a proof without reproducing it is the math equivalent of skimming code without writing any.",
		defaultSessionMin: 50,
		sequenceUnits: (goal, depth) => {
			const base = [
				`Definitions: write out every term in the opening of "${goal}" in your own words`,
				"First theorem: read the proof, then reproduce it from memory",
				"Worked examples: do 3 problems, check answers, redo the ones you missed",
				"Second theorem: same cycle (read → reproduce → problems)",
				"Connect: prove one corollary yourself",
			];
			if (depth === "appreciation") base.splice(3, 0, "Read a historical/motivating note on why the theorem matters");
			if (depth === "mastery") base.push("Find or construct a counterexample to a weakened hypothesis");
			return toUnits(base);
		},
		rubricShape: (edge) => [
			`Can you state the target of "${edge}" precisely? (0=no, 1=vague, 2=precise)`,
			`Can you reproduce the proof/derivation from memory? (0=no, 1=with gaps, 2=clean)`,
			`Can you do a problem that uses it without the worked example? (0=no, 1=slowly, 2=yes)`,
		],
	},
	science: {
		family: "science",
		label: "Science (concept + experiment)",
		practiceFolder: "experiments",
		blurb: "Concept → prediction → observation. Run the experiment, don't just read the result.",
		approach: "For each unit: state the concept, write a prediction, run or simulate the observation, reconcile the gap. Reading 'X causes Y' without testing it produces confident wrong beliefs; the experiment is the verify.",
		defaultSessionMin: 45,
		sequenceUnits: (goal, depth) => {
			const base = [
				`Core concept of "${goal}": write the definition and one everyday example`,
				"First mechanism: state it as a prediction (if A then B)",
				"Run or simulate the observation; record what you actually saw",
				"Reconcile: where did the observation differ from the prediction?",
				"Apply: predict a new case and check it",
			];
			if (depth === "appreciation") base.splice(3, 0, "Watch a demo video; note one thing that surprised you");
			if (depth === "mastery") base.push("Read one paper; identify the key control and why it's necessary");
			return toUnits(base);
		},
		rubricShape: (edge) => [
			`Can you state the target of "${edge}" and a prediction it implies? (0=no, 1=state, 2=predict)`,
			`Did you run an observation and record the actual result? (0=no, 1=partly, 2=yes)`,
			`Can you reconcile a case where reality differed from your prediction? (0=no, 1=vaguely, 2=clearly)`,
		],
	},
};

/** Domain families the wizard can scaffold, in display order. */
export function listDomainFamilies(): DomainFamily[] {
	return ["language", "music", "history", "math", "science"];
}

function toUnits(titles: string[]): MaterialUnit[] {
	const units: MaterialUnit[] = [];
	for (let i = 0; i < titles.length; i++) {
		units.push({
			id: `unit-${randomUUID().slice(0, 8)}`,
			title: titles[i],
			prerequisites: i > 0 ? [units[i - 1].id] : [],
			difficulty: i === 0 ? "easy" : i < 3 ? "medium" : "hard",
			status: i === 0 ? "active" : "pending",
		});
	}
	return units;
}

// --- Notes-workspace emitter ------------------------------------------------

export interface NotesFile {
	path: string;
	content: string;
}

export interface NotesContext {
	topic: string;
	goal: string;
	depth: StudyDepth;
	approach: Approach;
	source?: string;
}

export function buildNotesWorkspace(ctx: NotesContext): NotesFile[] {
	const { topic, goal, depth, approach, source } = ctx;
	const files: NotesFile[] = [];
	files.push({
		path: "README.md",
		content:
			`# ${topic}\n\n` +
			`Scaffolded by \`learn-pi /learn-study\` (study-plan wizard).\n\n` +
			`- Goal: ${goal}\n- Depth: ${depth}\n- Approach: ${approach.label}\n` +
			(source ? `- Primary source: ${source}\n` : "") +
			`\n## How to use this workspace\n\n` +
			`- Track state lives in \`~/.pi/learn/tracks/<id>.json\` — run \`/learn-start\` in pi to re-enter.\n` +
			`- \`notes/\` is for session journals. The agent reads/writes here during \`/learn-start\`.\n` +
			`- \`${approach.practiceFolder}/\` is for drills / problems / experiments / essays (one per domain).\n` +
			`- The current edge + next action are NOT in this file — they're in the Track. Run \`/learn-start\`.\n\n` +
			`## Approach\n\n${approach.approach}\n`,
	});
	files.push({
		path: "notes/.gitkeep",
		content: "",
	});
	files.push({
		path: `${approach.practiceFolder}/.gitkeep`,
		content: "",
	});
	return files;
}

/** Emit a notes workspace into targetDir. Returns the list of written paths. */
export async function emitNotesWorkspace(files: NotesFile[], targetDir: string): Promise<string[]> {
	const written: string[] = [];
	for (const f of files) {
		const dest = join(targetDir, f.path);
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, f.content, "utf8");
		written.push(relative(process.cwd(), dest) || dest);
	}
	return written;
}

// --- Suggested edge + outcome compass + rubric ------------------------------

export function buildStudySuggestedEdge(input: { goal: string; depth: StudyDepth; approach: Approach }): string {
	const { goal, depth, approach } = input;
	switch (depth) {
		case "appreciation":
			return `Orient: map the scope of ${goal} — name the major actors, terms, and time span; write a one-paragraph summary in your own words (in ${approach.practiceFolder}/).`;
		case "practitioner":
			return `Complete the first unit of ${goal}: read the definition, reproduce the core construct, and produce one piece of evidence (in ${approach.practiceFolder}/).`;
		case "mastery":
			return `Produce original work in ${goal}: take the first unit, reproduce the core construct, then construct a counterexample, alternative framing, or original argument (in ${approach.practiceFolder}/).`;
	}
}

export function buildStudyOutcomeCompass(input: { goal: string; depth: StudyDepth; approach: Approach; source?: string }): string {
	const { goal, depth, approach, source } = input;
	return `Learn ${goal} — depth: ${depth}, approach: ${approach.label}${source ? `, primary source: ${source}` : ""}.`;
}

/** Generate a rubric for an edge in a given domain family. */
export function buildRubric(family: DomainFamily, edge: string): string[] {
	return APPROACHES[family].rubricShape(edge);
}
