import { useEffect, useState } from "react";
import { getMarkdown } from "../api";
import type { MarkdownDocument } from "../types";
import { MarkdownScrollView } from "./MarkdownScrollView";

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
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("Unknown route /api/markdown")) {
            setError(
              "Dashboard server is outdated. Restart pi, then run /learn-dashboard stop && /learn-dashboard start.",
            );
          } else {
            setError(msg);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, url]);

  return (
    <MarkdownScrollView
      title={doc?.title}
      subtitle={doc?.path}
      loading={loading}
      error={error}
      content={doc?.content ?? null}
      onBack={onBack}
      backLabel="← Back to track"
    />
  );
}
