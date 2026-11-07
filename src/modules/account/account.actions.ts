"use server";

import { marketingSchema, profileSchema, travellersSchema } from "./account.schemas";
import { currentCustomer, saveMyMarketing, saveMyProfile, saveMyTravellers } from "./account.service";

/**
 * Account area Server Actions (docs/specs/phase-5-accounts-inquiries-operations.md decision 4):
 * signed-in customers only, Zod first, then the service with the customer's own session.
 */

export type AccountFormState = {
  status: "idle" | "saved" | "invalid" | "locked" | "too_many" | "lead_required" | "not_found" | "unavailable" | "expired" | "failed";
  errors?: Record<string, string>;
};

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};

export async function saveProfileAction(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await currentCustomer();
  if (!user) return { status: "expired" };
  const parsed = profileSchema.safeParse({
    fullName: text(formData, "fullName"),
    phone: text(formData, "phone") ?? "",
    country: text(formData, "country") ?? "",
    locale: text(formData, "preferredLocale"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      errors[field] ??= issue.message;
    }
    return { status: "invalid", errors };
  }
  const result = await saveMyProfile(user.id, parsed.data);
  return { status: result };
}

export async function saveMarketingAction(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await currentCustomer();
  if (!user) return { status: "expired" };
  const parsed = marketingSchema.safeParse({ marketing: text(formData, "marketing"), locale: text(formData, "locale") });
  if (!parsed.success) return { status: "invalid" };
  return { status: await saveMyMarketing(parsed.data.marketing, parsed.data.locale) };
}

/** Travellers come as parallel fields (`fullName`, `dateOfBirth`, … repeated per row). */
export async function saveTravellersAction(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await currentCustomer();
  if (!user) return { status: "expired" };
  const all = (key: string) => formData.getAll(key).map((value) => (typeof value === "string" ? value : ""));
  const names = all("fullName");
  const dates = all("dateOfBirth");
  const nationalities = all("nationality");
  const notes = all("dietaryNotes");
  const entries = names
    .map((fullName, index) => ({ index, row: { fullName, dateOfBirth: dates[index] ?? "", nationality: nationalities[index] ?? "", dietaryNotes: notes[index] ?? "" } }))
    // A row left completely empty is not a traveller.
    .filter(({ row }) => Object.values(row).some((value) => value.trim() !== ""));
  // The lead radio carries the row's position on the page; map it onto the kept rows.
  const leadOnPage = Number(text(formData, "lead") ?? "0");
  const lead = Math.max(entries.findIndex((entry) => entry.index === leadOnPage), entries.length > 0 ? -1 : 0);
  const rows = entries.map((entry) => entry.row);
  const parsed = travellersSchema.safeParse({ code: text(formData, "code"), travellers: rows, lead: lead < 0 ? rows.length : lead });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "travellers" && typeof issue.path[1] === "number") errors[`${issue.path[1]}.${String(issue.path[2])}`] ??= issue.message;
    }
    return { status: "invalid", errors };
  }
  // The account pages render per request (no cache to refresh).
  return { status: (await saveMyTravellers(parsed.data)).status };
}
