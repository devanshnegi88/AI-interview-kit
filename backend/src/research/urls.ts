const SKIP_EXT = /\.(pdf|zip|png|jpe?g|gif|webp|svg|css|js|mjs|woff2?|ttf|mp4|mp3|avi|mov|ico)(\?|$)/i;

export function stripWww(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

export function sameDomain(a: URL, b: URL): boolean {
  return stripWww(a.hostname) === stripWww(b.hostname);
}

/** Canonical form for de-dupe: no hash, no default port, no trailing slash (except /). */
export function canonicalize(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  if ((copy.protocol === "http:" && copy.port === "80") || (copy.protocol === "https:" && copy.port === "443")) {
    copy.port = "";
  }
  copy.hostname = copy.hostname.toLowerCase();
  if (copy.pathname.length > 1 && copy.pathname.endsWith("/")) {
    copy.pathname = copy.pathname.slice(0, -1);
  }
  return copy.href;
}

export function normalizeHref(href: string, base: URL): URL | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.toLowerCase().startsWith("javascript:")) return null;
  if (/^(mailto|tel|data):/i.test(trimmed)) return null;
  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  if (SKIP_EXT.test(resolved.pathname)) return null;
  resolved.hash = "";
  return resolved;
}
