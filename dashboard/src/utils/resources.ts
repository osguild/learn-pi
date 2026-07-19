export function isLocalMarkdownUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith("file://")) return false;
  return /\.(?:md|markdown)(?:$|[?#])/i.test(trimmed);
}

export function docViewerHref(trackId: string, resourceUrl: string): string {
  const params = new URLSearchParams({
    track: trackId,
    url: resourceUrl,
  });
  return `#/doc?${params.toString()}`;
}

export function parseDocViewerHash(hash: string): { trackId: string; url: string } | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith("/doc")) return null;
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  const trackId = params.get("track");
  const url = params.get("url");
  if (!trackId || !url) return null;
  return { trackId, url };
}
