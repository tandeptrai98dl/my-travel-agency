import { getTranslations } from "next-intl/server";

import type { AuthFormLabels } from "@/components/account/auth-form";
import type { AuthStatus } from "@/modules/identity/customer-auth.schemas";
import type { Locale } from "@/i18n/routing";

/** The shared answer and error strings of the auth forms, with one form's button labels. */
export async function authLabels(locale: Locale, submit: string, pending: string, extra: { status?: Partial<Record<AuthStatus, string>>; unavailable?: string } = {}): Promise<AuthFormLabels> {
  const t = await getTranslations({ locale, namespace: "Auth" });
  const status = ["sent", "saved", "invalid", "invalid_credentials", "unconfirmed", "turnstile", "rate_limited", "unavailable", "expired", "failed"] as const;
  const errors = ["required", "invalid", "invalidEmail", "tooLong", "passwordTooShort", "passwordTooLong", "passwordMismatch", "samePassword", "weakPassword", "wrongPassword", "sameEmail", "consentRequired"] as const;
  return {
    submit,
    pending,
    status: { ...Object.fromEntries(status.map((key) => [key, t(`status.${key}`)])), failed: t("status.failed"), ...extra.status },
    errors: { ...Object.fromEntries(errors.map((key) => [key, t(`errors.${key}`)])), invalid: t("errors.invalid") },
    unavailable: extra.unavailable,
  };
}
