import { describe, expect, it } from "vitest";

import { adminCsp, createNonce, isAdminPath, isSecurePath, PUBLIC_CSP_SOURCE, publicCsp, SECURE_ROUTES, secureAlternatives, secureCsp } from "./csp";

const SUPABASE = "https://x.supabase.co";
const DSN = "https://publickey@o123.ingest.de.sentry.io/456";

/** next.config.ts `source` as Next.js matches it (path-to-regexp: anchored at both ends). */
const publicSource = new RegExp(`^${PUBLIC_CSP_SOURCE.replace(/^\//, "\\/")}$`);

const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `) || part === name);

describe("secure CSP", () => {
  it("covers the localized checkout and account paths only", () => {
    for (const path of ["/dat-tour/ha-long", "/thanh-toan/PTA-2611-0042", "/thanh-toan/PTA-2611-0042/ket-qua", "/en/book/ha-long", "/en/checkout/PTA-2611-0042/result", "/thanh-toan/link/abc", "/en/pay/abc"]) {
      expect(isSecurePath(path), path).toBe(true);
    }
    // Customer sign-in and the account (Phase 5 PR 5A).
    for (const path of ["/dang-nhap", "/dang-ky", "/quen-mat-khau", "/dat-lai-mat-khau", "/en/login", "/en/register", "/en/forgot-password", "/en/reset-password", "/tai-khoan", "/tai-khoan/booking", "/tai-khoan/booking/PTA-2611-0042", "/tai-khoan/ho-so", "/en/account", "/en/account/bookings", "/en/account/bookings/PTA-2611-0042", "/en/account/profile", "/tra-cuu-booking", "/en/booking-lookup"]) {
      expect(isSecurePath(path), path).toBe(true);
    }
    // Public pages, including look-alikes of the secure paths.
    for (const path of ["/", "/en", "/tours/ha-long", "/en/tours", "/diem-den", "/admin", "/api/health", "/bookings", "/thanh-toanx", "/book/x", "/tai-khoanx", "/en/loginx", "/en/accounts", "/login", "/auth/login"]) {
      expect(isSecurePath(path), path).toBe(false);
    }
  });

  it("allows only nonce'd scripts and the hosts the checkout needs", () => {
    const policy = secureCsp({ nonce: "abc123", supabaseUrl: SUPABASE, sentryDsn: DSN, paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" });
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).toContain("img-src 'self' data: blob: https://x.supabase.co");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://x.supabase.co https://o123.ingest.de.sentry.io https://challenges.cloudflare.com");
    expect(policy).toContain("form-action 'self' https://sandbox.vnpayment.vn");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    const local = secureCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321", development: true });
    expect(local).toContain("'unsafe-eval'");
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(directive(local, "connect-src")).toBe("connect-src 'self' http://127.0.0.1:54321 https://challenges.cloudflare.com");
  });

  it("makes a fresh base64 nonce each time", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe("admin CSP", () => {
  it("covers /admin and below only", () => {
    for (const path of ["/admin", "/admin/", "/admin/tours/1/preview"]) expect(isAdminPath(path), path).toBe(true);
    for (const path of ["/administrator", "/en/admin", "/api/admin"]) expect(isAdminPath(path), path).toBe(false);
  });

  it("allows nonce'd scripts, Supabase uploads and Sentry, no frames", () => {
    const policy = adminCsp({ nonce: "n0", supabaseUrl: SUPABASE, sentryDsn: DSN });
    expect(policy).toContain("script-src 'self' 'nonce-n0' 'strict-dynamic'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://x.supabase.co https://o123.ingest.de.sentry.io");
    expect(policy).toContain("img-src 'self' data: blob: https://x.supabase.co");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });
});

describe("public CSP", () => {
  it("is nonce-free with the hosts public pages use", () => {
    const policy = publicCsp({ supabaseUrl: SUPABASE, sentryDsn: DSN });
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(policy).not.toContain("nonce-");
    expect(policy).not.toContain("unsafe-eval");
    expect(directive(policy, "img-src")).toBe("img-src 'self' data: blob: https://x.supabase.co");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://x.supabase.co https://o123.ingest.de.sentry.io https://challenges.cloudflare.com");
    expect(directive(policy, "frame-src")).toBe("frame-src https://challenges.cloudflare.com");
    for (const part of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "upgrade-insecure-requests"]) expect(policy).toContain(part);
  });

  it("upgrades insecure requests only when Supabase is https, and ignores a missing or broken DSN", () => {
    const local = publicCsp({ supabaseUrl: "http://127.0.0.1:54321", sentryDsn: "not a url", development: true });
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(local).toContain("'unsafe-eval'");
    expect(directive(local, "connect-src")).toBe("connect-src 'self' http://127.0.0.1:54321 https://challenges.cloudflare.com");
  });

  it("is generated from the secure route list, like isSecurePath", () => {
    expect(PUBLIC_CSP_SOURCE).toBe(
      "/((?!admin/|admin$|api/|dat-tour/|en/book/|thanh-toan/|en/checkout/|thanh-toan/link/|en/pay/|dang-nhap$|dang-nhap/|en/login$|en/login/|dang-ky$|dang-ky/|en/register$|en/register/|quen-mat-khau$|quen-mat-khau/|en/forgot-password$|en/forgot-password/|dat-lai-mat-khau$|dat-lai-mat-khau/|en/reset-password$|en/reset-password/|tai-khoan$|tai-khoan/|en/account$|en/account/|tra-cuu-booking$|tra-cuu-booking/|en/booking-lookup$|en/booking-lookup/).*)",
    );
    expect(SECURE_ROUTES).toEqual(["/book/[tourSlug]", "/checkout/[code]", "/pay/[token]", "/login", "/register", "/forgot-password", "/reset-password", "/account"]);
  });

  it("covers a route without parameters and the paths below it, in both languages (Phase 5 routes)", () => {
    expect(secureAlternatives(["/account", "/login"])).toEqual(["tai-khoan$", "tai-khoan/", "en/account$", "en/account/", "dang-nhap$", "dang-nhap/", "en/login$", "en/login/"]);
  });

  it("applies to public pages and /auth, never to the admin, the API or the secure paths", () => {
    for (const path of ["/", "/en", "/tours", "/tours/ha-long", "/en/tours/x", "/diem-den/viet-nam", "/auth/login", "/auth/update-password", "/robots.txt", "/administrator", "/tai-khoanx", "/en/accounts", "/dang-nhapx"]) {
      expect(publicSource.test(path), path).toBe(true);
      expect(isSecurePath(path) || isAdminPath(path), path).toBe(false);
    }
    for (const path of [
      "/admin", "/admin/tours", "/api/health", "/dat-tour/x", "/thanh-toan/PTA-1", "/thanh-toan/link/abc", "/en/book/x", "/en/checkout/PTA-1/result", "/en/pay/abc",
      "/dang-nhap", "/dang-ky", "/quen-mat-khau", "/dat-lai-mat-khau", "/en/login", "/en/register", "/en/forgot-password", "/en/reset-password",
      "/tai-khoan", "/tai-khoan/booking/PTA-2611-0042", "/tai-khoan/ho-so", "/en/account", "/en/account/bookings", "/en/account/profile", "/tra-cuu-booking", "/en/booking-lookup",
      // Below a route without parameters: the secure root answers it (its 404), so it needs the nonce policy.
      "/dang-nhap/x", "/en/login/x",
    ]) {
      expect(publicSource.test(path), path).toBe(false);
      expect(isSecurePath(path) || isAdminPath(path) || path.startsWith("/api/"), path).toBe(true);
    }
  });
});
