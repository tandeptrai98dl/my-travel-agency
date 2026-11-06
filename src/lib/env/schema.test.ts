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

  it("rejects a legacy service_role JWT used as the publishable key", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    expect(() =>
      parseEnv("public", publicEnvSchema, {
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `header.${payload}.signature`,
      }),
    ).toThrow(/never the secret key/);
  });

  it("accepts a legacy anon JWT", () => {
    const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
    expect(
      parseEnv("public", publicEnvSchema, {
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `header.${payload}.signature`,
      }).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ).toContain("header.");
  });

  it("never includes variable values in the error message", () => {
    expect.assertions(1);
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
      SUPABASE_SECRET_KEY: "sb_secret_example",
      GOOGLE_OAUTH_ENABLED: "",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
      SENTRY_DSN: "",
      CRON_SECRET: undefined,
    });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.GOOGLE_OAUTH_ENABLED).toBe(false);
  });

  it("requires the secret key", () => {
    expect(() => parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "" })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
  });

  it("rejects a publishable key used as the secret key", () => {
    expect(() =>
      parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_publishable_example" }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("parses the Google flag", () => {
    const env = parseEnv("server", serverEnvSchema, {
      SUPABASE_SECRET_KEY: "sb_secret_example",
      GOOGLE_OAUTH_ENABLED: "true",
    });
    expect(env.GOOGLE_OAUTH_ENABLED).toBe(true);
  });

  it("rejects a short cron secret", () => {
    expect(() =>
      parseEnv("server", serverEnvSchema, {
        SUPABASE_SECRET_KEY: "sb_secret_example",
        CRON_SECRET: "short",
      }),
    ).toThrow(/CRON_SECRET/);
  });

  it("keeps the Upstash variables optional and needs an https URL", () => {
    const env = parseEnv("server", serverEnvSchema, {
      SUPABASE_SECRET_KEY: "sb_secret_example",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    });
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
    expect(() =>
      parseEnv("server", serverEnvSchema, {
        SUPABASE_SECRET_KEY: "sb_secret_example",
        UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
      }),
    ).toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it("needs both Upstash variables or neither", () => {
    expect(() =>
      parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", UPSTASH_REDIS_REST_URL: "https://eu1.upstash.io" }),
    ).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
    const env = parseEnv("server", serverEnvSchema, {
      SUPABASE_SECRET_KEY: "sb_secret_example",
      UPSTASH_REDIS_REST_URL: "https://eu1.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("token");
  });
});
