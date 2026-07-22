/**
 * Verify every programming template ships exercise + reference on every unit,
 * and that the shapes pass the same integrity rules as lib/track.ts.
 *
 * Usage: node --import tsx/esm scripts/verify-templates.ts
 */

import {
	buildMaterialUnitsFromTemplate,
	listTrackTemplates,
	type ProgrammingTrackTemplate,
} from "../lib/track-templates.ts";

let failures = 0;
let checked = 0;

for (const template of listTrackTemplates()) {
	if (template.kind !== "programming") continue;
	const units = buildMaterialUnitsFromTemplate(template);
	for (const u of units) {
		checked++;
		if (!u.exercise) {
			console.error(`✗ ${template.id} / ${u.id}: missing exercise`);
			failures++;
			continue;
		}
		if (!u.exercise.spec.trim()) {
			console.error(`✗ ${template.id} / ${u.id}: empty exercise.spec`);
			failures++;
		}
		if (!u.exercise.test_command.trim()) {
			console.error(`✗ ${template.id} / ${u.id}: empty exercise.test_command`);
			failures++;
		}
		if (!u.reference) {
			console.error(`✗ ${template.id} / ${u.id}: missing reference`);
			failures++;
			continue;
		}
		if (!u.reference.summary.trim()) {
			console.error(`✗ ${template.id} / ${u.id}: empty reference.summary`);
			failures++;
		}
		if (!Array.isArray(u.reference.sources)) {
			console.error(`✗ ${template.id} / ${u.id}: reference.sources not an array`);
			failures++;
		}
	}
}

console.log(`\nChecked ${checked} programming units across templates.`);
if (failures === 0) {
	console.log("OK — every programming unit has a valid exercise + reference.");
	process.exit(0);
}
console.error(`FAIL — ${failures} problem(s) above.`);
process.exit(1);
