import { z } from "zod";

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
    .refine((key) => !key.startsWith("sb_secret_"), {
      message: "must be the publishable (anon) key, never the secret key",
    }),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
});

export const serverEnvSchema = z.object({
  // Required from Phase 0 step 7, when the service-role client is introduced.
  SUPABASE_SECRET_KEY: optionalString,
  GOOGLE_OAUTH_ENABLED: booleanFlag,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SENTRY_DSN: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16, "must be at least 16 characters").optional(),
  ),
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
