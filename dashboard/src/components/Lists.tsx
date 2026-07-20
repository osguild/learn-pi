import { useState } from "react";
import type { Resource, ResourceKind, Yak } from "../types";
import { patchTrack } from "../api";
import { InlineAdd } from "./Editable";
import { ResourceLink } from "./ResourceLink";

const RESOURCE_KINDS: ResourceKind[] = ["article", "doc", "video", "book", "paper", "repo", "other"];

interface ListProps {
  trackId: string;
  onTrackChanged: () => void;
}

export function ResourcesList({ trackId, resources, onTrackChanged }: ListProps & { resources: Resource[] }) {
  const [kind, setKind] = useState<ResourceKind>("article");
  const addResource = async (title: string) => {
    // The InlineAdd only captures a title; the URL is required by the API.
    // For the dashboard we treat the entered text as the title and reuse it
    // as the URL when it parses as one, otherwise fall back to a placeholder.
    const looksLikeUrl = /^https?:\/\//i.test(title) || /^[\w-]+(\.[\w-]+)+/.test(title);
    const url = looksLikeUrl ? (/^https?:\/\//i.test(title) ? title : `https://${title}`) : `about:blank#${encodeURIComponent(title)}`;
    await patchTrack(trackId, { add_resource: { title, url, kind } });
    onTrackChanged();
  };
  return (
    <div className="card resources">
      <div className="card-title">track resources</div>
      {resources.length > 0 ? (
        <ul className="res-list">
          {resources.map((r) => (
            <li key={r.id}>
              <ResourceLink trackId={trackId} resource={r} />
              {r.kind && <span className="dim small"> · {r.kind}</span>}
              {r.note && <div className="dim small">{r.note}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="dim small">(no track-level resources yet)</div>
      )}
      <div className="res-add">
        <select
          className="res-kind-select"
          value={kind}
          onChange={(e) => setKind(e.target.value as ResourceKind)}
          aria-label="resource kind"
        >
          {RESOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <InlineAdd label="add resource" placeholder="title or URL" onAdd={addResource} />
      </div>
    </div>
  );
}

export function YaksList({ trackId, yaks, onTrackChanged }: ListProps & { yaks: Yak[] }) {
  const addYak = async (desc: string) => {
    await patchTrack(trackId, { add_yak: { desc } });
    onTrackChanged();
  };
  const resolveYak = async (id: string) => {
    await patchTrack(trackId, { resolve_yak: { id } });
    onTrackChanged();
  };
  const open = yaks.filter((y) => !y.resolved);
  const resolved = yaks.filter((y) => y.resolved);
  return (
    <div className="card yaks">
      <div className="card-title">deferred yaks</div>
      {open.length > 0 ? (
        <ul className="yak-list">
          {open.map((y) => (
            <li key={y.id} className="yak-open">
              <span className="yak-mark">○</span>
              <span className="yak-desc">{y.desc}</span>
              <button type="button" className="yak-resolve-btn" onClick={() => void resolveYak(y.id)} title="mark resolved">
                ✓
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dim small">(no open yaks)</div>
      )}
      {resolved.length > 0 && (
        <details>
          <summary className="dim small">{resolved.length} resolved</summary>
          <ul className="yak-list">
            {resolved.map((y) => (
              <li key={y.id} className="yak-resolved dim">
                <span className="yak-mark">✓</span>
                <span className="strike">{y.desc}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="yak-add">
        <InlineAdd label="defer a yak" placeholder="what's the side task?" onAdd={addYak} />
      </div>
    </div>
  );
}
