import { useMemo, useRef, useState } from "react";
import type { GlossaryEntry, Track } from "../types";
import { patchTrack } from "../api";
import { definitionPreview, GlossaryDetailDialog, type GlossaryRow } from "./GlossaryDetailDialog";

const CARD_PREVIEW_LEN = 120;

type UnitFilter = "all" | "track" | string;
type SortKey = "term-asc" | "term-desc" | "unit" | "definition";

interface Props {
  track: Track;
  onTrackChanged: () => void;
}

function sortRows(rows: GlossaryRow[], sortKey: SortKey): GlossaryRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "term-desc":
        return b.term.localeCompare(a.term);
      case "unit": {
        const au = a.unitTitle || "\uffff";
        const bu = b.unitTitle || "\uffff";
        return au.localeCompare(bu) || a.term.localeCompare(b.term);
      }
      case "definition":
        return a.definition.localeCompare(b.definition);
      default:
        return a.term.localeCompare(b.term);
    }
  });
  return sorted;
}

export function GlossaryCarousel({ track, onTrackChanged }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("term-asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const rows = useMemo<GlossaryRow[]>(() => {
    return (track.glossary ?? []).map((e) => {
      const unit = e.unit_id ? track.material_graph.units.find((u) => u.id === e.unit_id) : undefined;
      return { ...e, unitTitle: unit?.title ?? "" };
    });
  }, [track.glossary, track.material_graph.units]);

  const filteredRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = rows.filter((r) => {
      if (unitFilter === "track" && r.unit_id) return false;
      if (unitFilter !== "all" && unitFilter !== "track" && r.unit_id !== unitFilter) return false;
      if (!q) return true;
      return (
        r.term.toLowerCase().includes(q) ||
        r.definition.toLowerCase().includes(q) ||
        r.unitTitle.toLowerCase().includes(q) ||
        (r.source?.toLowerCase().includes(q) ?? false)
      );
    });
    return sortRows(filtered, sortKey);
  }, [rows, query, unitFilter, sortKey]);

  const selectedEntry = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const openEntry = (id: string) => setSelectedId(id);
  const closeEntry = () => setSelectedId(null);

  const updateEntry = async (id: string, patch: Partial<Pick<GlossaryEntry, "term" | "definition">>) => {
    await patchTrack(track.id, { update_glossary: { id, patch } });
    onTrackChanged();
  };

  const removeEntry = async (id: string) => {
    await patchTrack(track.id, { remove_glossary: { id } });
    onTrackChanged();
  };

  const scanFromResources = async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      const before = track.glossary?.length ?? 0;
      const updated = await patchTrack(track.id, { scan_glossary: true });
      const added = (updated.glossary?.length ?? 0) - before;
      setScanMsg(added > 0 ? `Added ${added} terms.` : "No new terms.");
      onTrackChanged();
    } catch (err) {
      setScanMsg(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const scrollCarousel = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".glossary-card");
    const gap = 12;
    const amount = card ? card.offsetWidth + gap : 272;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  const toolbar = (
    <div className="res-table-toolbar">
      <input
        type="search"
        className="res-search"
        placeholder="Search glossary…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search glossary"
      />
      <select
        className="res-filter-select"
        value={unitFilter}
        onChange={(e) => setUnitFilter(e.target.value as UnitFilter)}
        aria-label="Filter by unit"
      >
        <option value="all">all units</option>
        <option value="track">track-level</option>
        {track.material_graph.units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.title}
          </option>
        ))}
      </select>
      <select
        className="res-filter-select"
        value={sortKey}
        onChange={(e) => setSortKey(e.target.value as SortKey)}
        aria-label="Sort glossary"
      >
        <option value="term-asc">term A→Z</option>
        <option value="term-desc">term Z→A</option>
        <option value="unit">unit</option>
        <option value="definition">definition</option>
      </select>
      <button type="button" className="res-page-btn" disabled={scanning} onClick={() => void scanFromResources()}>
        {scanning ? "Scanning…" : "scan guides"}
      </button>
      <span className="dim small res-count">
        {filteredRows.length} of {rows.length}
      </span>
      {scanMsg && <span className="dim small">{scanMsg}</span>}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="glossary-carousel-wrap">
        <div className="res-table-toolbar">
          <button type="button" className="res-page-btn" disabled={scanning} onClick={() => void scanFromResources()}>
            {scanning ? "Scanning…" : "Generate from unit guides"}
          </button>
          {scanMsg && <span className="dim small">{scanMsg}</span>}
        </div>
        <div className="dim small res-empty">(no glossary entries yet)</div>
      </div>
    );
  }

  return (
    <>
      <div className="glossary-carousel-wrap">
        {toolbar}

        {filteredRows.length === 0 ? (
          <div className="dim small res-empty">No terms match your filters.</div>
        ) : (
          <div className="glossary-carousel-nav">
            <button
              type="button"
              className="glossary-carousel-btn"
              onClick={() => scrollCarousel(-1)}
              aria-label="Scroll glossary left"
            >
              ←
            </button>
            <div className="glossary-carousel-track" ref={trackRef}>
              {filteredRows.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="glossary-card"
                  onClick={() => openEntry(entry.id)}
                  aria-label={`View ${entry.term}`}
                >
                  <div className="glossary-card-term">{entry.term}</div>
                  <div className="glossary-card-def">{definitionPreview(entry.definition, CARD_PREVIEW_LEN)}</div>
                  <div className="glossary-card-meta">
                    {entry.unitTitle ? (
                      <span className="glossary-card-unit">{entry.unitTitle}</span>
                    ) : (
                      <span className="glossary-card-unit dim">track</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="glossary-carousel-btn"
              onClick={() => scrollCarousel(1)}
              aria-label="Scroll glossary right"
            >
              →
            </button>
          </div>
        )}
      </div>

      <GlossaryDetailDialog
        entry={selectedEntry}
        trackId={track.id}
        onClose={closeEntry}
        onUpdate={updateEntry}
        onRemove={removeEntry}
      />
    </>
  );
}
