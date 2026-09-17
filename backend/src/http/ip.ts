import { BlockList, isIP } from "node:net";

const v4Blocked = new BlockList();
v4Blocked.addSubnet("0.0.0.0", 8, "ipv4");
v4Blocked.addSubnet("10.0.0.0", 8, "ipv4");
v4Blocked.addSubnet("100.64.0.0", 10, "ipv4");
v4Blocked.addSubnet("127.0.0.0", 8, "ipv4");
v4Blocked.addSubnet("169.254.0.0", 16, "ipv4");
v4Blocked.addSubnet("172.16.0.0", 12, "ipv4");
v4Blocked.addSubnet("192.0.0.0", 24, "ipv4");
v4Blocked.addSubnet("192.0.2.0", 24, "ipv4");
v4Blocked.addSubnet("192.168.0.0", 16, "ipv4");
v4Blocked.addSubnet("198.18.0.0", 15, "ipv4");
v4Blocked.addSubnet("198.51.100.0", 24, "ipv4");
v4Blocked.addSubnet("203.0.113.0", 24, "ipv4");
v4Blocked.addSubnet("224.0.0.0", 4, "ipv4");
v4Blocked.addSubnet("240.0.0.0", 4, "ipv4");

const v6Blocked = new BlockList();
v6Blocked.addAddress("::", "ipv6");
v6Blocked.addAddress("::1", "ipv6");
v6Blocked.addSubnet("fc00::", 7, "ipv6");
v6Blocked.addSubnet("fe80::", 10, "ipv6");
v6Blocked.addSubnet("ff00::", 8, "ipv6");
v6Blocked.addSubnet("2001:db8::", 32, "ipv6");
v6Blocked.addSubnet("fec0::", 10, "ipv6");

const LOOPBACK_V4 = new BlockList();
LOOPBACK_V4.addSubnet("127.0.0.0", 8, "ipv4");

const PRIVATE_V4 = new BlockList();
PRIVATE_V4.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_V4.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_V4.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_V4.addSubnet("100.64.0.0", 10, "ipv4");

const LINK_LOCAL_V4 = new BlockList();
LINK_LOCAL_V4.addSubnet("169.254.0.0", 16, "ipv4");

/** Unwrap IPv4-mapped IPv6 (::ffff:a.b.c.d) to a.b.c.d. */
export function unwrapMappedIpv4(ip: string): string {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = ip.slice(ip.lastIndexOf(":") + 1);
    if (isIP(rest) === 4) return rest;
  }
  return ip;
}

export function isLoopbackIp(ip: string): boolean {
  const addr = unwrapMappedIpv4(ip);
  const kind = isIP(addr);
  if (kind === 4) return LOOPBACK_V4.check(addr, "ipv4");
  if (kind === 6) return addr === "::1";
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const addr = unwrapMappedIpv4(ip);
  const kind = isIP(addr);
  if (kind === 4) return PRIVATE_V4.check(addr, "ipv4");
  if (kind === 6) return v6Blocked.check(addr, "ipv6") && !isLoopbackIp(addr) && !isLinkLocalIp(addr);
  return false;
}

export function isLinkLocalIp(ip: string): boolean {
  const addr = unwrapMappedIpv4(ip);
  const kind = isIP(addr);
  if (kind === 4) return LINK_LOCAL_V4.check(addr, "ipv4");
  if (kind === 6) return addr.toLowerCase().startsWith("fe80:");
  return false;
}

/** True if this address must not be contacted (SSRF). */
export function isBlockedDestinationIp(ip: string): boolean {
  const addr = unwrapMappedIpv4(ip);
  const kind = isIP(addr);
  if (kind === 4) return v4Blocked.check(addr, "ipv4") || addr === "255.255.255.255";
  if (kind === 6) {
    if (addr.toLowerCase().startsWith("::ffff:")) {
      return isBlockedDestinationIp(unwrapMappedIpv4(addr));
    }
    return v6Blocked.check(addr, "ipv6");
  }
  return true;
}

export function ipKind(ip: string): 0 | 4 | 6 {
  return isIP(unwrapMappedIpv4(ip)) as 0 | 4 | 6;
}
