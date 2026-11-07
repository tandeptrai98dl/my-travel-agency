import { describe, expect, it } from "vitest";

import { checkSource, clientIp, ipInRanges, parseAllowList, parseIp, parseRange } from "./ip-allowlist";

const ranges = (value: string) => {
  const { list, errors } = parseAllowList(value);
  expect(errors).toEqual([]);
  if (list.mode !== "list") throw new Error("expected a list");
  return list.ranges;
};

describe("parseIp", () => {
  it("reads IPv4 and IPv6, with IPv4-mapped IPv6 as IPv4", () => {
    expect(parseIp("203.0.113.5")).toEqual({ version: 4, value: BigInt(0xcb007105) });
    expect(parseIp("2001:db8::1")?.version).toBe(6);
    expect(parseIp("::ffff:203.0.113.5")).toEqual({ version: 4, value: BigInt(0xcb007105) });
    expect(parseIp("::ffff:cb00:7105")).toEqual({ version: 4, value: BigInt(0xcb007105) });
    expect(parseIp("::1")).toEqual({ version: 6, value: BigInt(1) });
    expect(parseIp("::")).toEqual({ version: 6, value: BigInt(0) });
    expect(parseIp("2001:db8:0:0:0:0:0:1")).toEqual(parseIp("2001:db8::1"));
  });

  it("refuses everything that is not exactly an address", () => {
    for (const bad of [
      "",
      "203.0.113",
      "203.0.113.256",
      "203.0.113.05",
      "203.0.113.5.1",
      " 203.0.113.5x",
      "1.2.3.-4",
      "2001:db8::1::2",
      "2001:db8:1:2:3:4:5:6:7",
      "2001:db8:1:2:3:4:5",
      "2001:db8::12345",
      "fe80::1%eth0",
      "::ffff:999.0.0.1",
      "localhost",
      "0x7f000001",
    ]) {
      expect(parseIp(bad), bad).toBeNull();
    }
  });
});

describe("parseRange", () => {
  it("accepts single addresses and CIDR ranges", () => {
    expect(parseRange("203.0.113.5")).toMatchObject({ version: 4, prefix: 32 });
    expect(parseRange("203.0.113.0/24")).toMatchObject({ version: 4, prefix: 24 });
    expect(parseRange("2001:db8::/32")).toMatchObject({ version: 6, prefix: 32 });
    expect(parseRange("2001:db8::1")).toMatchObject({ version: 6, prefix: 128 });
  });

  it("refuses /0, out-of-range prefixes, host bits and malformed prefixes", () => {
    for (const bad of [
      "0.0.0.0/0",
      "::/0",
      "203.0.113.0/33",
      "2001:db8::/129",
      "203.0.113.5/24",
      "2001:db8::1/64",
      "203.0.113.0/",
      "203.0.113.0/24/1",
      "203.0.113.0/2a",
      "203.0.113.0/-1",
      "::ffff:203.0.113.0/120",
      "/24",
    ]) {
      expect(parseRange(bad), bad).toBeNull();
    }
  });
});

describe("parseAllowList", () => {
  it("is off when empty and unrestricted only by the keyword", () => {
    expect(parseAllowList(undefined)).toEqual({ list: { mode: "off" }, errors: [] });
    expect(parseAllowList("  ")).toEqual({ list: { mode: "off" }, errors: [] });
    expect(parseAllowList("Unrestricted")).toEqual({ list: { mode: "unrestricted" }, errors: [] });
  });

  it("names every bad entry", () => {
    expect(parseAllowList("203.0.113.0/24, nope,,2001:db8::/129").errors).toEqual(["nope", "(empty entry)", "2001:db8::/129"]);
  });
});

describe("ipInRanges", () => {
  const list = ranges("203.0.113.0/24, 198.51.100.7, 2001:db8:abcd::/48");

  it("matches IPv4 ranges and single addresses", () => {
    expect(ipInRanges("203.0.113.0", list)).toBe(true);
    expect(ipInRanges("203.0.113.255", list)).toBe(true);
    expect(ipInRanges("203.0.114.0", list)).toBe(false);
    expect(ipInRanges("198.51.100.7", list)).toBe(true);
    expect(ipInRanges("198.51.100.8", list)).toBe(false);
  });

  it("matches IPv6 ranges, and IPv4-mapped addresses against IPv4 ranges", () => {
    expect(ipInRanges("2001:db8:abcd:12::5", list)).toBe(true);
    expect(ipInRanges("2001:db8:abce::5", list)).toBe(false);
    expect(ipInRanges("::ffff:203.0.113.9", list)).toBe(true);
    expect(ipInRanges("::ffff:203.0.114.9", list)).toBe(false);
  });

  it("never matches across versions or for bad input", () => {
    expect(ipInRanges("::cb00:7105", list)).toBe(false);
    expect(ipInRanges("not an ip", list)).toBe(false);
    expect(ipInRanges("", list)).toBe(false);
    expect(ipInRanges("203.0.113.5", [])).toBe(false);
  });
});

describe("clientIp and checkSource", () => {
  const headers = (value?: string) => new Headers(value === undefined ? {} : { "x-forwarded-for": value });

  it("takes the first x-forwarded-for hop", () => {
    expect(clientIp(headers("203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
    expect(clientIp(headers(" 2001:db8:abcd::1 "))).toBe("2001:db8:abcd::1");
    expect(clientIp(headers("garbage, 203.0.113.9"))).toBeNull();
    expect(clientIp(headers())).toBeNull();
  });

  it("allows everything while the list is off or unrestricted", () => {
    expect(checkSource({ mode: "off" }, headers())).toEqual({ enforced: false, allowed: true });
    expect(checkSource({ mode: "unrestricted" }, headers("192.0.2.1"))).toEqual({ enforced: false, allowed: true });
  });

  it("enforces the list on the first hop only, refusing a missing address", () => {
    const list = { mode: "list" as const, ranges: ranges("203.0.113.0/24") };
    expect(checkSource(list, headers("203.0.113.9"))).toEqual({ enforced: true, allowed: true });
    // A spoofed later hop does not help; only the edge-set first hop counts.
    expect(checkSource(list, headers("192.0.2.1, 203.0.113.9"))).toEqual({ enforced: true, allowed: false });
    expect(checkSource(list, headers())).toEqual({ enforced: true, allowed: false });
  });
});
