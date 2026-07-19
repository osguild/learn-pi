export type AppRoute =
  | { kind: "doc"; trackId: string; url: string }
  | { kind: "docs"; slug: string }
  | null;

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, "");

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

  if (raw.startsWith("/doc")) {
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const trackId = params.get("track");
    const url = params.get("url");
    if (trackId && url) return { kind: "doc", trackId, url };
  }

  return null;
}

export const DOCS_HREF = "#/docs/dashboard";

export function docsHref(slug = "dashboard"): string {
  return `#/docs/${slug}`;
}

export function navigateAppRoute(route: AppRoute): void {
  if (!route) {
    if (window.location.hash) {
      window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    return;
  }
  if (route.kind === "docs") {
    window.location.hash = docsHref(route.slug).slice(1);
    return;
  }
  const params = new URLSearchParams({ track: route.trackId, url: route.url });
  window.location.hash = `/doc?${params.toString()}`;
}
