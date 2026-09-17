import { describe, expect, it } from "vitest";
import { HttpClientError } from "./errors";
import { isLocalHostname, parseExternalUrl } from "./url";

describe("parseExternalUrl", () => {
  it("rejects localhost", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(() => parseExternalUrl("http://localhost/path")).toThrow(HttpClientError);
    try {
      parseExternalUrl("http://localhost/");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpClientError);
      expect((err as HttpClientError).code).toBe("SSRF_BLOCKED");
    }
  });

  it("rejects 127.0.0.1 as a hostname", () => {
    expect(() => parseExternalUrl("http://127.0.0.1/")).toThrow(/not allowed/);
  });

  it("rejects a private IP hostname", () => {
    expect(() => parseExternalUrl("http://192.168.0.10/")).toThrow(HttpClientError);
    expect(() => parseExternalUrl("http://10.0.0.5/secret")).toThrow(HttpClientError);
  });

  it("rejects loopback IPv6", () => {
    expect(() => parseExternalUrl("http://[::1]/")).toThrow(HttpClientError);
  });

  it("rejects link-local", () => {
    expect(() => parseExternalUrl("http://169.254.1.1/")).toThrow(HttpClientError);
  });

  it("rejects non-http schemes", () => {
    expect(() => parseExternalUrl("file:///etc/passwd")).toThrow(/scheme/);
    expect(() => parseExternalUrl("ftp://example.com/")).toThrow(/scheme/);
  });

  it("accepts a valid public URL (hostname still needs DNS)", () => {
    const url = parseExternalUrl("https://example.com/about");
    expect(url.hostname).toBe("example.com");
    expect(url.protocol).toBe("https:");
  });
});
