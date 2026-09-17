import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { HttpClientError } from "./errors";

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface PinnedRequestArgs {
  url: URL;
  ip: string;
  family: 4 | 6;
  method?: "GET" | "HEAD";
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
}

export type RequestFn = (args: PinnedRequestArgs) => Promise<RawResponse>;

function headerMap(res: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (typeof value === "string") out[key.toLowerCase()] = value;
    else if (Array.isArray(value)) out[key.toLowerCase()] = value.join(", ");
  }
  return out;
}

function networkError(err: unknown, url: string): HttpClientError {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "ABORT_ERR" || code === "ERR_HTTP_REQUEST_TIMEOUT") {
    return new HttpClientError("TIMEOUT", `Request timed out: ${url}`, { retryable: true, url, cause: err });
  }
  return new HttpClientError("NETWORK", `Network error fetching ${url}`, { retryable: true, url, cause: err });
}

/**
 * HTTP GET/HEAD pinned to a pre-validated destination IP.
 * Sets Host + TLS SNI to the original hostname so we do not re-resolve DNS.
 */
export function pinnedRequest(args: PinnedRequestArgs): Promise<RawResponse> {
  const { url, ip, family, timeoutMs, maxBytes } = args;
  const method = args.method ?? "GET";
  const lib = url.protocol === "https:" ? https : http;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const hostnameForSni = url.hostname.replace(/^\[/, "").replace(/]$/, "");

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: ip,
        family,
        port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          host: url.host,
          accept: "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "identity",
          connection: "close",
          ...args.headers,
        },
        servername: hostnameForSni,
        timeout: timeoutMs,
      },
      (res) => {
        const headers = headerMap(res);
        const declared = Number(headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.resume();
          reject(
            new HttpClientError("RESPONSE_TOO_LARGE", `Content-Length ${declared} exceeds ${maxBytes}`, {
              url: url.href,
            }),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(
              new HttpClientError("RESPONSE_TOO_LARGE", `Response exceeded ${maxBytes} bytes`, { url: url.href }),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", (err) => reject(networkError(err, url.href)));
      },
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new HttpClientError("TIMEOUT", `Request timed out: ${url.href}`, { retryable: true, url: url.href }));
    });
    req.on("error", (err) => reject(networkError(err, url.href)));
    req.end();
  });
}
