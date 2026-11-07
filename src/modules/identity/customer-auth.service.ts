import "server-only";

import { cookies } from "next/headers";

import { getPathname } from "@/i18n/navigation";
import { getAuthState } from "@/lib/auth/get-user";
import { isStaffRole, type Role } from "@/lib/auth/permissions";
import { serverEnv, validatedPublicEnv } from "@/lib/env/server";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";

import { checkLimits, checkTurnstile, turnstileUsable } from "./auth-guards";
import { confirmationGuard } from "./auth-settings";
import type {
  AuthState,
  ChangeEmailInput,
  ChangePasswordInput,
  EmailOnlyInput,
  NewPasswordInput,
  SignInInput,
  SignUpInput,
} from "./customer-auth.schemas";
import { RECOVERY_COOKIE, signRecoveryMarker, verifyRecoveryMarker } from "./recovery-marker";

/**
 * Customer and staff sign-in on the server (docs/specs/phase-5-accounts-inquiries-operations.md
 * decisions 1–3 and 6). Every form posts to a Server Action that calls this service; no page calls
 * Supabase Auth from the browser. Sign-up, password reset and resend confirmation always answer
 * "check your email", whether or not the address has an account.
 */

type Locale = "vi" | "en";
type Meta = { ip: string | null; userAgent: string | null };
type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AuthResult = AuthState | { status: "redirect"; to: string };

const HOUR = 3600;

export const accountPath = (locale: Locale) => getPathname({ locale, href: "/account" });
export const loginPath = (locale: Locale) => getPathname({ locale, href: "/login" });
const resetPath = (locale: Locale) => getPathname({ locale, href: "/reset-password" });

/** Where a signed-in user goes: staff to the admin, customers to `next` or their account. */
export function landingFor(role: Role, locale: Locale, next?: string | null): string {
  if (isStaffRole(role)) return "/admin";
  const fallback = accountPath(locale);
  const target = safeRedirectPath(next, fallback);
  // A customer never lands in the admin or on the staff pages.
  return /^\/(?:admin|auth)(?:\/|$|\?)/.test(target) ? fallback : target;
}

function siteOrigin(): string {
  return validatedPublicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
}

// Availability ------------------------------------------------------------------------------------

/** Sign-up needs the privacy policy in the page's language (ADR-035), real email confirmation
 * (decision 6) and, on Vercel, Turnstile keys. */
export async function signUpAvailability(locale: Locale): Promise<{ enabled: boolean; privacy: { href: string; version: string } | null }> {
  const [privacy, guard] = await Promise.all([getPrivacyConsent(locale), confirmationGuard()]);
  const enabled = Boolean(privacy) && guard.ok && turnstileUsable();
  return { enabled, privacy: privacy ? { href: privacy.href, version: privacy.version } : null };
}

// After a session exists ------------------------------------------------------------------------------

type Profile = { id: string; role: Role; locale: Locale; is_active: boolean; deleted_at: string | null };

async function loadProfile(supabase: Supabase): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, locale, is_active, deleted_at")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Attaches earlier guest bookings with the confirmed address (decision 6), unless GoTrue
 * auto-confirms emails. `attach_customer_bookings()` is service-role only (PR #42 review: a session
 * could otherwise call it through PostgREST and skip this guard), so it runs with the admin client
 * for the user the Auth server vouches for (`getUser()`). Never fails the sign-in.
 */
export async function attachEarlierBookings(supabase: Supabase): Promise<number> {
  const guard = await confirmationGuard();
  if (!guard.ok) return 0;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return 0;
  const { data, error } = await createAdminClient().rpc("attach_customer_bookings", { target_id: userId });
  if (error) {
    logger.error("auth.attach_failed", { code: error.code ?? null });
    return 0;
  }
  if (data && data > 0) logger.info("auth.bookings_attached", { count: data });
  return data ?? 0;
}

/**
 * Runs after every sign-in, confirmation and OAuth callback: an inactive or deleted profile is
 * signed out; a customer's earlier bookings are attached. Returns the profile, or null.
 */
export async function completeSignIn(supabase: Supabase): Promise<Profile | null> {
  const profile = await loadProfile(supabase);
  if (!profile || !profile.is_active || profile.deleted_at) {
    await supabase.auth.signOut({ scope: "local" });
    return null;
  }
  if (profile.role === "customer") await attachEarlierBookings(supabase);
  return profile;
}

/**
 * The active user, checked once more with the Auth server (`getUser()`): a session another device
 * signed out ("others" after a password change) or a deletion revoked is refused at once, even
 * while its access token has not expired. Used by the account gate and the sign-in pages.
 */
export async function verifiedUser() {
  const state = await getAuthState();
  if (state.status !== "active") return null;
  const { data, error } = await (await createClient()).auth.getUser();
  if (error || data.user?.id !== state.user.id) return null;
  return state.user;
}

// Sign-in ---------------------------------------------------------------------------------------------

export async function signIn(input: SignInInput, meta: Meta): Promise<AuthResult> {
  // Fails open (logged): no email is sent and GoTrue keeps its own limits (decision 2).
  const limited = await checkLimits(
    [
      { scope: "signin-ip", id: meta.ip ?? "unknown", limit: 10, window: 600 },
      { scope: "signin-email", id: input.email, limit: 5, window: 600 },
    ],
    { failOpen: true },
  );
  if (limited !== "ok") return { status: "rate_limited" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) {
    if (error.code === "email_not_confirmed") return { status: "unconfirmed" };
    if (error.status === 429 || error.code === "over_request_rate_limit") return { status: "rate_limited" };
    if (error.code === "invalid_credentials" || error.status === 400) return { status: "invalid_credentials" };
    logger.error("auth.signin_failed", { code: error.code ?? null, status: error.status ?? null });
    return { status: "failed" };
  }
  const profile = await completeSignIn(supabase);
  if (!profile) return { status: "invalid_credentials" };
  return { status: "redirect", to: landingFor(profile.role, input.locale, input.next) };
}

// Sign-up -----------------------------------------------------------------------------------------------

export async function signUp(input: SignUpInput, meta: Meta & { turnstileToken: string }): Promise<AuthState> {
  const availability = await signUpAvailability(input.locale);
  if (!availability.enabled || !availability.privacy) return { status: "unavailable" };
  const ipLimit = await checkLimits([{ scope: "signup-ip", id: meta.ip ?? "unknown", limit: 5, window: HOUR }]);
  if (ipLimit !== "ok") return { status: ipLimit };
  if (!(await checkTurnstile(meta.turnstileToken, "signup", meta.ip))) return { status: "turnstile" };
  // After Turnstile, so an unverified visitor cannot use up someone else's allowance.
  const emailLimit = await checkLimits([{ scope: "signup-email", id: input.email, limit: 3, window: 24 * HOUR }]);
  if (emailLimit !== "ok") return { status: emailLimit };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, locale: input.locale } },
  });
  if (error) {
    if (error.code === "weak_password") return { status: "invalid", errors: { password: "weakPassword" } };
    if (error.status === 429 || error.code?.startsWith("over_")) return { status: "rate_limited" };
    // An address that already has an account answers like a new one (decision 1).
    if (error.code === "user_already_exists" || error.code === "email_exists") return { status: "sent" };
    logger.error("auth.signup_failed", { code: error.code ?? null, status: error.status ?? null });
    return { status: "failed" };
  }
  // GoTrue returns a user without identities for an address that already exists: no consent row.
  const user = data.user;
  if (user && (user.identities?.length ?? 0) > 0) {
    const { error: consentError } = await createAdminClient().rpc("record_signup_consent", {
      target_id: user.id,
      privacy_version: availability.privacy.version,
      marketing: input.marketing,
      // Nullable in SQL; the generated types mark every argument as required.
      ip: meta.ip as string,
      user_agent: meta.userAgent as string,
    });
    if (consentError) logger.error("auth.signup_consent_failed", { code: consentError.code ?? null });
  }
  // A confirmation-free session is never kept (decision 6: confirmations stay on).
  if (data.session) await supabase.auth.signOut({ scope: "local" });
  return { status: "sent" };
}

export async function resendConfirmation(input: EmailOnlyInput, meta: Meta & { turnstileToken: string }): Promise<AuthState> {
  const ipLimit = await checkLimits([{ scope: "resend-ip", id: meta.ip ?? "unknown", limit: 10, window: HOUR }]);
  if (ipLimit !== "ok") return { status: ipLimit };
  if (!(await checkTurnstile(meta.turnstileToken, "resend", meta.ip))) return { status: "turnstile" };
  const emailLimit = await checkLimits([{ scope: "resend-email", id: input.email, limit: 3, window: HOUR }]);
  if (emailLimit !== "ok") return { status: emailLimit };
  const { error } = await (await createClient()).auth.resend({ type: "signup", email: input.email });
  if (error && error.status !== 429) logger.warn("auth.resend_failed", { code: error.code ?? null });
  return { status: "sent" };
}

// Password reset ----------------------------------------------------------------------------------------

export async function requestPasswordReset(input: EmailOnlyInput, meta: Meta & { turnstileToken: string }): Promise<AuthState> {
  if (!turnstileUsable()) return { status: "unavailable" };
  const ipLimit = await checkLimits([{ scope: "reset-ip", id: meta.ip ?? "unknown", limit: 5, window: HOUR }]);
  if (ipLimit !== "ok") return { status: ipLimit };
  if (!(await checkTurnstile(meta.turnstileToken, "reset", meta.ip))) return { status: "turnstile" };
  const emailLimit = await checkLimits([{ scope: "reset-email", id: input.email, limit: 3, window: HOUR }]);
  if (emailLimit !== "ok") return { status: emailLimit };
  const { error } = await (await createClient()).auth.resetPasswordForEmail(input.email);
  if (error && error.status !== 429) logger.warn("auth.reset_request_failed", { code: error.code ?? null });
  return { status: "sent" };
}

/** Called by `/auth/confirm` after a recovery or invitation link verified: marks the session. */
export async function markRecoverySession(userId: string): Promise<void> {
  const marker = signRecoveryMarker(serverEnv.SUPABASE_SECRET_KEY, userId);
  (await cookies()).set(RECOVERY_COOKIE, marker.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: siteOrigin().startsWith("https:"),
    path: "/",
    maxAge: marker.maxAge,
  });
}

/** Whether this session came from a recovery or invitation link (for the set-password pages). */
export async function hasRecoverySession(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;
  const value = (await cookies()).get(RECOVERY_COOKIE)?.value;
  return verifyRecoveryMarker(serverEnv.SUPABASE_SECRET_KEY, userId, value) ? { userId } : null;
}

/** Sets the new password from a recovery session, then signs out every other session. */
export async function completePasswordReset(input: NewPasswordInput): Promise<AuthResult> {
  const session = await hasRecoverySession();
  if (!session) return { status: "expired" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) {
    if (error.code === "weak_password") return { status: "invalid", errors: { password: "weakPassword" } };
    if (error.code === "same_password") return { status: "invalid", errors: { password: "samePassword" } };
    logger.error("auth.reset_failed", { code: error.code ?? null });
    return { status: "failed" };
  }
  await supabase.auth.signOut({ scope: "others" });
  (await cookies()).delete(RECOVERY_COOKIE);
  const profile = await completeSignIn(supabase);
  if (!profile) return { status: "expired" };
  return { status: "redirect", to: landingFor(profile.role, input.locale) };
}

// Signed-in changes -------------------------------------------------------------------------------------

async function currentUser(supabase: Supabase): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ? { id: data.user.id, email: data.user.email } : null;
}

/** Re-checks the current password with a fresh sign-in (same user, new session cookies). */
async function verifyCurrentPassword(supabase: Supabase, email: string, password: string): Promise<"ok" | "invalid" | "rate_limited"> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return "ok";
  return error.status === 429 ? "rate_limited" : "invalid";
}

/** The signed-in user (verified with the Auth server), or null: for limits keyed on the user. */
export async function signedInUser(): Promise<{ id: string; email: string } | null> {
  return currentUser(await createClient());
}

/**
 * The signed-in user re-entering their password before a sensitive step (data deletion, 5B):
 * the user, or why not. Rate-limited per user by the caller.
 */
export async function confirmCurrentPassword(password: string): Promise<{ id: string; email: string; accessToken: string | null } | "expired" | "invalid" | "rate_limited"> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return "expired";
  const result = await verifyCurrentPassword(supabase, user.email, password);
  if (result !== "ok") return result;
  const { data } = await supabase.auth.getSession();
  return { ...user, accessToken: data.session?.access_token ?? null };
}

export async function changePassword(input: ChangePasswordInput): Promise<AuthState> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { status: "expired" };
  const limited = await checkLimits([{ scope: "password-change", id: user.id, limit: 5, window: HOUR }]);
  if (limited !== "ok") return { status: limited };
  const current = await verifyCurrentPassword(supabase, user.email, input.current);
  if (current === "rate_limited") return { status: "rate_limited" };
  if (current === "invalid") return { status: "invalid", errors: { current: "wrongPassword" } };
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) {
    if (error.code === "weak_password") return { status: "invalid", errors: { password: "weakPassword" } };
    if (error.code === "same_password") return { status: "invalid", errors: { password: "samePassword" } };
    logger.error("auth.password_change_failed", { code: error.code ?? null });
    return { status: "failed" };
  }
  await supabase.auth.signOut({ scope: "others" });
  return { status: "saved" };
}

export async function changeEmail(input: ChangeEmailInput): Promise<AuthState> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { status: "expired" };
  if (user.email.toLowerCase() === input.email) return { status: "invalid", errors: { email: "sameEmail" } };
  const limited = await checkLimits([{ scope: "email-change", id: user.id, limit: 5, window: HOUR }]);
  if (limited !== "ok") return { status: limited };
  const current = await verifyCurrentPassword(supabase, user.email, input.current);
  if (current === "rate_limited") return { status: "rate_limited" };
  if (current === "invalid") return { status: "invalid", errors: { current: "wrongPassword" } };
  const { error } = await supabase.auth.updateUser({ email: input.email });
  // Taken addresses answer like free ones: both inboxes get the confirmation (or nothing).
  if (error && error.code !== "email_exists" && error.code !== "user_already_exists") {
    if (error.status === 429) return { status: "rate_limited" };
    logger.error("auth.email_change_failed", { code: error.code ?? null });
    return { status: "failed" };
  }
  return { status: "sent" };
}

export async function signOutEverywhereElse(): Promise<void> {
  await (await createClient()).auth.signOut({ scope: "others" });
}

export async function signOutCustomer(): Promise<void> {
  await (await createClient()).auth.signOut({ scope: "local" });
}

// Google ------------------------------------------------------------------------------------------------

export const OAUTH_NEXT_COOKIE = "pta_oauth_next";

export function googleEnabled(): boolean {
  return serverEnv.GOOGLE_OAUTH_ENABLED;
}

/** The provider's authorize URL; `next` waits in a short cookie (the callback URL stays fixed). */
export async function startGoogle(locale: Locale, next: string): Promise<string | null> {
  if (!googleEnabled()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteOrigin()}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    logger.error("auth.oauth_start_failed", { code: error?.code ?? null });
    return null;
  }
  (await cookies()).set(OAUTH_NEXT_COOKIE, JSON.stringify({ locale, next: safeRedirectPath(next, "") }), {
    httpOnly: true,
    sameSite: "lax",
    secure: siteOrigin().startsWith("https:"),
    path: "/auth/callback",
    maxAge: 600,
  });
  return data.url;
}

/**
 * `/auth/callback` (decision 3): exchanges the PKCE code on the server. Staff accounts are signed
 * out again and sent to the staff sign-in (password and TOTP only).
 */
export async function completeGoogle(code: string | null): Promise<string> {
  if (!googleEnabled() || !code) return "/auth/error?error=oauth";
  const store = await cookies();
  let state: { locale: Locale; next: string } = { locale: "vi", next: "" };
  try {
    const parsed = JSON.parse(store.get(OAUTH_NEXT_COOKIE)?.value ?? "{}") as { locale?: unknown; next?: unknown };
    state = { locale: parsed.locale === "en" ? "en" : "vi", next: typeof parsed.next === "string" ? parsed.next : "" };
  } catch {
    // A malformed cookie only loses `next`.
  }
  store.delete({ name: OAUTH_NEXT_COOKIE, path: "/auth/callback" });

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logger.warn("auth.oauth_exchange_failed", { code: error.code ?? null });
    return "/auth/error?error=oauth";
  }
  const profile = await loadProfile(supabase);
  if (profile && isStaffRole(profile.role)) {
    await supabase.auth.signOut({ scope: "local" });
    logger.warn("auth.oauth_staff_refused", {});
    return "/auth/login?error=staff_oauth";
  }
  const completed = await completeSignIn(supabase);
  if (!completed) return "/auth/error?error=inactive";
  return landingFor(completed.role, completed.locale ?? state.locale, state.next);
}

/** For `/auth/confirm` after a verified email link: what to do and where to go. */
export async function completeEmailLink(type: string, next: string | undefined): Promise<string> {
  const supabase = await createClient();
  if (type === "recovery" || type === "invite") {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return "/auth/error?error=link";
    const profile = await completeSignIn(supabase);
    if (!profile) return "/auth/error?error=inactive";
    await markRecoverySession(profile.id);
    return isStaffRole(profile.role) || type === "invite" ? "/auth/update-password" : resetPath(profile.locale);
  }
  const profile = await completeSignIn(supabase);
  if (!profile) return "/auth/error?error=inactive";
  // A link's own `next` (Auth templates) wins; an unsafe one falls back to the home page.
  if (next) return safeRedirectPath(next, "/");
  return landingFor(profile.role, profile.locale);
}
