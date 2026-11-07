import { describe, expect, it } from "vitest";

import {
  ALL_ACCEPTED,
  consentAction,
  consentCookieString,
  ESSENTIAL_ONLY,
  isConsentId,
  newConsentId,
  parseConsent,
  parseConsentValue,
  readConsentRecord,
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

describe("readConsentCookie robustness", () => {
  it("treats a malformed encoding as undecided instead of throwing", () => {
    expect(readConsentCookie("consent=%E0%A4%A")).toBeNull();
  });
});

describe("consent record id", () => {
  const id = "0f8b9c1e-2d3a-4b5c-8d6e-7f8091a2b3c4";

  it("keeps the record id in the cookie and reads it back", () => {
    const value = serializeConsent(ALL_ACCEPTED, id);
    expect(value).toBe(`v1.a1.m1.${id}`);
    expect(parseConsentValue(value)).toEqual({ choice: ALL_ACCEPTED, id });
    expect(readConsentRecord(`x=1; consent=${encodeURIComponent(value)}`)).toEqual({ choice: ALL_ACCEPTED, id });
    expect(consentCookieString(ESSENTIAL_ONLY, false, id)).toContain(`consent=v1.a0.m0.${id};`);
  });

  it("accepts older values without an id and refuses a malformed id", () => {
    expect(parseConsentValue("v1.a0.m0")).toEqual({ choice: ESSENTIAL_ONLY, id: null });
    expect(parseConsentValue("v1.a0.m0.not-a-uuid-at-all-not-a-uuid-at-a")).toBeNull();
    expect(parseConsentValue(`v1.a0.m0.${id.toUpperCase()}`)).toBeNull();
    expect(serializeConsent(ESSENTIAL_ONLY, "nope")).toBe("v1.a0.m0");
  });

  it("makes version 4 UUIDs", () => {
    const made = new Set(Array.from({ length: 20 }, newConsentId));
    expect(made.size).toBe(20);
    for (const value of made) expect(isConsentId(value)).toBe(true);
  });
});

describe("consent actions (the recorded state machine)", () => {
  const analyticsOnly = { analytics: true, marketing: false };

  it("names the button pressed for a first choice", () => {
    expect(consentAction(null, ALL_ACCEPTED, "accept_all")).toBe("accept_all");
    expect(consentAction(null, ESSENTIAL_ONLY, "essential_only")).toBe("essential_only");
    expect(consentAction(null, analyticsOnly, "custom")).toBe("custom");
    expect(consentAction(null, ESSENTIAL_ONLY, "custom")).toBe("custom");
  });

  it("records taking back every granted category as a withdrawal", () => {
    expect(consentAction(ALL_ACCEPTED, ESSENTIAL_ONLY, "essential_only")).toBe("withdraw");
    expect(consentAction(analyticsOnly, ESSENTIAL_ONLY, "custom")).toBe("withdraw");
    // Nothing was granted, so nothing is withdrawn.
    expect(consentAction(ESSENTIAL_ONLY, ESSENTIAL_ONLY, "essential_only")).toBe("essential_only");
    // A partial change is a custom choice.
    expect(consentAction(ALL_ACCEPTED, analyticsOnly, "custom")).toBe("custom");
    expect(consentAction(ESSENTIAL_ONLY, ALL_ACCEPTED, "accept_all")).toBe("accept_all");
  });

  it("never records an action that disagrees with the choices", () => {
    expect(consentAction(null, analyticsOnly, "accept_all")).toBe("custom");
    expect(consentAction(null, analyticsOnly, "essential_only")).toBe("custom");
  });
});
