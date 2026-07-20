import type { Resource, Track } from "../types";

/** A resource with optional unit scope (null = track-level). */
export interface TrackResourceRow extends Resource {
  unitId: string | null;
  unitTitle: string | null;
}

/** Track-level resources plus every unit's resources (including unit guides). */
export function collectAllResources(track: Track): TrackResourceRow[] {
  const rows: TrackResourceRow[] = [];
  for (const r of track.resources ?? []) {
    rows.push({ ...r, unitId: null, unitTitle: null });
  }
  for (const u of track.material_graph?.units ?? []) {
    for (const r of u.resources ?? []) {
      rows.push({ ...r, unitId: u.id, unitTitle: u.title });
    }
  }
  return rows;
}

/** True for local markdown unit guides registered as doc resources. */
export function isUnitGuide(row: TrackResourceRow): boolean {
  return row.title.toLowerCase().includes("unit guide") || row.id.startsWith("res-unit-guide-");
}
