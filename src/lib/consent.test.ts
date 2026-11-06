import { describe, expect, it } from "vitest";

import {
  ALL_ACCEPTED,
  consentCookieString,
  ESSENTIAL_ONLY,
  parseConsent,
  readConsentCookie,
  serializeConsent,
} from "./consent";

describe("consent cookie", () => {
  it("round-trips a choice", () => {
    for (const choice of [ESSENTIAL_ONLY, ALL_ACCEPTED, { analytics: true, marketing: false }]) {
      expect(parseConsent(serializeConsent(choice))).toEqual(choice);
    }
  });

  it("treats unknown, malformed or older values as undecided", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent("v0.a1.m1")).toBeNull();
    expect(parseConsent("v1.a2.m0")).toBeNull();
  });

  it("reads the cookie among others", () => {
    expect(readConsentCookie("sb=x; consent=v1.a1.m0; theme=light")).toEqual({
      analytics: true,
      marketing: false,
    });
    expect(readConsentCookie("sb=x")).toBeNull();
  });

  it("writes a 12-month first-party cookie, Secure on HTTPS", () => {
    const value = consentCookieString(ESSENTIAL_ONLY, true);
    expect(value).toContain("consent=v1.a0.m0");
    expect(value).toContain("Max-Age=31536000");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Secure");
    expect(consentCookieString(ESSENTIAL_ONLY, false)).not.toContain("Secure");
  });
});
