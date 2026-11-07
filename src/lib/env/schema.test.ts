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

  it("rejects a cron secret under 32 characters", () => {
    for (const secret of ["short", "x".repeat(31)]) {
      expect(() =>
        parseEnv("server", serverEnvSchema, {
          SUPABASE_SECRET_KEY: "sb_secret_example",
          CRON_SECRET: secret,
        }),
      ).toThrow(/CRON_SECRET/);
    }
    expect(parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", CRON_SECRET: "x".repeat(32) }).CRON_SECRET).toHaveLength(32);
  });

  it("requires the cron secret in production only", () => {
    const upstash = { UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token" };
    expect(() => parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", VERCEL_ENV: "production", ...upstash })).toThrow(
      /CRON_SECRET/,
    );
    expect(parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", VERCEL_ENV: "preview" }).CRON_SECRET).toBeUndefined();
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
    ).toThrow(/UPSTASH_REDIS_REST_TOKEN is missing/);
    expect(() =>
      parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", UPSTASH_REDIS_REST_TOKEN: "token" }),
    ).toThrow(/UPSTASH_REDIS_REST_URL is missing/);
    const env = parseEnv("server", serverEnvSchema, {
      SUPABASE_SECRET_KEY: "sb_secret_example",
      UPSTASH_REDIS_REST_URL: "https://eu1.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("token");
  });

  it("requires Upstash in production only", () => {
    expect(() => parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", VERCEL_ENV: "production" })).toThrow(
      /required in production/,
    );
    expect(parseEnv("server", serverEnvSchema, { SUPABASE_SECRET_KEY: "sb_secret_example", VERCEL_ENV: "preview" }).UPSTASH_REDIS_REST_URL).toBeUndefined();
    const env = parseEnv("server", serverEnvSchema, {
      SUPABASE_SECRET_KEY: "sb_secret_example",
      VERCEL_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://eu1.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
      CRON_SECRET: "c".repeat(32),
    });
    expect(env.VERCEL_ENV).toBe("production");
  });
});

describe("payment variables", () => {
  const base = { SUPABASE_SECRET_KEY: "sb_secret_example" };
  it("needs VNPay keys and bank webhook settings in pairs", () => {
    expect(() => parseEnv("server", serverEnvSchema, { ...base, VNPAY_TMN_CODE: "CODE1234" })).toThrow(/VNPAY_HASH_SECRET is missing/);
    expect(() => parseEnv("server", serverEnvSchema, { ...base, BANK_WEBHOOK_SECRET: "a-long-enough-secret" })).toThrow(
      /BANK_WEBHOOK_PROVIDER is missing/,
    );
    const env = parseEnv("server", serverEnvSchema, base);
    expect(env.VNPAY_PAYMENT_URL).toBe("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html");
    expect(env.VNPAY_STUB).toBe(false);
  });

  it("never allows the VNPay stub in production", () => {
    expect(() => parseEnv("server", serverEnvSchema, { ...base, VNPAY_STUB: "true", VERCEL_ENV: "production" })).toThrow(
      /never allowed in production/,
    );
    expect(parseEnv("server", serverEnvSchema, { ...base, VNPAY_STUB: "true", VERCEL_ENV: "preview" }).VNPAY_STUB).toBe(true);
    // Whatever else is set: real-looking VNPay keys and allow-lists do not make it acceptable.
    expect(() =>
      parseEnv("server", serverEnvSchema, {
        ...base,
        ...PRODUCTION,
        VNPAY_TMN_CODE: "CODE1234",
        VNPAY_HASH_SECRET: "a-long-enough-hash-secret",
        VNPAY_IPN_ALLOWED_IPS: "203.0.113.0/24",
        VNPAY_STUB: "true",
      }),
    ).toThrow(/never allowed in production/);
  });
});

// Everything production requires besides the payment settings.
const PRODUCTION = {
  VERCEL_ENV: "production",
  UPSTASH_REDIS_REST_URL: "https://eu1.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
  CRON_SECRET: "c".repeat(32),
};

describe("webhook source allow-lists (Phase 6 decision 2)", () => {
  const base = { SUPABASE_SECRET_KEY: "sb_secret_example" };
  const vnpay = { VNPAY_TMN_CODE: "CODE1234", VNPAY_HASH_SECRET: "a-long-enough-hash-secret" };
  const bank = { BANK_WEBHOOK_PROVIDER: "sepay", BANK_WEBHOOK_SECRET: "a-long-enough-secret" };

  it("are off when empty, outside production", () => {
    const env = parseEnv("server", serverEnvSchema, { ...base, ...vnpay, ...bank, VNPAY_IPN_ALLOWED_IPS: "" });
    expect(env.VNPAY_IPN_ALLOWED_IPS).toEqual({ mode: "off" });
    expect(env.BANK_WEBHOOK_ALLOWED_IPS).toEqual({ mode: "off" });
  });

  it("parse addresses and ranges, IPv4 and IPv6", () => {
    const env = parseEnv("server", serverEnvSchema, { ...base, VNPAY_IPN_ALLOWED_IPS: "203.0.113.0/24, 198.51.100.7,2001:db8::/32" });
    expect(env.VNPAY_IPN_ALLOWED_IPS).toMatchObject({ mode: "list", ranges: [{ prefix: 24 }, { prefix: 32 }, { version: 6, prefix: 32 }] });
  });

  it("name bad entries, refuse /0 and never print other values", () => {
    expect(() => parseEnv("server", serverEnvSchema, { ...base, BANK_WEBHOOK_ALLOWED_IPS: "203.0.113.0/24,10.0.0.300" })).toThrow(
      /BANK_WEBHOOK_ALLOWED_IPS: not an IPv4\/IPv6 address or CIDR range .*10\.0\.0\.300/,
    );
    expect(() => parseEnv("server", serverEnvSchema, { ...base, VNPAY_IPN_ALLOWED_IPS: "0.0.0.0/0" })).toThrow(/VNPAY_IPN_ALLOWED_IPS/);
    expect(() => parseEnv("server", serverEnvSchema, { ...base, ...vnpay, VNPAY_IPN_ALLOWED_IPS: "nope" })).not.toThrow(/a-long-enough-hash-secret/);
  });

  it("are required in production for each configured gateway, unless the exception is recorded", () => {
    expect(() => parseEnv("server", serverEnvSchema, { ...base, ...PRODUCTION, ...vnpay })).toThrow(/VNPAY_IPN_ALLOWED_IPS is required in production/);
    expect(() => parseEnv("server", serverEnvSchema, { ...base, ...PRODUCTION, ...bank })).toThrow(/BANK_WEBHOOK_ALLOWED_IPS is required in production/);
    const env = parseEnv("server", serverEnvSchema, {
      ...base,
      ...PRODUCTION,
      ...vnpay,
      ...bank,
      VNPAY_IPN_ALLOWED_IPS: "203.0.113.0/24",
      BANK_WEBHOOK_ALLOWED_IPS: "unrestricted",
    });
    expect(env.BANK_WEBHOOK_ALLOWED_IPS).toEqual({ mode: "unrestricted" });
    // A gateway that is off in production needs no list.
    expect(() => parseEnv("server", serverEnvSchema, { ...base, ...PRODUCTION })).not.toThrow();
  });
});
