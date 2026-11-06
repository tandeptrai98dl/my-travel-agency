import { z } from "zod";

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
});

export const serverEnvSchema = z.object({
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
  CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16, "must be at least 16 characters").optional(),
  ),
  // Upstash Redis REST (redirects, decision 5; rate limits later). Optional until the account
  // exists: without both, redirect sync is a logged no-op. Required in production from Phase 3.
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url({ protocol: /^https$/, error: "must be an https URL" }).optional(),
  ),
  UPSTASH_REDIS_REST_TOKEN: optionalString,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(scope: "public" | "server", issues: z.core.$ZodIssue[]) {
    const details = issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
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
