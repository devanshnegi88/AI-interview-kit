import { HttpClientError } from "./errors";

export const RETRYABLE_STATUS = new Set([408, 429]);
export const NON_RETRYABLE_STATUS = new Set([400, 401, 403]);

const RETRYABLE_NETWORK = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  random: () => number;
}

export function defaultRetryPolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  return {
    maxRetries: 3,
    baseDelayMs: 200,
    maxDelayMs: 8_000,
    jitterRatio: 1,
    random: Math.random,
    ...overrides,
  };
}

export function isRetryableStatus(status: number): boolean {
  if (NON_RETRYABLE_STATUS.has(status)) return false;
  if (RETRYABLE_STATUS.has(status)) return true;
  return status >= 500 && status <= 599;
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpClientError) {
    if (err.status !== undefined && NON_RETRYABLE_STATUS.has(err.status)) return false;
    if (err.code === "HTTP_STATUS" && err.status !== undefined) return isRetryableStatus(err.status);
    return err.retryable;
  }
  if (typeof err === "object" && err && "code" in err) {
    const code = String((err as { code: unknown }).code);
    return RETRYABLE_NETWORK.has(code);
  }
  return false;
}

/** Parse Retry-After as delta-seconds or HTTP-date. Caps at maxDelayMs. */
export function parseRetryAfterMs(
  header: string | undefined,
  nowMs: number,
  maxDelayMs: number,
): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxDelayMs);
  }
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return undefined;
  return Math.min(Math.max(0, when - nowMs), maxDelayMs);
}

/**
 * Exponential backoff with full jitter: random() * min(max, base * 2^attempt).
 * Retry-After, when present, wins (still capped).
 */
export function backoffMs(
  attempt: number,
  policy: RetryPolicy,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  const jittered = policy.random() * exp * policy.jitterRatio;
  return Math.min(policy.maxDelayMs, Math.max(0, jittered));
}
