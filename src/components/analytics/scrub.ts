import type { AnalyticsParams } from "./track";

/** Booking (`PTA-2611-0042`) and inquiry (`INQ-2611-0042`) codes. */
const CODE = /\b(?:PTA|INQ)-?\d{4}-?\d{3,}\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Long digit runs (phone numbers) and long URL-safe tokens. */
const PHONE = /(?:\+?\d[\s.-]?){8,}/;
const TOKEN = /[A-Za-z0-9_-]{32,}/;

/** Whether a string could carry personal data, a code or a token. */
export function unsafeValue(value: string): boolean {
  return CODE.test(value) || EMAIL.test(value) || UUID.test(value) || PHONE.test(value) || TOKEN.test(value);
}

/**
 * The last guard before gtag: drops any string parameter that looks like a code, an address, a
 * phone number, a UUID (the consent id) or a token. `transaction_id` is a hash made for GA and
 * passes as long as it is one (32 hex digits).
 */
export function scrubParams(params: AnalyticsParams): AnalyticsParams {
  const out: AnalyticsParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "transaction_id") {
      if (typeof value === "string" && /^[0-9a-f]{32}$/.test(value)) out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (!unsafeValue(value)) out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((entry) =>
        Object.fromEntries(Object.entries(entry).filter(([, inner]) => typeof inner !== "string" || !unsafeValue(inner))),
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}
