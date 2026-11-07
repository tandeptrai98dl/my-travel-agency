import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getPathname } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isStaffRole } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";
import { verifiedUser } from "@/modules/identity/customer-auth.service";

import * as repo from "./account.repository";
import type { ProfileInput, TravellersInput } from "./account.schemas";

/**
 * The customer account (docs/specs/phase-5-accounts-inquiries-operations.md decisions 4–5): every
 * booking read goes through the customer-safe functions, never the tables.
 */

type Locale = "vi" | "en";

export type BookingStatus = "draft" | "quoted" | "pending_payment" | "confirmed" | "completed" | "cancelled" | "expired";
export type PaymentState = "unpaid" | "deposit_paid" | "paid" | "partially_refunded" | "refunded";

export type BookingListItem = {
  code: string;
  status: BookingStatus;
  paymentState: PaymentState;
  tourCode: string | null;
  tourTitle: string | null;
  startDate: string;
  endDate: string | null;
  travellers: number;
  total: number;
  amountPaid: number;
  balanceDueDate: string | null;
  upcoming: boolean;
};

const lineSchema = z.object({ type: z.string(), label: z.string(), unit_price: z.number(), quantity: z.number(), amount: z.number() });
const travellerSchema = z.object({
  full_name: z.string(),
  date_of_birth: z.string().nullable(),
  nationality: z.string().nullable(),
  dietary_notes: z.string().nullable(),
  is_lead: z.boolean(),
});
const paymentSchema = z.object({
  amount: z.number(),
  kind: z.enum(["deposit", "balance", "full", "refund"]),
  provider: z.string(),
  status: z.enum(["pending", "succeeded", "failed", "expired", "cancelled"]),
  paid_at: z.string().nullable(),
  created_at: z.string(),
});
const detailSchema = z.object({
  code: z.string(),
  status: z.enum(["draft", "quoted", "pending_payment", "confirmed", "completed", "cancelled", "expired"]),
  payment_state: z.enum(["unpaid", "deposit_paid", "paid", "partially_refunded", "refunded"]),
  type: z.enum(["instant", "quoted"]),
  locale: z.enum(["vi", "en"]),
  tour_code: z.string().nullable(),
  tour_title: z.string().nullable(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  adults: z.number(),
  children: z.number(),
  infants: z.number(),
  single_rooms: z.number(),
  contact_name: z.string(),
  contact_email: z.string(),
  contact_phone: z.string(),
  total: z.number(),
  deposit_amount: z.number(),
  amount_paid: z.number(),
  payment_plan: z.enum(["deposit", "full"]),
  balance_due_date: z.string().nullable(),
  created_at: z.string(),
  cancellation_summary: z.record(z.string(), z.string()).nullable().catch(null),
  travellers_editable: z.boolean(),
  items: z.array(lineSchema),
  travellers: z.array(travellerSchema),
  payments: z.array(paymentSchema),
});

export type BookingDetail = {
  code: string;
  status: BookingStatus;
  paymentState: PaymentState;
  tourCode: string | null;
  tourTitle: string | null;
  startDate: string;
  endDate: string | null;
  party: { adults: number; children: number; infants: number; singleRooms: number };
  contact: { name: string; email: string; phone: string };
  total: number;
  depositAmount: number;
  amountPaid: number;
  balanceDue: number;
  balanceDueDate: string | null;
  /** Whether the checkout can take money now (opens the existing checkout pages). */
  payable: boolean;
  cancellationSummary: string | null;
  travellersEditable: boolean;
  maxTravellers: number;
  lines: { type: string; label: string; unitPrice: number; quantity: number; amount: number }[];
  travellers: { fullName: string; dateOfBirth: string | null; nationality: string | null; dietaryNotes: string | null; isLead: boolean }[];
  payments: { amount: number; kind: string; provider: string; status: string; paidAt: string | null; createdAt: string }[];
};

/** Today's date in Vietnam (`YYYY-MM-DD`), for upcoming vs past. */
function vietnamToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

/** The signed-in customer, or null (signed out, staff, inactive). */
export async function currentCustomer() {
  const user = await getCurrentUser();
  return user && user.role === "customer" ? user : null;
}

/**
 * Gate of every account page (decision 4): signed-out visitors go to sign-in with `next`, staff to
 * the admin. Returns the customer.
 */
export async function requireCustomer(locale: Locale, nextPath: string) {
  const user = await verifiedUser();
  if (!user) redirect(`${getPathname({ locale, href: "/login" })}?next=${encodeURIComponent(nextPath)}`);
  if (isStaffRole(user.role)) redirect("/admin");
  return user;
}

export async function listMyBookings(now = new Date()): Promise<BookingListItem[]> {
  const { data, error } = await repo.listBookings();
  if (error) throw new Error(`customer_bookings failed: ${error.code ?? "unknown"}`);
  const today = vietnamToday(now);
  return (data ?? []).map((row) => ({
    code: row.code,
    status: row.status,
    paymentState: row.payment_state,
    tourCode: row.tour_code,
    tourTitle: row.tour_title,
    startDate: row.start_date,
    endDate: row.end_date,
    travellers: row.adults + row.children + row.infants,
    total: row.total,
    amountPaid: row.amount_paid,
    balanceDueDate: row.balance_due_date,
    upcoming: row.start_date >= today && !["cancelled", "expired", "completed"].includes(row.status),
  }));
}

export function summaryFor(summary: Record<string, string> | null, locale: Locale): string | null {
  if (!summary) return null;
  return summary[locale] || summary[locale === "vi" ? "en" : "vi"] || null;
}

export async function getMyBooking(code: string, locale: Locale): Promise<BookingDetail | null> {
  if (!/^PTA-\d{4}-\d{4,}$/.test(code)) return null;
  const { data, error } = await repo.getBooking(code);
  if (error) throw new Error(`customer_booking failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const parsed = detailSchema.safeParse(data);
  if (!parsed.success) {
    logger.error("account.booking_shape", { issues: parsed.error.issues.length });
    return null;
  }
  const b = parsed.data;
  const balanceDue = Math.max(b.total - b.amount_paid, 0);
  return {
    code: b.code,
    status: b.status,
    paymentState: b.payment_state,
    tourCode: b.tour_code,
    tourTitle: b.tour_title,
    startDate: b.start_date,
    endDate: b.end_date,
    party: { adults: b.adults, children: b.children, infants: b.infants, singleRooms: b.single_rooms },
    contact: { name: b.contact_name, email: b.contact_email, phone: b.contact_phone },
    total: b.total,
    depositAmount: b.deposit_amount,
    amountPaid: b.amount_paid,
    balanceDue,
    balanceDueDate: b.balance_due_date,
    payable: (b.status === "confirmed" && balanceDue > 0) || b.status === "draft" || b.status === "pending_payment" || b.status === "quoted",
    cancellationSummary: summaryFor(b.cancellation_summary, locale),
    travellersEditable: b.travellers_editable,
    maxTravellers: b.adults + b.children + b.infants,
    lines: b.items.map((item) => ({ type: item.type, label: item.label, unitPrice: item.unit_price, quantity: item.quantity, amount: item.amount })),
    travellers: b.travellers.map((t) => ({
      fullName: t.full_name,
      dateOfBirth: t.date_of_birth,
      nationality: t.nationality,
      dietaryNotes: t.dietary_notes,
      isLead: t.is_lead,
    })),
    payments: b.payments.map((p) => ({ amount: p.amount, kind: p.kind, provider: p.provider, status: p.status, paidAt: p.paid_at, createdAt: p.created_at })),
  };
}

export type TravellersResult = { status: "saved" | "invalid" | "locked" | "too_many" | "lead_required" | "not_found" | "failed" };

/** Maps the function's errors (`save_customer_travellers()`) to the form's answers. */
export function mapTravellersError(error: { code?: string; message?: string } | null): TravellersResult["status"] {
  if (!error) return "saved";
  const message = error.message ?? "";
  if (message.includes("travellers_locked")) return "locked";
  if (message.includes("too_many_travellers")) return "too_many";
  if (message.includes("lead_required")) return "lead_required";
  if (message.includes("invalid_traveller")) return "invalid";
  if (error.code === "P0002" || message.includes("not_found")) return "not_found";
  return "failed";
}

export async function saveMyTravellers(input: TravellersInput): Promise<TravellersResult> {
  if (input.travellers.length > 0 && input.lead >= input.travellers.length) return { status: "lead_required" };
  const payload = input.travellers.map((t, index) => ({
    full_name: t.fullName,
    date_of_birth: t.dateOfBirth,
    nationality: t.nationality,
    dietary_notes: t.dietaryNotes,
    is_lead: index === input.lead,
  }));
  const { error } = await repo.saveTravellers(input.code, payload);
  const status = mapTravellersError(error);
  if (status === "failed") logger.error("account.travellers_failed", { code: error?.code ?? null });
  return { status };
}

export type Profile = { fullName: string; phone: string | null; country: string | null; locale: Locale; marketing: boolean; email: string };

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await repo.getProfile(userId);
  if (error) throw new Error(`profile read failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  return { fullName: data.full_name ?? "", phone: data.phone, country: data.country, locale: data.locale, marketing: data.marketing_consent, email: data.email };
}

export async function saveMyProfile(userId: string, input: ProfileInput): Promise<"saved" | "failed"> {
  const { data, error } = await repo.updateProfile(userId, { full_name: input.fullName, phone: input.phone, country: input.country, locale: input.locale });
  if (error || !data) {
    logger.error("account.profile_failed", { code: error?.code ?? null });
    return "failed";
  }
  return "saved";
}

/** A marketing change needs the published privacy policy of the page's language (its version). */
export async function saveMyMarketing(userId: string, granted: boolean, locale: Locale): Promise<"saved" | "unavailable" | "failed"> {
  const privacy = await getPrivacyConsent(locale);
  if (!privacy) return "unavailable";
  const { error } = await repo.setMarketingConsent(userId, granted, privacy.version);
  if (error) {
    logger.error("account.marketing_failed", { code: error.code ?? null });
    return "failed";
  }
  return "saved";
}
