import { isIP } from "node:net";
import { HttpClientError } from "./errors";
import { isBlockedDestinationIp } from "./ip";

const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  return false;
}

/**
 * Parse and validate an external http(s) URL.
 * Hostname-only checks are not enough — callers must still resolve DNS
 * and validate the destination IP (and do so again after every redirect).
 */
export function parseExternalUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpClientError("INVALID_URL", `Invalid URL: ${raw}`, { url: raw });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpClientError("INVALID_URL", `URL scheme not allowed: ${url.protocol}`, { url: raw });
  }
  if (url.username || url.password) {
    throw new HttpClientError("INVALID_URL", "URLs with credentials are not allowed", { url: raw });
  }
  const hostname = url.hostname.replace(/^\[/, "").replace(/]$/, "");
  if (!hostname) {
    throw new HttpClientError("INVALID_URL", "URL is missing a hostname", { url: raw });
  }
  if (isLocalHostname(hostname)) {
    throw new HttpClientError("SSRF_BLOCKED", `Hostname is not an external destination: ${hostname}`, {
      url: raw,
    });
  }
  if (isIP(hostname) && isBlockedDestinationIp(hostname)) {
    throw new HttpClientError("SSRF_BLOCKED", `Destination IP is not allowed: ${hostname}`, {
      url: raw,
      ip: hostname,
    });
  }
  return url;
}
