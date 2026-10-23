import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/api/rest";
import { clientIpFrom, trustedHops, withoutPort } from "./client-ip";

const h = (xff?: string, extra: Record<string, string> = {}) => new Headers({ ...(xff === undefined ? {} : { "x-forwarded-for": xff }), ...extra });

describe("the client address behind Railway's proxy", () => {
  it("reads the hop the proxy added (the last one), never what the client wrote first", () => {
    expect(clientIpFrom(h("203.0.113.9"), {})).toBe("203.0.113.9");
    // A client that fakes the header only adds entries on the left.
    expect(clientIpFrom(h("1.2.3.4, 203.0.113.9"), {})).toBe("203.0.113.9");
    expect(clientIpFrom(h("1.2.3.4, 5.6.7.8, 2001:db8::1"), {})).toBe("2001:db8::1");
    // Faking X-Real-IP does nothing either.
    expect(clientIpFrom(h("203.0.113.9", { "x-real-ip": "1.2.3.4" }), {})).toBe("203.0.113.9");
    expect(clientIp(h("9.9.9.9, 198.51.100.7"), {})).toBe("198.51.100.7");
  });

  it("follows the trusted-proxy setting", () => {
    expect(clientIpFrom(h("1.2.3.4, 203.0.113.9, 10.0.0.2"), { WOVI_TRUSTED_PROXY_HOPS: "2" })).toBe("203.0.113.9");
    expect(clientIpFrom(h("203.0.113.9"), { WOVI_TRUSTED_PROXY_HOPS: "3" })).toBe("203.0.113.9");
    expect(clientIpFrom(h("203.0.113.9"), { WOVI_TRUSTED_PROXY_HOPS: "0" })).toBe("direct");
    expect(clientIpFrom(h("1.2.3.4", { "x-real-ip": "203.0.113.9" }), { WOVI_CLIENT_IP_HEADER: "X-Real-IP" })).toBe("203.0.113.9");
    expect(trustedHops({ WOVI_TRUSTED_PROXY_HOPS: "lots" })).toBe(1);
    expect(trustedHops({})).toBe(1);
  });

  it("never takes text that is not an address, and says local with no proxy header", () => {
    expect(clientIpFrom(h("1.2.3.4, <script>"), {})).toBe("unknown");
    expect(clientIpFrom(h(), {})).toBe("local");
    expect(clientIpFrom(h(" , "), {})).toBe("local");
  });
});

describe("one client is one address, whatever its port", () => {
  it("drops the port from IPv4, bracketed IPv6 and mapped addresses", () => {
    expect(withoutPort("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(withoutPort("203.0.113.7")).toBe("203.0.113.7");
    expect(withoutPort("[2001:DB8::1]:443")).toBe("2001:db8::1");
    expect(withoutPort("2001:db8::1")).toBe("2001:db8::1");
    expect(withoutPort("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
  it("counts new connections from the same client as one address", () => {
    const a = clientIpFrom(h("9.9.9.9, 203.0.113.7:51234"), {});
    const b = clientIpFrom(h("8.8.8.8, 203.0.113.7:60001"), {});
    expect(a).toBe("203.0.113.7");
    expect(b).toBe(a);
  });
});
