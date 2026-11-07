"use server";

import { redirect } from "next/navigation";

import { getPathname } from "@/i18n/navigation";
import { type AuthState, deleteAccountSchema, fieldErrors } from "@/modules/identity/customer-auth.schemas";

import { requestMyDeletion } from "./account-deletion.service";

/**
 * "Delete my account" (spec Phase 5 decision 8): the current password, then the service. When
 * the session has ended (deleted, or a step failed after the ban), the answer is shown on the
 * sign-in page: the account page cannot render for a signed-out visitor.
 */
export async function deleteAccountAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = deleteAccountSchema.safeParse({ current: formData.get("current") ?? undefined, locale: formData.get("locale") ?? undefined });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  const result = await requestMyDeletion(parsed.data);
  if (result.status === "deleted" || result.status === "received") {
    redirect(`${getPathname({ locale: parsed.data.locale, href: "/login" })}?deleted=${result.status === "deleted" ? "1" : "received"}`);
  }
  return result;
}
