/**
 * Curated starter track templates — programming + study in one catalog.
 *
 * Templates pre-seed outcome_compass, edge, next_action, material units,
 * resources, and glossary. Tier is beginner | intermediate | advanced
 * (learner-facing). Programming templates also map tier → Depth internally;
 * study templates map tier → StudyDepth.
 *
 * Consumed by `/learn-scaffold` (CLI picker) and the dashboard template API.
 */

import { randomUUID } from "node:crypto";
import type { SkeletonFile } from "./scaffold";
import type {
	Depth,
	Exercise,
	GlossaryEntry,
	MaterialUnit,
	ReferenceMaterial,
	Resource,
	ResourceKind,
	StudyDepth,
	Track,
} from "./track";
import type { DomainFamily } from "./study-plan";

export type TemplateTier = "beginner" | "intermediate" | "advanced";

export interface TemplateUnitSeed {
	id: string;
	title: string;
	difficulty: MaterialUnit["difficulty"];
	exercise?: Omit<Exercise, "last_run_at">;
	reference?: ReferenceMaterial;
	/** Glossary term names (matched when building units). */
	glossary_term_names?: string[];
}

export interface TemplateGlossarySeed {
	term: string;
	definition: string;
	unit_id?: string;
}

export interface TemplateResourceSeed {
	title: string;
	url: string;
	kind?: ResourceKind;
}

interface TrackTemplateBase {
	id: string;
	label: string;
	tier: TemplateTier;
	blurb: string;
	outcome_compass: string;
	suggested_edge: string;
	suggested_next_action: string;
	default_dir_name: string;
	default_session_min: number;
	units: TemplateUnitSeed[];
	resources: TemplateResourceSeed[];
	glossary: TemplateGlossarySeed[];
}

export interface ProgrammingTrackTemplate extends TrackTemplateBase {
	kind: "programming";
	/** Language keys from LANGUAGE_SKELETONS. Empty when recipe-only. */
	languages: string[];
	recipe?: string;
	frameworkByLanguage?: Partial<Record<string, string>>;
	/** Extra or replacement skeleton files (merged after language skeleton). */
	extraSkeletonFiles?: (ctx: TemplateScaffoldContext) => SkeletonFile[];
	verifyCommand?: (ctx: TemplateScaffoldContext) => string;
}

export interface StudyTrackTemplate extends TrackTemplateBase {
	kind: "study";
	domain_family: DomainFamily;
	/** Fixed topic label, or prompt learner when customizableTopic is true. */
	default_topic: string;
	customizableTopic?: boolean;
	topicPlaceholder?: string;
}

export type TrackTemplate = ProgrammingTrackTemplate | StudyTrackTemplate;

export interface TemplateScaffoldContext {
	template: ProgrammingTrackTemplate;
	language: string;
	projectName: string;
	goal: string;
	depth: Depth;
	framework?: string;
}

/** Public metadata returned by GET /api/templates. */
export interface TrackTemplateMeta {
	id: string;
	label: string;
	tier: TemplateTier;
	kind: "programming" | "study";
	blurb: string;
	languages: string[];
	language_labels: Record<string, string>;
	customizable_topic: boolean;
	topic_placeholder?: string;
	recipe: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
	python: "Python",
	rust: "Rust",
	c: "C",
	javascript: "JavaScript (Node)",
	typescript: "TypeScript",
	go: "Go",
};

export function programmingDepthForTier(tier: TemplateTier): Depth {
	switch (tier) {
		case "beginner":
			return "guided";
		case "intermediate":
			return "standard";
		case "advanced":
			return "from-scratch";
	}
}

export function studyDepthForTier(tier: TemplateTier): StudyDepth {
	switch (tier) {
		case "beginner":
			return "appreciation";
		case "intermediate":
			return "practitioner";
		case "advanced":
			return "mastery";
	}
}

const TEMPLATES: TrackTemplate[] = [
	// --- Beginner programming ------------------------------------------------
	{
		id: "python-cli-basics",
		kind: "programming",
		label: "Python CLI basics",
		tier: "beginner",
		blurb: "Variables, control flow, functions, and file I/O via a small command-line program.",
		outcome_compass: "Write small Python scripts that automate everyday tasks from the terminal.",
		suggested_edge: "Run a script that reads stdin and prints formatted output.",
		suggested_next_action: "Open main.py and add input() + print() for a one-line echo program.",
		default_dir_name: "python-cli-basics",
		default_session_min: 45,
		languages: ["python"],
		units: [
			{ id: "u-vars", title: "Variables, print, and input", difficulty: "easy" },
			{ id: "u-flow", title: "Conditionals and loops", difficulty: "easy" },
			{ id: "u-func", title: "Functions and scope", difficulty: "medium" },
			{ id: "u-files", title: "Read and write text files", difficulty: "medium" },
			{ id: "u-project", title: "Mini project: CLI todo or expense tracker", difficulty: "medium" },
		],
		resources: [
			{ title: "Python tutorial (official)", url: "https://docs.python.org/3/tutorial/", kind: "doc" },
			{ title: "Automate the Boring Stuff", url: "https://automatetheboringstuff.com/", kind: "book" },
		],
		glossary: [
			{ term: "variable", definition: "A name bound to a value in memory.", unit_id: "u-vars" },
			{ term: "function", definition: "A reusable block of code invoked by name.", unit_id: "u-func" },
			{ term: "stdin", definition: "Standard input stream — typically the keyboard.", unit_id: "u-vars" },
		],
	},
	{
		id: "js-node-first-steps",
		kind: "programming",
		label: "Node.js first steps",
		tier: "beginner",
		blurb: "Run JavaScript outside the browser; read files and automate a personal workflow.",
		outcome_compass: "Automate a real personal workflow with a Node.js script you run from the terminal.",
		suggested_edge: "Write index.js that reads a JSON file and prints a one-line summary.",
		suggested_next_action: "Create package.json with type module and add index.js with fs.readFileSync.",
		default_dir_name: "js-node-first-steps",
		default_session_min: 45,
		languages: ["javascript"],
		units: [
			{ id: "u-node", title: "Node runtime + npm scripts", difficulty: "easy" },
			{ id: "u-modules", title: "ES modules and imports", difficulty: "easy" },
			{ id: "u-fs", title: "Read files with fs", difficulty: "medium" },
			{ id: "u-json", title: "Parse and summarize JSON", difficulty: "medium" },
			{ id: "u-project", title: "Automate one personal task", difficulty: "medium" },
		],
		resources: [
			{ title: "Node.js docs", url: "https://nodejs.org/docs/latest/api/", kind: "doc" },
			{ title: "MDN JavaScript guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", kind: "doc" },
		],
		glossary: [
			{ term: "npm", definition: "Node package manager — installs libraries and runs scripts.", unit_id: "u-node" },
			{ term: "module", definition: "A file whose exports can be imported by other files.", unit_id: "u-modules" },
			{ term: "JSON", definition: "JavaScript Object Notation — text format for structured data.", unit_id: "u-json" },
		],
	},
	{
		id: "web-fundamentals",
		kind: "programming",
		label: "Web fundamentals",
		tier: "beginner",
		blurb: "HTML structure, CSS layout, and one DOM interaction — no framework.",
		outcome_compass: "Build and open a readable static page with styled sections and one interactive control.",
		suggested_edge: "Create index.html with three styled sections and a button that toggles visible text.",
		suggested_next_action: "Create index.html with a header, main, and footer; link styles.css.",
		default_dir_name: "web-fundamentals",
		default_session_min: 45,
		languages: ["javascript"],
		extraSkeletonFiles: ({ projectName }) => [
			{
				path: "index.html",
				content: [
					`<!DOCTYPE html>`,
					`<html lang="en">`,
					`<head>`,
					`  <meta charset="UTF-8" />`,
					`  <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
					`  <title>${projectName}</title>`,
					`  <link rel="stylesheet" href="styles.css" />`,
					`</head>`,
					`<body>`,
					`  <header><h1>${projectName}</h1></header>`,
					`  <main>`,
					`    <section id="intro"><h2>Intro</h2><p>Edit this page.</p></section>`,
					`    <section id="details"><h2>Details</h2><p>More content here.</p></section>`,
					`    <button id="toggle" type="button">Toggle extra</button>`,
					`    <p id="extra" hidden>Hello from the DOM.</p>`,
					`  </main>`,
					`  <footer><small>learn-pi web fundamentals</small></footer>`,
					`  <script src="main.js"></script>`,
					`</body>`,
					`</html>`,
					``,
				].join("\n"),
			},
			{
				path: "styles.css",
				content: [
					`:root { font-family: system-ui, sans-serif; line-height: 1.5; }`,
					`body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }`,
					`section { margin-bottom: 1.5rem; padding: 1rem; border: 1px solid #ccc; border-radius: 8px; }`,
					`button { padding: 0.4rem 0.8rem; cursor: pointer; }`,
					``,
				].join("\n"),
			},
			{
				path: "main.js",
				content: [
					`const btn = document.getElementById("toggle");`,
					`const extra = document.getElementById("extra");`,
					`btn?.addEventListener("click", () => {`,
					`  extra.hidden = !extra.hidden;`,
					`});`,
					``,
				].join("\n"),
			},
		],
		verifyCommand: () => "test -f index.html && test -f styles.css && test -f main.js",
		units: [
			{ id: "u-html", title: "HTML document structure", difficulty: "easy" },
			{ id: "u-css", title: "CSS typography and layout", difficulty: "easy" },
			{ id: "u-dom", title: "DOM selection and events", difficulty: "medium" },
			{ id: "u-a11y", title: "Semantic tags and basic accessibility", difficulty: "medium" },
			{ id: "u-project", title: "Publishable single-page profile or reading list", difficulty: "medium" },
		],
		resources: [
			{ title: "MDN HTML", url: "https://developer.mozilla.org/en-US/docs/Web/HTML", kind: "doc" },
			{ title: "MDN CSS", url: "https://developer.mozilla.org/en-US/docs/Web/CSS", kind: "doc" },
		],
		glossary: [
			{ term: "DOM", definition: "Document Object Model — the tree of elements the browser exposes to scripts.", unit_id: "u-dom" },
			{ term: "semantic HTML", definition: "Tags that describe meaning (header, main, nav) not just appearance.", unit_id: "u-a11y" },
		],
	},
	// --- Intermediate programming ----------------------------------------------
	{
		id: "rest-api-sqlite",
		kind: "programming",
		label: "REST API + SQLite",
		tier: "intermediate",
		blurb: "HTTP routes, JSON, and persistent storage for one resource.",
		outcome_compass: "Ship a small REST API backed by SQLite that you can curl and test.",
		suggested_edge: "Define one resource model and return JSON from GET /items.",
		suggested_next_action: "Create the items table schema and wire the first GET route.",
		default_dir_name: "rest-api-sqlite",
		default_session_min: 45,
		languages: ["python", "javascript", "typescript"],
		frameworkByLanguage: { python: "fastapi", javascript: "express", typescript: "express" },
		units: [
			{ id: "u-http", title: "HTTP verbs and routing", difficulty: "easy" },
			{ id: "u-json", title: "JSON request and response bodies", difficulty: "medium" },
			{ id: "u-db", title: "SQLite schema and one table", difficulty: "medium" },
			{ id: "u-crud", title: "CRUD for one resource", difficulty: "hard" },
			{ id: "u-test", title: "One integration test against the running server", difficulty: "hard" },
		],
		resources: [
			{ title: "HTTP overview (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", kind: "doc" },
			{ title: "SQLite tutorial", url: "https://www.sqlitetutorial.net/", kind: "doc" },
		],
		glossary: [
			{ term: "REST", definition: "Architectural style using HTTP resources and standard verbs.", unit_id: "u-http" },
			{ term: "CRUD", definition: "Create, Read, Update, Delete — the four basic persistence operations.", unit_id: "u-crud" },
			{ term: "SQLite", definition: "Embedded relational database stored in a single file.", unit_id: "u-db" },
		],
	},
	{
		id: "cli-tool-rust",
		kind: "programming",
		label: "Rust CLI tool",
		tier: "intermediate",
		blurb: "Parse arguments, read files, and emit structured output with clap.",
		outcome_compass: "Build a fast, reliable CLI you would actually use daily.",
		suggested_edge: "Parse --help and one subcommand that reads a file and prints structured output.",
		suggested_next_action: "Add clap with a file path argument and print the file's line count.",
		default_dir_name: "cli-tool-rust",
		default_session_min: 45,
		languages: ["rust"],
		frameworkByLanguage: { rust: "clap" },
		units: [
			{ id: "u-clap", title: "Argument parsing with clap", difficulty: "easy" },
			{ id: "u-io", title: "File I/O and error handling", difficulty: "medium" },
			{ id: "u-fmt", title: "Structured output (JSON or table)", difficulty: "medium" },
			{ id: "u-test", title: "Unit tests for core logic", difficulty: "medium" },
			{ id: "u-project", title: "Ship one useful subcommand", difficulty: "hard" },
		],
		resources: [
			{ title: "The Rust Book — ch 12 I/O", url: "https://doc.rust-lang.org/book/ch12-00-an-io-project.html", kind: "doc" },
			{ title: "clap docs", url: "https://docs.rs/clap/latest/clap/", kind: "doc" },
		],
		glossary: [
			{ term: "Result", definition: "Rust enum for success (Ok) or failure (Err) — explicit error handling.", unit_id: "u-io" },
			{ term: "subcommand", definition: "CLI mode selected after the program name, e.g. mytool count file.txt.", unit_id: "u-clap" },
		],
	},
	{
		id: "dsa-practice-track",
		kind: "programming",
		label: "Data structures & algorithms",
		tier: "intermediate",
		blurb: "Implement core structures and pass a focused test suite.",
		outcome_compass: "Implement stacks, queues, and one search/sort algorithm with tests you trust.",
		suggested_edge: "Implement Stack with push, pop, peek and three unit tests.",
		suggested_next_action: "Open src/stack.py and implement push/pop/peek until pytest passes.",
		default_dir_name: "dsa-practice",
		default_session_min: 45,
		languages: ["python", "typescript"],
		verifyCommand: () => "pytest",
		extraSkeletonFiles: () => [
			{ path: "requirements.txt", content: "pytest>=8.0\n" },
			{ path: "pytest.ini", content: "[pytest]\ntestpaths = tests\n" },
			{ path: "src/__init__.py", content: "" },
			{ path: "tests/__init__.py", content: "" },
			{
				path: "src/stack.py",
				content: 'class Stack:\n    """Implement push, pop, peek, is_empty, and size."""\n\n    pass\n',
			},
			{
				path: "src/queue.py",
				content: 'class Queue:\n    """Implement enqueue, dequeue, peek, is_empty, and size."""\n\n    pass\n',
			},
			{
				path: "src/hashmap.py",
				content: 'class HashMap:\n    """Implement get, set, delete with at least 8 buckets."""\n\n    pass\n',
			},
			{
				path: "src/binary_search.py",
				content: 'def binary_search(sorted_items: list, target) -> int:\n    """Return index of target or -1."""\n\n    raise NotImplementedError\n',
			},
			{
				path: "src/sort.py",
				content: 'def sort_items(items: list) -> list:\n    """Return a new sorted list (merge sort or quicksort)."""\n\n    raise NotImplementedError\n',
			},
		],
		units: [
			{
				id: "u-stack",
				title: "Stack ADT + tests",
				difficulty: "easy",
				glossary_term_names: ["ADT"],
				reference: {
					summary:
						"A **stack** is a Last-In-First-Out (LIFO) abstract data type. Core operations: `push` (add to top), `pop` (remove from top), `peek` (read top without removing). Use a list or linked nodes; `pop`/`peek` on an empty stack should raise an error.",
					sources: [
						{ title: "Visualgo — Stack", url: "https://visualgo.net/en/list" },
						{ title: "Big-O cheat sheet", url: "https://www.bigocheatsheet.com/" },
					],
				},
				exercise: {
					spec: "Implement a `Stack` class in `src/stack.py` with `push`, `pop`, `peek`, `is_empty`, and a `size` property. Raise `IndexError` on `pop`/`peek` when empty.",
					starter_path: "src/stack.py",
					test_path: "tests/test_stack.py",
					test_command: "pytest tests/test_stack.py",
					status: "todo",
				},
			},
			{
				id: "u-queue",
				title: "Queue ADT + tests",
				difficulty: "medium",
				reference: {
					summary:
						"A **queue** is First-In-First-Out (FIFO): `enqueue` at the back, `dequeue` from the front. A circular buffer or linked list both work; avoid O(n) dequeue from a plain Python list if you can.",
					sources: [{ title: "Visualgo — Queue", url: "https://visualgo.net/en/list" }],
				},
				exercise: {
					spec: "Implement a `Queue` class in `src/queue.py` with `enqueue`, `dequeue`, `peek`, `is_empty`, and `size`. Raise `IndexError` on `dequeue`/`peek` when empty.",
					starter_path: "src/queue.py",
					test_path: "tests/test_queue.py",
					test_command: "pytest tests/test_queue.py",
					status: "todo",
				},
			},
			{
				id: "u-hash",
				title: "Hash map / dict usage patterns",
				difficulty: "medium",
				reference: {
					summary:
						"A **hash map** maps keys to values via a hash function and collision handling (chaining or open addressing). Average O(1) get/set when load factor stays reasonable.",
					sources: [{ title: "Visualgo — Hash Table", url: "https://visualgo.net/en/hashtable" }],
				},
				exercise: {
					spec: "Implement a minimal `HashMap` in `src/hashmap.py` with `get`, `set`, and `delete`. Use at least 8 buckets and handle collisions with chaining.",
					starter_path: "src/hashmap.py",
					test_path: "tests/test_hashmap.py",
					test_command: "pytest tests/test_hashmap.py",
					status: "todo",
				},
			},
			{
				id: "u-search",
				title: "Binary search",
				difficulty: "medium",
				reference: {
					summary:
						"**Binary search** requires a sorted collection. Compare the midpoint to the target; discard half each step. Runs in O(log n) time.",
					sources: [{ title: "Visualgo — Binary Search", url: "https://visualgo.net/en/bst" }],
				},
				exercise: {
					spec: "Implement `binary_search(sorted_items, target)` in `src/binary_search.py`. Return the index of `target` or `-1` if absent. Assume `sorted_items` is sorted ascending.",
					starter_path: "src/binary_search.py",
					test_path: "tests/test_binary_search.py",
					test_command: "pytest tests/test_binary_search.py",
					status: "todo",
				},
			},
			{
				id: "u-sort",
				title: "One sort algorithm (merge or quick)",
				difficulty: "hard",
				glossary_term_names: ["Big-O"],
				reference: {
					summary:
						"**Merge sort** divides, sorts halves, merges in O(n log n). **Quicksort** picks a pivot and partitions; average O(n log n), worst O(n²). Both are standard interview implementations.",
					sources: [{ title: "Visualgo — Sorting", url: "https://visualgo.net/en/sorting" }],
				},
				exercise: {
					spec: "Implement `sort_items(items)` in `src/sort.py` using merge sort or quicksort. Return a **new** sorted list; do not mutate the input.",
					starter_path: "src/sort.py",
					test_path: "tests/test_sort.py",
					test_command: "pytest tests/test_sort.py",
					status: "todo",
				},
			},
		],
		resources: [
			{ title: "Big-O cheat sheet", url: "https://www.bigocheatsheet.com/", kind: "doc" },
			{ title: "Visualgo", url: "https://visualgo.net/en", kind: "doc" },
		],
		glossary: [
			{ term: "ADT", definition: "Abstract Data Type — behavior defined by operations, not implementation.", unit_id: "u-stack" },
			{ term: "Big-O", definition: "Upper bound on growth of runtime or space as input size increases.", unit_id: "u-sort" },
		],
	},
	// --- Advanced programming --------------------------------------------------
	{
		id: "webgpu-rust",
		kind: "programming",
		label: "Rust WebGPU",
		tier: "advanced",
		blurb: "wgpu render pipeline — the existing learn-pi recipe track.",
		outcome_compass: "A Rust WebGPU app that could grow into a small game engine.",
		suggested_edge: "Render a triangle via a wgpu render pipeline.",
		suggested_next_action: "Open src/main.rs and follow the wgpu triangle tutorial through adapter + surface setup.",
		default_dir_name: "rust-webgpu",
		default_session_min: 45,
		languages: [],
		recipe: "webgpu-rust",
		units: [
			{ id: "u-window", title: "Window + wgpu instance", difficulty: "medium" },
			{ id: "u-surface", title: "Surface, adapter, device", difficulty: "hard" },
			{ id: "u-pipeline", title: "Render pipeline + shaders", difficulty: "hard" },
			{ id: "u-triangle", title: "Draw a triangle", difficulty: "hard" },
			{ id: "u-texture", title: "Optional: textured quad", difficulty: "hard" },
		],
		resources: [
			{ title: "Learn WGPU", url: "https://sotrh.github.io/learn-wgpu/", kind: "doc" },
			{ title: "wgpu repo", url: "https://github.com/gfx-rs/wgpu", kind: "repo" },
		],
		glossary: [
			{ term: "render pipeline", definition: "GPU configuration chain: shaders, vertex layout, rasterization.", unit_id: "u-pipeline" },
			{ term: "wgpu", definition: "Cross-platform WebGPU implementation in Rust.", unit_id: "u-window" },
		],
	},
	{
		id: "interpreter-mini",
		kind: "programming",
		label: "Mini interpreter",
		tier: "advanced",
		blurb: "Lexer, parser, and evaluator for a tiny expression language.",
		outcome_compass: "Understand how languages execute by building a minimal interpreter yourself.",
		suggested_edge: "Tokenize arithmetic expressions into a stream of tokens.",
		suggested_next_action: "Write a lexer test for '1 + 2 * 3' and implement enough tokenizer to pass it.",
		default_dir_name: "interpreter-mini",
		default_session_min: 60,
		languages: ["python", "rust"],
		units: [
			{ id: "u-lex", title: "Lexer + token types", difficulty: "medium" },
			{ id: "u-parse", title: "Parser → AST", difficulty: "hard" },
			{ id: "u-eval", title: "Tree-walk evaluator", difficulty: "hard" },
			{ id: "u-vars", title: "Variables and assignment", difficulty: "hard" },
			{ id: "u-fn", title: "Functions (optional stretch)", difficulty: "hard" },
		],
		resources: [
			{ title: "Crafting Interpreters (free book)", url: "https://craftinginterpreters.com/", kind: "book" },
		],
		glossary: [
			{ term: "lexer", definition: "Scanner that converts source text into a sequence of tokens.", unit_id: "u-lex" },
			{ term: "AST", definition: "Abstract Syntax Tree — structured representation of parsed code.", unit_id: "u-parse" },
		],
	},
	{
		id: "ml-from-scratch",
		kind: "programming",
		label: "ML from scratch (NumPy)",
		tier: "advanced",
		blurb: "Linear and logistic regression without PyTorch — just NumPy.",
		outcome_compass: "Implement core ML algorithms and watch loss decrease on real data.",
		suggested_edge: "Load a CSV, normalize features, and train linear regression with decreasing loss.",
		suggested_next_action: "Load the dataset with NumPy and plot feature vs target to inspect scale.",
		default_dir_name: "ml-from-scratch",
		default_session_min: 60,
		languages: ["python"],
		frameworkByLanguage: { python: "numpy" },
		units: [
			{ id: "u-data", title: "Load CSV + normalize features", difficulty: "medium" },
			{ id: "u-linear", title: "Linear regression + MSE loss", difficulty: "hard" },
			{ id: "u-grad", title: "Gradient descent loop", difficulty: "hard" },
			{ id: "u-logistic", title: "Logistic regression + accuracy", difficulty: "hard" },
			{ id: "u-eval", title: "Train/test split and evaluation", difficulty: "hard" },
		],
		resources: [
			{ title: "NumPy quickstart", url: "https://numpy.org/doc/stable/user/quickstart.html", kind: "doc" },
			{ title: "Andrew Ng ML notes (Stanford)", url: "https://see.stanford.edu/materials/aimlcs229/transcripts/MachineLearning-Lecture2.pdf", kind: "paper" },
		],
		glossary: [
			{ term: "gradient descent", definition: "Optimization that steps parameters opposite the loss gradient.", unit_id: "u-grad" },
			{ term: "MSE", definition: "Mean Squared Error — average squared difference between prediction and target.", unit_id: "u-linear" },
		],
	},
	// --- Study templates -------------------------------------------------------
	{
		id: "study-music-theory",
		kind: "study",
		label: "Music theory fundamentals",
		tier: "beginner",
		blurb: "Intervals, scales, and diatonic harmony — ear + theory interleaved.",
		outcome_compass: "Hear and name the building blocks of Western music.",
		suggested_edge: "Write out and sing a C major scale; label each interval.",
		suggested_next_action: "Open notes/ and write the C major scale on the staff; sing it once.",
		default_dir_name: "music-theory-notes",
		default_session_min: 45,
		domain_family: "music",
		default_topic: "music theory fundamentals",
		units: [
			{ id: "u-staff", title: "Staff, note names, and the C major scale", difficulty: "easy" },
			{ id: "u-intervals", title: "Intervals up to an octave", difficulty: "medium" },
			{ id: "u-triads", title: "Diatonic triads in a major key", difficulty: "medium" },
			{ id: "u-ear", title: "Identify intervals by ear", difficulty: "medium" },
			{ id: "u-phrase", title: "Write or play a short phrase using I–IV–V", difficulty: "hard" },
		],
		resources: [
			{ title: "musictheory.net", url: "https://www.musictheory.net/", kind: "doc" },
		],
		glossary: [
			{ term: "interval", definition: "Distance between two pitches, measured in semitones or scale degrees.", unit_id: "u-intervals" },
			{ term: "diatonic", definition: "Notes belonging to the key's scale, without chromatic alteration.", unit_id: "u-triads" },
		],
	},
	{
		id: "study-language",
		kind: "study",
		label: "Foreign language (practitioner)",
		tier: "intermediate",
		blurb: "High-frequency vocab, sentence patterns, and early conversation.",
		outcome_compass: "Hold a five-minute conversation on daily topics using what you know.",
		suggested_edge: "Learn 50 high-frequency words and produce 10 original sentences.",
		suggested_next_action: "Create an Anki deck (or paper list) with your first 20 words.",
		default_dir_name: "language-study",
		default_session_min: 30,
		domain_family: "language",
		default_topic: "conversational language",
		customizableTopic: true,
		topicPlaceholder: "e.g. conversational Spanish",
		units: [
			{ id: "u-sounds", title: "Sound inventory and writing system", difficulty: "easy" },
			{ id: "u-vocab", title: "Core 200 high-frequency words", difficulty: "medium" },
			{ id: "u-patterns", title: "Present-tense sentence patterns", difficulty: "medium" },
			{ id: "u-convo", title: "Five-minute conversation using only known material", difficulty: "hard" },
			{ id: "u-tense", title: "Past and future tense; expand to 600 words", difficulty: "hard" },
		],
		resources: [
			{ title: "Anki", url: "https://apps.ankiweb.net/", kind: "doc" },
		],
		glossary: [
			{ term: "spaced repetition", definition: "Review schedule that increases intervals after successful recall.", unit_id: "u-vocab" },
			{ term: "high-frequency words", definition: "Most common words in everyday speech — best ROI for beginners.", unit_id: "u-vocab" },
		],
	},
	{
		id: "study-history",
		kind: "study",
		label: "History (mastery)",
		tier: "advanced",
		blurb: "Primary sources → timeline → defended historical argument.",
		outcome_compass: "Construct and defend a historical claim grounded in primary sources.",
		suggested_edge: "Read one primary source and extract five dated claims.",
		suggested_next_action: "Open notes/ and paste one primary source excerpt with its date and author.",
		default_dir_name: "history-study",
		default_session_min: 45,
		domain_family: "history",
		default_topic: "historical inquiry",
		customizableTopic: true,
		topicPlaceholder: "e.g. the French Revolution",
		units: [
			{ id: "u-source", title: "Read and annotate one primary source", difficulty: "medium" },
			{ id: "u-timeline", title: "Build a dated timeline (10+ events)", difficulty: "medium" },
			{ id: "u-claim", title: "Draft a one-sentence historical claim", difficulty: "hard" },
			{ id: "u-evidence", title: "Map evidence for and against the claim", difficulty: "hard" },
			{ id: "u-essay", title: "Write a short argument essay", difficulty: "hard" },
		],
		resources: [
			{ title: "Library of Congress primary sources", url: "https://www.loc.gov/collections/", kind: "doc" },
		],
		glossary: [
			{ term: "primary source", definition: "Document or artifact from the period under study.", unit_id: "u-source" },
			{ term: "historiography", definition: "How historians interpret and argue about the past.", unit_id: "u-essay" },
		],
	},
];

export function listTrackTemplates(): TrackTemplate[] {
	return TEMPLATES;
}

export function getTrackTemplate(id: string): TrackTemplate | undefined {
	return TEMPLATES.find((t) => t.id === id);
}

export function listTemplatesByTier(tier: TemplateTier): TrackTemplate[] {
	return TEMPLATES.filter((t) => t.tier === tier);
}

export function templateToMeta(t: TrackTemplate): TrackTemplateMeta {
	const languages =
		t.kind === "programming" ? (t.recipe ? [] : t.languages) : [];
	const language_labels: Record<string, string> = {};
	for (const lang of languages) {
		language_labels[lang] = LANGUAGE_LABELS[lang] ?? lang;
	}
	return {
		id: t.id,
		label: t.label,
		tier: t.tier,
		kind: t.kind,
		blurb: t.blurb,
		languages,
		language_labels,
		customizable_topic: t.kind === "study" ? Boolean(t.customizableTopic) : false,
		topic_placeholder: t.kind === "study" ? t.topicPlaceholder : undefined,
		recipe: t.kind === "programming" ? Boolean(t.recipe) : false,
	};
}

export function listTrackTemplateMeta(): TrackTemplateMeta[] {
	return TEMPLATES.map(templateToMeta);
}

export function buildMaterialUnitsFromTemplate(
	template: TrackTemplate,
	glossary: GlossaryEntry[] = buildGlossaryFromTemplate(template),
): MaterialUnit[] {
	const termToId = new Map(glossary.map((g) => [g.term.toLowerCase(), g.id]));
	const units: MaterialUnit[] = [];
	for (let i = 0; i < template.units.length; i++) {
		const seed = template.units[i];
		const glossary_terms = seed.glossary_term_names
			?.map((name) => termToId.get(name.toLowerCase()))
			.filter((id): id is string => Boolean(id));
		const reference = seed.reference
			? { ...seed.reference, glossary_terms: glossary_terms?.length ? glossary_terms : seed.reference.glossary_terms }
			: undefined;
		units.push({
			id: seed.id,
			title: seed.title,
			prerequisites: i > 0 ? [template.units[i - 1].id] : [],
			difficulty: seed.difficulty,
			status: i === 0 ? "active" : "pending",
			exercise: seed.exercise ? { ...seed.exercise } : undefined,
			reference,
		});
	}
	return units;
}

export function buildResourcesFromTemplate(template: TrackTemplate): Resource[] {
	const now = new Date().toISOString();
	return template.resources.map((r) => ({
		id: `res-${randomUUID().slice(0, 8)}`,
		title: r.title,
		url: r.url,
		kind: r.kind,
		added_at: now,
	}));
}

export function buildGlossaryFromTemplate(template: TrackTemplate): GlossaryEntry[] {
	const now = new Date().toISOString();
	return template.glossary.map((g) => ({
		id: `gl-${randomUUID().slice(0, 8)}`,
		term: g.term,
		definition: g.definition,
		unit_id: g.unit_id,
		added_at: now,
	}));
}

/** Partial Track fields seeded from a template (caller adds id, work_dir, etc.). */
export function buildTrackSeedFromTemplate(
	template: TrackTemplate,
	overrides: {
		label: string;
		work_dir: string;
		verify_command?: string | null;
		track_kind?: Track["track_kind"];
		depth?: Depth;
		study_depth?: StudyDepth;
		domain_family?: DomainFamily;
		approach?: string;
		rubric?: string[];
		recommended_stack?: string[];
	},
): Partial<Track> {
	const now = new Date().toISOString();
	const glossary = buildGlossaryFromTemplate(template);
	return {
		label: overrides.label,
		outcome_compass: template.outcome_compass,
		work_dir: overrides.work_dir,
		verify_command: overrides.verify_command ?? null,
		edge: { statement: template.suggested_edge, set_at: now, sessions_at_edge: 0 },
		next_action: template.suggested_next_action,
		next_action_set_at: now,
		edge_suggested: true,
		material_graph: {
			source: `template:${template.id}`,
			units: buildMaterialUnitsFromTemplate(template, glossary),
			revised_at: now,
		},
		resources: buildResourcesFromTemplate(template),
		glossary,
		process_contract: {
			cue: null,
			session_min: template.default_session_min,
			reward: "log + 5min decompression",
		},
		track_kind: overrides.track_kind ?? "programming",
		depth: overrides.depth,
		study_depth: overrides.study_depth,
		domain_family: overrides.domain_family,
		approach: overrides.approach,
		rubric: overrides.rubric,
		recommended_stack: overrides.recommended_stack,
	};
}

export function languageLabel(lang: string): string {
	return LANGUAGE_LABELS[lang] ?? lang;
}
