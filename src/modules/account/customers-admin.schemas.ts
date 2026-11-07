import { z } from "zod";

/** The customers admin (spec Phase 5 decision 16): list, detail, notes, export and deletion. */

export const CUSTOMER_SORTS = ["created_at", "full_name", "email"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
export const CUSTOMER_STATES = ["active", "requested", "deleted"] as const;
export type CustomerState = (typeof CUSTOMER_STATES)[number];
export const DELETION_BLOCKERS = ["open_payment", "balance_due", "upcoming_trip", "attention"] as const;

const note = z.string().trim().min(3, "noteRequired").max(2000, "tooLong");

export const customerNoteSchema = z.object({ customerId: z.uuid(), body: note });
export type CustomerNoteInput = z.input<typeof customerNoteSchema>;

export const finishDeletionSchema = z.object({ customerId: z.uuid(), note });
export type FinishDeletionInput = z.input<typeof finishDeletionSchema>;

export const customerIdSchema = z.object({ customerId: z.uuid() });

export type CustomerActionError = "forbidden" | "invalid" | "not_found" | "not_requested" | "blocked" | "failed";
export type CustomerActionResult =
  | { ok: true; status?: "done" }
  | { ok: false; error: CustomerActionError; fields?: Record<string, string>; reasons?: string[]; step?: string };

export type CustomerExportResult = { ok: true; json: string; filename: string } | { ok: false; error: "forbidden" | "not_found" | "failed" };

export type CustomerListRow = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  createdAt: string;
  state: CustomerState;
};

export type DeletionRequest = {
  id: string;
  email: string;
  fullName: string | null;
  requestedAt: string;
  profileDeleted: boolean;
  authDeleted: boolean;
  blockers: string[];
};

export const deletionRequestsSchema = z.array(
  z.object({
    id: z.string(),
    email: z.string(),
    full_name: z.string().nullable(),
    requested_at: z.string(),
    profile_deleted: z.boolean(),
    auth_deleted: z.boolean(),
    blockers: z.array(z.string()),
  }),
);

export const consentsSchema = z.array(
  z.object({ purpose: z.string(), granted: z.boolean(), document_version: z.string(), created_at: z.string() }),
);

export function customerState(row: { deletion_requested_at: string | null; deleted_at: string | null }): CustomerState {
  if (row.deleted_at) return "deleted";
  return row.deletion_requested_at ? "requested" : "active";
}

/** PostgREST filter syntax and LIKE wildcards are dropped from free-text search. */
export function cleanCustomerSearch(q: string): string {
  return q.replace(/[,()*%_\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** An address as a literal ILIKE pattern (case-insensitive equality). */
export function exactPattern(email: string): string {
  return email.replace(/[\\%_]/g, (char) => `\\${char}`);
}
