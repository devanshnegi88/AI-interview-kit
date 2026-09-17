/**
 * http/ — Phase 4 secure retrieval client.
 *
 * Reusable by the later crawler. Hostname checks are not enough: every
 * hop resolves DNS and validates the destination IP. No crawler here.
 */

export { HttpClientError, isHttpClientError } from "./errors";
export type { HttpErrorCode } from "./errors";
export {
  isBlockedDestinationIp,
  isLinkLocalIp,
  isLoopbackIp,
  isPrivateIp,
  unwrapMappedIpv4,
} from "./ip";
export { isLocalHostname, parseExternalUrl } from "./url";
export { resolveAndValidate, defaultLookup } from "./dns";
export type { LookupFn, ResolvedAddress } from "./dns";
export {
  backoffMs,
  defaultRetryPolicy,
  isRetryableError,
  isRetryableStatus,
  parseRetryAfterMs,
} from "./retry";
export { HostRateLimiter } from "./ratelimit";
export { parseRobotsTxt, isPathAllowed } from "./robots";
export { pinnedRequest } from "./request";
export type { RequestFn, RawResponse, PinnedRequestArgs } from "./request";
export { createSecureHttpClient, DEFAULT_ALLOWED_CONTENT_TYPES } from "./client";
export type { SecureHttpClientOptions, SecureHttpResponse } from "./client";
