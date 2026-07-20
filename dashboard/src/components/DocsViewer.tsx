import { useEffect, useState } from "react";
import { getDoc } from "../api";
import type { DashboardDoc } from "../types";
import { MarkdownScrollView } from "./MarkdownScrollView";

interface Props {
  slug: string;
  onBack: () => void;
}

export function DocsViewer({ slug, onBack }: Props) {
  const [doc, setDoc] = useState<DashboardDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    getDoc(slug)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("Unknown route /api/docs")) {
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
  }, [slug]);

  return (
    <MarkdownScrollView
      title={doc?.title}
      loading={loading}
      error={error}
      content={doc?.content ?? null}
      onBack={onBack}
      backLabel="← Back to dashboard"
    />
  );
}
