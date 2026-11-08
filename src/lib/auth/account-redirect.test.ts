import { describe, expect, it } from "vitest";

import { accountLocale, hasSessionCookie, sessionCookieName, signedOutAccountRedirect } from "./account-redirect";

const NAME = "sb-127-auth-token";
const none: { name: string; value: string }[] = [];
const session = [{ name: NAME, value: "base64-eyJ..." }];
const redirect = (path: string, search = "", cookies = none) => signedOutAccountRedirect(path, search, cookies, NAME);

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

describe("sessionCookieName", () => {
  it.each([
    ["http://127.0.0.1:54321", "sb-127-auth-token"],
    ["http://localhost:54321", "sb-localhost-auth-token"],
    ["https://abcdefghijklmnop.supabase.co", "sb-abcdefghijklmnop-auth-token"],
  ])("derives %s → %s, as @supabase/ssr does", (url, name) => {
    expect(sessionCookieName(url)).toBe(name);
  });

  it("gives null for a value that is not a URL", () => {
    expect(sessionCookieName("")).toBeNull();
  });
});

describe("hasSessionCookie", () => {
  it.each([
    [[{ name: NAME, value: "x" }], true],
    [[{ name: `${NAME}.0`, value: "x" }, { name: `${NAME}.1`, value: "y" }], true],
    // Removed by the refresh (empty value), the PKCE verifier and unrelated cookies are no session.
    [[{ name: NAME, value: "" }], false],
    [[{ name: `${NAME}-code-verifier`, value: "x" }], false],
    [[{ name: `${NAME}.x`, value: "x" }], false],
    [[{ name: "consent", value: "v1.a0.m0" }, { name: "booking_access_PTA-2611-0001", value: "x" }], false],
    // Another project's leftover cookie never counts (it is not refreshed or cleared).
    [[{ name: "sb-localhost-auth-token", value: "x" }], false],
    [[{ name: "sb-abcdefghijklmnop-auth-token.0", value: "x" }], false],
    [[], false],
  ])("%j → %s", (cookies, expected) => {
    expect(hasSessionCookie(cookies, NAME)).toBe(expected);
  });
});

describe("signedOutAccountRedirect", () => {
  it("sends signed-out visitors to sign-in in their language, with the page as next", () => {
    expect(redirect("/tai-khoan", "")).toBe("/dang-nhap?next=%2Ftai-khoan");
    expect(redirect("/tai-khoan/booking", "")).toBe("/dang-nhap?next=%2Ftai-khoan%2Fbooking");
    expect(redirect("/en/account", "")).toBe("/en/login?next=%2Fen%2Faccount");
    expect(redirect("/en/account/bookings", "?page=2")).toBe("/en/login?next=%2Fen%2Faccount%2Fbookings%3Fpage%3D2");
  });

  it("leaves signed-in requests and other pages to the app", () => {
    expect(redirect("/tai-khoan", "", session)).toBeNull();
    expect(redirect("/dang-nhap", "")).toBeNull();
    expect(redirect("/tours", "")).toBeNull();
  });

  it("falls back to the account root when the path is not a safe next", () => {
    // A path that normalises to another host never becomes `next`.
    expect(redirect("/tai-khoan/..//evil.example", "")).toBe("/dang-nhap?next=%2Ftai-khoan");
    expect(redirect("/en/account/../..//evil.example", "")).toBe("/en/login?next=%2Fen%2Faccount");
  });

  it("ignores another project's leftover cookie", () => {
    expect(redirect("/tai-khoan", "", [{ name: "sb-localhost-auth-token", value: "x" }])).toBe("/dang-nhap?next=%2Ftai-khoan");
  });

  it("drops a query, then a path, that would not fit the sign-in page's 500-character next", () => {
    expect(redirect(`/tai-khoan/booking/${"A".repeat(600)}`)).toBe("/dang-nhap?next=%2Ftai-khoan");
    expect(redirect(`/en/account/bookings/${"A".repeat(600)}`, "?page=2")).toBe("/en/login?next=%2Fen%2Faccount");
    expect(redirect("/tai-khoan/booking", `?q=${"a".repeat(600)}`)).toBe("/dang-nhap?next=%2Ftai-khoan%2Fbooking");
  });
});
