import { z } from "zod";

/**
 * Inputs of the customer and staff sign-in forms (docs/specs/phase-5-accounts-inquiries-operations.md
 * decisions 1–4). Messages are translation keys (`Auth.errors.*`).
 */

export const PASSWORD_MIN = 10;
/** bcrypt, which GoTrue uses, reads at most 72 bytes. */
export const PASSWORD_MAX = 72;

const email = z.string().trim().toLowerCase().max(254, "invalidEmail").pipe(z.email("invalidEmail"));
const password = z
  .string()
  .min(PASSWORD_MIN, "passwordTooShort")
  .max(PASSWORD_MAX, "passwordTooLong")
  .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX, "passwordTooLong");
const locale = z.enum(["vi", "en"]);
const next = z.string().max(500).optional().default("");
const turnstileToken = z.string().max(2048).default("");

export const signInSchema = z.object({
  email,
  // Sign-in checks any length: older accounts may predate the 10-character rule.
  password: z.string().min(1, "required").max(200, "invalid"),
  locale,
  next,
  surface: z.enum(["customer", "staff"]).default("customer"),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  email,
  password,
  privacy: z.literal("on", { error: "consentRequired" }),
  marketing: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
  locale,
  turnstileToken,
});

export const emailOnlySchema = z.object({ email, locale, turnstileToken });

export const newPasswordSchema = z
  .object({ password, confirm: z.string().max(200), locale })
  .refine((value) => value.password === value.confirm, { path: ["confirm"], message: "passwordMismatch" });

export const changePasswordSchema = z
  .object({ current: z.string().min(1, "required").max(200, "invalid"), password, confirm: z.string().max(200), locale })
  .refine((value) => value.password === value.confirm, { path: ["confirm"], message: "passwordMismatch" })
  .refine((value) => value.password !== value.current, { path: ["password"], message: "samePassword" });

export const changeEmailSchema = z.object({ current: z.string().min(1, "required").max(200, "invalid"), email, locale });

export const oauthStartSchema = z.object({ locale, next });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/** The fields a form can show errors on. */
export type AuthField = "fullName" | "email" | "password" | "confirm" | "current" | "privacy";

/** Every answer of an auth form. `sent` is the "check your email" answer, whatever matched. */
export type AuthStatus =
  | "idle"
  | "sent"
  | "saved"
  | "invalid"
  | "invalid_credentials"
  | "unconfirmed"
  | "turnstile"
  | "rate_limited"
  | "unavailable"
  | "expired"
  | "failed";

export type AuthState = { status: AuthStatus; errors?: Partial<Record<AuthField, string>> };

/** Zod issues → field errors (first message per field). */
export function fieldErrors(issues: readonly z.core.$ZodIssue[]): Partial<Record<AuthField, string>> {
  const fields: readonly AuthField[] = ["fullName", "email", "password", "confirm", "current", "privacy"];
  const errors: Partial<Record<AuthField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0] as AuthField;
    if (fields.includes(field) && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
