import { describe, expect, it } from "vitest";

import { createNonce, isSecurePath, secureCsp } from "./csp";

describe("secure CSP", () => {
  it("covers the localized checkout and account paths only", () => {
    for (const path of ["/dat-tour/ha-long", "/thanh-toan/PTA-2611-0042", "/thanh-toan/PTA-2611-0042/ket-qua", "/en/book/ha-long", "/en/checkout/PTA-2611-0042/result", "/thanh-toan/link/abc", "/en/pay/abc"]) {
      expect(isSecurePath(path), path).toBe(true);
    }
    // Not served by the secure root yet (the account): the public root answers them.
    for (const path of ["/", "/en", "/tours/ha-long", "/en/tours", "/diem-den", "/admin", "/api/health", "/bookings", "/thanh-toanx", "/tai-khoan", "/en/account/bookings", "/book/x"]) {
      expect(isSecurePath(path), path).toBe(false);
    }
  });

  it("allows only nonce'd scripts and the hosts the checkout needs", () => {
    const policy = secureCsp({ nonce: "abc123", supabaseUrl: "https://x.supabase.co", paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" });
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).toContain("img-src 'self' data: blob: https://x.supabase.co");
    expect(policy).toContain("form-action 'self' https://sandbox.vnpayment.vn");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    const local = secureCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321", development: true });
    expect(local).toContain("'unsafe-eval'");
    expect(local).not.toContain("upgrade-insecure-requests");
  });

  it("makes a fresh base64 nonce each time", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});
