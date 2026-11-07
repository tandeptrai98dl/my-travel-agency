import "server-only";

import { deploymentIssues } from "./deployment";
import { EnvValidationError, parseEnv, publicEnvSchema, serverEnvSchema } from "./schema";

/** Public values, validated (server-side copy). */
export const validatedPublicEnv = parseEnv("public", publicEnvSchema, {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS: process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
});

export const serverEnv = parseEnv("server", serverEnvSchema, {
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  GOOGLE_OAUTH_ENABLED: process.env.GOOGLE_OAUTH_ENABLED,
  SHOW_DESIGN_SYSTEM: process.env.SHOW_DESIGN_SYSTEM,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SENTRY_DSN: process.env.SENTRY_DSN,
  CRON_SECRET: process.env.CRON_SECRET,
  CRON_HEARTBEAT_URL: process.env.CRON_HEARTBEAT_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE,
  VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET,
  VNPAY_PAYMENT_URL: process.env.VNPAY_PAYMENT_URL,
  VNPAY_STUB: process.env.VNPAY_STUB,
  VNPAY_IPN_ALLOWED_IPS: process.env.VNPAY_IPN_ALLOWED_IPS,
  BANK_WEBHOOK_PROVIDER: process.env.BANK_WEBHOOK_PROVIDER,
  BANK_WEBHOOK_SECRET: process.env.BANK_WEBHOOK_SECRET,
  BANK_WEBHOOK_ALLOWED_IPS: process.env.BANK_WEBHOOK_ALLOWED_IPS,
  BOOKING_ACCESS_SECRET: process.env.BOOKING_ACCESS_SECRET,
});

// Production uses only production values and previews never production ones (Phase 6 decision 11,
// `./deployment.ts`). Runs on the whole environment, since it also checks variable names.
const deployment = deploymentIssues(process.env);
if (deployment.length) throw new EnvValidationError("deployment", deployment);
