/**
 * Cookie-consent state (spec step 9). Essential cookies need no consent; analytics and marketing
 * stay off until the visitor opts in. Stored in a first-party cookie readable by the client so
 * cached public pages stay static (no cookie read on the server).
 */

export const CONSENT_COOKIE = "consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 12 months

export type ConsentChoice = { analytics: boolean; marketing: boolean };

export const ESSENTIAL_ONLY: ConsentChoice = { analytics: false, marketing: false };
export const ALL_ACCEPTED: ConsentChoice = { analytics: true, marketing: true };

/**
 * The cookie value: `v1.a1.m0`, then `.<id>` once the choice has a pseudonymous record id
 * (`cookie_consents.id`, ADR-039). Older values without an id stay valid; the next choice adds one.
 */
export function serializeConsent(choice: ConsentChoice, id?: string | null): string {
  const base = `v${CONSENT_VERSION}.a${choice.analytics ? 1 : 0}.m${choice.marketing ? 1 : 0}`;
  return id && isConsentId(id) ? `${base}.${id}` : base;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A version 4 UUID in lower case (the only form the record id takes). */
export function isConsentId(value: string): boolean {
  return UUID.test(value);
}

/** Parses a stored value with its record id; anything unknown or older counts as "not decided". */
export function parseConsentValue(value: string | undefined | null): { choice: ConsentChoice; id: string | null } | null {
  const match = value?.match(/^v(\d+)\.a([01])\.m([01])(?:\.([0-9a-f-]{36}))?$/);
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  if (match[4] !== undefined && !isConsentId(match[4])) return null;
  return { choice: { analytics: match[2] === "1", marketing: match[3] === "1" }, id: match[4] ?? null };
}

/** Parses a stored value; anything unknown or from an older version counts as "not decided". */
export function parseConsent(value: string | undefined | null): ConsentChoice | null {
  return parseConsentValue(value)?.choice ?? null;
}

/** Reads the consent cookie (choice and record id) from a `document.cookie` string. */
export function readConsentRecord(cookieHeader: string): { choice: ConsentChoice; id: string | null } | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== CONSENT_COOKIE) continue;
    try {
      return parseConsentValue(decodeURIComponent(rest.join("=")));
    } catch {
      return null; // malformed encoding: treat as undecided
    }
  }
  return null;
}

/** Reads the consent cookie from a `document.cookie` string. */
export function readConsentCookie(cookieHeader: string): ConsentChoice | null {
  return readConsentRecord(cookieHeader)?.choice ?? null;
}

/** The `document.cookie` assignment for a choice (first-party, Lax, Secure on HTTPS). */
export function consentCookieString(choice: ConsentChoice, secure: boolean, id?: string | null): string {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(choice, id)}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** What the visitor pressed: "Accept all", "Essential only" or "Save my choices". */
export type ConsentSource = "accept_all" | "essential_only" | "custom";
/** The `cookie_consents.action` of a choice. */
export type ConsentAction = ConsentSource | "withdraw";

/**
 * The recorded action of a choice: taking back every optional category that was granted is a
 * withdrawal, whichever button did it; otherwise the button pressed. "Save my choices" with both
 * categories on or off is still `custom` (the stored choices say what was chosen).
 */
export function consentAction(previous: ConsentChoice | null, next: ConsentChoice, source: ConsentSource): ConsentAction {
  const hadGrant = Boolean(previous && (previous.analytics || previous.marketing));
  if (hadGrant && !next.analytics && !next.marketing) return "withdraw";
  if (source === "accept_all" && !(next.analytics && next.marketing)) return "custom";
  if (source === "essential_only" && (next.analytics || next.marketing)) return "custom";
  return source;
}

/** A new pseudonymous record id (UUID v4), also where `crypto.randomUUID` is missing. */
export function newConsentId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `localStorage` key of choices whose record failed, retried once on the next page view. */
export const CONSENT_RETRY_KEY = "consent-retry";

/** Window event fired when the choice changes (detail: the choice); the analytics loader listens to it. */
export const CONSENT_EVENT = "consentchange";
/** Window event that reopens the settings dialog (footer "Cookie settings" link). */
export const CONSENT_OPEN_EVENT = "consentopen";
