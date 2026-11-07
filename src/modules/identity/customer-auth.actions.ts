"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/get-user";

import { requestMeta } from "./auth-guards";
import {
  type AuthState,
  changeEmailSchema,
  changePasswordSchema,
  emailOnlySchema,
  fieldErrors,
  newPasswordSchema,
  oauthStartSchema,
  signInSchema,
  signUpSchema,
} from "./customer-auth.schemas";
import * as service from "./customer-auth.service";

/**
 * Server Actions of the auth and account forms (docs/specs/phase-5-accounts-inquiries-operations.md
 * PR 5A step 2): Zod first, then the service (rate limits, Turnstile, Supabase Auth on the
 * server). Successful sign-ins redirect; every other answer is a state for the form.
 */

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};
const token = (formData: FormData) => text(formData, "cf-turnstile-response") ?? "";

function finish(result: service.AuthResult): AuthState {
  if (result.status === "redirect") redirect(result.to);
  return result;
}

export async function signInAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
    locale: text(formData, "locale"),
    next: text(formData, "next"),
    surface: text(formData, "surface"),
  });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return finish(await service.signIn(parsed.data, await requestMeta()));
}

export async function signUpAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    password: text(formData, "password"),
    privacy: text(formData, "privacy"),
    marketing: text(formData, "marketing"),
    locale: text(formData, "locale"),
    turnstileToken: token(formData),
  });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return service.signUp(parsed.data, { ...(await requestMeta()), turnstileToken: parsed.data.turnstileToken });
}

export async function resendConfirmationAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailOnlySchema.safeParse({ email: text(formData, "email"), locale: text(formData, "locale"), turnstileToken: token(formData) });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return service.resendConfirmation(parsed.data, { ...(await requestMeta()), turnstileToken: parsed.data.turnstileToken });
}

export async function requestPasswordResetAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailOnlySchema.safeParse({ email: text(formData, "email"), locale: text(formData, "locale"), turnstileToken: token(formData) });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return service.requestPasswordReset(parsed.data, { ...(await requestMeta()), turnstileToken: parsed.data.turnstileToken });
}

export async function completePasswordResetAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
    locale: text(formData, "locale"),
  });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return finish(await service.completePasswordReset(parsed.data));
}

/** Signed-in customers only (staff change their password through the same form in Phase 6). */
async function signedIn(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

export async function changePasswordAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!(await signedIn())) return { status: "expired" };
  const parsed = changePasswordSchema.safeParse({
    current: text(formData, "current"),
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
    locale: text(formData, "locale"),
  });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return service.changePassword(parsed.data);
}

export async function changeEmailAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!(await signedIn())) return { status: "expired" };
  const parsed = changeEmailSchema.safeParse({
    current: text(formData, "current"),
    email: text(formData, "email"),
    locale: text(formData, "locale"),
  });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return service.changeEmail(parsed.data);
}

export async function startGoogleAction(formData: FormData): Promise<void> {
  const parsed = oauthStartSchema.safeParse({ locale: text(formData, "locale"), next: text(formData, "next") });
  const locale = parsed.success ? parsed.data.locale : "vi";
  const url = parsed.success ? await service.startGoogle(parsed.data.locale, parsed.data.next) : null;
  redirect(url ?? `${service.loginPath(locale)}?error=oauth`);
}

export async function signOutCustomerAction(formData: FormData): Promise<void> {
  const locale = text(formData, "locale") === "en" ? "en" : "vi";
  await service.signOutCustomer();
  redirect(locale === "en" ? "/en" : "/");
}
