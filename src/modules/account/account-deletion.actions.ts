"use server";

import { type AuthState, deleteAccountSchema, fieldErrors } from "@/modules/identity/customer-auth.schemas";

import { requestMyDeletion } from "./account-deletion.service";

/** "Delete my account" (spec Phase 5 decision 8): the current password, then the service. */
export async function deleteAccountAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = deleteAccountSchema.safeParse({ current: formData.get("current") ?? undefined, locale: formData.get("locale") ?? undefined });
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  return requestMyDeletion(parsed.data);
}
