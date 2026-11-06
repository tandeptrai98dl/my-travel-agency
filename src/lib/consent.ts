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

/** Serialises a choice as `v1.a1.m0`. */
export function serializeConsent(choice: ConsentChoice): string {
  return `v${CONSENT_VERSION}.a${choice.analytics ? 1 : 0}.m${choice.marketing ? 1 : 0}`;
}

/** Parses a stored value; anything unknown or from an older version counts as "not decided". */
export function parseConsent(value: string | undefined | null): ConsentChoice | null {
  const match = value?.match(/^v(\d+)\.a([01])\.m([01])$/);
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  return { analytics: match[2] === "1", marketing: match[3] === "1" };
}

/** Reads the consent cookie from a `document.cookie` string. */
export function readConsentCookie(cookieHeader: string): ConsentChoice | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONSENT_COOKIE) return parseConsent(decodeURIComponent(rest.join("=")));
  }
  return null;
}

/** The `document.cookie` assignment for a choice (first-party, Lax, Secure on HTTPS). */
export function consentCookieString(choice: ConsentChoice, secure: boolean): string {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(choice)}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Window event fired when the choice changes; GA4 Consent Mode listens to it (Phase 3/6). */
export const CONSENT_EVENT = "consentchange";
/** Window event that reopens the settings dialog (footer "Cookie settings" link). */
export const CONSENT_OPEN_EVENT = "consentopen";
