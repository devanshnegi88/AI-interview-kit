import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpClientError } from "./errors";
import { isBlockedDestinationIp } from "./ip";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export const defaultLookup: LookupFn = async (hostname) => {
  const rows = await dnsLookup(hostname, { all: true });
  return rows.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
};

/**
 * Resolve hostname to IPs (or use the literal IP) and reject if any
 * destination is private/loopback/link-local/reserved.
 */
export async function resolveAndValidate(
  hostname: string,
  lookup: LookupFn = defaultLookup,
): Promise<ResolvedAddress[]> {
  const host = hostname.replace(/^\[/, "").replace(/]$/, "");
  let addrs: ResolvedAddress[];

  if (isIP(host)) {
    addrs = [{ address: host, family: isIP(host) as 4 | 6 }];
  } else {
    try {
      addrs = await lookup(host);
    } catch (err) {
      throw new HttpClientError("DNS_FAILED", `DNS lookup failed for ${host}`, {
        retryable: true,
        cause: err,
      });
    }
  }

  if (addrs.length === 0) {
    throw new HttpClientError("DNS_FAILED", `No addresses for ${host}`, { retryable: true });
  }

  for (const addr of addrs) {
    if (isBlockedDestinationIp(addr.address)) {
      throw new HttpClientError("SSRF_BLOCKED", `Resolved destination is not allowed: ${host} -> ${addr.address}`, {
        ip: addr.address,
      });
    }
  }

  return addrs;
}
