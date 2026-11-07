/**
 * Source-IP allow-lists for the payment webhooks (docs/specs/phase-6-hardening-launch.md
 * decision 2): `VNPAY_IPN_ALLOWED_IPS` and `BANK_WEBHOOK_ALLOWED_IPS` hold comma-separated
 * addresses or CIDR ranges, IPv4 or IPv6. Empty means "not enforced"; the keyword `unrestricted`
 * records an accepted exception for a provider that publishes no addresses (the signature check
 * stays the only guard, docs/SECURITY_REVIEW.md). Pure TypeScript, so it runs in any runtime.
 */

export type IpRange = { version: 4 | 6; base: bigint; prefix: number };

export type IpAllowList =
  | { mode: "off" }
  | { mode: "unrestricted" }
  | { mode: "list"; ranges: IpRange[] };

export const UNRESTRICTED = "unrestricted";

function parseIpv4(text: string): bigint | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = BigInt(0);
  for (const part of parts) {
    // Decimal octets only: no leading zeros (an "octal" 010 would mean something else elsewhere).
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << BigInt(8)) | BigInt(octet);
  }
  return value;
}

function parseIpv6(text: string): bigint | null {
  if (text.includes("%") || !/^[0-9a-fA-F:.]+$/.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (half: string): number[] | null => {
    if (half === "") return [];
    const out: number[] = [];
    const parts = half.split(":");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (i === parts.length - 1 && part.includes(".")) {
        const v4 = parseIpv4(part);
        if (v4 === null) return null;
        out.push(Number(v4 >> BigInt(16)), Number(v4 & BigInt(0xffff)));
      } else if (/^[0-9a-fA-F]{1,4}$/.test(part)) {
        out.push(parseInt(part, 16));
      } else {
        return null;
      }
    }
    return out;
  };
  const head = groups(halves[0]!);
  const tail = halves.length === 2 ? groups(halves[1]!) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
  return all.reduce((value, group) => (value << BigInt(16)) | BigInt(group), BigInt(0));
}

const MAPPED_PREFIX = BigInt(0xffff) << BigInt(32);
const LOW_32 = (BigInt(1) << BigInt(32)) - BigInt(1);

/** An address as a version and a number; IPv4-mapped IPv6 (::ffff:a.b.c.d) counts as IPv4. */
export function parseIp(text: string): { version: 4 | 6; value: bigint } | null {
  const trimmed = text.trim();
  if (trimmed.includes(":")) {
    const value = parseIpv6(trimmed);
    if (value === null) return null;
    if ((value & ~LOW_32) === MAPPED_PREFIX) {
      return { version: 4, value: value & LOW_32 };
    }
    return { version: 6, value };
  }
  const value = parseIpv4(trimmed);
  return value === null ? null : { version: 4, value };
}

function mask(version: 4 | 6, prefix: number): bigint {
  const bits = version === 4 ? 32 : 128;
  return ((BigInt(1) << BigInt(bits)) - BigInt(1)) ^ ((BigInt(1) << BigInt(bits - prefix)) - BigInt(1));
}

/** One address (a /32 or /128) or a CIDR range; null for anything else, including /0. */
export function parseRange(text: string): IpRange | null {
  const [address, prefixText, extra] = text.trim().split("/");
  if (extra !== undefined || !address) return null;
  const ip = parseIp(address);
  if (!ip) return null;
  // A mapped address with a prefix would be ambiguous (its IPv6 prefix length); write IPv4 instead.
  if (prefixText !== undefined && address.includes(":") && ip.version === 4) return null;
  const bits = ip.version === 4 ? 32 : 128;
  if (prefixText !== undefined && !/^\d{1,3}$/.test(prefixText)) return null;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  // /0 would allow every address: leave the variable empty for "not enforced" instead.
  if (prefix < 1 || prefix > bits) return null;
  const m = mask(ip.version, prefix);
  // Host bits must be zero (203.0.113.5/24 is almost always a typo for one address or the range).
  if ((ip.value & m) !== ip.value) return null;
  return { version: ip.version, base: ip.value, prefix };
}

/** Parses the env value; `errors` lists the entries that are not valid addresses or ranges. */
export function parseAllowList(value: string | undefined): { list: IpAllowList; errors: string[] } {
  const text = (value ?? "").trim();
  if (text === "") return { list: { mode: "off" }, errors: [] };
  if (text.toLowerCase() === UNRESTRICTED) return { list: { mode: "unrestricted" }, errors: [] };
  const ranges: IpRange[] = [];
  const errors: string[] = [];
  for (const entry of text.split(",").map((part) => part.trim())) {
    const range = entry ? parseRange(entry) : null;
    if (range) ranges.push(range);
    else errors.push(entry || "(empty entry)");
  }
  return { list: { mode: "list", ranges }, errors };
}

/** Whether an address falls in one of the ranges. */
export function ipInRanges(ip: string, ranges: readonly IpRange[]): boolean {
  const parsed = parseIp(ip);
  if (!parsed) return false;
  return ranges.some((range) => range.version === parsed.version && (parsed.value & mask(range.version, range.prefix)) === range.base);
}

/**
 * The caller's address: the first `x-forwarded-for` hop. On Vercel this header is set by the edge
 * and a client-sent value is overwritten, so the first hop is the connecting address. Null when
 * missing or not an address (refused wherever the list is enforced).
 */
export function clientIp(headers: Headers): string | null {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return parseIp(first) ? first : null;
}

export type SourceCheck = { enforced: boolean; allowed: boolean };

/** The allow-list decision for a request: allowed whenever the list is off or unrestricted. */
export function checkSource(list: IpAllowList, headers: Headers): SourceCheck {
  if (list.mode !== "list") return { enforced: false, allowed: true };
  const ip = clientIp(headers);
  return { enforced: true, allowed: ip !== null && ipInRanges(ip, list.ranges) };
}
