"use server";

import { requestMeta } from "@/modules/identity/auth-guards";
import { type AuthState, fieldErrors } from "@/modules/identity/customer-auth.schemas";

import { bookingLookupSchema } from "./booking-lookup.schemas";
import { requestBookingLookup } from "./booking-lookup.service";

/** Guest booking lookup (spec Phase 5 decision 7): Zod with field errors, then the service. */
export async function bookingLookupAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const value = (key: string) => formData.get(key) ?? undefined;
  const parsed = bookingLookupSchema.safeParse({
    code: value("code"),
    email: value("email"),
    locale: value("locale"),
    turnstileToken: value("cf-turnstile-response") ?? "",
  });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  const meta = await requestMeta();
  return requestBookingLookup(parsed.data, { ip: meta.ip });
}
