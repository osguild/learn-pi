import { useEffect, useMemo, useState } from "react";
import type { TemplateTier, TrackTemplateMeta } from "../types";
import { getTemplates, scaffoldTemplate } from "../api";

const TIER_LABEL: Record<TemplateTier, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

interface Props {
  onCreated: (trackId: string) => void;
}

export function TemplatePicker({ onCreated }: Props) {
  const [templates, setTemplates] = useState<TrackTemplateMeta[]>([]);
  const [tier, setTier] = useState<TemplateTier>("beginner");
  const [selected, setSelected] = useState<TrackTemplateMeta | null>(null);
  const [language, setLanguage] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const filtered = useMemo(() => templates.filter((t) => t.tier === tier), [templates, tier]);

  const openTemplate = (t: TrackTemplateMeta) => {
    setSelected(t);
    setLanguage(t.languages[0] ?? "");
    setTopic("");
    setErr(null);
  };

  const closeDialog = () => {
    setSelected(null);
    setErr(null);
  };

  const submit = async () => {
    if (!selected) return;
    if (selected.languages.length > 1 && !language) {
      setErr("Pick a language.");
      return;
    }
    if (selected.customizable_topic && !topic.trim()) {
      setErr("Enter a topic.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const result = await scaffoldTemplate(selected.id, {
        language: language || undefined,
        topic: topic.trim() || undefined,
      });
      closeDialog();
      onCreated(result.track.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) {
        setErr("A track with this id already exists. Use /learn-scaffold in pi with overwrite, or pick a different topic.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  if (loadErr) {
    const stale = loadErr.includes("Unknown route /api/templates") || loadErr.includes("404");
    return (
      <p className="dim small template-load-error">
        {stale
          ? "Dashboard server is outdated. Restart pi, then run /learn-dashboard stop and /learn-dashboard start."
          : `Could not load templates: ${loadErr}`}
      </p>
    );
  }

  return (
    <div className="template-picker">
      <div className="template-tier-tabs">
        {(Object.keys(TIER_LABEL) as TemplateTier[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`template-tier-tab${tier === t ? " active" : ""}`}
            onClick={() => setTier(t)}
          >
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="template-grid">
        {filtered.map((t) => (
          <button key={t.id} type="button" className="template-card" onClick={() => openTemplate(t)}>
            <div className="template-card-head">
              <span className="template-card-label">{t.label}</span>
              <span className={`template-kind ${t.kind}`}>{t.kind}</span>
            </div>
            <p className="template-card-blurb">{t.blurb}</p>
            {t.languages.length > 0 && (
              <p className="dim small template-card-langs">
                {t.languages.map((l) => t.language_labels[l] ?? l).join(" · ")}
              </p>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <dialog className="template-dialog" open>
          <div className="template-dialog-panel">
            <header className="template-dialog-header">
              <h3>{selected.label}</h3>
              <button type="button" className="template-dialog-close" onClick={closeDialog} aria-label="Close">
                ✕
              </button>
            </header>
            <div className="template-dialog-body">
              <p className="dim small">{selected.blurb}</p>
              {selected.languages.length > 1 && (
                <label className="template-field">
                  <span className="template-field-label">Language</span>
                  <select
                    className="res-filter-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {selected.languages.map((l) => (
                      <option key={l} value={l}>
                        {selected.language_labels[l] ?? l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.customizable_topic && (
                <label className="template-field">
                  <span className="template-field-label">Topic</span>
                  <input
                    type="text"
                    className="res-search"
                    placeholder={selected.topic_placeholder ?? "Topic"}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </label>
              )}
              {err && <p className="template-error">{err}</p>}
            </div>
            <footer className="template-dialog-footer">
              <button type="button" className="res-page-btn" disabled={busy} onClick={() => void submit()}>
                {busy ? "Creating…" : "Create track"}
              </button>
            </footer>
          </div>
        </dialog>
      )}
    </div>
  );
}
