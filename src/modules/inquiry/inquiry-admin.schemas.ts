import { z } from "zod";

import type { Database } from "@/types/database.types";

// Messages are keys in `Admin.Inquiries.errors`.

export type InquiryStatus = Database["public"]["Enums"]["inquiry_status"];

export const INQUIRY_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"] as const satisfies readonly InquiryStatus[];
/** Statuses staff can set (`new` means "not answered yet": nothing goes back to it). */
export const SETTABLE_STATUSES = ["contacted", "quoted", "won", "lost", "spam"] as const satisfies readonly InquiryStatus[];
export const INQUIRY_SOURCES = ["tailor_made", "tour_inquiry", "contact"] as const;
export const INQUIRY_SORTS = ["created_at", "first_responded_at"] as const;
export type InquirySort = (typeof INQUIRY_SORTS)[number];

const note = z.string().trim().min(3, "noteRequired").max(2000, "tooLong");

export const inquiryNoteSchema = z.object({
  inquiryId: z.uuid(),
  body: note,
  contacted: z.boolean().default(false),
});
export type InquiryNoteInput = z.input<typeof inquiryNoteSchema>;
export type InquiryNoteValues = z.output<typeof inquiryNoteSchema>;

export const inquiryStatusSchema = z.object({
  inquiryId: z.uuid(),
  status: z.enum(SETTABLE_STATUSES, "required"),
  note: z.string().trim().max(2000, "tooLong").default(""),
});
export type InquiryStatusInput = z.input<typeof inquiryStatusSchema>;
export type InquiryStatusValues = z.output<typeof inquiryStatusSchema>;

/** `assignee` is a staff id, or "" for nobody. */
export const inquiryAssignSchema = z.object({
  inquiryId: z.uuid(),
  assignee: z.union([z.uuid(), z.literal("")]),
});
export type InquiryAssignInput = z.input<typeof inquiryAssignSchema>;
export type InquiryAssignValues = z.output<typeof inquiryAssignSchema>;

export type InquiryActionError = "forbidden" | "invalid" | "not_found" | "note_required" | "invalid_status" | "invalid_assignee" | "failed";
export type InquiryActionResult = { ok: true } | { ok: false; error: InquiryActionError; fields?: Record<string, string> };

/** Maps an error raised by the inquiry functions to a message key. */
export function inquiryErrorCode(error: { code?: string; message?: string } | null): InquiryActionError {
  if (!error) return "failed";
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.message === "note_required") return "note_required";
  if (error.message === "invalid_status") return "invalid_status";
  if (error.message === "invalid_assignee") return "invalid_assignee";
  if (error.code === "22001") return "invalid";
  return "failed";
}

/** Milliseconds from arrival to the first response, or null while unanswered. */
export function responseTime(createdAt: string, firstRespondedAt: string | null): number | null {
  if (!firstRespondedAt) return null;
  return Math.max(new Date(firstRespondedAt).getTime() - new Date(createdAt).getTime(), 0);
}

/** "45 phút", "3 giờ 20 phút", "2 ngày 4 giờ": short enough for a table cell. */
export function formatDuration(ms: number): { days: number; hours: number; minutes: number } {
  const minutes = Math.floor(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/**
 * The owner filter: "mine", "unassigned", a staff id (managers and admins), or nothing (every
 * inquiry the caller can read: for sales that is their own and the unassigned ones, through RLS).
 */
export function ownerFilter(value: string | undefined, canSeeAll: boolean): { kind: "mine" | "unassigned" | "all" } | { kind: "user"; id: string } {
  if (value === "mine") return { kind: "mine" };
  if (value === "unassigned") return { kind: "unassigned" };
  if (canSeeAll && value && z.guid().safeParse(value).success) return { kind: "user", id: value };
  return { kind: "all" };
}

/** A quote form start date from the inquiry's month: its first day when that is still ahead. */
export function quoteStartDate(travelMonth: string | null, today: string): string | null {
  if (!travelMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(travelMonth)) return null;
  const first = `${travelMonth}-01`;
  return first > today ? first : null;
}

export type InquiryListRow = {
  id: string;
  code: string;
  status: InquiryStatus;
  source: string | null;
  name: string;
  email: string;
  tourCode: string | null;
  owner: string | null;
  createdAt: string;
  firstRespondedAt: string | null;
};

export type InquiryNote = { id: string; body: string; author: string | null; createdAt: string };
export type InquiryActivity = { action: string; actor: string | null; createdAt: string; before: Record<string, unknown>; after: Record<string, unknown>; contacted: boolean };

export type InquiryDetail = {
  id: string;
  code: string;
  status: InquiryStatus;
  source: string | null;
  locale: "vi" | "en";
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  companyName: string | null;
  preferredContact: string | null;
  destinations: string[];
  destinationsOther: string | null;
  travelStyle: string | null;
  tour: { id: string; code: string; title: string; type: "group" | "private" } | null;
  travelMonth: string | null;
  flexibleDates: boolean;
  durationDays: number | null;
  adults: number | null;
  children: number;
  budget: string | null;
  message: string | null;
  utm: Record<string, string>;
  ownerId: string | null;
  owner: string | null;
  createdAt: string;
  firstRespondedAt: string | null;
  booking: { id: string; code: string; status: Database["public"]["Enums"]["booking_status"] } | null;
  notes: InquiryNote[];
  consents: { purpose: string; granted: boolean; version: string; createdAt: string }[];
  activity: InquiryActivity[];
};

export type QuotePrefill = {
  inquiryCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  adults: number;
  children: number;
  locale: "vi" | "en";
  tourId: string | null;
  startDate: string | null;
};
