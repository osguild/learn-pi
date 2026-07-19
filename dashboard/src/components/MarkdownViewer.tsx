import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMarkdown } from "../api";
import type { MarkdownDocument } from "../types";

interface Props {
  trackId: string;
  url: string;
  onBack: () => void;
}

export function MarkdownViewer({ trackId, url, onBack }: Props) {
  const [doc, setDoc] = useState<MarkdownDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    getMarkdown(trackId, url)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, url]);

  return (
    <div className="markdown-view">
      <header className="markdown-view-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back to track
        </button>
        {doc && (
          <div className="markdown-view-meta">
            <h2>{doc.title}</h2>
            <div className="dim small mono">{doc.path}</div>
          </div>
        )}
      </header>

      <div className="markdown-scroll">
        {loading && <div className="dim">Loading markdown…</div>}
        {error && (
          <div className="error">
            <strong>Could not load document:</strong> <code>{error}</code>
          </div>
        )}
        {doc && (
          <article className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
