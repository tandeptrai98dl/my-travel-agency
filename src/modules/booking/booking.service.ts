import "server-only";

import { revalidateTag } from "next/cache";

import { todayInVietnam, addDays } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { TOURS_TAG, tourTag } from "@/modules/catalog/cache-tags";
import type { Json } from "@/types/database.types";

import { notifyBooking } from "./booking-emails.service";
import * as repo from "./booking.repository";
import type { DraftValues, StartPaymentValues } from "./booking.schemas";
import { type PartyError, priceBooking, type Quote } from "./pricing";

/**
 * The booking core (docs/specs/phase-4-booking-payments.md decisions 1–4, 11). Prices come from
 * pricing.ts on every call; seats and money change only in the Postgres functions. The Server
 * Actions of PR 4B call these after Zod, Turnstile and rate limits.
 */

export type BookingError =
  | PartyError
  | "planUnavailable"
  | "not_found"
  | "departure_closed"
  | "sold_out"
  | "price_changed"
  | "too_many_attempts"
  | "not_payable"
  | "plan_unavailable"
  | "not_cancellable"
  | "retry"
  | "failed";

type DbError = { code?: string; message?: string } | null;

const KNOWN: BookingError[] = [
  "departure_closed",
  "sold_out",
  "price_changed",
  "too_many_attempts",
  "not_payable",
  "plan_unavailable",
  "not_cancellable",
];

/** Function errors raise their name as the message (P0001), or P0002 for a missing row. */
export function mapBookingError(error: DbError): BookingError {
  if (error?.code === "P0002" || error?.message === "not_found") return "not_found";
  // A deadlock or serialisation failure rolled the call back: nothing changed, trying again is safe.
  if (error?.code === "40P01" || error?.code === "40001") return "retry";
  const known = KNOWN.find((name) => error?.message === name);
  if (known) return known;
  logger.error("booking.write_failed", { code: error?.code, message: error?.message });
  return "failed";
}

/** Departures in the cached catalog change bookability: refresh the tour's pages (decision 11). */
export function refreshTour(tourId: string) {
  revalidateTag(TOURS_TAG, "max");
  revalidateTag(tourTag(tourId), "max");
}

type Loaded = { quote: Quote; tourId: string; startDate: string };

async function quoteFor(departureId: string, party: DraftValues["party"], plan: DraftValues["plan"]) {
  const [{ data: row, error }, cutoff] = await Promise.all([
    repo.findDepartureForBooking(departureId),
    repo.bookingCutoffDays(),
  ]);
  if (error) return { ok: false as const, error: mapBookingError(error) };
  const tour = row?.tours;
  if (!row || !tour) return { ok: false as const, error: "not_found" as const };
  const today = todayInVietnam();
  const earliest = addDays(today, typeof cutoff.data === "number" ? cutoff.data : 7);
  if (tour.status !== "published" || tour.type !== "group" || !["open", "guaranteed"].includes(row.status) || row.start_date < earliest) {
    return { ok: false as const, error: "departure_closed" as const };
  }
  const priced = priceBooking(
    {
      startDate: row.start_date,
      capacity: row.capacity,
      seatsReserved: row.seats_reserved,
      priceAdult: row.price_adult,
      priceChild: row.price_child,
      priceInfant: row.price_infant,
      singleSupplement: row.single_supplement,
    },
    { minPax: tour.min_pax, maxPax: tour.max_pax, depositPercent: tour.deposit_percent, balanceDueDays: tour.balance_due_days },
    party,
    plan,
    today,
  );
  if (!priced.ok) return { ok: false as const, error: priced.error };
  return { ok: true as const, value: { quote: priced.quote, tourId: tour.id, startDate: row.start_date } satisfies Loaded };
}

/** A price for the current choices, for each step of the flow (never trusted from the browser). */
export async function quote(input: Pick<DraftValues, "departureId" | "party" | "plan">) {
  const result = await quoteFor(input.departureId, input.party, input.plan);
  return result.ok ? { ok: true as const, quote: result.value.quote } : result;
}

function payload(input: DraftValues, loaded: Loaded, customerId: string | null): Json {
  const { quote: q } = loaded;
  return {
    idempotency_key: input.idempotencyKey,
    tour_id: loaded.tourId,
    departure_id: input.departureId,
    customer_id: customerId,
    locale: input.locale,
    adults: input.party.adults,
    children: input.party.children,
    infants: input.party.infants,
    single_rooms: input.party.singleRooms,
    contact_name: input.contact.name,
    contact_email: input.contact.email,
    contact_phone: input.contact.phone,
    contact_country: input.contact.country,
    special_requests: input.contact.specialRequests,
    payment_plan: q.plan,
    subtotal: q.subtotal,
    total: q.total,
    deposit_amount: q.deposit,
    balance_due_date: q.balanceDueDate,
    invoice_requested: input.invoice !== null,
    invoice_info: input.invoice
      ? { company_name: input.invoice.companyName, tax_code: input.invoice.taxCode, address: input.invoice.address, email: input.invoice.email }
      : null,
    items: q.lines.map((line) => ({ type: line.type, label: line.type, unit_price: line.unitPrice, quantity: line.quantity, amount: line.amount })),
  };
}

export type DraftResult = { ok: true; id: string; quote: Quote } | { ok: false; error: BookingError };

/** The draft payload for create_draft_booking(), priced on the server (decision 1). */
export async function buildDraft(input: DraftValues, customerId: string | null) {
  const loaded = await quoteFor(input.departureId, input.party, input.plan);
  if (!loaded.ok) return loaded;
  return { ok: true as const, payload: payload(input, loaded.value, customerId), quote: loaded.value.quote };
}

/** Creates the draft (no seats). The same idempotency key returns the same booking. */
export async function startDraft(input: DraftValues, customerId: string | null): Promise<DraftResult> {
  const built = await buildDraft(input, customerId);
  if (!built.ok) return built;
  const { data, error } = await repo.createDraft(built.payload);
  if (error || !data) return { ok: false, error: mapBookingError(error) };
  return { ok: true, id: data, quote: built.quote };
}

/** Reprices a draft, e.g. after `price_changed` or a new party (decision 2). Keeps the customer. */
export async function repriceDraft(bookingId: string, input: DraftValues, customerId: string | null): Promise<DraftResult> {
  const built = await buildDraft(input, customerId);
  if (!built.ok) return built;
  const { error } = await repo.updateDraft(bookingId, built.payload);
  if (error) return { ok: false, error: mapBookingError(error) };
  return { ok: true, id: bookingId, quote: built.quote };
}

/**
 * A draft whose departure price changed since it was made (reserve_and_create_payment raised
 * `price_changed`): repriced from the booking row itself (departure, party, plan, contact,
 * customer), so the customer sees the new total and the next Pay goes through (decision 2).
 */
export async function repriceStaleDraft(bookingId: string): Promise<DraftResult> {
  const { data: row, error } = await repo.findDraftForReprice(bookingId);
  if (error || !row) return { ok: false, error: error ? mapBookingError(error) : "not_found" };
  if (row.status !== "draft" || !row.departure_id) return { ok: false, error: "not_payable" };
  const invoice = row.invoice_info as { company_name?: string; tax_code?: string; address?: string; email?: string } | null;
  const input: DraftValues = {
    idempotencyKey: row.idempotency_key ?? crypto.randomUUID(),
    departureId: row.departure_id,
    locale: row.locale,
    party: { adults: row.adults, children: row.children, infants: row.infants, singleRooms: row.single_rooms },
    plan: row.payment_plan,
    contact: {
      name: row.contact_name,
      email: row.contact_email,
      phone: row.contact_phone,
      country: row.contact_country,
      specialRequests: row.special_requests,
    },
    invoice:
      row.invoice_requested && invoice
        ? { companyName: invoice.company_name ?? "", taxCode: invoice.tax_code ?? "", address: invoice.address ?? "", email: invoice.email ?? "" }
        : null,
  };
  let result = await repriceDraft(bookingId, input, row.customer_id);
  // The deposit plan may have closed meanwhile (the balance would already be due): pay in full.
  if (!result.ok && result.error === "planUnavailable" && input.plan === "deposit") {
    result = await repriceDraft(bookingId, { ...input, plan: "full" }, row.customer_id);
  }
  return result;
}

export type PaymentStart = { paymentId: string; reference: string; amount: number; expiresAt: string; bookingStatus: string };
export type StartPaymentResult = { ok: true; payment: PaymentStart } | { ok: false; error: BookingError };

const paymentStart = (value: unknown): PaymentStart | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.payment_id !== "string" || typeof row.reference !== "string" || typeof row.amount !== "number") return null;
  return {
    paymentId: row.payment_id,
    reference: row.reference,
    amount: row.amount,
    expiresAt: String(row.expires_at),
    bookingStatus: String(row.booking_status),
  };
};

/** Holds seats on the first attempt and opens a payment (decision 4). */
export async function startPayment(input: StartPaymentValues): Promise<StartPaymentResult> {
  const { data: before } = await repo.findBooking(input.bookingId);
  if (!before) return { ok: false, error: "not_found" };
  const { data, error } = await repo.reserve(input.bookingId, input.provider, input.kind);
  if (error) return { ok: false, error: mapBookingError(error) };
  const payment = paymentStart(data);
  if (!payment) return { ok: false, error: "failed" };
  if (before.status !== "pending_payment" && before.departure_id && payment.bookingStatus === "pending_payment") {
    refreshTour(before.tour_id);
  }
  // After the commit: "booking received" on the first hold (once per booking event, 4E).
  notifyBooking(input.bookingId);
  return { ok: true, payment };
}

export type CancelResult = { ok: true; refundPercent: number; refundAmount: number } | { ok: false; error: BookingError };

/** Cancels a booking and releases its seats; returns the refund the policy suggests (decision 4). */
export async function cancelBooking(bookingId: string, actorId: string | null, reason: string): Promise<CancelResult> {
  const { data: before } = await repo.findBooking(bookingId);
  if (!before) return { ok: false, error: "not_found" };
  const { data, error } = await repo.cancel(bookingId, actorId, reason);
  if (error) return { ok: false, error: mapBookingError(error) };
  if (before.departure_id && ["pending_payment", "confirmed"].includes(before.status)) refreshTour(before.tour_id);
  notifyBooking(bookingId);
  const row = (data ?? {}) as Record<string, unknown>;
  return { ok: true, refundPercent: Number(row.refund_percent ?? 0), refundAmount: Number(row.refund_amount ?? 0) };
}
