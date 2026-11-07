import "server-only";

import { z } from "zod";

import { pageRange, type ListParams } from "@/lib/admin/list-params";
import { todayInVietnam } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";

import * as repo from "./inquiry-admin.repository";
import {
  INQUIRY_SOURCES,
  INQUIRY_STATUSES,
  type InquiryActionResult,
  type InquiryActivity,
  type InquiryAssignValues,
  type InquiryDetail,
  inquiryErrorCode,
  type InquiryListRow,
  type InquiryNoteValues,
  type InquirySort,
  type InquiryStatusValues,
  ownerFilter,
  type QuotePrefill,
  quoteStartDate,
} from "./inquiry-admin.schemas";

type One<T> = T | T[] | null;
const one = <T>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
const personLabel = (person: { full_name: string | null; email: string } | null) => (person ? (person.full_name ?? person.email) : null);
type Translation = { locale: string; title?: string | null; name?: string | null };
const vietnamese = (rows: Translation[] | null | undefined, field: "title" | "name") => {
  const usable = (rows ?? []).filter((row) => typeof row[field] === "string" && row[field]!.trim());
  return (usable.find((row) => row.locale === "vi") ?? usable[0])?.[field] ?? null;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Whether the role sees and assigns every inquiry (ADR-037). */
export function managesAllInquiries(role: string | null | undefined): boolean {
  return can(role as never, "inquiries.manage_all");
}

export type InquiryPage = { rows: InquiryListRow[]; total: number; pageCount: number };

/** One page of the inbox for staff who may read inquiries (sales roles, operator, admin). */
export async function listInquiries(params: ListParams<InquirySort>): Promise<InquiryPage> {
  const user = await requirePermission("inquiries.read");
  const status = (INQUIRY_STATUSES as readonly string[]).includes(params.filters.status ?? "")
    ? (params.filters.status as (typeof INQUIRY_STATUSES)[number])
    : undefined;
  const source = (INQUIRY_SOURCES as readonly string[]).includes(params.filters.source ?? "") ? params.filters.source : undefined;
  const query = {
    q: params.q || undefined,
    status,
    source,
    owner: ownerFilter(params.filters.owner, managesAllInquiries(user.role) || user.role === "operator"),
    userId: user.id,
    sort: params.sort,
    dir: params.dir,
  };
  let { data, error, count } = await repo.findInquiries({ ...query, range: pageRange(params) });
  if (error?.code === "PGRST103") {
    ({ data, error, count } = await repo.findInquiries({ ...query, range: [0, 0] }));
    data = [];
  }
  if (error) throw new Error(`inquiries query failed: ${error.message}`);
  const rows: InquiryListRow[] = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    source: row.source,
    name: row.name,
    email: row.email,
    tourCode: one(row.tour)?.code ?? null,
    owner: personLabel(one(row.owner)),
    createdAt: row.created_at,
    firstRespondedAt: row.first_responded_at,
  }));
  const total = count ?? rows.length;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}

/** Staff who can own inquiries, for the owner filter and the assignment select. */
export async function inquiryAssignees(): Promise<{ value: string; label: string }[]> {
  await requirePermission("inquiries.read");
  const { data } = await repo.listAssignees();
  return (data ?? []).map((row) => ({ value: row.id, label: row.full_name ?? row.email }));
}

export async function getInquiry(id: string): Promise<InquiryDetail | null> {
  await requirePermission("inquiries.read");
  const { data: row, error } = await repo.findInquiry(id);
  if (error) throw new Error(`inquiry query failed: ${error.message}`);
  if (!row) return null;
  const ids = (row.destination_ids ?? []).filter((value): value is string => typeof value === "string");
  const [names, consents, activity] = await Promise.all([
    ids.length > 0 ? repo.destinationNames(ids) : Promise.resolve({ data: [], error: null }),
    repo.consents(id),
    repo.activity(id),
  ]);
  if (activity.error) logger.warn("inquiry.activity_failed", { code: activity.error.code ?? null });
  const activityRows = activity.data ?? [];

  // Names for the actors and the owners in the history.
  const people = new Set<string>();
  for (const item of activityRows) {
    if (item.actor_id) people.add(item.actor_id);
    for (const side of [record(record(item.changes).before), record(record(item.changes).after)]) {
      if (typeof side.assigned_to === "string") people.add(side.assigned_to);
    }
  }
  const { data: profiles } = people.size > 0 ? await repo.profileNames([...people]) : { data: [] };
  const nameOf = new Map((profiles ?? []).map((person) => [person.id, person.full_name ?? person.email]));
  const named = (side: Record<string, unknown>) =>
    "assigned_to" in side ? { ...side, assigned_to: typeof side.assigned_to === "string" ? (nameOf.get(side.assigned_to) ?? "—") : null } : side;

  const tour = one(row.tour);
  const booking = one(row.booking);
  const utm = Object.fromEntries(Object.entries(record(row.utm)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    source: row.source,
    locale: row.locale,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    companyName: row.company_name,
    preferredContact: row.preferred_contact,
    destinations: ids
      .map((value) => vietnamese((names.data ?? []).filter((item) => item.destination_id === value), "name"))
      .filter((name): name is string => Boolean(name)),
    destinationsOther: row.destinations_other,
    travelStyle: (() => {
      const style = one(row.style);
      return style ? (vietnamese(style.travel_style_translations, "name") ?? style.key) : null;
    })(),
    tour: tour ? { id: tour.id, code: tour.code, type: tour.type, title: vietnamese(tour.tour_translations, "title") ?? tour.code } : null,
    travelMonth: row.travel_month,
    flexibleDates: row.flexible_dates,
    durationDays: row.duration_days,
    adults: row.adults,
    children: row.children,
    budget: row.budget_per_person,
    message: row.message,
    utm,
    ownerId: row.assigned_to,
    owner: personLabel(one(row.owner)),
    createdAt: row.created_at,
    firstRespondedAt: row.first_responded_at,
    booking: booking ? { id: booking.id, code: booking.code, status: booking.status } : null,
    notes: (row.notes ?? [])
      .map((note) => ({ id: note.id, body: note.body, author: personLabel(one(note.author)), createdAt: note.created_at }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    consents: (consents.data ?? []).map((item) => ({ purpose: item.purpose, granted: item.granted, version: item.document_version, createdAt: item.created_at })),
    activity: activityRows.map(
      (item): InquiryActivity => ({
        action: item.action,
        actor: item.actor_id ? (nameOf.get(item.actor_id) ?? null) : null,
        createdAt: item.created_at,
        before: named(record(record(item.changes).before)),
        after: named(record(record(item.changes).after)),
        contacted: record(item.changes).contacted === true,
      }),
    ),
  };
}

function failure(action: string, error: { code?: string; message?: string }): InquiryActionResult {
  const code = inquiryErrorCode(error);
  if (code === "failed") logger.error("inquiry.admin_action_failed", { action, code: error.code ?? null });
  return { ok: false, error: code };
}

/** Sales take an unassigned inquiry; managers and admins assign anyone or nobody (the function decides). */
export async function assignInquiry(values: InquiryAssignValues): Promise<InquiryActionResult> {
  await requirePermission("inquiries.edit");
  const { error } = await repo.assign(values.inquiryId, values.assignee || null);
  return error ? failure("assign", error) : { ok: true };
}

export async function updateInquiryStatus(values: InquiryStatusValues): Promise<InquiryActionResult> {
  await requirePermission("inquiries.edit");
  const { error } = await repo.updateStatus(values.inquiryId, values.status, values.note);
  return error ? failure("status", error) : { ok: true };
}

export async function addInquiryNote(values: InquiryNoteValues): Promise<InquiryActionResult> {
  await requirePermission("inquiries.edit");
  const { error } = await repo.addNote(values.inquiryId, values.body, values.contacted);
  return error ? failure("note", error) : { ok: true };
}

/**
 * The quote form prefilled from an inquiry (`/admin/bookings/new?inquiry=<code>`): contact, party,
 * language, the tour when it is a private one, and the first day of the travel month when ahead.
 * Null when the caller cannot see the inquiry or it already has a booking.
 */
export async function quotePrefill(code: string): Promise<QuotePrefill | null> {
  await requirePermission("bookings.edit");
  const parsed = z.string().trim().toUpperCase().regex(/^INQ-\d{4}-\d{4,}$/).safeParse(code);
  if (!parsed.success) return null;
  const { data } = await repo.findInquiryByCode(parsed.data);
  if (!data || one(data.booking)) return null;
  const tour = one(data.tour);
  return {
    inquiryCode: data.code,
    contactName: data.name,
    contactEmail: data.email,
    contactPhone: data.phone ?? "",
    adults: data.adults && data.adults > 0 ? data.adults : 2,
    children: data.children ?? 0,
    locale: data.locale,
    tourId: tour && tour.type === "private" && tour.status !== "archived" ? tour.id : null,
    startDate: quoteStartDate(data.travel_month, todayInVietnam()),
  };
}
