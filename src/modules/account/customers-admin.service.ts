import "server-only";

import { z } from "zod";

import type { ListParams } from "@/lib/admin/list-params";
import { requirePermission } from "@/lib/auth/require-role";
import { can } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import type { Database } from "@/types/database.types";

import { finishDeletionAsAdmin } from "./account-deletion.service";
import * as repo from "./customers-admin.repository";
import {
  cleanCustomerSearch,
  consentsSchema,
  type CustomerActionResult,
  type CustomerExportResult,
  type CustomerListRow,
  type CustomerSort,
  type CustomerState,
  customerState,
  type DeletionRequest,
  deletionRequestsSchema,
  exactPattern,
} from "./customers-admin.schemas";

/**
 * The customers admin (spec Phase 5 decision 16; FEATURES "Customers"): every staff role that
 * reads customers (sales roles, operator, accountant, admin) sees the list and the detail;
 * notes are for sales roles and admin; the data export and finishing a deletion request are for
 * an MFA-verified admin only (decision 8). RLS and the definer functions check again.
 */

export const CUSTOMERS_PAGE_SIZE = 25;

type Enums = Database["public"]["Enums"];

export async function listCustomers(params: ListParams<CustomerSort>) {
  await requirePermission("customers.read");
  const from = (params.page - 1) * CUSTOMERS_PAGE_SIZE;
  const { data, error, count } = await repo.listCustomerRows({
    q: cleanCustomerSearch(params.q),
    state: params.filters.state as CustomerState | undefined,
    sort: params.sort,
    dir: params.dir,
    range: [from, from + CUSTOMERS_PAGE_SIZE - 1],
  });
  if (error) throw new Error(`customers query failed: ${error.code ?? "unknown"}`);
  const rows: CustomerListRow[] = (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    country: row.country,
    createdAt: row.created_at,
    state: customerState(row),
  }));
  const total = count ?? rows.length;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)) };
}

function toRequests(data: unknown): DeletionRequest[] {
  return deletionRequestsSchema.parse(data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    requestedAt: row.requested_at,
    profileDeleted: row.profile_deleted,
    authDeleted: row.auth_deleted,
    blockers: row.blockers,
  }));
}

/** Open deletion requests with their blockers (admin at aal2; `admin_deletion_requests()`). */
export async function listDeletionRequests(): Promise<DeletionRequest[]> {
  await requirePermission("customers.delete_data");
  const { data, error } = await repo.deletionRequests();
  if (error) throw new Error(`deletion requests query failed: ${error.code ?? "unknown"}`);
  return toRequests(data);
}

export type CustomerDetail = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  locale: string;
  marketingConsent: boolean;
  createdAt: string;
  state: CustomerState;
  requestedAt: string | null;
  bookings: { id: string; code: string; status: Enums["booking_status"]; paymentState: Enums["booking_payment_state"]; startDate: string; total: number; amountPaid: number; tourCode: string }[];
  inquiries: { id: string; code: string; status: Enums["inquiry_status"]; source: string | null; createdAt: string }[];
  notes: { id: string; body: string; createdAt: string; author: string }[] | null;
  consents: { purpose: string; granted: boolean; documentVersion: string; createdAt: string }[];
  /** Only for an MFA-verified admin; null for other roles, or when no request is open. */
  deletion: DeletionRequest | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const user = await requirePermission("customers.read");
  if (!z.guid().safeParse(id).success) return null;
  const { data: profile, error } = await repo.findCustomer(id);
  if (error) throw new Error(`customer query failed: ${error.code ?? "unknown"}`);
  if (!profile) return null;

  const readsNotes = can(user.role, "customers.notes") || user.role === "operator";
  const [bookings, inquiries, notes, consents, deletion] = await Promise.all([
    repo.customerBookings(id),
    can(user.role, "inquiries.read") ? repo.customerInquiries(exactPattern(profile.email)) : Promise.resolve({ data: [], error: null }),
    readsNotes ? repo.customerNotes(id) : Promise.resolve({ data: null, error: null }),
    repo.customerConsents(id),
    can(user.role, "customers.delete_data") ? repo.deletionRequests(id) : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = bookings.error ?? inquiries.error ?? notes.error ?? consents.error ?? deletion.error;
  if (failed) throw new Error(`customer detail query failed: ${failed.code ?? "unknown"}`);

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    country: profile.country,
    locale: profile.locale,
    marketingConsent: profile.marketing_consent,
    createdAt: profile.created_at,
    state: customerState(profile),
    requestedAt: profile.deletion_requested_at,
    bookings: (bookings.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      paymentState: row.payment_state,
      startDate: row.start_date,
      total: row.total,
      amountPaid: row.amount_paid,
      tourCode: one(row.tour)?.code ?? "",
    })),
    inquiries: (inquiries.data ?? []).map((row) => ({ id: row.id, code: row.code, status: row.status, source: row.source, createdAt: row.created_at })),
    notes: notes.data
      ? notes.data.map((row) => {
          const author = one(row.author);
          return { id: row.id, body: row.body, createdAt: row.created_at, author: author?.full_name || author?.email || "" };
        })
      : null,
    consents: consentsSchema.parse(consents.data ?? []).map((row) => ({
      purpose: row.purpose,
      granted: row.granted,
      documentVersion: row.document_version,
      createdAt: row.created_at,
    })),
    deletion: toRequests(deletion.data)[0] ?? null,
  };
}

export async function addCustomerNote(values: { customerId: string; body: string }): Promise<CustomerActionResult> {
  const user = await requirePermission("customers.notes");
  const { data: profile } = await repo.findCustomer(values.customerId);
  if (!profile) return { ok: false, error: "not_found" };
  const { error } = await repo.addNote({ body: values.body, author_id: user.id, customer_id: values.customerId });
  if (error) {
    logger.error("customers.note_failed", { code: error.code ?? null });
    return { ok: false, error: error.code === "42501" ? "forbidden" : "failed" };
  }
  return { ok: true };
}

/**
 * The personal-data export (decisions 8 and 16): an MFA-verified admin, the service-role read
 * (`customer_data_export()`: the address comes from the confirmed Auth email, never
 * `profiles.email`), then the `customers.export` audit row; without that row there is no file.
 */
export async function exportCustomerData(customerId: string): Promise<CustomerExportResult> {
  const user = await requirePermission("customers.delete_data");
  const { data, error } = await repo.dataExport(customerId);
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "not_found" };
    logger.error("customers.export_failed", { code: error.code ?? null });
    return { ok: false, error: "failed" };
  }
  const exported = (data ?? {}) as Record<string, unknown>;
  const size = (key: string) => (Array.isArray(exported[key]) ? (exported[key] as unknown[]).length : 0);
  const audit = await repo.writeAuditRow({
    actor_id: user.id,
    action: "customers.export",
    entity_type: "profiles",
    entity_id: customerId,
    changes: { counts: { bookings: size("bookings"), travellers: size("travellers"), consents: size("consents"), inquiries: size("inquiries") } },
  });
  if (audit.error) {
    logger.error("customers.export_audit_failed", { code: audit.error.code ?? null });
    return { ok: false, error: "failed" };
  }
  const json = JSON.stringify({ exported_at: new Date().toISOString(), ...exported }, null, 2);
  return { ok: true, json, filename: `customer-${customerId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json` };
}

/** Finishes (or retries) a deletion request that had to wait, with a note (decision 8). */
export async function finishCustomerDeletion(values: { customerId: string; note: string }): Promise<CustomerActionResult> {
  const outcome = await finishDeletionAsAdmin(values.customerId, values.note);
  switch (outcome.status) {
    case "done":
      return { ok: true, status: "done" };
    case "blocked":
      return { ok: false, error: "blocked", reasons: outcome.reasons };
    case "not_requested":
      return { ok: false, error: "not_requested" };
    case "forbidden":
      return { ok: false, error: "forbidden" };
    case "failed":
      return { ok: false, error: "failed", step: outcome.step };
  }
}
