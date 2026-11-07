import "server-only";

import { createHash } from "node:crypto";

import { cookies } from "next/headers";

import { todayInVietnam } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/get-user";
import { serverEnv } from "@/lib/env/server";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isTurnstileConfigured, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";
import { getTourDepartures, getTourPage } from "@/modules/catalog/public/tour-public.service";
import { getPrivacyConsent } from "@/modules/content/public/content-public.service";
import type { Locale } from "@/modules/catalog/public/types";
import { availableMethods, instructionsFor } from "@/modules/payment/payment.service";
import type { PaymentInstructions } from "@/modules/payment/provider";

import { accessCookieName, signAccess, verifyAccess } from "./booking-access";
import type { CheckoutDraftValues } from "./booking.schemas";
import * as bookingRepo from "./booking.repository";
import { type BookingError, buildDraft, mapBookingError, quote as quoteBooking, repriceStaleDraft, startPayment } from "./booking.service";
import * as repo from "./checkout.repository";
import { hashLinkToken } from "./quote.service";
import { availablePlans, type PaymentPlan, type Quote } from "./pricing";

/**
 * The book-now flow and the guest checkout (docs/specs/phase-4-booking-payments.md PR 4B,
 * decisions 7–9). Prices always come from booking.service.ts; this module adds access, consent,
 * Turnstile, rate limits and the view models of the pages.
 */

const DRAFT_LIMIT = { limit: 10, window: 600 };
const PAY_IP_LIMIT = { limit: 10, window: 600 };
const PAY_BOOKING_LIMIT = { limit: 5, window: 600 };

/** Online booking needs the cookie key; without it the booking page offers the hotline. */
export function bookingEnabled(): boolean {
  return Boolean(serverEnv.BOOKING_ACCESS_SECRET);
}

export type BookingFormDeparture = {
  id: string;
  startDate: string;
  endDate: string;
  seatsLeft: number;
  priceAdult: number;
  priceChild: number | null;
  priceInfant: number | null;
  singleSupplement: number | null;
  plans: PaymentPlan[];
};

export type BookingForm = {
  tour: {
    id: string;
    code: string;
    slug: string;
    title: string;
    durationDays: number;
    durationNights: number;
    minPax: number;
    maxPax: number | null;
    depositPercent: number;
    childAgeMax: number;
    infantAgeMax: number;
    policy: { summary: string | null; rules: { minDaysBefore: number; refundPercent: number }[] } | null;
  };
  departures: BookingFormDeparture[];
  turnstileSiteKey: string | null;
};

/** The published group tour and its bookable departures (live), or null (404). */
export async function getBookingForm(locale: Locale, slug: string): Promise<BookingForm | null> {
  const page = await getTourPage(locale, slug);
  if (page.kind !== "found" || page.tour.type !== "group") return null;
  const tour = page.tour;
  const today = todayInVietnam();
  const departures = (await getTourDepartures(tour.id))
    .filter((departure) => departure.bookable)
    .map((departure) => ({
      id: departure.id,
      startDate: departure.startDate,
      endDate: departure.endDate,
      seatsLeft: departure.seatsLeft,
      priceAdult: departure.priceAdult,
      priceChild: departure.priceChild,
      priceInfant: departure.priceInfant,
      singleSupplement: departure.singleSupplement,
      plans: availablePlans({ startDate: departure.startDate }, { balanceDueDays: tour.balanceDueDays, depositPercent: tour.depositPercent }, today),
    }));
  return {
    tour: {
      id: tour.id,
      code: tour.code,
      slug: tour.slug,
      title: tour.title,
      durationDays: tour.durationDays,
      durationNights: tour.durationNights,
      minPax: tour.minPax,
      maxPax: tour.maxPax,
      depositPercent: tour.depositPercent,
      childAgeMax: tour.childAgeMax,
      infantAgeMax: tour.infantAgeMax,
      policy: tour.policy,
    },
    departures,
    turnstileSiteKey: turnstileSiteKey(),
  };
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: BookingError };

export async function quoteForForm(input: Parameters<typeof quoteBooking>[0]): Promise<QuoteResult> {
  return quoteBooking(input);
}

export type RequestContext = { ip: string | null; userAgent: string | null };

export type CreateResult =
  | { ok: true; code: string }
  | { ok: false; error: BookingError | "turnstile" | "rate_limited" | "unavailable" };

/** Production is VERCEL_ENV=production only (decision 8); previews and CI run without Turnstile keys. */
function turnstileRequired(): boolean {
  return serverEnv.VERCEL_ENV === "production" || isTurnstileConfigured();
}

/**
 * Versions of the documents the customer accepts (decision 9), only for published pages: the
 * privacy policy as the newsletter records it (`getPrivacyConsent`, required), and the terms page
 * by the same scheme when one is published (null otherwise).
 */
async function legalVersions(locale: Locale): Promise<{ terms: string | null; privacy: string } | null> {
  const [privacy, terms] = await Promise.all([getPrivacyConsent(locale), repo.findPublishedTerms(locale)]);
  if (!privacy) return null;
  const termsVersion = terms.data
    ? `terms-${locale}-${createHash("sha256").update(JSON.stringify([terms.data.title, terms.data.content ?? null])).digest("hex").slice(0, 16)}`
    : null;
  return { terms: termsVersion, privacy: privacy.version };
}

/**
 * Creates the draft (no seats), records the terms and privacy acceptance and sets the
 * `booking_access_<code>` cookie. The same idempotency key returns the same booking.
 */
export async function createCheckoutBooking(values: CheckoutDraftValues, context: RequestContext): Promise<CreateResult> {
  const secret = serverEnv.BOOKING_ACCESS_SECRET;
  if (!secret) return { ok: false, error: "unavailable" };
  if (turnstileRequired() && !(await verifyTurnstile(values.turnstileToken, { action: "booking", ip: context.ip }))) {
    return { ok: false, error: "turnstile" };
  }
  const limited = await rateLimit([rateLimitKey("booking-draft-ip", context.ip ?? "unknown")], DRAFT_LIMIT.limit, DRAFT_LIMIT.window, {
    failOpen: true,
    scope: "booking-draft",
  });
  if (limited === "limited") return { ok: false, error: "rate_limited" };

  const versions = await legalVersions(values.locale);
  if (!versions) return { ok: false, error: "unavailable" };
  const user = await getCurrentUser();
  const customerId = user && user.role === "customer" ? user.id : null;
  const built = await buildDraft(values, customerId);
  if (!built.ok) return built;
  // The draft and the consent are one transaction; a replay records nothing twice.
  const { data: id, error } = await bookingRepo.createCheckoutDraft({
    payload: built.payload,
    termsVersion: versions.terms,
    privacyVersion: versions.privacy,
    marketing: values.marketing,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  if (error || !id) return { ok: false, error: mapBookingError(error) };
  const draft = { id };
  const { data: row } = await repo.findBookingCode(draft.id);
  if (!row) return { ok: false, error: "failed" };

  const access = signAccess(secret, draft.id);
  (await cookies()).set(accessCookieName(row.code), access.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: access.expires,
  });
  return { ok: true, code: row.code };
}

type CheckoutRow = NonNullable<Awaited<ReturnType<typeof repo.findCheckoutByCode>>["data"]>;

export type CheckoutView = {
  id: string;
  code: string;
  status: CheckoutRow["status"];
  paymentState: CheckoutRow["payment_state"];
  locale: Locale;
  tourTitle: string;
  tourCode: string;
  startDate: string;
  party: { adults: number; children: number; infants: number; singleRooms: number };
  contactName: string;
  contactEmail: string;
  lines: { type: string; unitPrice: number; quantity: number; amount: number }[];
  total: number;
  depositAmount: number;
  amountPaid: number;
  plan: PaymentPlan;
  balanceDueDate: string | null;
  holdExpiresAt: string | null;
  policySummary: string | null;
  /** What Pay would ask for now, or null when nothing can be paid. */
  dueNow: { kind: "deposit" | "full" | "balance"; amount: number } | null;
};

function snapshotText(snapshot: unknown, key: string): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const value = (snapshot as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function policyText(snapshot: unknown, locale: Locale): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const summary = (snapshot as Record<string, unknown>).summary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const text = (summary as Record<string, unknown>)[locale];
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }
  return null;
}

function dueNow(row: CheckoutRow): CheckoutView["dueNow"] {
  if (row.status === "draft" || row.status === "quoted" || row.status === "pending_payment") {
    const amount = row.payment_plan === "deposit" ? row.deposit_amount : row.total;
    return { kind: row.payment_plan, amount: Math.max(amount - row.amount_paid, 0) };
  }
  if (row.status === "confirmed" && row.amount_paid < row.total) return { kind: "balance", amount: row.total - row.amount_paid };
  return null;
}

/**
 * A checkout this browser may open (decision 7): the access cookie for that booking, or the
 * signed-in customer who owns it. Anything else is "not found", so a code alone reveals nothing.
 */
export async function loadCheckout(code: string): Promise<CheckoutView | null> {
  const secret = serverEnv.BOOKING_ACCESS_SECRET;
  if (!secret || !/^PTA-\d{4}-\d{4,}$/.test(code)) return null;
  const { data: row, error } = await repo.findCheckoutByCode(code);
  if (error) throw new Error(`checkout query failed: ${error.message}`);
  if (!row) return null;
  const token = (await cookies()).get(accessCookieName(row.code))?.value;
  let allowed = verifyAccess(secret, row.id, token);
  if (!allowed && row.customer_id) {
    const user = await getCurrentUser();
    allowed = user?.id === row.customer_id;
  }
  if (!allowed) return null;
  const locale = row.locale;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    paymentState: row.payment_state,
    locale,
    tourTitle: snapshotText(row.tour_snapshot, "title"),
    tourCode: snapshotText(row.tour_snapshot, "code"),
    startDate: row.start_date,
    party: { adults: row.adults, children: row.children, infants: row.infants, singleRooms: row.single_rooms },
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    lines: (row.items ?? []).map((item) => ({ type: item.type, unitPrice: item.unit_price, quantity: item.quantity, amount: item.amount })),
    total: row.total,
    depositAmount: row.deposit_amount,
    amountPaid: row.amount_paid,
    plan: row.payment_plan,
    balanceDueDate: row.balance_due_date,
    holdExpiresAt: row.hold_expires_at,
    policySummary: policyText(row.cancellation_policy_snapshot, locale),
    dueNow: dueNow(row),
  };
}

export async function checkoutMethods() {
  return availableMethods();
}

export type OpenInstructions = { provider: "vnpay" | "bank_transfer"; reference: string; amount: number; expiresAt: string; instructions: PaymentInstructions | null };

/** The transfer to make for the open bank-transfer attempt, shown again after a reload. */
export async function openTransfer(view: CheckoutView): Promise<OpenInstructions | null> {
  if (view.status !== "pending_payment" && view.status !== "confirmed") return null;
  const { data } = await repo.findOpenPayment(view.id);
  if (!data || data.provider !== "bank_transfer" || !data.expires_at) return null;
  const instructions = await instructionsFor("bank_transfer", {
    reference: data.reference,
    amount: data.amount,
    expiresAt: new Date(data.expires_at),
    bookingCode: view.code,
    locale: view.locale,
    ipAddress: "",
  });
  return { provider: "bank_transfer", reference: data.reference, amount: data.amount, expiresAt: data.expires_at, instructions };
}

export type StartResult =
  | { ok: true; instructions: PaymentInstructions; expiresAt: string }
  | { ok: false; error: BookingError | "rate_limited" | "method_unavailable" | "nothing_due"; total?: number };

/** Pay: holds the seats on the first attempt (decision 4) and returns what to do next. */
export async function startCheckoutPayment(view: CheckoutView, provider: "vnpay" | "bank_transfer", context: RequestContext): Promise<StartResult> {
  if (!view.dueNow || view.dueNow.amount <= 0) return { ok: false, error: "nothing_due" };
  if (!(await availableMethods()).includes(provider)) return { ok: false, error: "method_unavailable" };
  const limited = await rateLimit(
    [rateLimitKey("booking-pay-ip", context.ip ?? "unknown")],
    PAY_IP_LIMIT.limit,
    PAY_IP_LIMIT.window,
    { failOpen: true, scope: "booking-pay" },
  );
  const perBooking = await rateLimit([rateLimitKey("booking-pay-booking", view.id)], PAY_BOOKING_LIMIT.limit, PAY_BOOKING_LIMIT.window, {
    failOpen: true,
    scope: "booking-pay",
  });
  if (limited === "limited" || perBooking === "limited") return { ok: false, error: "rate_limited" };

  const started = await startPayment({ bookingId: view.id, provider, kind: view.dueNow.kind });
  if (!started.ok) {
    // Decision 2: the departure's price changed since the draft. Reprice it from the booking row,
    // tell the customer the new total, and the next Pay goes through.
    if (started.error === "price_changed" && view.status === "draft") {
      const repriced = await repriceStaleDraft(view.id);
      if (repriced.ok) return { ok: false, error: "price_changed", total: repriced.quote.total };
      return { ok: false, error: repriced.error };
    }
    return started;
  }
  const instructions = await instructionsFor(provider, {
    reference: started.payment.reference,
    amount: started.payment.amount,
    expiresAt: new Date(started.payment.expiresAt),
    bookingCode: view.code,
    locale: view.locale,
    ipAddress: context.ip ?? "127.0.0.1",
  });
  if (!instructions) return { ok: false, error: "method_unavailable" };
  return { ok: true, instructions, expiresAt: started.payment.expiresAt };
}

export type StatusView = { status: string; paymentState: string; amountPaid: number; total: number; holdExpiresAt: string | null };

export async function checkoutStatus(code: string): Promise<StatusView | null> {
  const view = await loadCheckout(code);
  if (!view) return null;
  const { data } = await repo.checkoutStatus(view.code);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    status: String(row.status ?? view.status),
    paymentState: String(row.payment_state ?? view.paymentState),
    amountPaid: Number(row.amount_paid ?? view.amountPaid),
    total: Number(row.total ?? view.total),
    holdExpiresAt: typeof row.hold_expires_at === "string" ? row.hold_expires_at : null,
  };
}

export type LinkState = "valid" | "used" | "expired" | "invalid";

/** What the payment-link page shows before the customer continues (no side effects). */
export async function paymentLinkState(token: string): Promise<LinkState> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return "invalid";
  const { data } = await repo.paymentLinkState(hashLinkToken(token));
  return data === "valid" || data === "used" || data === "expired" ? data : "invalid";
}

export type RedeemResult = { ok: true; code: string; locale: Locale } | { ok: false; error: LinkState | "not_payable" | "unavailable" };

/**
 * The customer continues from a payment link (spec Phase 4 step 14): the link is used up, this
 * browser gets the booking's access cookie, and the standard payment step takes over.
 */
export async function redeemPaymentLink(token: string): Promise<RedeemResult> {
  const secret = serverEnv.BOOKING_ACCESS_SECRET;
  if (!secret) return { ok: false, error: "unavailable" };
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "invalid" };
  const { data, error } = await repo.redeemPaymentLink(hashLinkToken(token));
  if (error || !data) {
    const reason = error?.message === "link_used" ? "used" : error?.message === "link_expired" ? "expired" : error?.message === "not_payable" ? "not_payable" : "invalid";
    return { ok: false, error: reason };
  }
  const row = data as { booking_id: string; code: string; locale: Locale };
  const access = signAccess(secret, row.booking_id);
  (await cookies()).set(accessCookieName(row.code), access.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: access.expires,
  });
  return { ok: true, code: row.code, locale: row.locale };
}

const CODE_PATTERN = /^PTA-\d{4}-\d{4,}$/;

/**
 * Whether `?access=<token>` from an email (4E, `checkoutUrl()`) opens this booking. No side
 * effects: the checkout page shows only an "open" button until the customer clicks it, so a mail
 * scanner that follows the link sees no booking details and sets no cookie.
 */
export async function emailLinkValid(code: string, token: string | undefined): Promise<boolean> {
  const secret = serverEnv.BOOKING_ACCESS_SECRET;
  if (!secret || !token || !CODE_PATTERN.test(code)) return false;
  const { data } = await repo.findBookingIdByCode(code);
  return Boolean(data && verifyAccess(secret, data.id, token));
}

export type OpenLinkResult = { ok: true; code: string; locale: Locale } | { ok: false };

/** The customer's click on an emailed checkout link: this browser gets the booking's access cookie. */
export async function openEmailLink(code: string, token: string): Promise<OpenLinkResult> {
  const secret = serverEnv.BOOKING_ACCESS_SECRET;
  if (!secret || !CODE_PATTERN.test(code)) return { ok: false };
  const { data } = await repo.findBookingIdByCode(code);
  if (!data || !verifyAccess(secret, data.id, token)) return { ok: false };
  // The cookie keeps the link's own expiry: opening a link never extends access.
  (await cookies()).set(accessCookieName(data.code), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Number(token.split(".")[0])),
  });
  return { ok: true, code: data.code, locale: data.locale };
}

/**
 * A used payment link opened again in the browser that used it (#34 review): that browser still
 * holds the booking's access cookie, so the page offers the checkout instead of a dead end.
 */
export async function usedLinkCheckout(token: string): Promise<{ code: string } | null> {
  const secret = serverEnv.BOOKING_ACCESS_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data } = await repo.findLinkBooking(hashLinkToken(token));
  const booking = data?.bookings as { code: string } | null | undefined;
  if (!data || !booking) return null;
  const cookie = (await cookies()).get(accessCookieName(booking.code))?.value;
  return verifyAccess(secret, data.booking_id, cookie) ? { code: booking.code } : null;
}
