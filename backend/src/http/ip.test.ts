import { describe, expect, it } from "vitest";
import { isBlockedDestinationIp, isLinkLocalIp, isLoopbackIp, isPrivateIp, unwrapMappedIpv4 } from "./ip";

describe("destination IP classification", () => {
  it("rejects loopback", () => {
    expect(isLoopbackIp("127.0.0.1")).toBe(true);
    expect(isLoopbackIp("127.0.0.2")).toBe(true);
    expect(isLoopbackIp("::1")).toBe(true);
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedDestinationIp("127.0.0.1")).toBe(true);
  });

  it("rejects private IPv4", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.20")).toBe(true);
    expect(isPrivateIp("172.16.0.4")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isBlockedDestinationIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("rejects link-local", () => {
    expect(isLinkLocalIp("169.254.1.1")).toBe(true);
    expect(isLinkLocalIp("169.254.169.254")).toBe(true);
    expect(isLinkLocalIp("fe80::1")).toBe(true);
    expect(isBlockedDestinationIp("169.254.169.254")).toBe(true);
  });

  it("allows a public address", () => {
    expect(isBlockedDestinationIp("1.1.1.1")).toBe(false);
    expect(isBlockedDestinationIp("8.8.8.8")).toBe(false);
    expect(isBlockedDestinationIp("93.184.216.34")).toBe(false);
  });

  it("unwraps IPv4-mapped IPv6", () => {
    expect(unwrapMappedIpv4("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(isBlockedDestinationIp("::ffff:192.168.0.1")).toBe(true);
  });
});
