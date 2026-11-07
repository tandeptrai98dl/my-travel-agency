import { z } from "zod";

import { type IpAllowList, parseAllowList, UNRESTRICTED } from "../ip-allowlist";

/** Returns true for keys that grant service-role access (new or legacy JWT format). */
export function isSecretSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/** Treats empty strings (common in .env files) as "not set". */
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * A webhook source allow-list (docs/specs/phase-6-hardening-launch.md decision 2): empty is "not
 * enforced", `unrestricted` an accepted exception, otherwise comma-separated addresses or CIDRs.
 * Bad entries fail validation by name, so a typo never silently opens or closes the webhook.
 */
const allowList = z.string().optional().transform((value, ctx): IpAllowList => {
  const { list, errors } = parseAllowList(value);
  if (errors.length) {
    ctx.addIssue({ code: "custom", message: `not an IPv4/IPv6 address or CIDR range (at least /8 for IPv4 and /16 for IPv6, no host bits): ${errors.join(", ")}` });
    return z.NEVER;
  }
  return list;
});

const booleanFlag = z.preprocess(
  (value) => (value === "" || value === undefined ? "false" : value),
  z.enum(["true", "false"]).transform((value) => value === "true"),
);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    (value) => (value === "" || value === undefined ? "http://localhost:3000" : value),
    z.url(),
  ),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .refine((key) => !isSecretSupabaseKey(key), {
      message: "must be the publishable (anon) key, never the secret key",
    }),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  // Serve public images through Supabase Storage image transformations (Pro plan; Phase 3 spec
  // decision 1). Off locally and in CI, where the original object is served as is.
  NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: booleanFlag,
  // Cloudflare Turnstile site key for public forms (ADR-014). Optional until the owner's account
  // exists: without it (or the secret) the forms that need it show a disabled state.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
  // Google Analytics 4 measurement ID (ADR-039). Without it nothing of Google's loads and the CSP
  // allows no Google host; with it, gtag.js loads only after the visitor grants "analytics".
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^G-[A-Z0-9]{4,16}$/, "must be a GA4 measurement ID (G-XXXXXXXXXX)").optional(),
  ),
});

export const serverEnvSchema = z
  .object({
  // Service-role key for src/lib/supabase/admin.ts. It must really be a secret key, so a
  // publishable key pasted by mistake fails at startup instead of on the first guest write.
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1)
    .refine(isSecretSupabaseKey, {
      message: "must be the secret (service_role) key",
    }),
  GOOGLE_OAUTH_ENABLED: booleanFlag,
  // Serves /admin/design-system in a production build (CI and previews). Off by default.
  SHOW_DESIGN_SYSTEM: booleanFlag,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SENTRY_DSN: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  // Vercel Cron's bearer secret for /api/cron/* (spec Phase 5 decision 12). Without it the routes
  // answer 503 and nothing runs; required in production.
  CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32, "must be at least 32 characters").optional(),
  ),
  // Heartbeat of the Vercel Cron jobs (docs/specs/phase-6-hardening-launch.md decision 3): an
  // uptime monitor's heartbeat URL, pinged after every successful run; `{job}` is replaced by the
  // job name. Optional: Sentry Cron Monitors also receive check-ins when SENTRY_DSN is set.
  CRON_HEARTBEAT_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url({ protocol: /^https$/, error: "must be an https URL" }).optional(),
  ),
  // Upstash Redis REST (redirects, decision 5; rate limits later). Optional until the account
  // exists: without both, redirect sync and lookups are logged no-ops. Required in production.
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url({ protocol: /^https$/, error: "must be an https URL" }).optional(),
  ),
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  // Cloudflare Turnstile secret (server-side verification of public form submissions).
  TURNSTILE_SECRET_KEY: optionalString,
  // Vercel sets this; "production" is the only environment that takes real payments
  // (docs/specs/phase-4-booking-payments.md decision 8). NODE_ENV is "production" on previews too.
  VERCEL_ENV: z.preprocess((value) => (value === "" ? undefined : value), z.enum(["production", "preview", "development"]).optional()),
  // VNPay (decision 6). Without both, the VNPay method is hidden and its routes never confirm.
  VNPAY_TMN_CODE: optionalString,
  VNPAY_HASH_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16, "must be at least 16 characters").optional(),
  ),
  VNPAY_PAYMENT_URL: z.preprocess(
    (value) => (value === "" || value === undefined ? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" : value),
    z.url({ protocol: /^https?$/ }),
  ),
  // CI only: a local stand-in for VNPay's payment page that signs its IPN with VNPAY_HASH_SECRET.
  VNPAY_STUB: booleanFlag,
  // Source addresses of VNPay's IPN calls (decision 2). Required in production while VNPay is on:
  // the addresses VNPay gives the merchant, or `unrestricted` (an exception in SECURITY_REVIEW.md).
  VNPAY_IPN_ALLOWED_IPS: allowList,
  // HMAC key of the guest checkout cookie (docs/specs/phase-4-booking-payments.md decision 7).
  // Without it online booking is off: the booking page offers the hotline instead.
  BOOKING_ACCESS_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32, "must be at least 32 characters").optional(),
  ),
  // SePay or Casso (ADR-013). Without both, the bank webhook answers 503 and records nothing.
  BANK_WEBHOOK_PROVIDER: z.preprocess((value) => (value === "" ? undefined : value), z.enum(["sepay", "casso"]).optional()),
  BANK_WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16, "must be at least 16 characters").optional(),
  ),
  // Source addresses of the SePay or Casso webhook calls, as for VNPay above.
  BANK_WEBHOOK_ALLOWED_IPS: allowList,
}).superRefine((env, ctx) => {
  const pairs = [
    ["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET"],
    ["BANK_WEBHOOK_PROVIDER", "BANK_WEBHOOK_SECRET"],
  ] as const;
  for (const [a, b] of pairs) {
    const missing = env[a] && !env[b] ? b : env[b] && !env[a] ? a : null;
    if (missing) ctx.addIssue({ code: "custom", path: [missing], message: `${missing} is missing (set both or neither)` });
  }
  // Production takes real money: each configured gateway has its allow-list or a recorded exception.
  const lists = [
    ["VNPAY_IPN_ALLOWED_IPS", env.VNPAY_TMN_CODE, env.VNPAY_IPN_ALLOWED_IPS],
    ["BANK_WEBHOOK_ALLOWED_IPS", env.BANK_WEBHOOK_PROVIDER, env.BANK_WEBHOOK_ALLOWED_IPS],
  ] as const;
  for (const [name, configured, list] of lists) {
    if (env.VERCEL_ENV === "production" && configured && list.mode === "off") {
      ctx.addIssue({
        code: "custom",
        path: [name],
        message: `${name} is required in production: the provider's addresses, or "${UNRESTRICTED}" with the accepted exception in docs/SECURITY_REVIEW.md`,
      });
    }
  }
  if (env.VNPAY_STUB && env.VERCEL_ENV === "production") {
    ctx.addIssue({ code: "custom", path: ["VNPAY_STUB"], message: "the VNPay stub is never allowed in production" });
  }
  if (env.VNPAY_STUB && env.VNPAY_PAYMENT_URL.startsWith("https://pay.vnpay.vn")) {
    ctx.addIssue({ code: "custom", path: ["VNPAY_STUB"], message: "the VNPay stub cannot run against the production gateway" });
  }
  // Both or neither: one without the other would make every redirect sync fail at run time.
  const missing = env.UPSTASH_REDIS_REST_URL && !env.UPSTASH_REDIS_REST_TOKEN
    ? "UPSTASH_REDIS_REST_TOKEN"
    : env.UPSTASH_REDIS_REST_TOKEN && !env.UPSTASH_REDIS_REST_URL
      ? "UPSTASH_REDIS_REST_URL"
      : null;
  if (missing) {
    ctx.addIssue({ code: "custom", path: [missing], message: `${missing} is missing (set both Upstash variables or neither)` });
  }
  if (env.VERCEL_ENV === "production" && !env.CRON_SECRET) {
    ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "CRON_SECRET is required in production (Vercel Cron)" });
  }
  // Production serves the admin's redirects and rate limits from Upstash (ADR-031, Phase 3 PR M).
  if (env.VERCEL_ENV === "production" && !env.UPSTASH_REDIS_REST_URL) {
    ctx.addIssue({ code: "custom", path: ["UPSTASH_REDIS_REST_URL"], message: "UPSTASH_REDIS_REST_URL and _TOKEN are required in production" });
  }
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(scope: "public" | "server" | "deployment", issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>) {
    const details = issues
      .map((issue) => `  - ${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    super(
      `Invalid ${scope} environment variables:\n${details}\n` +
        "Check .env.local against .env.example.",
    );
    this.name = "EnvValidationError";
  }
}

/** Parses values with a schema; reports variable names only, never their values. */
export function parseEnv<T extends z.ZodType>(
  scope: "public" | "server",
  schema: T,
  values: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(values);
  if (!result.success) {
    throw new EnvValidationError(scope, result.error.issues);
  }
  return result.data;
}
