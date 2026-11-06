import "server-only";

import { parseEnv, publicEnvSchema, serverEnvSchema } from "./schema";

/** Public values, validated (server-side copy). */
export const validatedPublicEnv = parseEnv("public", publicEnvSchema, {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

export const serverEnv = parseEnv("server", serverEnvSchema, {
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  GOOGLE_OAUTH_ENABLED: process.env.GOOGLE_OAUTH_ENABLED,
  SHOW_DESIGN_SYSTEM: process.env.SHOW_DESIGN_SYSTEM,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SENTRY_DSN: process.env.SENTRY_DSN,
  CRON_SECRET: process.env.CRON_SECRET,
});
