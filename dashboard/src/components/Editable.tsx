import { useEffect, useRef, useState } from "react";

// Inline-edit primitives shared by the dashboard cards. All edits go through
// PATCH /api/tracks/:id (see api.ts patchTrack); the parent supplies the
// save callback and a refresh hook so a successful edit is reflected
// immediately instead of waiting for the 5s poll.

interface EditTextProps {
  value: string;
  onSave: (next: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  mono?: boolean;
  /** Disable editing (e.g. empty next_action on an active track is invalid). */
  disabled?: boolean;
  /** Extra className on the display element. */
  className?: string;
  /** Render the value with custom formatting instead of the raw string. */
  render?: (v: string) => React.ReactNode;
}

export function EditableText({
  value,
  onSave,
  multiline = false,
  placeholder,
  mono = false,
  disabled = false,
  className = "",
  render,
}: EditTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    const cancel = () => {
      setDraft(value);
      setErr(null);
      setEditing(false);
    };
    const save = async () => {
      setSaving(true);
      setErr(null);
      try {
        await onSave(draft);
        setEditing(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    };
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && !multiline && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void save();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && multiline) {
        e.preventDefault();
        void save();
      }
    };
    return (
      <div className="edit-inline">
        {multiline ? (
          <textarea
            ref={(el) => {
              inputRef.current = el;
            }}
            className={`edit-field${mono ? " mono" : ""}`}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={Math.max(3, Math.min(12, draft.split("\n").length + 1))}
            disabled={saving}
          />
        ) : (
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            className={`edit-field${mono ? " mono" : ""}`}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={saving}
          />
        )}
        <div className="edit-actions">
          <button type="button" className="edit-btn save" onClick={() => void save()} disabled={saving}>
            {saving ? "…" : "save"}
          </button>
          <button type="button" className="edit-btn cancel" onClick={cancel} disabled={saving}>
            cancel
          </button>
        </div>
        {err && <div className="edit-error">{err}</div>}
      </div>
    );
  }

  return (
    <div className={`editable${disabled ? " disabled" : ""}`}>
      <span className={`edit-value${mono ? " mono" : ""} ${className}`}>{render ? render(value) : value || placeholder || "(unset)"}</span>
      {!disabled && (
        <button
          type="button"
          className="edit-pencil"
          title="edit"
          onClick={() => {
            setDraft(value);
            setErr(null);
            setEditing(true);
          }}
        >
          ✎
        </button>
      )}
    </div>
  );
}

interface InlineAddProps {
  label: string;
  placeholder?: string;
  onAdd: (value: string) => Promise<void>;
}

/** A "+ add" button that reveals a single-line input. */
export function InlineAdd({ label, placeholder, onAdd }: InlineAddProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className="add-btn" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }
  const cancel = () => {
    setDraft("");
    setErr(null);
    setOpen(false);
  };
  const add = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onAdd(draft);
      setDraft("");
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="edit-inline">
      <input
        ref={(el) => {
          inputRef.current = el;
        }}
        className="edit-field"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          else if (e.key === "Enter") void add();
        }}
        disabled={saving}
      />
      <div className="edit-actions">
        <button type="button" className="edit-btn save" onClick={() => void add()} disabled={saving}>
          {saving ? "…" : "add"}
        </button>
        <button type="button" className="edit-btn cancel" onClick={cancel} disabled={saving}>
          cancel
        </button>
      </div>
      {err && <div className="edit-error">{err}</div>}
    </div>
  );
}
