import { useEffect, useRef } from "react";
import type { GlossaryEntry } from "../types";
import { EditableText } from "./Editable";
import { docViewerHref, isLocalMarkdownUrl } from "../utils/resources";

export interface GlossaryRow extends GlossaryEntry {
  unitTitle: string;
}

interface Props {
  entry: GlossaryRow | null;
  trackId: string;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Pick<GlossaryEntry, "term" | "definition">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function sourceLink(trackId: string, source: string) {
  const label = source.replace(/^file:\/\//, "");
  if (isLocalMarkdownUrl(source)) {
    return (
      <a href={docViewerHref(trackId, source)} className="glossary-source" title={source}>
        {label}
      </a>
    );
  }
  return (
    <a href={source} target="_blank" rel="noreferrer" className="glossary-source" title={source}>
      {label}
    </a>
  );
}

export function GlossaryDetailDialog({ entry, trackId, onClose, onUpdate, onRemove }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (entry) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [entry]);

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const handleRemove = async () => {
    if (!entry) return;
    await onRemove(entry.id);
    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="glossary-dialog"
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) handleClose();
      }}
    >
      {entry && (
        <div className="glossary-dialog-panel" role="document">
          <header className="glossary-dialog-header">
            <h3 className="glossary-dialog-title">Glossary entry</h3>
            <button type="button" className="glossary-dialog-close" onClick={handleClose} aria-label="Close">
              ✕
            </button>
          </header>

          <div className="glossary-dialog-body">
            <div className="glossary-dialog-field">
              <span className="glossary-dialog-label">Term</span>
              <EditableText
                value={entry.term}
                onSave={(v) => onUpdate(entry.id, { term: v })}
                className="glossary-term-text"
              />
            </div>

            <div className="glossary-dialog-field">
              <span className="glossary-dialog-label">Definition</span>
              <EditableText
                value={entry.definition}
                onSave={(v) => onUpdate(entry.id, { definition: v })}
                multiline
                className="glossary-def-text"
              />
            </div>

            {(entry.unitTitle || entry.source) && (
              <div className="glossary-dialog-meta dim small">
                {entry.unitTitle && (
                  <div>
                    <span className="glossary-dialog-label">Unit</span> {entry.unitTitle}
                  </div>
                )}
                {entry.source && (
                  <div>
                    <span className="glossary-dialog-label">Source</span> {sourceLink(trackId, entry.source)}
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="glossary-dialog-footer">
            <button type="button" className="glossary-dialog-remove" onClick={() => void handleRemove()}>
              Remove term
            </button>
            <button type="button" className="glossary-dialog-done" onClick={handleClose}>
              Done
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}

export function definitionPreview(text: string, max = 96): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}
