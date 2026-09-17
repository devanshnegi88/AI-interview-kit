import { describe, expect, it, vi } from "vitest";
import { createSecureHttpClient } from "./client";
import { HttpClientError } from "./errors";
import { resolveAndValidate } from "./dns";
import type { PinnedRequestArgs, RawResponse } from "./request";

const PUBLIC = [{ address: "93.184.216.34", family: 4 as const }];

function html(status = 200, extra: Partial<RawResponse> = {}): RawResponse {
  return {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extra.headers },
    body: extra.body ?? Buffer.from("<html>ok</html>"),
  };
}

function client(opts: {
  lookup?: (h: string) => Promise<{ address: string; family: 4 | 6 }[]>;
  request?: (args: PinnedRequestArgs) => Promise<RawResponse>;
  maxRetries?: number;
  maxBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
}) {
  const sleep = vi.fn(async () => undefined);
  return {
    sleep,
    http: createSecureHttpClient({
      minIntervalMs: 0,
      timeoutMs: opts.timeoutMs ?? 1000,
      maxBytes: opts.maxBytes ?? 1024,
      lookup: opts.lookup ?? (async () => PUBLIC),
      request: opts.request ?? (async () => html()),
      sleep,
      retry: {
        maxRetries: opts.maxRetries ?? 2,
        random: () => 0,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 1,
      },
      allowedContentTypes: opts.allowedContentTypes,
    }),
  };
}

describe("resolveAndValidate", () => {
  it("blocks a hostname that resolves to loopback", async () => {
    await expect(
      resolveAndValidate("evil.example", async () => [{ address: "127.0.0.1", family: 4 }]),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("blocks a hostname that resolves to a private IP", async () => {
    await expect(
      resolveAndValidate("intranet.example", async () => [{ address: "10.0.0.8", family: 4 }]),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("blocks link-local metadata", async () => {
    await expect(
      resolveAndValidate("metadata.example", async () => [{ address: "169.254.169.254", family: 4 }]),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("allows a public A record", async () => {
    const addrs = await resolveAndValidate("example.com", async () => PUBLIC);
    expect(addrs[0].address).toBe("93.184.216.34");
  });
});

describe("createSecureHttpClient", () => {
  it("fetches a valid public URL after DNS + IP checks", async () => {
    const requests: string[] = [];
    const { http } = client({
      request: async (args) => {
        requests.push(args.ip);
        return html();
      },
    });
    const res = await http.get("https://example.com/about");
    expect(res.status).toBe(200);
    expect(res.body).toContain("ok");
    expect(res.ip).toBe("93.184.216.34");
    expect(requests).toEqual(["93.184.216.34"]);
  });

  it("rejects redirect to a private IP without following it", async () => {
    let calls = 0;
    const { http } = client({
      request: async () => {
        calls += 1;
        return html(302, { headers: { "content-type": "text/html", location: "http://127.0.0.1/admin" } });
      },
    });
    await expect(http.get("https://example.com/")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    expect(calls).toBe(1);
  });

  it("re-checks DNS after a redirect to another host", async () => {
    const lookups: string[] = [];
    const { http } = client({
      lookup: async (h) => {
        lookups.push(h);
        if (h === "evil.internal") return [{ address: "192.168.0.50", family: 4 }];
        return PUBLIC;
      },
      request: async () =>
        html(302, { headers: { "content-type": "text/html", location: "https://evil.internal/steal" } }),
    });
    await expect(http.get("https://example.com/")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    expect(lookups).toContain("evil.internal");
  });

  it("rejects an oversized response", async () => {
    const { http } = client({
      request: async () => {
        throw new HttpClientError("RESPONSE_TOO_LARGE", "too big", { url: "https://example.com/" });
      },
    });
    await expect(http.get("https://example.com/")).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      retryable: false,
    });
  });

  it("rejects an unsupported content type", async () => {
    const { http } = client({
      request: async () => ({
        status: 200,
        headers: { "content-type": "application/javascript" },
        body: Buffer.from("alert(1)"),
      }),
    });
    await expect(http.get("https://example.com/app.js")).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT_TYPE",
    });
  });

  it("surfaces a timeout as a retryable error and retries", async () => {
    let calls = 0;
    const { http, sleep } = client({
      maxRetries: 2,
      request: async () => {
        calls += 1;
        throw new HttpClientError("TIMEOUT", "slow", { retryable: true, url: "https://example.com/" });
      },
    });
    await expect(http.get("https://example.com/")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalled();
  });

  it("retries 503 then succeeds", async () => {
    let calls = 0;
    const { http } = client({
      maxRetries: 3,
      request: async () => {
        calls += 1;
        if (calls < 3) {
          return { status: 503, headers: { "content-type": "text/plain", "retry-after": "1" }, body: Buffer.from("no") };
        }
        return html();
      },
    });
    const res = await http.get("https://example.com/");
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("does not retry 403", async () => {
    let calls = 0;
    const { http } = client({
      request: async () => {
        calls += 1;
        return { status: 403, headers: { "content-type": "text/html" }, body: Buffer.from("no") };
      },
    });
    await expect(http.get("https://example.com/")).rejects.toMatchObject({
      code: "HTTP_STATUS",
      status: 403,
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("does not retry 400 or 401", async () => {
    for (const status of [400, 401]) {
      let calls = 0;
      const { http } = client({
        request: async () => {
          calls += 1;
          return { status, headers: { "content-type": "text/html" }, body: Buffer.from("no") };
        },
      });
      await expect(http.get("https://example.com/")).rejects.toMatchObject({ status, retryable: false });
      expect(calls).toBe(1);
    }
  });
});
