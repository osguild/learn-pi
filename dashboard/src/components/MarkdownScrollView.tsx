import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  title?: string;
  subtitle?: string;
  loading: boolean;
  error: string | null;
  content: string | null;
  onBack: () => void;
  backLabel?: string;
}

export function MarkdownScrollView({
  title,
  subtitle,
  loading,
  error,
  content,
  onBack,
  backLabel = "← Back",
}: Props) {
  return (
    <div className="markdown-view">
      <header className="markdown-view-header">
        <button type="button" className="back-btn" onClick={onBack}>
          {backLabel}
        </button>
        {title && (
          <div className="markdown-view-meta">
            <h2>{title}</h2>
            {subtitle && <div className="dim small mono">{subtitle}</div>}
          </div>
        )}
      </header>

      <div className="markdown-scroll">
        {loading && <div className="dim">Loading…</div>}
        {error && (
          <div className="error">
            <strong>Could not load document:</strong> <code>{error}</code>
          </div>
        )}
        {content && (
          <article className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
