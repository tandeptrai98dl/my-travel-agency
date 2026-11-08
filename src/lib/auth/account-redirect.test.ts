import { describe, expect, it } from "vitest";

import { accountLocale, hasSessionCookie, signedOutAccountRedirect } from "./account-redirect";

const none: { name: string; value: string }[] = [];
const session = [{ name: "sb-127-auth-token", value: "base64-eyJ..." }];

describe("accountLocale", () => {
  it.each([
    ["/tai-khoan", "vi"],
    ["/tai-khoan/booking", "vi"],
    ["/tai-khoan/booking/PTA-2611-0001", "vi"],
    ["/tai-khoan/ho-so", "vi"],
    ["/en/account", "en"],
    ["/en/account/bookings", "en"],
    ["/en/account/profile", "en"],
  ])("finds the account page %s", (path, locale) => {
    expect(accountLocale(path)).toBe(locale);
  });

  it.each(["/", "/dang-nhap", "/en/login", "/tai-khoanx", "/en/accounting", "/account", "/en/tai-khoan", "/admin", "/thanh-toan/PTA-2611-0001"])(
    "ignores %s",
    (path) => {
      expect(accountLocale(path)).toBeNull();
    },
  );
});

describe("hasSessionCookie", () => {
  it.each([
    [[{ name: "sb-abcdefghijklmnop-auth-token", value: "x" }], true],
    [[{ name: "sb-127-auth-token.0", value: "x" }, { name: "sb-127-auth-token.1", value: "y" }], true],
    // Removed by the refresh (empty value), the PKCE verifier and unrelated cookies are no session.
    [[{ name: "sb-127-auth-token", value: "" }], false],
    [[{ name: "sb-127-auth-token-code-verifier", value: "x" }], false],
    [[{ name: "consent", value: "v1.a0.m0" }, { name: "booking_access_PTA-2611-0001", value: "x" }], false],
    [[], false],
  ])("%j → %s", (cookies, expected) => {
    expect(hasSessionCookie(cookies)).toBe(expected);
  });
});

describe("signedOutAccountRedirect", () => {
  it("sends signed-out visitors to sign-in in their language, with the page as next", () => {
    expect(signedOutAccountRedirect("/tai-khoan", "", none)).toBe("/dang-nhap?next=%2Ftai-khoan");
    expect(signedOutAccountRedirect("/tai-khoan/booking", "", none)).toBe("/dang-nhap?next=%2Ftai-khoan%2Fbooking");
    expect(signedOutAccountRedirect("/en/account", "", none)).toBe("/en/login?next=%2Fen%2Faccount");
    expect(signedOutAccountRedirect("/en/account/bookings", "?page=2", none)).toBe("/en/login?next=%2Fen%2Faccount%2Fbookings%3Fpage%3D2");
  });

  it("leaves signed-in requests and other pages to the app", () => {
    expect(signedOutAccountRedirect("/tai-khoan", "", session)).toBeNull();
    expect(signedOutAccountRedirect("/dang-nhap", "", none)).toBeNull();
    expect(signedOutAccountRedirect("/tours", "", none)).toBeNull();
  });

  it("falls back to the account root when the path is not a safe next", () => {
    // A path that normalises to another host never becomes `next`.
    expect(signedOutAccountRedirect("/tai-khoan/..//evil.example", "", none)).toBe("/dang-nhap?next=%2Ftai-khoan");
    expect(signedOutAccountRedirect("/en/account/../..//evil.example", "", none)).toBe("/en/login?next=%2Fen%2Faccount");
  });

  it("drops a query that would not fit the sign-in page's 500-character next", () => {
    expect(signedOutAccountRedirect("/tai-khoan/booking", `?q=${"a".repeat(600)}`, none)).toBe("/dang-nhap?next=%2Ftai-khoan%2Fbooking");
  });
});
