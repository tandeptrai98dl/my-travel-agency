import "server-only";

import { parseEnv, serverEnvSchema } from "./schema";

export { publicEnv } from "./public";

export const serverEnv = parseEnv("server", serverEnvSchema, {
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  GOOGLE_OAUTH_ENABLED: process.env.GOOGLE_OAUTH_ENABLED,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SENTRY_DSN: process.env.SENTRY_DSN,
  CRON_SECRET: process.env.CRON_SECRET,
});
