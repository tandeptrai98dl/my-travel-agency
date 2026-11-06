import { describe, expect, it } from "vitest";

import {
  EnvValidationError,
  parseEnv,
  publicEnvSchema,
  serverEnvSchema,
} from "./schema";

const validPublic = {
  NEXT_PUBLIC_SITE_URL: "https://example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_123",
  NEXT_PUBLIC_SENTRY_DSN: undefined,
};

describe("publicEnvSchema", () => {
  it("accepts a valid configuration", () => {
    expect(parseEnv("public", publicEnvSchema, validPublic)).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    });
  });

  it("defaults the site URL for local development", () => {
    const env = parseEnv("public", publicEnvSchema, {
      ...validPublic,
      NEXT_PUBLIC_SITE_URL: "",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("names every missing or invalid variable", () => {
    const run = () =>
      parseEnv("public", publicEnvSchema, {
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      });
    expect(run).toThrow(EnvValidationError);
    expect(run).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(run).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects a secret key used as the publishable key", () => {
    expect(() =>
      parseEnv("public", publicEnvSchema, {
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc",
      }),
    ).toThrow(/never the secret key/);
  });

  it("never includes variable values in the error message", () => {
    try {
      parseEnv("public", publicEnvSchema, {
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_supersecretvalue",
      });
    } catch (error) {
      expect(String(error)).not.toContain("supersecretvalue");
    }
  });
});

describe("serverEnvSchema", () => {
  it("treats empty strings as unset and defaults flags to false", () => {
    const env = parseEnv("server", serverEnvSchema, {
      SUPABASE_SECRET_KEY: "",
      GOOGLE_OAUTH_ENABLED: "",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
      SENTRY_DSN: "",
      CRON_SECRET: undefined,
    });
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(env.GOOGLE_OAUTH_ENABLED).toBe(false);
  });

  it("parses the Google flag", () => {
    const env = parseEnv("server", serverEnvSchema, { GOOGLE_OAUTH_ENABLED: "true" });
    expect(env.GOOGLE_OAUTH_ENABLED).toBe(true);
  });

  it("rejects a short cron secret", () => {
    expect(() =>
      parseEnv("server", serverEnvSchema, { CRON_SECRET: "short" }),
    ).toThrow(/CRON_SECRET/);
  });
});
