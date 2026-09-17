import { describe, expect, it } from "vitest";
import { HttpClientError } from "./errors";
import { backoffMs, defaultRetryPolicy, isRetryableError, isRetryableStatus, parseRetryAfterMs } from "./retry";

describe("retry policy", () => {
  it("retries 429, 408, and 5xx", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("does not retry 400, 401, 403", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
  });

  it("treats TIMEOUT and network codes as retryable", () => {
    expect(isRetryableError(new HttpClientError("TIMEOUT", "t", { retryable: true }))).toBe(true);
    expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
    expect(isRetryableError(new HttpClientError("SSRF_BLOCKED", "no"))).toBe(false);
    expect(isRetryableError(new HttpClientError("HTTP_STATUS", "no", { status: 403 }))).toBe(false);
  });

  it("parses Retry-After seconds and HTTP-date", () => {
    expect(parseRetryAfterMs("2", 0, 10_000)).toBe(2000);
    expect(parseRetryAfterMs("120", 0, 5_000)).toBe(5000);
    const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    const later = "Wed, 21 Oct 2015 07:28:05 GMT";
    expect(parseRetryAfterMs(later, now, 10_000)).toBe(5000);
  });

  it("applies exponential backoff with jitter", () => {
    const policy = defaultRetryPolicy({ random: () => 0.5, baseDelayMs: 100, maxDelayMs: 10_000, jitterRatio: 1 });
    expect(backoffMs(0, policy)).toBe(50);
    expect(backoffMs(1, policy)).toBe(100);
    expect(backoffMs(2, policy)).toBe(200);
    expect(backoffMs(0, policy, 1500)).toBe(1500);
  });
});
