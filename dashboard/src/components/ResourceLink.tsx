import type { Resource } from "../types";
import { docViewerHref, isLocalMarkdownUrl } from "../utils/resources";

interface Props {
  trackId: string;
  resource: Resource;
}

export function ResourceLink({ trackId, resource }: Props) {
  if (isLocalMarkdownUrl(resource.url)) {
    return (
      <a href={docViewerHref(trackId, resource.url)}>{resource.title}</a>
    );
  }
  return (
    <a href={resource.url} target="_blank" rel="noreferrer">
      {resource.title}
    </a>
  );
}
