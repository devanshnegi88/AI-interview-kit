export type HttpErrorCode =
  | "INVALID_URL"
  | "SSRF_BLOCKED"
  | "DNS_FAILED"
  | "TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "HTTP_STATUS"
  | "REDIRECT"
  | "NETWORK"
  | "ROBOTS_DISALLOWED";

export class HttpClientError extends Error {
  readonly code: HttpErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly url?: string;
  readonly ip?: string;

  constructor(
    code: HttpErrorCode,
    message: string,
    extras: { retryable?: boolean; status?: number; url?: string; ip?: string; cause?: unknown } = {},
  ) {
    super(message, extras.cause !== undefined ? { cause: extras.cause } : undefined);
    this.name = "HttpClientError";
    this.code = code;
    this.retryable = extras.retryable ?? false;
    this.status = extras.status;
    this.url = extras.url;
    this.ip = extras.ip;
  }
}

export function isHttpClientError(err: unknown): err is HttpClientError {
  return err instanceof HttpClientError;
}
