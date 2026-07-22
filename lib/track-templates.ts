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
		verifyCommand: () => "pytest -q",
		extraSkeletonFiles: () => [
			{ path: "requirements.txt", content: "pytest>=8.0\n" },
			{ path: "pytest.ini", content: "[pytest]\ntestpaths = tests\n" },
			{ path: "src/__init__.py", content: "" },
			{ path: "tests/__init__.py", content: "" },
			{
				path: "src/echo.py",
				content: 'def echo(line: str) -> str:\n    """Return the line unchanged."""\n\n    raise NotImplementedError\n',
			},
			{
				path: "src/counter.py",
				content: 'def count_lines(text: str) -> int:\n    """Return the number of newline-terminated lines in text."""\n\n    raise NotImplementedError\n',
			},
			{
				path: "src/stats.py",
				content: 'def summarize(numbers: list) -> dict:\n    """Return {"count", "total", "average"} for a list of numbers. Empty list -> average 0."""\n\n    raise NotImplementedError\n',
			},
			{
				path: "src/fileio.py",
				content: 'def read_lines(path: str) -> list:\n    """Return file contents as a list of lines without trailing newlines."""\n\n    raise NotImplementedError\n\n\ndef write_lines(path: str, lines: list) -> None:\n    """Write lines to path, each terminated by a newline."""\n\n    raise NotImplementedError\n',
			},
			{
				path: "src/cli.py",
				content: 'def parse_args(argv: list) -> dict:\n    """Parse argv into {"command", "args"}. First token is command, rest are args."""\n\n    raise NotImplementedError\n',
			},
		],
		units: [
			{
				id: "u-vars",
				title: "Variables, print, and input",
				difficulty: "easy",
				glossary_term_names: ["variable", "stdin"],
				reference: {
					summary:
						"**Variables** bind names to values. `input()` reads a line from stdin (strips the trailing newline); `print()` writes to stdout. Python is dynamically typed — a name can be rebound to any type. Use f-strings (`f\"x={x}\"`) for formatted output.",
					sources: [
						{ title: "Python tutorial — input/output", url: "https://docs.python.org/3/tutorial/inputoutput.html" },
					],
				},
				exercise: {
					spec: "Implement `echo(line)` in `src/echo.py` that returns its argument unchanged. Then write `src/main.py` so `python -m src` reads one line from stdin and prints `echo(line)`.",
					starter_path: "src/echo.py",
					test_path: "tests/test_echo.py",
					test_command: "pytest tests/test_echo.py",
					status: "todo",
				},
			},
			{
				id: "u-flow",
				title: "Conditionals and loops",
				difficulty: "easy",
				reference: {
					summary:
						"`if`/`elif`/`else` branch on truthiness. `for x in iterable` loops; `while cond` loops until false. `break`/`continue` control flow. Strings are iterables of characters; `text.splitlines()` splits on newlines.",
					sources: [
						{ title: "Python tutorial — control flow", url: "https://docs.python.org/3/tutorial/controlflow.html" },
					],
				},
				exercise: {
					spec: "Implement `count_lines(text)` in `src/counter.py` returning the number of newline-terminated lines (`\"\"` → 0, `\"a\"` → 0, `\"a\\n\"` → 1, `\"a\\nb\\n\"` → 2). Use a loop, not `str.count`.",
					starter_path: "src/counter.py",
					test_path: "tests/test_counter.py",
					test_command: "pytest tests/test_counter.py",
					status: "todo",
				},
			},
			{
				id: "u-func",
				title: "Functions and scope",
				difficulty: "medium",
				glossary_term_names: ["function"],
				reference: {
					summary:
						"`def name(params):` defines a function. Parameters are pass-by-reference-to-object (mutation is visible; rebinding is not). Names defined inside a function are local unless declared `global`/`nonlocal`. A `return` with no value yields `None`.",
					sources: [
						{ title: "Python tutorial — functions", url: "https://docs.python.org/3/tutorial/controlflow.html#defining-functions" },
					],
				},
				exercise: {
					spec: "Implement `summarize(numbers)` in `src/stats.py` returning `{\"count\", \"total\", \"average\"}`. Empty list → `count=0`, `total=0`, `average=0`. Average is the float mean.",
					starter_path: "src/stats.py",
					test_path: "tests/test_stats.py",
					test_command: "pytest tests/test_stats.py",
					status: "todo",
				},
			},
			{
				id: "u-files",
				title: "Read and write text files",
				difficulty: "medium",
				reference: {
					summary:
						"`open(path, \"r\")` / `\"w\"` handle text files; use `with open(...) as f:` to auto-close. `f.read()`, `f.readlines()`, `f.writelines()` are the primitives. `pathlib.Path` is the modern path API. Always close via `with`.",
					sources: [
						{ title: "Python tutorial — file I/O", url: "https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files" },
					],
				},
				exercise: {
					spec: "Implement `read_lines(path)` and `write_lines(path, lines)` in `src/fileio.py`. `read_lines` returns lines without trailing newlines. `write_lines` writes each line followed by `\\n`.",
					starter_path: "src/fileio.py",
					test_path: "tests/test_fileio.py",
					test_command: "pytest tests/test_fileio.py",
					status: "todo",
				},
			},
			{
				id: "u-project",
				title: "Mini project: CLI todo or expense tracker",
				difficulty: "medium",
				reference: {
					summary:
						"A CLI reads `sys.argv`, dispatches on the first token (the command), and persists state to a text or JSON file. Combine the prior units: parse args, loop over records, read/write the store file. Keep the store format simple (one record per line, or JSON).",
					sources: [
						{ title: "Automate the Boring Stuff — chapter on files", url: "https://automatetheboringstuff.com/2e/chapter9/" },
					],
				},
				exercise: {
					spec: "Implement `parse_args(argv)` in `src/cli.py` returning `{\"command\", \"args\"}` (first token is command, rest are args). Then build `src/main.py` into a tiny todo CLI: `add <text>` appends to `todos.txt`, `list` prints numbered lines, `done <n>` removes line n. Tests cover `parse_args`; the CLI itself is verified by running it.",
					starter_path: "src/cli.py",
					test_path: "tests/test_cli.py",
					test_command: "pytest tests/test_cli.py",
					status: "todo",
				},
			},
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
		verifyCommand: () => "node --test",
		extraSkeletonFiles: () => [
			{
				path: "src/echo.js",
				content:
					'// Re-export a function the tests can import. Implement the body.\n' +
					'export function echo(line) {\n  // Return the line unchanged.\n  throw new Error("not implemented");\n}\n',
			},
			{
				path: "src/counter.js",
				content:
					'export function countLines(text) {\n  // Return the number of newline-terminated lines.\n  throw new Error("not implemented");\n}\n',
			},
			{
				path: "src/summary.js",
				content:
					'import { readFileSync } from "node:fs";\n\n' +
					'export function summarizeFile(path) {\n  // Read the file at path and return { bytes, lines }.\n  // lines = number of newline-terminated lines.\n  throw new Error("not implemented");\n}\n',
			},
			{
				path: "src/jsonSummary.js",
				content:
					'export function summarizeJson(jsonText) {\n  // Parse jsonText and return a one-line summary string:\n  // "<keyCount> keys, <arrayLen> array items" depending on top-level type.\n  throw new Error("not implemented");\n}\n',
			},
			{
				path: "src/task.js",
				content:
					'export function runTask(argv) {\n  // argv is process.argv.slice(2). Return a string describing what happened.\n  throw new Error("not implemented");\n}\n',
			},
		],
		units: [
			{
				id: "u-node",
				title: "Node runtime + npm scripts",
				difficulty: "easy",
				glossary_term_names: ["npm"],
				reference: {
					summary:
						"Node.js runs JavaScript outside the browser. `node file.js` executes a script; `package.json` `scripts` define runnable tasks (`npm test`, `npm start`). `process.argv` holds command-line args. `console.log` writes to stdout.",
					sources: [
						{ title: "Node.js — getting started", url: "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs" },
					],
				},
				exercise: {
					spec: "Implement `echo(line)` in `src/echo.js` returning its argument unchanged. Add `src/main.js` that reads `process.argv[2]` (or a stdin line) and prints `echo(...)`.",
					starter_path: "src/echo.js",
					test_path: "tests/echo.test.js",
					test_command: "node --test tests/echo.test.js",
					status: "todo",
				},
			},
			{
				id: "u-modules",
				title: "ES modules and imports",
				difficulty: "easy",
				glossary_term_names: ["module"],
				reference: {
					summary:
						"With `\"type\": \"module\"` in package.json, `.js` files are ES modules. `export function foo() {}` exports; `import { foo } from \"./mod.js\"` imports. Paths must include the extension (`.js`) and start with `./` for relative imports.",
					sources: [
						{ title: "MDN — JavaScript modules", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules" },
					],
				},
				exercise: {
					spec: "Implement `countLines(text)` in `src/counter.js` returning the count of newline-terminated lines. Import it from `tests/counter.test.js` using a relative `./` path with the `.js` extension.",
					starter_path: "src/counter.js",
					test_path: "tests/counter.test.js",
					test_command: "node --test tests/counter.test.js",
					status: "todo",
				},
			},
			{
				id: "u-fs",
				title: "Read files with fs",
				difficulty: "medium",
				reference: {
					summary:
						"`import { readFileSync } from \"node:fs\"` reads a file synchronously into a string or Buffer. `readFileSync(path, \"utf8\")` returns a string. `fs.statSync(path).size` gives byte length. Always pass an encoding for text.",
					sources: [
						{ title: "Node.js — fs module", url: "https://nodejs.org/api/fs.html" },
					],
				},
				exercise: {
					spec: "Implement `summarizeFile(path)` in `src/summary.js` returning `{ bytes, lines }` where `bytes` is the file size and `lines` is the count of newline-terminated lines. Use `readFileSync` with `\"utf8\"`.",
					starter_path: "src/summary.js",
					test_path: "tests/summary.test.js",
					test_command: "node --test tests/summary.test.js",
					status: "todo",
				},
			},
			{
				id: "u-json",
				title: "Parse and summarize JSON",
				difficulty: "medium",
				glossary_term_names: ["JSON"],
				reference: {
					summary:
						"`JSON.parse(text)` parses JSON into JS values; throws on invalid input. The top-level value is an object, array, or primitive. `Object.keys(obj).length` counts keys; `Array.isArray(x)` distinguishes arrays from objects.",
					sources: [
						{ title: "MDN — JSON", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON" },
					],
				},
				exercise: {
					spec: "Implement `summarizeJson(jsonText)` in `src/jsonSummary.js` returning a one-line summary: for an object `\"<n> keys\"`, for an array `\"<n> array items\"`, for a primitive `\"primitive\"`. Throw on invalid JSON.",
					starter_path: "src/jsonSummary.js",
					test_path: "tests/jsonSummary.test.js",
					test_command: "node --test tests/jsonSummary.test.js",
					status: "todo",
				},
			},
			{
				id: "u-project",
				title: "Automate one personal task",
				difficulty: "medium",
				reference: {
					summary:
						"Combine the prior units: parse `process.argv`, read a file, summarize, print. A personal automation script is just `runTask(argv)` wired to `console.log`. Keep it under 50 lines.",
					sources: [
						{ title: "Node.js — command-line scripts", url: "https://nodejs.org/en/learn/command-line/run-node-from-the-command-line" },
					],
				},
				exercise: {
					spec: "Implement `runTask(argv)` in `src/task.js` that takes `argv = process.argv.slice(2)` and returns a string. Behavior: if `argv[0] === \"summary\"` and `argv[1]` is a path, return the `summarizeFile` one-liner; if `argv[0] === \"json\"`, return the `summarizeJson` result for `argv[1]`; otherwise return `\"unknown command\"`.",
					starter_path: "src/task.js",
					test_path: "tests/task.test.js",
					test_command: "node --test tests/task.test.js",
					status: "todo",
				},
			},
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
			{
				path: "tests/html.test.js",
				content: [
					`import { readFileSync } from "node:fs";`,
					`import { test } from "node:test";`,
					`import assert from "node:assert/strict";`,
					``,
					`const html = () => readFileSync("index.html", "utf8");`,
					``,
					`test("index.html has a <header>, <main>, and <footer>", () => {`,
					`  const h = html();`,
					`  assert.match(h, /<header[\\s>]/);`,
					`  assert.match(h, /<main[\\s>]/);`,
					`  assert.match(h, /<footer[\\s>]/);`,
					`});`,
					``,
					`test("index.html links styles.css and main.js", () => {`,
					`  const h = html();`,
					`  assert.match(h, /href="styles\\.css"/);`,
					`  assert.match(h, /src="main\\.js"/);`,
					`});`,
					``,
				].join("\n"),
			},
			{
				path: "tests/css.test.js",
				content: [
					`import { readFileSync } from "node:fs";`,
					`import { test } from "node:test";`,
					`import assert from "node:assert/strict";`,
					``,
					`const css = () => readFileSync("styles.css", "utf8");`,
					``,
					`test("styles.css sets a font-family and body max-width", () => {`,
					`  const c = css();`,
					`  assert.match(c, /font-family\\s*:/);`,
					`  assert.match(c, /body\\s*\\{[^}]*max-width\\s*:/);`,
					`});`,
					``,
				].join("\n"),
			},
			{
				path: "tests/dom.test.js",
				content: [
					`import { readFileSync } from "node:fs";`,
					`import { test } from "node:test";`,
					`import assert from "node:assert/strict";`,
					``,
					`const js = () => readFileSync("main.js", "utf8");`,
					``,
					`test("main.js selects #toggle and #extra by id", () => {`,
					`  const j = js();`,
					`  assert.match(j, /getElementById\\(["'\`]toggle["'\`]/);`,
					`  assert.match(j, /getElementById\\(["'\`]extra["'\`]/);`,
					`});`,
					``,
					`test("main.js attaches a click listener", () => {`,
					`  assert.match(js(), /addEventListener\\(["'\`]click["'\`]/);`,
					`});`,
					``,
				].join("\n"),
			},
			{
				path: "tests/a11y.test.js",
				content: [
					`import { readFileSync } from "node:fs";`,
					`import { test } from "node:test";`,
					`import assert from "node:assert/strict";`,
					``,
					`const html = () => readFileSync("index.html", "utf8");`,
					``,
					`test("every <button> has visible text", () => {`,
					`  const h = html();`,
					`  const buttons = [...h.matchAll(/<button[^>]*>(.*?)<\\/button>/gs)];`,
					`  assert.ok(buttons.length > 0, "expected at least one button");`,
					`  for (const b of buttons) assert.ok(b[1].trim(), "button has no text");`,
					`});`,
					``,
					`test("page uses at least one semantic landmark (main, header, or nav)", () => {`,
					`  const h = html();`,
					`  assert.ok(/<(main|header|nav)[\\s>]/.test(h));`,
					`});`,
					``,
				].join("\n"),
			},
			{
				path: "tests/project.test.js",
				content: [
					`import { readFileSync, existsSync } from "node:fs";`,
					`import { test } from "node:test";`,
					`import assert from "node:assert/strict";`,
					``,
					`test("index.html has at least three <section> blocks", () => {`,
					`  const h = readFileSync("index.html", "utf8");`,
					`  const sections = h.match(/<section[\\s>]/g) ?? [];`,
					`  assert.ok(sections.length >= 3, \`found \${sections.length} sections\`);`,
					`});`,
					``,
					`test("styles.css and main.js exist", () => {`,
					`  assert.ok(existsSync("styles.css"));`,
					`  assert.ok(existsSync("main.js"));`,
					`});`,
					``,
				].join("\n"),
			},
		],
		verifyCommand: () => "node --test tests/",
		units: [
			{
				id: "u-html",
				title: "HTML document structure",
				difficulty: "easy",
				reference: {
					summary:
						"An HTML5 document starts with `<!DOCTYPE html>`, then `<html>`, `<head>` (metadata, `<title>`, stylesheet links), and `<body>`. Semantic landmarks — `<header>`, `<main>`, `<footer>`, `<nav>` — describe page regions to assistive tech and search engines.",
					sources: [
						{ title: "MDN — HTML basics", url: "https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/HTML_basics" },
					],
				},
				exercise: {
					spec: "Edit `index.html` so it has a `<header>`, `<main>` containing at least two `<section>` blocks, and a `<footer>`. Link `styles.css` in `<head>` and `main.js` before `</body>`. `tests/html.test.js` must pass.",
					starter_path: "index.html",
					test_path: "tests/html.test.js",
					test_command: "node --test tests/html.test.js",
					status: "todo",
				},
			},
			{
				id: "u-css",
				title: "CSS typography and layout",
				difficulty: "easy",
				reference: {
					summary:
						"CSS selects elements via selectors (`body`, `.class`, `#id`) and sets properties. `font-family` controls typeface; `max-width` + `margin: auto` centers a column; `padding`/`margin` space content. The cascade: later and more-specific rules win.",
					sources: [
						{ title: "MDN — CSS basics", url: "https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/CSS_basics" },
					],
				},
				exercise: {
					spec: "Edit `styles.css` to set a `font-family` on `:root`/`body` and a `max-width` on `body` (centered with `margin: 0 auto`). Style `section` blocks with padding and a border. `tests/css.test.js` must pass.",
					starter_path: "styles.css",
					test_path: "tests/css.test.js",
					test_command: "node --test tests/css.test.js",
					status: "todo",
				},
			},
			{
				id: "u-dom",
				title: "DOM selection and events",
				difficulty: "medium",
				glossary_term_names: ["DOM"],
				reference: {
					summary:
						"`document.getElementById(\"id\")` returns an element (or null). `el.addEventListener(\"click\", fn)` runs `fn` on click. Toggle state by flipping a property (`el.hidden = !el.hidden`) or a class (`classList.toggle`).",
					sources: [
						{ title: "MDN — events", url: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events" },
					],
				},
				exercise: {
					spec: "Edit `main.js` so it selects `#toggle` and `#extra` by id and attaches a click listener that flips `extra.hidden`. `tests/dom.test.js` must pass.",
					starter_path: "main.js",
					test_path: "tests/dom.test.js",
					test_command: "node --test tests/dom.test.js",
					status: "todo",
				},
			},
			{
				id: "u-a11y",
				title: "Semantic tags and basic accessibility",
				difficulty: "medium",
				glossary_term_names: ["semantic HTML"],
				reference: {
					summary:
						"Accessibility starts with semantic HTML: `<button>` (not `<div onclick>`), `<nav>`, `<main>`, descriptive link text. Every interactive element needs a text label. `hidden` hides content from screen readers; `aria-label` adds a name when visible text is absent.",
					sources: [
						{ title: "MDN — accessibility", url: "https://developer.mozilla.org/en-US/docs/Learn/Accessibility" },
					],
				},
				exercise: {
					spec: "Ensure every `<button>` in `index.html` has visible text content and the page uses at least one semantic landmark. Add an `<aria-label>` to the toggle button if its text is ambiguous. `tests/a11y.test.js` must pass.",
					starter_path: "index.html",
					test_path: "tests/a11y.test.js",
					test_command: "node --test tests/a11y.test.js",
					status: "todo",
				},
			},
			{
				id: "u-project",
				title: "Publishable single-page profile or reading list",
				difficulty: "medium",
				reference: {
					summary:
						"A publishable single page combines structure, style, and one interaction. Three `<section>` blocks minimum (e.g. intro, list, contact). Open the file directly in a browser to verify visually; the test asserts the structural floor.",
					sources: [
						{ title: "MDN — getting started with the web", url: "https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web" },
					],
				},
				exercise: {
					spec: "Expand `index.html` into a personal profile or reading list with at least three `<section>` blocks, styled per `styles.css`, with the toggle interaction working. `tests/project.test.js` must pass and the page must open cleanly in a browser.",
					starter_path: "index.html",
					test_path: "tests/project.test.js",
					test_command: "node --test tests/project.test.js",
					status: "todo",
				},
			},
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
		// NOTE: exercise paths/commands below are authored against python+fastapi
		// (the primary language). JS/TS learners get the same specs — the behavior
		// is language-agnostic; only the test_command path differs. Same convention
		// as dsa-practice-track. Multi-language per-exercise commands are a known gap.
		verifyCommand: () => "pytest -q",
		extraSkeletonFiles: () => [
			{ path: "requirements.txt", content: "fastapi\nuvicorn\npytest\nhttpx\n" },
			{ path: "pytest.ini", content: "[pytest]\ntestpaths = tests\n" },
			{ path: "app/__init__.py", content: "" },
			{ path: "tests/__init__.py", content: "" },
			{
				path: "app/main.py",
				content:
					'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/health")\ndef health():\n    """Return {"status": "ok"} — implement this first."""\n    raise NotImplementedError\n',
			},
			{
				path: "app/items.py",
				content:
					'from fastapi import APIRouter\n\nrouter = APIRouter(prefix="/items")\n\n\n@router.get("/")\ndef list_items():\n    """Return a JSON list of items (empty list for now)."""\n    raise NotImplementedError\n',
			},
			{
				path: "app/database.py",
				content:
					'import sqlite3\n\nDB_PATH = "items.db"\n\n\ndef get_connection():\n    """Return a sqlite3 connection to DB_PATH."""\n    raise NotImplementedError\n\n\ndef init_schema():\n    """Create the items table if it does not exist."""\n    raise NotImplementedError\n',
			},
			{
				path: "app/crud.py",
				content:
					'from .database import get_connection\n\n\ndef create_item(title: str) -> dict:\n    raise NotImplementedError\n\n\ndef list_items() -> list:\n    raise NotImplementedError\n\n\ndef get_item(item_id: int) -> dict | None:\n    raise NotImplementedError\n\n\ndef update_item(item_id: int, title: str) -> dict | None:\n    raise NotImplementedError\n\n\ndef delete_item(item_id: int) -> bool:\n    raise NotImplementedError\n',
			},
		],
		units: [
			{
				id: "u-http",
				title: "HTTP verbs and routing",
				difficulty: "easy",
				glossary_term_names: ["REST"],
				reference: {
					summary:
						"HTTP verbs map to actions: `GET` (read), `POST` (create), `PUT`/`PATCH` (update), `DELETE`. A router groups routes under a prefix (`/items`). FastAPI: `@app.get(\"/path\")`, `@app.post(...)`. The handler's return value is JSON-serialized automatically.",
					sources: [
						{ title: "FastAPI — first steps", url: "https://fastapi.tiangolo.com/tutorial/first-steps/" },
						{ title: "MDN — HTTP overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview" },
					],
				},
				exercise: {
					spec: "Implement `GET /health` in `app/main.py` returning `{\"status\": \"ok\"}`. Run `uvicorn app.main:app --reload` and `curl localhost:8000/health` to verify. `tests/test_health.py` (you write it) should hit the route via FastAPI's TestClient and assert the JSON.",
					starter_path: "app/main.py",
					test_path: "tests/test_health.py",
					test_command: "pytest tests/test_health.py",
					status: "todo",
				},
			},
			{
				id: "u-json",
				title: "JSON request and response bodies",
				difficulty: "medium",
				reference: {
					summary:
						"FastAPI auto-serializes return values to JSON. To accept a body, declare a Pydantic `BaseModel` and type the handler param: `def create(item: ItemCreate)`. `ItemCreate` validates the body and rejects bad input with a 422 automatically.",
					sources: [
						{ title: "FastAPI — request body", url: "https://fastapi.tiangolo.com/tutorial/body/" },
					],
				},
				exercise: {
					spec: "Add an `ItemCreate` Pydantic model with a `title: str` field to `app/items.py`. Implement `POST /items` accepting an `ItemCreate` body and returning `{\"id\": 1, \"title\": ...}` (in-memory is fine for this unit). `tests/test_items.py` should POST a JSON body and assert the response.",
					starter_path: "app/items.py",
					test_path: "tests/test_items.py",
					test_command: "pytest tests/test_items.py",
					status: "todo",
				},
			},
			{
				id: "u-db",
				title: "SQLite schema and one table",
				difficulty: "medium",
				glossary_term_names: ["SQLite"],
				reference: {
					summary:
						"SQLite stores a whole database in one file. `sqlite3.connect(path)` opens a connection; `conn.execute(\"CREATE TABLE ...\")` runs DDL. Use `IF NOT EXISTS` so re-running is safe. `row_factory = sqlite3.Row` gives dict-like rows.",
					sources: [
						{ title: "SQLite — CREATE TABLE", url: "https://www.sqlitetutorial.net/sqlite-create-table/" },
					],
				},
				exercise: {
					spec: "Implement `get_connection()` and `init_schema()` in `app/database.py`. The schema: `items(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)`. `tests/test_database.py` should call `init_schema()` on a temp DB and assert the table exists.",
					starter_path: "app/database.py",
					test_path: "tests/test_database.py",
					test_command: "pytest tests/test_database.py",
					status: "todo",
				},
			},
			{
				id: "u-crud",
				title: "CRUD for one resource",
				difficulty: "hard",
				glossary_term_names: ["CRUD"],
				reference: {
					summary:
						"CRUD = Create, Read, Update, Delete. Wire `app/crud.py` functions to the router in `app/items.py`: `POST /items` (create), `GET /items` (list), `GET /items/{id}` (read), `PUT /items/{id}` (update), `DELETE /items/{id}`. Return 404 when an id is missing.",
					sources: [
						{ title: "FastAPI — path parameters", url: "https://fastapi.tiangolo.com/tutorial/path-params/" },
					],
				},
				exercise: {
					spec: "Implement all five `crud.py` functions and wire them to the `/items` router. Use `init_schema()` at app startup. `tests/test_crud.py` should create, list, get, update, and delete an item end-to-end via TestClient.",
					starter_path: "app/crud.py",
					test_path: "tests/test_crud.py",
					test_command: "pytest tests/test_crud.py",
					status: "todo",
				},
			},
			{
				id: "u-test",
				title: "One integration test against the running server",
				difficulty: "hard",
				reference: {
					summary:
						"An integration test exercises the whole stack: router → DB → response. FastAPI's `TestClient` (from `starlette.testclient`, wrapped by `httpx`) lets you call the app in-process without binding a port. Reset the DB between tests so runs are independent.",
					sources: [
						{ title: "FastAPI — testing", url: "https://fastapi.tiangolo.com/tutorial/testing/" },
					],
				},
				exercise: {
					spec: "Write `tests/test_integration.py` covering the full CRUD flow on a fresh temp DB: create an item, list it, update its title, delete it, then assert `GET /items/{id}` returns 404. Run with `pytest tests/test_integration.py`.",
					starter_path: "tests/test_integration.py",
					test_path: "tests/test_integration.py",
					test_command: "pytest tests/test_integration.py",
					status: "todo",
				},
			},
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
		verifyCommand: () => "cargo test",
		extraSkeletonFiles: () => [
			{
				path: "src/lib.rs",
				content: [
					`//! Library crate — unit-testable logic lives here so \`cargo test\` works.`,
					`//! The binary (src/main.rs) calls into these functions.`,
					``,
					`/// Count the number of newline-terminated lines in a string.`,
					`pub fn count_lines(text: &str) -> usize {`,
					`    todo!("implement: iterate bytes, count '\\n'")`,
					`}`,
					``,
					`/// Format a key/value pair as "key: value".`,
					`pub fn format_kv(key: &str, value: &str) -> String {`,
					`    todo!("implement")`,
					`}`,
				].join("\n") + "\n",
			},
			{
				path: "src/cli.rs",
				content: [
					`//! CLI argument definitions (clap derive).`,
					`//! Run \`cargo add clap --features derive\` before using this.`,
					``,
					`use clap::{Parser, Subcommand};`,
					``,
					`#[derive(Debug, Parser)]`,
					`#[command(name = "mytool", about = "A small CLI you will grow.")]`,
					`pub struct Cli {`,
					`    #[command(subcommand)]`,
					`    pub command: Commands,`,
					`}`,
					``,
					`#[derive(Debug, Subcommand)]`,
					`pub enum Commands {`,
					`    /// Count lines in a file.`,
					`    Count { path: String },`,
					`    /// Print a key/value pair.`,
					`    Kv { key: String, value: String },`,
					`}`,
				].join("\n") + "\n",
			},
			{
				path: "src/io.rs",
				content: [
					`use std::fs;`,
					`use std::io;`,
					``,
					`/// Read a file to a string, returning an io::Error on failure.`,
					`pub fn read_to_string(path: &str) -> io::Result<String> {`,
					`    fs::read_to_string(path)`,
					`}`,
					``,
					`/// Write a string to a file, returning an io::Error on failure.`,
					`pub fn write_string(path: &str, contents: &str) -> io::Result<()> {`,
					`    fs::write(path, contents)`,
					`}`,
				].join("\n") + "\n",
			},
			{
				path: "src/fmt.rs",
				content: [
					`/// Format a list of (key, value) pairs as JSON: [{"key":..,"value":..}, ...].`,
					`/// Run \`cargo add serde_json\` before using this.`,
					`pub fn to_json(pairs: &[(&str, &str)]) -> String {`,
					`    todo!("implement with serde_json::to_string")`,
					`}`,
				].join("\n") + "\n",
			},
		],
		units: [
			{
				id: "u-clap",
				title: "Argument parsing with clap",
				difficulty: "easy",
				glossary_term_names: ["subcommand"],
				reference: {
					summary:
						"`clap` (derive feature) parses argv into a typed struct. `#[derive(Parser)] struct Cli { #[command(subcommand)] command: Commands }` gives you `mytool count <path>`. `cargo add clap --features derive` enables derive. `Cli::parse()` reads `std::env::args`.",
					sources: [
						{ title: "clap — derive tutorial", url: "https://docs.rs/clap/latest/clap/_derive/_tutorial/index.html" },
					],
				},
				exercise: {
					spec: "Run `cargo add clap --features derive`. Use `src/cli.rs` (provided) and wire `src/main.rs` to call `Cli::parse()` and print the parsed command. `cargo run -- count README.md` should print `Count { path: \"README.md\" }` (debug form is fine for this unit).",
					starter_path: "src/cli.rs",
					test_path: "tests/cli.rs",
					test_command: "cargo test",
					status: "todo",
				},
			},
			{
				id: "u-io",
				title: "File I/O and error handling",
				difficulty: "medium",
				glossary_term_names: ["Result"],
				reference: {
					summary:
						"`std::fs::read_to_string(path)` returns `io::Result<String>`. `?` propagates errors to the caller. `main` can return `Result<(), Box<dyn Error>>` so errors surface as a non-zero exit. Never `unwrap` user-facing input.",
					sources: [
						{ title: "The Rust Book — ch 12", url: "https://doc.rust-lang.org/book/ch12-00-an-io-project.html" },
					],
				},
				exercise: {
					spec: "Implement the `count` subcommand in `src/main.rs`: read the file via `src/io.rs::read_to_string`, call `src/lib.rs::count_lines`, print the count. Use `?` and a `Result`-returning `main`. `cargo run -- count Cargo.toml` prints a number.",
					starter_path: "src/main.rs",
					test_path: "tests/io.rs",
					test_command: "cargo test",
					status: "todo",
				},
			},
			{
				id: "u-fmt",
				title: "Structured output (JSON or table)",
				difficulty: "medium",
				reference: {
					summary:
						"`serde_json::to_string(&value)` serializes a `Serialize` type to JSON. For a table, format with `println!` and width specifiers (`{:20}` pads to 20 cols). Pick one format and keep the output stable so tests can match it.",
					sources: [
						{ title: "serde_json docs", url: "https://docs.rs/serde_json/latest/serde_json/" },
					],
				},
				exercise: {
					spec: "Implement `to_json(pairs)` in `src/fmt.rs` using `serde_json` (run `cargo add serde_json serde`). Add a `kv` subcommand that prints `format_kv(key, value)` as JSON. `cargo run -- kv name value` prints `{\"key\":\"name\",\"value\":\"value\"}` (whitespace-insensitive).",
					starter_path: "src/fmt.rs",
					test_path: "tests/fmt.rs",
					test_command: "cargo test",
					status: "todo",
				},
			},
			{
				id: "u-test",
				title: "Unit tests for core logic",
				difficulty: "medium",
				reference: {
					summary:
						"Put unit tests in `src/lib.rs` under `#[cfg(test)] mod tests { use super::*; #[test] fn ... }`. `cargo test` runs them. Keep logic in the lib, I/O in the binary, so tests don't touch the filesystem.",
					sources: [
						{ title: "The Rust Book — testing", url: "https://doc.rust-lang.org/book/ch11-00-testing.html" },
					],
				},
				exercise: {
					spec: "Implement `count_lines` and `format_kv` in `src/lib.rs` and add `#[test]` cases: empty string → 0, `\"a\\n\"` → 1, `\"a\\nb\\n\"` → 2; `format_kv(\"k\", \"v\")` == `\"k: v\"`. `cargo test` must pass.",
					starter_path: "src/lib.rs",
					test_path: "src/lib.rs",
					test_command: "cargo test",
					status: "todo",
				},
			},
			{
				id: "u-project",
				title: "Ship one useful subcommand",
				difficulty: "hard",
				reference: {
					summary:
						"A useful CLI subcommand combines parsing, I/O, and structured output. Pick a real personal task (count TODOs in a notes folder, summarize a CSV, list largest files). Keep it to one subcommand you'd actually run daily.",
					sources: [
						{ title: "The Rust Book — ch 12 I/O project", url: "https://doc.rust-lang.org/book/ch12-00-an-io-project.html" },
					],
				},
				exercise: {
					spec: "Add one new subcommand of your choice to `src/cli.rs` and implement it end-to-end in `src/main.rs` using the lib helpers. Add at least one `#[test]` for any new pure function. `cargo test` and `cargo run -- <your-subcommand> <args>` both work.",
					starter_path: "src/cli.rs",
					test_path: "tests/project.rs",
					test_command: "cargo test",
					status: "todo",
				},
			},
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
			{
				id: "u-window",
				title: "Window + wgpu instance",
				difficulty: "medium",
				glossary_term_names: ["wgpu"],
				reference: {
					summary:
						"`winit` creates an OS window; `wgpu::Instance::new(Backends::all())` is the entry point to the GPU. The instance enumerates adapters; the window provides a surface the instance can target. No rendering yet — just open a window and keep it alive with an event loop.",
					sources: [
						{ title: "Learn WGPU — the window", url: "https://sotrh.github.io/learn-wgpu/beginner/tutorial3-pipeline/" },
						{ title: "wgpu — Instance", url: "https://docs.rs/wgpu/latest/wgpu/struct.Instance.html" },
					],
				},
				exercise: {
					spec: "In `src/main.rs`, create a `winit` event loop and open a window titled \"learn-pi webgpu\". Create a `wgpu::Instance`. Keep the window open until the user closes it. `cargo build` must succeed and `cargo run` must open a blank window.",
					starter_path: "src/main.rs",
					test_path: "tests/window.rs",
					test_command: "cargo build",
					status: "todo",
				},
			},
			{
				id: "u-surface",
				title: "Surface, adapter, device",
				difficulty: "hard",
				reference: {
					summary:
						"`instance.request_surface(window)` (or `create_surface_from_raw_window`) gives a `Surface`. `instance.request_adapter(&RequestAdapterOptions { compatible_surface: Some(&surface), .. })` picks a GPU. `adapter.request_device(&DeviceDescriptor, None)` yields a `(Device, Queue)`. The device is your handle to allocate buffers and pipelines.",
					sources: [
						{ title: "Learn WGPU — surface & device", url: "https://sotrh.github.io/learn-wgpu/beginner/tutorial2-swapchain/" },
					],
				},
				exercise: {
					spec: "Acquire the `Surface`, request an `Adapter` compatible with it, and request a `Device` + `Queue`. Configure the surface with `SurfaceConfiguration` matching the window size. `cargo build` must succeed; `cargo run` shows a cleared (black or configured-color) window.",
					starter_path: "src/main.rs",
					test_path: "tests/surface.rs",
					test_command: "cargo build",
					status: "todo",
				},
			},
			{
				id: "u-pipeline",
				title: "Render pipeline + shaders",
				difficulty: "hard",
				glossary_term_names: ["render pipeline"],
				reference: {
					summary:
						"A render pipeline needs: a `ShaderModule` (WGSL), a `RenderPipeline` (vertex + fragment state, primitive topology, layout), and a `PipelineLayout`. WGSL shaders go in a `.wgsl` file loaded with `device.create_shader_module(wgpu::include_wgsl!(\"...\"))`. The pipeline describes how vertex data maps to screen positions and how fragments are colored.",
					sources: [
						{ title: "Learn WGPU — pipeline", url: "https://sotrh.github.io/learn-wgpu/beginner/tutorial3-pipeline/" },
						{ title: "WGSL spec", url: "https://www.w3.org/TR/WGSL/" },
					],
				},
				exercise: {
					spec: "Write a `shader.wgsl` with a vertex stage that outputs a position and a fragment stage that returns a solid color. Build a `RenderPipeline` in `src/main.rs` (or a `renderer.rs` module). `cargo build` must succeed. Don't draw yet — just construct the pipeline.",
					starter_path: "src/main.rs",
					test_path: "tests/pipeline.rs",
					test_command: "cargo build",
					status: "todo",
				},
			},
			{
				id: "u-triangle",
				title: "Draw a triangle",
				difficulty: "hard",
				reference: {
					summary:
						"In the render loop: get the surface texture, create a `TextureView`, begin a `RenderPass` with a load op (clear color), set the pipeline, `draw(0..3)` for a triangle with no vertex buffer (positions hardcoded in the shader), submit, present. Three hardcoded vertices in WGSL is the simplest first draw.",
					sources: [
						{ title: "Learn WGPU — first triangle", url: "https://sotrh.github.io/learn-wgpu/beginner/tutorial4-buffer/" },
					],
				},
				exercise: {
					spec: "In the event loop's `RedrawRequested` arm, run a render pass that sets the pipeline and draws 3 vertices. `cargo run` must display a single colored triangle on the cleared background. Verify visually (no automated GPU test).",
					starter_path: "src/main.rs",
					test_path: "tests/triangle.rs",
					test_command: "cargo build",
					status: "todo",
				},
			},
			{
				id: "u-texture",
				title: "Optional: textured quad",
				difficulty: "hard",
				reference: {
					summary:
						"A textured quad needs a vertex buffer (4 vertices with UV coords), an index buffer (2 triangles), a `Texture` + `TextureView` + `Sampler`, and a `BindGroup` binding them. The fragment shader samples the texture with `textureSample`. This is the foundation for sprites and UI.",
					sources: [
						{ title: "Learn WGPU — textures", url: "https://sotrh.github.io/learn-wgpu/beginner/tutorial5-textures/" },
					],
				},
				exercise: {
					spec: "Add a vertex buffer (4 verts with position + UV), an index buffer, and a texture (a 1x1 or checkerboard `Texture` you create from CPU data). Bind via a `BindGroup` and sample in the fragment shader. `cargo run` shows a textured quad. This unit is optional — mark it skipped if you stop at the triangle.",
					starter_path: "src/main.rs",
					test_path: "tests/texture.rs",
					test_command: "cargo build",
					status: "todo",
				},
			},
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
		// Exercise paths/commands authored against python (primary). Rust learners
		// get the same specs; behavior is language-agnostic.
		verifyCommand: () => "pytest -q",
		extraSkeletonFiles: () => [
			{ path: "requirements.txt", content: "pytest>=8.0\n" },
			{ path: "pytest.ini", content: "[pytest]\ntestpaths = tests\n" },
			{ path: "src/__init__.py", content: "" },
			{ path: "tests/__init__.py", content: "" },
			{
				path: "src/lexer.py",
				content:
					'from enum import Enum\n\n\nclass TokenKind(Enum):\n    NUMBER = "number"\n    PLUS = "+"\n    MINUS = "-"\n    STAR = "*"\n    SLASH = "/"\n    LPAREN = "("\n    RPAREN = ")"\n    EOF = "eof"\n\n\nclass Token:\n    def __init__(self, kind, value=None):\n        self.kind = kind\n        self.value = value\n\n\ndef tokenize(source: str) -> list:\n    """Convert source text into a list of Tokens, ending with an EOF token."""\n    raise NotImplementedError\n',
			},
			{
				path: "src/parser.py",
				content:
					'from .lexer import Token, TokenKind\n\n\nclass Number:\n    def __init__(self, value):\n        self.value = value\n\n\nclass BinOp:\n    def __init__(self, op, left, right):\n        self.op = op\n        self.left = left\n        self.right = right\n\n\ndef parse(tokens: list):\n    """Parse a token list into an AST (Number or BinOp). Grammar:\n    expr   := term (("+" | "-") term)*\n    term   := factor (("*" | "/") factor)*\n    factor := NUMBER | "(" expr ")"\n    """\n    raise NotImplementedError\n',
			},
			{
				path: "src/evaluator.py",
				content:
					'from .parser import Number, BinOp\n\n\ndef evaluate(node) -> float:\n    """Evaluate an AST node to a number."""\n    raise NotImplementedError\n',
			},
			{
				path: "src/environment.py",
				content:
					'class Environment:\n    def __init__(self):\n        self.vars = {}\n\n    def get(self, name: str):\n        raise NotImplementedError\n\n    def set(self, name: str, value):\n        raise NotImplementedError\n',
			},
			{
				path: "src/functions.py",
				content:
					'# Optional stretch: function definitions and calls.\n# Leave unimplemented until you reach u-fn.\n\nFUNCTIONS = {}\n\n\ndef call(name: str, args: list):\n    """Look up a named function and apply it to args."""\n    raise NotImplementedError\n',
			},
		],
		units: [
			{
				id: "u-lex",
				title: "Lexer + token types",
				difficulty: "medium",
				glossary_term_names: ["lexer"],
				reference: {
					summary:
						"A **lexer** converts source text into a stream of **tokens**. For arithmetic: numbers, `+ - * /`, parens, and an `EOF` sentinel. Skip whitespace. Each token carries a kind and (for numbers) a value. A simple loop with a cursor and a `while` for multi-digit numbers is enough.",
					sources: [
						{ title: "Crafting Interpreters — lexing", url: "https://craftinginterpreters.com/scanning.html" },
					],
				},
				exercise: {
					spec: "Implement `tokenize(source)` in `src/lexer.py` returning a list of `Token` ending with `Token(TokenKind.EOF)`. Handle integers, `+ - * / ( )`, and skip spaces. `tests/test_lexer.py` should tokenize `\"1 + 2 * 3\"` into 7 tokens (including EOF).",
					starter_path: "src/lexer.py",
					test_path: "tests/test_lexer.py",
					test_command: "pytest tests/test_lexer.py",
					status: "todo",
				},
			},
			{
				id: "u-parse",
				title: "Parser → AST",
				difficulty: "hard",
				glossary_term_names: ["AST"],
				reference: {
					summary:
						"A **recursive-descent parser** turns tokens into an **AST**. Grammar: `expr := term ((\"+\"|\"-\") term)*`, `term := factor ((\"*\"|\"/\") factor)*`, `factor := NUMBER | \"(\" expr \")\"`. Each non-terminal is a function consuming tokens and returning a node. Precedence falls out of the grammar shape.",
					sources: [
						{ title: "Crafting Interpreters — parsing", url: "https://craftinginterpreters.com/parsing-expressions.html" },
					],
				},
				exercise: {
					spec: "Implement `parse(tokens)` in `src/parser.py` returning a `Number` or `BinOp` AST per the grammar in the docstring. `tests/test_parser.py` should parse `\"1 + 2 * 3\"` into `BinOp(\"+\", 1, BinOp(\"*\", 2, 3))` (so `*` binds tighter).",
					starter_path: "src/parser.py",
					test_path: "tests/test_parser.py",
					test_command: "pytest tests/test_parser.py",
					status: "todo",
				},
			},
			{
				id: "u-eval",
				title: "Tree-walk evaluator",
				difficulty: "hard",
				reference: {
					summary:
						"A **tree-walk evaluator** recurses over the AST: `Number` → its value; `BinOp` → apply `op` to `evaluate(left)` and `evaluate(right)`. Division by zero raises. This is the simplest possible evaluator — no bytecode, no VM.",
					sources: [
						{ title: "Crafting Interpreters — evaluating", url: "https://craftinginterpreters.com/evaluating-expressions.html" },
					],
				},
				exercise: {
					spec: "Implement `evaluate(node)` in `src/evaluator.py`. `tests/test_evaluator.py` should assert `evaluate(parse(tokenize(\"1 + 2 * 3\"))) == 7` and that division by zero raises.",
					starter_path: "src/evaluator.py",
					test_path: "tests/test_evaluator.py",
					test_command: "pytest tests/test_evaluator.py",
					status: "todo",
				},
			},
			{
				id: "u-vars",
				title: "Variables and assignment",
				difficulty: "hard",
				reference: {
					summary:
						"Add an `Environment` (a dict of name → value) and extend the lexer/parser with identifiers and `=`. `let x = 5` (or `x = 5`) binds a name; referencing `x` looks it up. The evaluator threads the environment through `evaluate`.",
					sources: [
						{ title: "Crafting Interpreters — statements & state", url: "https://craftinginterpreters.com/statements-and-state.html" },
					],
				},
				exercise: {
					spec: "Implement `Environment.get`/`set` in `src/environment.py`. Extend the lexer (identifier tokens), parser (assignment + identifier nodes), and evaluator to support `x = 5` then `x + 1` → `6`. `tests/test_vars.py` should cover binding and lookup; unknown names raise.",
					starter_path: "src/environment.py",
					test_path: "tests/test_vars.py",
					test_command: "pytest tests/test_vars.py",
					status: "todo",
				},
			},
			{
				id: "u-fn",
				title: "Functions (optional stretch)",
				difficulty: "hard",
				reference: {
					summary:
						"Functions are named parameters bound to a body. `fn add(a, b) = a + b` defines; `add(2, 3)` calls. The evaluator pushes a new environment scoped to the call, binds params, evaluates the body. Closures capture the defining environment. This is a stretch — skip if time-boxed.",
					sources: [
						{ title: "Crafting Interpreters — functions", url: "https://craftinginterpreters.com/functions.html" },
					],
				},
				exercise: {
					spec: "Implement `call(name, args)` in `src/functions.py` and extend the parser/evaluator for `fn name(params) = body` definitions and `name(args)` calls. `tests/test_functions.py` should define `add(a, b) = a + b` and assert `add(2, 3) == 5`. Optional unit — mark skipped if you stop at u-vars.",
					starter_path: "src/functions.py",
					test_path: "tests/test_functions.py",
					test_command: "pytest tests/test_functions.py",
					status: "todo",
				},
			},
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
		verifyCommand: () => "pytest -q",
		extraSkeletonFiles: () => [
			{ path: "requirements.txt", content: "numpy\npytest>=8.0\n" },
			{ path: "pytest.ini", content: "[pytest]\ntestpaths = tests\n" },
			{ path: "src/__init__.py", content: "" },
			{ path: "tests/__init__.py", content: "" },
			{
				path: "src/data.py",
				content:
					'import numpy as np\n\n\ndef load_csv(path: str) -> tuple:\n    """Load a CSV with a header row. Return (X, y) where X is the feature\n    matrix (n_samples, n_features) and y is the target vector (n_samples,).\n    The last column is the target."""\n    raise NotImplementedError\n\n\ndef normalize(X: "np.ndarray") -> tuple:\n    """Return (X_normalized, mean, std) with per-column zero mean / unit std.\n    Guard against divide-by-zero (std==0 -> std=1)."""\n    raise NotImplementedError\n',
			},
			{
				path: "src/linear.py",
				content:
					'import numpy as np\n\n\ndef mse(y_true: "np.ndarray", y_pred: "np.ndarray") -> float:\n    """Mean squared error."""\n    raise NotImplementedError\n\n\ndef predict(X: "np.ndarray", w: "np.ndarray", b: float) -> "np.ndarray":\n    """Linear model: y = X @ w + b."""\n    raise NotImplementedError\n',
			},
			{
				path: "src/gradient.py",
				content:
					'import numpy as np\nfrom .linear import predict, mse\n\n\ndef step(X: "np.ndarray", y: "np.ndarray", w: "np.ndarray", b: float, lr: float) -> tuple:\n    """One gradient-descent step. Return (w_new, b_new)."""\n    raise NotImplementedError\n\n\ndef train(X: "np.ndarray", y: "np.ndarray", epochs: int, lr: float) -> tuple:\n    """Run gradient descent for `epochs` steps. Return (w, b, losses) where\n    losses is a list of MSE values per epoch (should decrease)."""\n    raise NotImplementedError\n',
			},
			{
				path: "src/logistic.py",
				content:
					'import numpy as np\n\n\ndef sigmoid(z: "np.ndarray") -> "np.ndarray":\n    """1 / (1 + exp(-z)), numerically stable."""\n    raise NotImplementedError\n\n\ndef predict_proba(X: "np.ndarray", w: "np.ndarray", b: float) -> "np.ndarray":\n    """P(y=1 | x) via sigmoid(X @ w + b)."""\n    raise NotImplementedError\n\n\ndef accuracy(y_true: "np.ndarray", y_pred: "np.ndarray") -> float:\n    """Fraction of correct predictions (y_pred are 0/1 labels)."""\n    raise NotImplementedError\n',
			},
			{
				path: "src/evaluate.py",
				content:
					'import numpy as np\n\n\ndef train_test_split(X: "np.ndarray", y: "np.ndarray", test_frac: float = 0.2, seed: int = 0) -> tuple:\n    """Shuffle (deterministically with seed) and split into (X_train, X_test, y_train, y_test)."""\n    raise NotImplementedError\n',
			},
			{
				path: "data/linear.csv",
				content:
					'x1,x2,y\n0,0,0\n1,1,3\n2,2,6\n3,3,9\n4,4,12\n5,5,15\n6,6,18\n7,7,21\n8,8,24\n9,9,27\n',
			},
			{
				path: "data/binary.csv",
				content:
					'x1,x2,y\n0,0,0\n1,1,0\n2,2,0\n3,3,0\n6,6,1\n7,7,1\n8,8,1\n9,9,1\n',
			},
		],
		units: [
			{
				id: "u-data",
				title: "Load CSV + normalize features",
				difficulty: "medium",
				reference: {
					summary:
						"`numpy.loadtxt(path, delimiter=\",\", skiprows=1)` reads a numeric CSV into an array. Slice the last column as the target `y`, the rest as `X`. Normalize features per column: subtract the mean, divide by std (guard std==0 → 1). Normalized features make gradient descent converge.",
					sources: [
						{ title: "NumPy — loadtxt", url: "https://numpy.org/doc/stable/reference/generated/numpy.loadtxt.html" },
					],
				},
				exercise: {
					spec: "Implement `load_csv(path)` and `normalize(X)` in `src/data.py`. `load_csv` returns `(X, y)` with the last column as target. `normalize` returns `(X_norm, mean, std)`. `tests/test_data.py` should load `data/linear.csv` and assert normalized columns have mean≈0 and std≈1.",
					starter_path: "src/data.py",
					test_path: "tests/test_data.py",
					test_command: "pytest tests/test_data.py",
					status: "todo",
				},
			},
			{
				id: "u-linear",
				title: "Linear regression + MSE loss",
				difficulty: "hard",
				glossary_term_names: ["MSE"],
				reference: {
					summary:
						"Linear model: `y_pred = X @ w + b` where `w` is a weight vector and `b` a scalar bias. **MSE** = mean of `(y_true - y_pred)²`. With normalized features and a small LR, gradient descent drives MSE down. Start by implementing the forward pass and the loss before the gradient.",
					sources: [
						{ title: "Andrew Ng — linear regression", url: "https://see.stanford.edu/materials/aimlcs229/transcripts/MachineLearning-Lecture2.pdf" },
					],
				},
				exercise: {
					spec: "Implement `mse(y_true, y_pred)` and `predict(X, w, b)` in `src/linear.py`. `tests/test_linear.py` should assert `predict` on a known `(w, b)` matches `X @ w + b`, and `mse` on a perfect prediction is 0.",
					starter_path: "src/linear.py",
					test_path: "tests/test_linear.py",
					test_command: "pytest tests/test_linear.py",
					status: "todo",
				},
			},
			{
				id: "u-grad",
				title: "Gradient descent loop",
				difficulty: "hard",
				glossary_term_names: ["gradient descent"],
				reference: {
					summary:
						"Gradients for linear regression: `dw = (2/n) Xᵀ @ (y_pred - y)`, `db = (2/n) sum(y_pred - y)`. Update `w -= lr * dw`, `b -= lr * db` each step. Over epochs the loss decreases monotonically (for small enough LR). Track the loss per epoch to verify.",
					sources: [
						{ title: "NumPy — linear algebra", url: "https://numpy.org/doc/stable/reference/routines.linalg.html" },
					],
				},
				exercise: {
					spec: "Implement `step(...)` and `train(...)` in `src/gradient.py`. `train` returns `(w, b, losses)` where `losses[i]` is the MSE at epoch i. `tests/test_gradient.py` should train on `data/linear.csv` for 200 epochs and assert `losses[-1] < losses[0]` and `losses[-1] < 1.0`.",
					starter_path: "src/gradient.py",
					test_path: "tests/test_gradient.py",
					test_command: "pytest tests/test_gradient.py",
					status: "todo",
				},
			},
			{
				id: "u-logistic",
				title: "Logistic regression + accuracy",
				difficulty: "hard",
				reference: {
					summary:
						"Logistic regression: `p = sigmoid(X @ w + b)`, predict `1` if `p ≥ 0.5`. Use a numerically stable sigmoid (`np.where(z >= 0, 1/(1+exp(-z)), exp(z)/(1+exp(z)))`). Accuracy = fraction of correct 0/1 predictions. Gradient is similar to linear regression but with `(p - y)` instead of `(y_pred - y)`.",
					sources: [
						{ title: "NumPy — logistic function", url: "https://en.wikipedia.org/wiki/Logistic_function" },
					],
				},
				exercise: {
					spec: "Implement `sigmoid(z)`, `predict_proba(X, w, b)`, and `accuracy(y_true, y_pred)` in `src/logistic.py`. `tests/test_logistic.py` should assert `sigmoid(0) == 0.5`, `sigmoid` is in (0,1), and `accuracy` on a perfect prediction is 1.0.",
					starter_path: "src/logistic.py",
					test_path: "tests/test_logistic.py",
					test_command: "pytest tests/test_logistic.py",
					status: "todo",
				},
			},
			{
				id: "u-eval",
				title: "Train/test split and evaluation",
				difficulty: "hard",
				reference: {
					summary:
						"Split the data into train/test (e.g. 80/20) with a fixed seed for reproducibility. Train on the train split, evaluate MSE (regression) or accuracy (classification) on the test split. A test metric much worse than train metric signals overfitting.",
					sources: [
						{ title: "NumPy — random permutation", url: "https://numpy.org/doc/stable/reference/random/generated/numpy.random.RandomState.permutation.html" },
					],
				},
				exercise: {
					spec: "Implement `train_test_split(X, y, test_frac=0.2, seed=0)` in `src/evaluate.py` with a deterministic shuffle (use `seed`). `tests/test_evaluate.py` should split `data/binary.csv`, train logistic regression on the train split, and assert test accuracy ≥ 0.75.",
					starter_path: "src/evaluate.py",
					test_path: "tests/test_evaluate.py",
					test_command: "pytest tests/test_evaluate.py",
					status: "todo",
				},
			},
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
