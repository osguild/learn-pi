export type AppRoute =
  | { kind: "home" }
  | { kind: "track"; trackId: string }
  | { kind: "doc"; trackId: string; url: string }
  | { kind: "docs"; slug: string }
  | null;

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, "");

  // Empty hash or bare "#/" → home (track list).
  if (raw === "" || raw === "/") {
    return { kind: "home" };
  }

  // Legacy help hash → dashboard docs
  if (raw === "/help" || raw.startsWith("/help?")) {
    return { kind: "docs", slug: "dashboard" };
  }

  if (raw === "/docs" || raw.startsWith("/docs?")) {
    return { kind: "docs", slug: "dashboard" };
  }
  if (raw.startsWith("/docs/")) {
    const slug = raw.slice("/docs/".length).split("?")[0].replace(/\.md$/, "");
    if (/^[a-z0-9-]+$/.test(slug)) return { kind: "docs", slug };
  }

  // Per-track page: /tracks/:id
  if (raw.startsWith("/tracks/")) {
    const id = raw.slice("/tracks/".length).split("?")[0];
    if (id) return { kind: "track", trackId: decodeURIComponent(id) };
  }

  // Markdown viewer for a track resource (overlay).
  if (raw.startsWith("/doc")) {
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const trackId = params.get("track");
    const url = params.get("url");
    if (trackId && url) return { kind: "doc", trackId, url };
  }

  return { kind: "home" };
}

export const DOCS_HREF = "#/docs/dashboard";

export function docsHref(slug = "dashboard"): string {
  return `#/docs/${slug}`;
}

export function trackHref(id: string): string {
  return `#/tracks/${encodeURIComponent(id)}`;
}

export function homeHref(): string {
  return "#/";
}

export function navigateAppRoute(route: AppRoute): void {
  if (!route || route.kind === "home") {
    window.location.hash = "/";
    return;
  }
  if (route.kind === "track") {
    window.location.hash = trackHref(route.trackId).slice(1);
    return;
  }
  if (route.kind === "docs") {
    window.location.hash = docsHref(route.slug).slice(1);
    return;
  }
  const params = new URLSearchParams({ track: route.trackId, url: route.url });
  window.location.hash = `/doc?${params.toString()}`;
}
