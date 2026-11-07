import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { deploymentIssues } from "./deployment";
import { publicEnvSchema, serverEnvSchema } from "./schema";

const STAGING_REF = "stagingrefabcdefghij";
const PROD_REF = "productionrefabcdefg";
const hosts = {
  STAGING_HOSTS: `${STAGING_REF}.supabase.co, staging-db.upstash.io`,
  PRODUCTION_HOSTS: `${PROD_REF}.supabase.co,prod-db.upstash.io, www.example.vn`,
};

const production = {
  VERCEL_ENV: "production",
  ...hosts,
  NEXT_PUBLIC_SITE_URL: "https://www.example.vn",
  NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  UPSTASH_REDIS_REST_URL: "https://prod-db.upstash.io",
};

const preview = {
  VERCEL_ENV: "preview",
  ...hosts,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.vn",
  NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
  UPSTASH_REDIS_REST_URL: "https://staging-db.upstash.io",
  SHOW_DESIGN_SYSTEM: "true",
};

function paths(env: Record<string, string | undefined>): string[] {
  return deploymentIssues(env).map((issue) => issue.path.join("."));
}

function jwt(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

describe("deployment guards (Phase 6 decision 11)", () => {
  it("accept a production that uses production values, and a preview on staging", () => {
    expect(deploymentIssues(production)).toEqual([]);
    expect(deploymentIssues(preview)).toEqual([]);
  });

  it("do nothing locally and in CI (no VERCEL_ENV), whatever the switches", () => {
    expect(
      deploymentIssues({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SHOW_DESIGN_SYSTEM: "true",
        NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-E2ETEST000",
        E2E_SUPABASE_SECRET_KEY: "x",
        SEED_USER_PASSWORD: "y",
        VNPAY_STUB: "true",
      }),
    ).toEqual([]);
  });

  describe("production", () => {
    it("needs both host lists, so the guard cannot be skipped by leaving them out", () => {
      expect(paths({ ...production, STAGING_HOSTS: "" })).toEqual(["STAGING_HOSTS"]);
      expect(paths({ ...production, PRODUCTION_HOSTS: undefined })).toEqual(["PRODUCTION_HOSTS"]);
    });

    it("refuses the staging Supabase, Upstash and site hosts", () => {
      expect(paths({ ...production, NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co` })).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
      ]);
      expect(paths({ ...production, UPSTASH_REDIS_REST_URL: "https://STAGING-DB.upstash.io" })).toContain("UPSTASH_REDIS_REST_URL");
      expect(paths({ ...production, STAGING_HOSTS: `${hosts.STAGING_HOSTS},staging.example.vn`, NEXT_PUBLIC_SITE_URL: "https://staging.example.vn" })).toEqual([
        "NEXT_PUBLIC_SITE_URL",
      ]);
    });

    it("sees a host written with a final dot as the same host", () => {
      expect(paths({ ...production, NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co.` })).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(paths({ ...production, UPSTASH_REDIS_REST_URL: "https://prod-db.upstash.io./" })).toEqual([]);
      expect(paths({ ...production, PRODUCTION_HOSTS: `${PROD_REF}.supabase.co.,prod-db.upstash.io` })).toEqual([]);
    });

    it("needs Supabase and Upstash hosts listed in PRODUCTION_HOSTS", () => {
      expect(paths({ ...production, NEXT_PUBLIC_SUPABASE_URL: "https://otherprojectrefabcde.supabase.co" })).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
      expect(paths({ ...production, UPSTASH_REDIS_REST_URL: "https://someone-else.upstash.io" })).toEqual(["UPSTASH_REDIS_REST_URL"]);
    });

    it("needs the https production domain as the site URL", () => {
      expect(paths({ ...production, NEXT_PUBLIC_SITE_URL: undefined })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
      expect(paths({ ...production, NEXT_PUBLIC_SITE_URL: "http://www.example.vn" })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
      expect(paths({ ...production, NEXT_PUBLIC_SITE_URL: "https://localhost:3000" })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
    });

    it("refuses the design-system switch", () => {
      expect(paths({ ...production, SHOW_DESIGN_SYSTEM: "true" })).toEqual(["SHOW_DESIGN_SYSTEM"]);
      expect(paths({ ...production, SHOW_DESIGN_SYSTEM: "false" })).toEqual([]);
    });

    it("refuses CI's fake GA4 ID but accepts a real-looking one", () => {
      expect(paths({ ...production, NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-E2ETEST000" })).toEqual(["NEXT_PUBLIC_GA_MEASUREMENT_ID"]);
      expect(paths({ ...production, NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-7QX2LMN4PB" })).toEqual([]);
    });

    it("refuses Cloudflare's Turnstile test keys", () => {
      expect(
        paths({ ...production, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA" }),
      ).toEqual(["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]);
      expect(paths({ ...production, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAB1cDeFgHiJkLmN" })).toEqual([]);
    });

    it("refuses any E2E or seed variable by name, without printing its value", () => {
      const issues = deploymentIssues({ ...production, E2E_SUPABASE_SECRET_KEY: "sb_secret_leaked", SEED_USER_PASSWORD: "hunter2hunter2", E2E_EMPTY: "" });
      expect(issues.map((issue) => issue.path[0])).toEqual(["E2E_SUPABASE_SECRET_KEY", "SEED_USER_PASSWORD"]);
      expect(JSON.stringify(issues)).not.toMatch(/sb_secret_leaked|hunter2/);
    });

    it("refuses VNPay keys with the sandbox gateway, explicit or by default", () => {
      expect(paths({ ...production, VNPAY_TMN_CODE: "ABC" })).toEqual(["VNPAY_PAYMENT_URL"]);
      expect(paths({ ...production, VNPAY_TMN_CODE: "ABC", VNPAY_PAYMENT_URL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" })).toEqual(["VNPAY_PAYMENT_URL"]);
      expect(paths({ ...production, VNPAY_TMN_CODE: "ABC", VNPAY_PAYMENT_URL: "https://pay.vnpay.vn/vpcpay.html" })).toEqual([]);
      expect(paths({ ...production, VNPAY_PAYMENT_URL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" })).toEqual([]);
    });
  });

  describe("previews", () => {
    it("refuse every production host", () => {
      expect(paths({ ...preview, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` })).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
      expect(paths({ ...preview, UPSTASH_REDIS_REST_URL: "https://prod-db.upstash.io" })).toEqual(["UPSTASH_REDIS_REST_URL"]);
      expect(paths({ ...preview, NEXT_PUBLIC_SITE_URL: "https://www.example.vn/" })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
    });

    it("may run before production exists (no PRODUCTION_HOSTS yet), on a restored project too", () => {
      expect(paths({ ...preview, PRODUCTION_HOSTS: undefined })).toEqual([]);
      expect(paths({ ...preview, NEXT_PUBLIC_SUPABASE_URL: "https://restoredprojectrefabc.supabase.co" })).toEqual([]);
    });

    it("never use VNPay's production gateway", () => {
      expect(paths({ ...preview, VNPAY_PAYMENT_URL: "https://pay.vnpay.vn/vpcpay.html" })).toEqual(["VNPAY_PAYMENT_URL"]);
    });
  });

  describe("in every environment", () => {
    it("refuses a legacy key of another project than the URL's", () => {
      const env = { ...preview, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon", ref: PROD_REF }), SUPABASE_SECRET_KEY: jwt({ role: "service_role", ref: STAGING_REF }) };
      expect(paths(env)).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
      expect(paths({ ...env, VERCEL_ENV: undefined, SUPABASE_SECRET_KEY: jwt({ role: "service_role", ref: PROD_REF }) })).toEqual([
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
      ]);
    });

    it("leaves local keys and URLs alone (no project ref to compare)", () => {
      expect(paths({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: jwt({ role: "service_role", iss: "supabase-demo" }) })).toEqual([]);
    });

    it("names bad host-list entries and hosts listed twice", () => {
      expect(paths({ STAGING_HOSTS: "https://x.supabase.co, ok.upstash.io" })).toEqual(["STAGING_HOSTS"]);
      expect(paths({ STAGING_HOSTS: "a.upstash.io", PRODUCTION_HOSTS: "A.upstash.io" })).toEqual(["STAGING_HOSTS"]);
    });
  });
});

describe("src/lib/env/server.ts", () => {
  const source = readFileSync(fileURLToPath(new URL("./server.ts", import.meta.url)), "utf8");

  it("passes every schema variable (a missing one is silently undefined at run time)", () => {
    for (const name of [...Object.keys(publicEnvSchema.shape), ...Object.keys(serverEnvSchema.shape)]) {
      expect(source, name).toContain(`${name}: process.env.${name},`);
    }
  });

  it("runs the deployment guards on the whole environment", () => {
    expect(source).toContain("deploymentIssues(process.env)");
  });
});
