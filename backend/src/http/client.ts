import { env } from "../common/env";
import { HttpClientError } from "./errors";
import { defaultLookup, resolveAndValidate, type LookupFn } from "./dns";
import { HostRateLimiter, type RateLimiter } from "./ratelimit";
import { isPathAllowed, parseRobotsTxt, type RobotsGroup } from "./robots";
import { backoffMs, defaultRetryPolicy, isRetryableError, isRetryableStatus, parseRetryAfterMs, type RetryPolicy } from "./retry";
import { pinnedRequest, type RawResponse, type RequestFn } from "./request";
import { parseExternalUrl } from "./url";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/xml",
  "text/xml",
  "application/json",
];

export interface SecureHttpClientOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  minIntervalMs?: number;
  allowedContentTypes?: string[];
  userAgent?: string;
  respectRobots?: boolean;
  lookup?: LookupFn;
  request?: RequestFn;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  rateLimiter?: RateLimiter;
}

export interface SecureHttpResponse {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  ip: string;
}

function mimeOf(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

function contentTypeAllowed(contentType: string | undefined, allowed: string[]): boolean {
  const mime = mimeOf(contentType);
  if (!mime) return false;
  return allowed.some((a) => mime === a);
}

export function createSecureHttpClient(options: SecureHttpClientOptions = {}) {
  const timeoutMs = options.timeoutMs ?? env.httpTimeoutMs;
  const maxBytes = options.maxBytes ?? env.httpMaxBytes;
  const maxRedirects = options.maxRedirects ?? env.httpMaxRedirects;
  const allowedContentTypes = options.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES;
  const userAgent = options.userAgent ?? "AI-Interview-Prep-Kit/0.1";
  const lookup = options.lookup ?? defaultLookup;
  const request = options.request ?? pinnedRequest;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retry = defaultRetryPolicy(options.retry);
  const limiter =
    options.rateLimiter ?? new HostRateLimiter(options.minIntervalMs ?? env.httpMinIntervalMs, now, sleep);
  const robotsCache = new Map<string, RobotsGroup[] | null>();

  async function once(url: URL, method: "GET" | "HEAD"): Promise<{ raw: RawResponse; ip: string }> {
    await limiter.acquire(url.hostname);
    const addrs = await resolveAndValidate(url.hostname, lookup);
    const target = addrs[0];
    const raw = await request({
      url,
      ip: target.address,
      family: target.family,
      method,
      timeoutMs,
      maxBytes,
      headers: { "user-agent": userAgent },
    });
    return { raw, ip: target.address };
  }

  async function withRetries(url: URL, method: "GET" | "HEAD"): Promise<{ raw: RawResponse; ip: string }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retry.maxRetries; attempt += 1) {
      try {
        const result = await once(url, method);
        const status = result.raw.status;
        if (status >= 400 && isRetryableStatus(status) && attempt < retry.maxRetries) {
          const after = parseRetryAfterMs(result.raw.headers["retry-after"], now(), retry.maxDelayMs);
          await sleep(backoffMs(attempt, retry, after));
          lastErr = new HttpClientError("HTTP_STATUS", `HTTP ${status}`, {
            retryable: true,
            status,
            url: url.href,
          });
          continue;
        }
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < retry.maxRetries && isRetryableError(err)) {
          const after =
            err instanceof HttpClientError
              ? parseRetryAfterMs(undefined, now(), retry.maxDelayMs)
              : undefined;
          await sleep(backoffMs(attempt, retry, after));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async function loadRobots(origin: string): Promise<RobotsGroup[] | null> {
    if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const parsed = parseExternalUrl(robotsUrl);
      const { raw } = await withRetries(parsed, "GET");
      if (raw.status >= 400) {
        robotsCache.set(origin, null);
        return null;
      }
      const groups = parseRobotsTxt(raw.body.toString("utf8"));
      robotsCache.set(origin, groups);
      return groups;
    } catch {
      robotsCache.set(origin, null);
      return null;
    }
  }

  async function get(urlString: string, extras: { respectRobots?: boolean } = {}): Promise<SecureHttpResponse> {
    const startUrl = parseExternalUrl(urlString);
    let current = startUrl;
    const respectRobots = extras.respectRobots ?? options.respectRobots ?? false;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      if (respectRobots) {
        const groups = await loadRobots(current.origin);
        if (groups && !isPathAllowed(groups, userAgent, current.pathname || "/")) {
          throw new HttpClientError("ROBOTS_DISALLOWED", `robots.txt disallows ${current.pathname}`, {
            url: current.href,
          });
        }
      }

      const { raw, ip } = await withRetries(current, "GET");

      if (REDIRECT_STATUS.has(raw.status)) {
        const location = raw.headers.location;
        if (!location) {
          throw new HttpClientError("REDIRECT", `Redirect ${raw.status} missing Location`, {
            status: raw.status,
            url: current.href,
          });
        }
        const next = new URL(location, current);
        current = parseExternalUrl(next.href);
        continue;
      }

      if (raw.status >= 400) {
        throw new HttpClientError("HTTP_STATUS", `HTTP ${raw.status} for ${current.href}`, {
          retryable: isRetryableStatus(raw.status),
          status: raw.status,
          url: current.href,
          ip,
        });
      }

      const contentType = raw.headers["content-type"] ?? "";
      if (!contentTypeAllowed(contentType, allowedContentTypes)) {
        throw new HttpClientError(
          "UNSUPPORTED_CONTENT_TYPE",
          `Unsupported Content-Type "${contentType}"`,
          { url: current.href, status: raw.status },
        );
      }

      return {
        url: startUrl.href,
        finalUrl: current.href,
        status: raw.status,
        contentType,
        body: raw.body.toString("utf8"),
        ip,
      };
    }

    throw new HttpClientError("REDIRECT", `Too many redirects (max ${maxRedirects})`, { url: startUrl.href });
  }

  return { get, parseRobotsTxt, isPathAllowed };
}
