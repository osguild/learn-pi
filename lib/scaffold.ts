/**
 * Scaffold recipe loader + skeleton emitter.
 *
 * Recipes live in ~/.pi/learn/scaffold-templates/<recipe>/:
 *   manifest.json   — declarative recipe spec (see ScaffoldManifest)
 *   skeleton/       — the file tree to emit (relative paths preserved)
 *
 * Variable substitution: {{VAR}} in file CONTENTS is replaced. Variable
 * defaults come from the manifest; the learner can override via prompts.
 * Post-create commands are shell strings run with cwd = target dir.
 */

import { execSync } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { accessSync, constants, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { scaffoldRecipeDir, SCAFFOLD_TEMPLATES_DIR } from "./paths";
import type { Depth } from "./track";

export interface ScaffoldVariable {
	name: string;
	default: string;
	description?: string;
}

export interface ScaffoldManifest {
	recipe: string;
	label: string;
	outcome_compass_template: string;
	default_dir_name: string;
	default_session_min?: number;
	variables: ScaffoldVariable[];
	post_create: string[];
	verify_command: string;
	skeleton: string;
	/** Optional track id prefix; final id is slugified from label if unset. */
	track_id?: string;
}

export async function listRecipes(): Promise<string[]> {
	try {
		const entries = await readdir(SCAFFOLD_TEMPLATES_DIR, { withFileTypes: true });
		const recipes: string[] = [];
		for (const e of entries) {
			if (e.isDirectory()) {
				try {
					await access(join(SCAFFOLD_TEMPLATES_DIR, e.name, "manifest.json"), constants.R_OK);
					recipes.push(e.name);
				} catch {
					// incomplete recipe, skip
				}
			}
		}
		return recipes.sort();
	} catch {
		return [];
	}
}

export async function loadManifest(recipe: string): Promise<ScaffoldManifest | null> {
	const dir = scaffoldRecipeDir(recipe);
	const path = join(dir, "manifest.json");
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw) as ScaffoldManifest;
	} catch {
		return null;
	}
}

export function substitute(text: string, vars: Record<string, string>): string {
	return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_m, name: string) =>
		name in vars ? vars[name] : `{{${name}}}`,
	);
}

/**
 * Copy the skeleton tree into targetDir, substituting variables in file contents.
 * Directories are walked recursively. Binary files are detected by a simple
 * NUL-byte heuristic and copied byte-for-byte without substitution.
 */
export async function emitSkeleton(
	recipe: string,
	targetDir: string,
	vars: Record<string, string>,
): Promise<string[]> {
	const skeletonRoot = scaffoldRecipeDir(recipe);
	const src = join(skeletonRoot, "skeleton");
	const written: string[] = [];
	await copyTree(src, targetDir, vars, written);
	return written;
}

async function copyTree(src: string, dest: string, vars: Record<string, string>, written: string[]): Promise<void> {
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destName = substitute(entry.name, vars);
		const destPath = join(dest, destName);
		if (entry.isDirectory()) {
			await mkdir(destPath, { recursive: true });
			await copyTree(srcPath, destPath, vars, written);
		} else if (entry.isFile()) {
			const buf = await readFile(srcPath);
			await mkdir(dirname(destPath), { recursive: true });
			const isBinary = buf.includes(0);
			const out = isBinary ? buf : Buffer.from(substitute(buf.toString("utf8"), vars), "utf8");
			await writeFile(destPath, out);
			written.push(relative(process.cwd(), destPath) || destPath);
		}
	}
}

/** Run post_create shell strings with cwd = targetDir. Throws on first failure. */
export function runPostCreate(manifest: ScaffoldManifest, targetDir: string, vars: Record<string, string>): void {
	for (const raw of manifest.post_create) {
		const cmd = substitute(raw, vars);
		execSync(cmd, { cwd: targetDir, stdio: "pipe", env: process.env });
	}
}

/** Resolve variable values: manifest defaults overlaid with learner overrides. */
export function resolveVariables(manifest: ScaffoldManifest, overrides: Record<string, string>): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const v of manifest.variables) {
		vars[v.name] = overrides[v.name] ?? v.default;
	}
	return vars;
}

// --- Built-in recipe bootstrapping -----------------------------------------

/**
 * Seed the built-in webgpu-rust recipe into ~/.pi/learn/scaffold-templates/
 * on first use. Idempotent — does not overwrite an existing manifest.
 */
export async function ensureBuiltinRecipes(): Promise<void> {
	await ensureWebGpuRustRecipe();
}

async function ensureWebGpuRustRecipe(): Promise<void> {
	const dir = scaffoldRecipeDir("webgpu-rust");
	const manifestPath = join(dir, "manifest.json");
	if (existsSync(manifestPath)) return;
	await mkdir(join(dir, "skeleton", "src"), { recursive: true });

	const manifest: ScaffoldManifest = {
		recipe: "webgpu-rust",
		label: "Rust WebGPU",
		outcome_compass_template:
			"A Rust WebGPU app that turns into a game engine people might use.",
		default_dir_name: "rust-webgpu",
		default_session_min: 45,
		track_id: "rust-webgpu",
		variables: [
			{ name: "PROJECT_NAME", default: "rust-webgpu", description: "Cargo package name" },
		],
		post_create: ["cargo add wgpu winit pollster bytemuck 2>/dev/null || true"],
		verify_command: "cargo test",
		skeleton: "skeleton/",
	};
	await mkdir(dir, { recursive: true });
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

	const cargoToml = [
		"[package]",
		`name = "{{PROJECT_NAME}}"`,
		`version = "0.1.0"`,
		`edition = "2021"`,
		``,
		`[dependencies]`,
		`# post_create will add: wgpu winit pollster bytemuck`,
		``,
		`# Learn-pi verify command: cargo test`,
		`# Current edge: set one with /learn-plan (e.g. "render a triangle via a wgpu render pipeline").`,
	].join("\n");
	await writeFile(join(dir, "skeleton", "Cargo.toml"), cargoToml + "\n", "utf8");

	const mainRs = [
		`// {{PROJECT_NAME}} — learning sandbox.`,
		`// The current edge and next action live in the learn-pi Track, not here.`,
		`// Run /learn-start to see them.`,
		``,
		`fn main() {`,
		`    println!("{{PROJECT_NAME}} bootstrapped by learn-pi /learn-scaffold.");`,
		`    println!("Next: open this file and follow the next_action from /learn-start.");`,
		`}`,
	].join("\n");
	await writeFile(join(dir, "skeleton", "src", "main.rs"), mainRs + "\n", "utf8");

	const readme = [
		`# {{PROJECT_NAME}}`,
		``,
		`Scaffolded by \`learn-pi /learn-scaffold webgpu-rust\`.`,
		``,
		`Track state lives in \`~/.pi/learn/tracks/{{PROJECT_NAME}}.json\`.`,
		`Run \`/learn-start\` in pi to re-enter.`,
	].join("\n");
	await writeFile(join(dir, "skeleton", "README.md"), readme + "\n", "utf8");

	const gitignore = ["/target", ""].join("\n");
	await writeFile(join(dir, "skeleton", ".gitignore"), gitignore, "utf8");
}

/** Simple sync existence check used during seeding. */
export function recipeManifestExists(recipe: string): boolean {
	return existsSync(join(scaffoldRecipeDir(recipe), "manifest.json"));
}

void accessSync;
void stat;
void readFileSync;
void resolve;
void randomUUID;

// --- Generic wizard (Mode B, open-ended goal) ------------------------------
//
// The recipe path above is declarative and curated — right tool for a known-
// painful stack with no good tutorial (the webgpu-rust proof case). The
// generic wizard is the second path: the learner states an open-ended goal
// ("ML fundamentals"), the wizard recommends a language + frameworks, gauges
// depth, and synthesizes a project skeleton on the fly instead of pulling
// one off the shelf.
//
// Per DESIGN.md Fork B asterisk: the recipe path stays socratic-OFF and
// purely mechanical; the wizard path is conversational-but-direct (recommend,
// don't quiz) — still not socratic. The scope-guard skill is explicitly
// active during the wizard and the web-search step is capped to one round
// to keep "which framework is best" from becoming a yak.

export type { Depth };

export interface SkeletonFile {
	/** Path relative to the target dir. Forward slashes; nested dirs OK. */
	path: string;
	content: string;
}

export interface SkeletonContext {
	projectName: string;
	goal: string;
	depth: Depth;
	framework?: string;
}

export interface LanguageSkeleton {
	/** Key used in selects, e.g. "python". */
	language: string;
	/** Display label, e.g. "Python". */
	label: string;
	/** Produce the file tree to emit. */
	files: (ctx: SkeletonContext) => SkeletonFile[];
	/** Best-effort post-create shell strings (failures are non-fatal). */
	postCreate: (ctx: SkeletonContext) => string[];
	/** Default verify command for the track. */
	verifyCommand: (ctx: SkeletonContext) => string;
	/** Default session length for the track. */
	defaultSessionMin: number;
}

/** Curated table of per-language skeleton generators. Bounded + inspectable. */
export const LANGUAGE_SKELETONS: Record<string, LanguageSkeleton> = {
	python: {
		language: "python",
		label: "Python",
		defaultSessionMin: 45,
		files: ({ projectName, goal, depth, framework }) => [
			{
				path: "requirements.txt",
				content: framework
					? `# ${projectName} — ${goal} (depth: ${depth})\n${framework}\n`
					: `# ${projectName} — ${goal} (depth: ${depth})\n# add your deps here, e.g. numpy, torch\n`,
			},
			{
				path: "main.py",
				content: [
					`"""${projectName} — learning sandbox for: ${goal} (depth: ${depth})."""`,
					``,
					`# The current edge and next action live in the learn-pi Track, not here.`,
					`# Run /learn-start to see them.`,
					``,
					`def main() -> None:`,
					`    print("${projectName} bootstrapped by learn-pi /learn-scaffold.")`,
					`    print("Next: follow the next_action from /learn-start.")`,
					``,
					`if __name__ == "__main__":`,
					`    main()`,
				].join("\n") + "\n",
			},
			{
				path: "README.md",
				content: `# ${projectName}\n\nScaffolded by \`learn-pi /learn-scaffold\` (generic wizard).\nGoal: ${goal} — depth: ${depth}${framework ? `, framework: ${framework}` : ""}.\n\nTrack state lives in \`~/.pi/learn/tracks/<id>.json\`. Run \`/learn-start\` in pi to re-enter.\n`,
			},
			{ path: ".gitignore", content: "__pycache__/\n.venv/\n*.pyc\n" },
		],
		postCreate: ({ framework }) => [
			"python3 -m venv .venv 2>/dev/null || true",
			framework ? `.venv/bin/pip install ${framework} 2>/dev/null || true` : "true",
		],
		verifyCommand: () => "python3 main.py",
	},
	rust: {
		language: "rust",
		label: "Rust",
		defaultSessionMin: 45,
		files: ({ projectName, goal, depth }) => [
			{
				path: "Cargo.toml",
				content: [
					`[package]`,
					`name = "${projectName}"`,
					`version = "0.1.0"`,
					`edition = "2021"`,
					``,
					`[dependencies]`,
					`# add deps via: cargo add <crate>`,
					``,
					`# Learn-pi verify command: cargo test`,
					`# Goal: ${goal} (depth: ${depth})`,
				].join("\n") + "\n",
			},
			{
				path: "src/main.rs",
				content: [
					`// ${projectName} — learning sandbox for: ${goal} (depth: ${depth}).`,
					`// The current edge and next action live in the learn-pi Track, not here.`,
					`// Run /learn-start to see them.`,
					``,
					`fn main() {`,
					`    println!("${projectName} bootstrapped by learn-pi /learn-scaffold.");`,
					`    println!("Next: follow the next_action from /learn-start.");`,
					`}`,
				].join("\n") + "\n",
			},
			{
				path: "README.md",
				content: `# ${projectName}\n\nScaffolded by \`learn-pi /learn-scaffold\` (generic wizard).\nGoal: ${goal} — depth: ${depth}.\n`,
			},
			{ path: ".gitignore", content: "/target\n" },
		],
		postCreate: ({ framework }) => [
			framework ? `cargo add ${framework} 2>/dev/null || true` : "true",
		],
		verifyCommand: () => "cargo test",
	},
	c: {
		language: "c",
		label: "C",
		defaultSessionMin: 45,
		files: ({ projectName, goal, depth }) => [
			{
				path: "Makefile",
				content: [
					`CC ?= cc`,
					`CFLAGS ?= -std=c11 -Wall -Wextra -O2`,
					``,
					`${projectName}: main.c`,
					`\t$(CC) $(CFLAGS) -o ${projectName} main.c`,
					``,
					`run: ${projectName}`,
					`\t./${projectName}`,
					``,
					`clean:`,
					`\trm -f ${projectName}`,
					``,
					`.PHONY: run clean`,
				].join("\n") + "\n",
			},
			{
				path: "main.c",
				content: [
					`/* ${projectName} — learning sandbox for: ${goal} (depth: ${depth}). */`,
					`/* The current edge and next action live in the learn-pi Track, not here. */`,
					`/* Run /learn-start to see them. */`,
					``,
					`#include <stdio.h>`,
					``,
					`int main(void) {`,
					`    puts("${projectName} bootstrapped by learn-pi /learn-scaffold.");`,
					`    puts("Next: follow the next_action from /learn-start.");`,
					`    return 0;`,
					`}`,
				].join("\n") + "\n",
			},
			{
				path: "README.md",
				content: `# ${projectName}\n\nScaffolded by \`learn-pi /learn-scaffold\` (generic wizard).\nGoal: ${goal} — depth: ${depth}.\nBuild: \`make\` — run: \`make run\`.\n`,
			},
			{ path: ".gitignore", content: `${projectName}\n*.o\n` },
		],
		postCreate: () => ["make 2>/dev/null || true"],
		verifyCommand: ({ projectName }) => `make && ./${projectName}`,
	},
	javascript: {
		language: "javascript",
		label: "JavaScript (Node)",
		defaultSessionMin: 45,
		files: ({ projectName, goal, depth, framework }) => [
			{
				path: "package.json",
				content: JSON.stringify(
					{
						name: projectName,
						version: "0.1.0",
						private: true,
						type: "module",
						description: `${goal} (depth: ${depth})`,
						scripts: { start: "node index.js", test: "node --test" },
						dependencies: framework ? {} : {},
					},
					null,
					2,
				) + `\n`,
			},
			{
				path: "index.js",
				content: [
					`// ${projectName} — learning sandbox for: ${goal} (depth: ${depth}).`,
					`// The current edge and next action live in the learn-pi Track, not here.`,
					`// Run /learn-start to see them.`,
					``,
					`console.log("${projectName} bootstrapped by learn-pi /learn-scaffold.");`,
					`console.log("Next: follow the next_action from /learn-start.");`,
				].join("\n") + "\n",
			},
			{
				path: "README.md",
				content: `# ${projectName}\n\nScaffolded by \`learn-pi /learn-scaffold\` (generic wizard).\nGoal: ${goal} — depth: ${depth}${framework ? `, framework: ${framework}` : ""}.\n`,
			},
			{ path: ".gitignore", content: "node_modules/\n" },
		],
		postCreate: ({ framework }) => [
			framework ? `npm install ${framework} 2>/dev/null || true` : "true",
		],
		verifyCommand: () => "node index.js",
	},
	typescript: {
		language: "typescript",
		label: "TypeScript",
		defaultSessionMin: 45,
		files: ({ projectName, goal, depth, framework }) => [
			{
				path: "package.json",
				content: JSON.stringify(
					{
						name: projectName,
						version: "0.1.0",
						private: true,
						type: "module",
						description: `${goal} (depth: ${depth})`,
						scripts: { build: "tsc", start: "node dist/index.js", test: "node --test" },
					},
					null,
					2,
				) + `\n`,
			},
			{
				path: "tsconfig.json",
				content: JSON.stringify(
					{
						compilerOptions: {
							target: "ES2022",
							module: "ESNext",
							moduleResolution: "Bundler",
							strict: true,
							outDir: "dist",
							esModuleInterop: true,
							skipLibCheck: true,
						},
						include: ["src"],
					},
					null,
					2,
				) + `\n`,
			},
			{
				path: "src/index.ts",
				content: [
					`// ${projectName} — learning sandbox for: ${goal} (depth: ${depth}).`,
					`// The current edge and next action live in the learn-pi Track, not here.`,
					`// Run /learn-start to see them.`,
					``,
					`console.log("${projectName} bootstrapped by learn-pi /learn-scaffold.");`,
					`console.log("Next: follow the next_action from /learn-start.");`,
				].join("\n") + "\n",
			},
			{
				path: "README.md",
				content: `# ${projectName}\n\nScaffolded by \`learn-pi /learn-scaffold\` (generic wizard).\nGoal: ${goal} — depth: ${depth}${framework ? `, framework: ${framework}` : ""}.\n`,
			},
			{ path: ".gitignore", content: "node_modules/\ndist/\n" },
		],
		postCreate: ({ framework }) => [
			"npm install --no-save typescript 2>/dev/null || true",
			framework ? `npm install ${framework} 2>/dev/null || true` : "true",
		],
		verifyCommand: () => "npx --no-install tsc --noEmit",
	},
	go: {
		language: "go",
		label: "Go",
		defaultSessionMin: 45,
		files: ({ projectName, goal, depth }) => [
			{
				path: "go.mod",
				content: `module ${projectName}\n\ngo 1.22\n`,
			},
			{
				path: "main.go",
				content: [
					`// ${projectName} — learning sandbox for: ${goal} (depth: ${depth}).`,
					`// The current edge and next action live in the learn-pi Track, not here.`,
					`// Run /learn-start to see them.`,
					``,
					`package main`,
					``,
					`import "fmt"`,
					``,
					`func main() {`,
					`	fmt.Println("${projectName} bootstrapped by learn-pi /learn-scaffold.")`,
					`	fmt.Println("Next: follow the next_action from /learn-start.")`,
					`}`,
				].join("\n") + "\n",
			},
			{
				path: "README.md",
				content: `# ${projectName}\n\nScaffolded by \`learn-pi /learn-scaffold\` (generic wizard).\nGoal: ${goal} — depth: ${depth}.\n`,
			},
			{ path: ".gitignore", content: `${projectName}\n` },
		],
		postCreate: () => ["go mod tidy 2>/dev/null || true"],
		verifyCommand: () => "go build ./...",
	},
};

/** Languages the wizard can scaffold, in display order. */
export function listLanguages(): string[] {
	return ["python", "rust", "c", "javascript", "typescript", "go"];
}

/** Emit a programmatic skeleton (no recipe on disk) into targetDir. */
export async function emitGenericSkeleton(files: SkeletonFile[], targetDir: string): Promise<string[]> {
	const written: string[] = [];
	for (const f of files) {
		const destPath = join(targetDir, f.path);
		await mkdir(dirname(destPath), { recursive: true });
		await writeFile(destPath, f.content, "utf8");
		written.push(relative(process.cwd(), destPath) || destPath);
	}
	return written;
}

/**
 * Run best-effort post-create shell strings with cwd = targetDir.
 * Returns a warning per failed command; never throws (generic setup is
 * best-effort — the learner can fix the env by hand or re-run).
 */
export function runGenericPostCreate(commands: string[], targetDir: string): string[] {
	const warnings: string[] = [];
	for (const cmd of commands) {
		try {
			execSync(cmd, { cwd: targetDir, stdio: "pipe", env: process.env });
		} catch (err) {
			warnings.push(`${cmd}: ${(err as Error).message.split("\n")[0]}`);
		}
	}
	return warnings;
}

/** Build the wizard's suggested first edge from goal + depth + stack. */
export function buildSuggestedEdge(input: { goal: string; depth: Depth; language: string; framework?: string }): string {
	const stack = input.framework ? `${input.language} + ${input.framework}` : input.language;
	switch (input.depth) {
		case "guided":
			return `Get a ${stack} environment running and complete one introductory ${input.goal} tutorial end-to-end.`;
		case "standard":
			return `Build a small ${input.goal} project in ${stack}, using the framework's standard abstractions (don't reimplement them).`;
		case "from-scratch":
			return `Implement a minimal ${input.goal} primitive from scratch in ${input.language} — no high-level ${input.framework ?? "library"}; you write the core loop.`;
	}
}

/** Build the wizard's outcome compass from goal + depth + stack. */
export function buildOutcomeCompass(input: { goal: string; depth: Depth; language: string; framework?: string }): string {
	const stack = input.framework ? `${input.language} + ${input.framework}` : input.language;
	return `Learn ${input.goal} — depth: ${input.depth}, stack: ${stack}.`;
}
