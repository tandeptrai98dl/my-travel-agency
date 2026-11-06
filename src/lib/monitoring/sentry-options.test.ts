import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubEvent, sentryOptions } from "./sentry-options";

describe("Sentry options", () => {
  it("is disabled without a DSN", () => {
    expect(sentryOptions(undefined).enabled).toBe(false);
    expect(sentryOptions("https://key@o0.ingest.sentry.io/1").enabled).toBe(true);
  });

  it("never sends default PII", () => {
    expect(sentryOptions("https://key@o0.ingest.sentry.io/1").sendDefaultPii).toBe(false);
  });

  it("drops credentials, cookies and bodies from events", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://example.com/admin",
        headers: { Authorization: "Bearer token", Cookie: "sb=1", "User-Agent": "test" },
        cookies: { sb: "1" },
        data: { password: "secret" },
      },
    } as ErrorEvent);
    expect(event.request?.headers).toEqual({ "User-Agent": "test" });
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
  });
});
