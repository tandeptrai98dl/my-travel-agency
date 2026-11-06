import * as Sentry from "@sentry/nextjs";
import { afterAll, describe, expect, it } from "vitest";

import { redactUrl, sentryOptions } from "./sentry-options";

const DSN = "https://publickey@o0.ingest.sentry.io/0";

describe("Sentry options", () => {
  it("is disabled without a DSN", () => {
    expect(sentryOptions(undefined).enabled).toBe(false);
    expect(sentryOptions(DSN).enabled).toBe(true);
  });

  it("redacts query strings and payment-link tokens from URLs", () => {
    expect(redactUrl("https://x.vn/pay/abc123?x=1#y")).toBe("https://x.vn/pay/[redacted]");
    expect(redactUrl("/thanh-toan/link/abc123")).toBe("/thanh-toan/link/[redacted]");
    expect(redactUrl("/en/tours/ha-long?page=2")).toBe("/en/tours/ha-long");
    expect(redactUrl("/thanh-toan/PTA-2611-0042/ket-qua")).toBe("/thanh-toan/PTA-2611-0042/ket-qua");
  });

  it("records errors only, no performance traces", () => {
    expect("tracesSampleRate" in sentryOptions(DSN)).toBe(false);
    expect("tracesSampler" in sentryOptions(DSN)).toBe(false);
  });
});

describe("what a server error event actually contains", () => {
  const envelopes: string[] = [];

  Sentry.init({
    ...sentryOptions(DSN),
    // Capture envelopes in memory instead of sending them.
    transport: () => ({
      send: async (envelope: unknown) => {
        envelopes.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => true,
    }),
    defaultIntegrations: false,
    integrations: [Sentry.requestDataIntegration()],
  });

  afterAll(async () => {
    await Sentry.close();
  });

  it("drops IPs, cookies, bodies, query strings, credentials and user details", async () => {
    Sentry.withIsolationScope((scope) => {
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          method: "POST",
          url: "https://example.com/auth/callback?code=secret-oauth-code&email=a%40b.vn",
          query_string: "code=secret-oauth-code&email=a%40b.vn",
          headers: {
            "user-agent": "Mozilla/5.0",
            "x-forwarded-for": "203.0.113.7",
            "x-real-ip": "203.0.113.7",
            "x-vercel-ip-city": "Hanoi",
            authorization: "Bearer secret-token",
            cookie: "sb-access-token=secret-cookie",
            referer: "https://example.com/pay/secret-pay-token",
          },
          cookies: { "sb-access-token": "secret-cookie" },
          data: '{"contact_email":"a@b.vn","password":"secret-password"}',
        },
        ipAddress: "203.0.113.7",
      });
      scope.setUser({ id: "user-1", email: "a@b.vn", ip_address: "203.0.113.7" });
      Sentry.addBreadcrumb({ category: "console", message: "contact a@b.vn" });
      Sentry.addBreadcrumb({
        category: "navigation",
        data: { from: "/en?email=a%40b.vn", to: "/pay/secret-pay-token?code=secret-oauth-code" },
      });
      Sentry.captureException(new Error("boom"));
    });
    // A server span over a URL with a token: tracing is off, so nothing about it may be sent.
    Sentry.startSpan(
      {
        name: "GET /auth/confirm",
        attributes: { "http.target": "/auth/confirm?token_hash=secret-span-token", "url.path": "/pay/secret-span-path" },
      },
      () => undefined,
    );
    await Sentry.flush(2000);

    const sent = envelopes.join("\n");
    expect(sent).not.toContain('"type":"transaction"');
    expect(sent).not.toContain('"type":"span"');
    expect(sent).not.toContain("secret-span");
    expect(sent).toContain("boom");
    for (const secret of [
      "203.0.113.7",
      "Hanoi",
      "secret-token",
      "secret-cookie",
      "secret-oauth-code",
      "secret-pay-token",
      "secret-password",
      "a@b.vn",
      "a%40b.vn",
    ]) {
      expect(sent, secret).not.toContain(secret);
    }
    expect(sent).toContain("Mozilla/5.0");
  });
});
