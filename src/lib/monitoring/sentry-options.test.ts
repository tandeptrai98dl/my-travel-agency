import * as Sentry from "@sentry/nextjs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { redactUrl, scrubBreadcrumb, sentryOptions } from "./sentry-options";

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

  describe("release tracking", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("names the release after the deployment's commit", () => {
      vi.stubEnv("SENTRY_RELEASE", "");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "");
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "d02ea67abc");
      expect(sentryOptions(DSN).release).toBe("d02ea67abc");
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "fromclient1");
      expect(sentryOptions(DSN).release).toBe("fromclient1");
      vi.stubEnv("SENTRY_RELEASE", "pta@1.0.0");
      expect(sentryOptions(DSN).release).toBe("pta@1.0.0");
    });
    it("leaves the release to the SDK when no commit is known", () => {
      vi.stubEnv("SENTRY_RELEASE", "");
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "");
      expect("release" in sentryOptions(DSN)).toBe(false);
    });
  });

  it("drops breadcrumbs of requests to the cron heartbeat (a secret URL)", () => {
    vi.stubEnv("CRON_HEARTBEAT_URL", "https://hb.example.test/ping/secret-token-{job}");
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "https://hb.example.test/ping/secret-token-health-checks", method: "GET" } })).toBeNull();
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "https://api.resend.com/emails", method: "POST" } })).not.toBeNull();
    vi.unstubAllEnvs();
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "https://hb.example.test/ping/x" } })).not.toBeNull();
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

  it("never sends a payment-link token in the transaction name or the envelope header's trace", async () => {
    envelopes.length = 0;
    for (const path of ["/en/pay/secret-dsc-token-en", "/thanh-toan/link/secret-dsc-token-vi"]) {
      Sentry.withIsolationScope((scope) => {
        scope.setTransactionName(`GET ${path}`);
        Sentry.withScope((inner) => {
          inner.setTransactionName(`GET ${path}`);
          Sentry.captureException(new Error("link boom"));
        });
      });
    }
    // A span named after a raw URL: tracing is off, but its name must not reach a header either.
    Sentry.startSpan({ name: "GET /en/pay/secret-dsc-token-span", forceTransaction: true }, () => {
      Sentry.captureException(new Error("span boom"));
    });
    await Sentry.flush(2000);

    expect(envelopes.length).toBeGreaterThanOrEqual(3);
    process.stderr.write("HDRS " + envelopes.map((e) => JSON.stringify(JSON.parse(e)[0])).join("\n") + "\n");
    for (const raw of envelopes) {
      const [header, items] = JSON.parse(raw) as [{ trace?: { transaction?: string } }, [unknown, { transaction?: string }][]];
      expect(header.trace?.transaction ?? "", "envelope header trace.transaction").not.toMatch(/secret-dsc/);
      for (const [, payload] of items) expect(payload?.transaction ?? "", "event transaction").not.toMatch(/secret-dsc/);
    }
    expect(envelopes.join("\n")).not.toContain("secret-dsc");
  });
});
