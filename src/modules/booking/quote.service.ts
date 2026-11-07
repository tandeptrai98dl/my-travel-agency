import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getPathname } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";

import * as repo from "./quote.repository";
import { type CreatePaymentLinkValues, type CreateQuoteValues, type PaymentLinkResult, type QuoteActionResult, quoteErrorCode } from "./quote.schemas";

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A quoted booking from sales (spec Phase 4 step 13); payment follows the standard flow. */
export async function createQuote(values: CreateQuoteValues): Promise<QuoteActionResult> {
  await requirePermission("bookings.edit");
  let inquiryId: string | null = null;
  if (values.inquiryCode) {
    const { data } = await repo.findInquiryByCode(values.inquiryCode.toUpperCase());
    if (!data) return { ok: false, error: "invalid", fields: { inquiryCode: "inquiryNotFound" } };
    inquiryId = data.id;
  }
  const { data, error } = await repo.createQuote({
    tour_id: values.tourId,
    start_date: values.startDate,
    locale: values.locale,
    adults: values.adults,
    children: values.children,
    infants: values.infants,
    price_adult: values.priceAdult,
    price_child: values.priceChild ?? 0,
    payment_plan: values.plan,
    valid_days: values.validDays,
    contact_name: values.contactName,
    contact_email: values.contactEmail,
    contact_phone: values.contactPhone,
    special_requests: values.specialRequests,
    inquiry_id: inquiryId,
  });
  if (error || !data) {
    const code = quoteErrorCode(error);
    if (code === "failed") logger.error("booking.quote_failed", { code: error?.code });
    if (code === "plan_unavailable") return { ok: false, error: "invalid", fields: { plan: "plan_unavailable" } };
    if (code === "inquiryTaken") return { ok: false, error: "invalid", fields: { inquiryCode: "inquiryTaken" } };
    return { ok: false, error: code };
  }
  return { ok: true, id: data };
}

/**
 * A payment link (step 14): 32 random bytes the customer gets once, of which only the SHA-256 is
 * stored. The URL is shown to the staff member once (and emailed in 4E).
 */
export async function createPaymentLink(values: CreatePaymentLinkValues): Promise<PaymentLinkResult> {
  await requirePermission("bookings.send_payment_link");
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await repo.createPaymentLink(values.bookingId, hashLinkToken(token), values.validHours);
  if (error || !data) {
    const code = quoteErrorCode(error);
    if (code === "failed") logger.error("booking.payment_link_failed", { code: error?.code });
    return { ok: false, error: code };
  }
  const row = data as { amount: number; expires_at: string; locale: "vi" | "en" };
  const path = getPathname({ locale: row.locale, href: { pathname: "/pay/[token]", params: { token } } });
  return { ok: true, url: new URL(path, siteUrl).toString(), amount: row.amount, expiresAt: row.expires_at };
}

/** Tours for the quote form, with their title in Vietnamese (admin language). */
export async function quoteTourOptions() {
  await requirePermission("bookings.edit");
  const { data } = await repo.listQuoteTours();
  return (data ?? []).map((row) => {
    const translations = (row.tour_translations ?? []) as { locale: string; title: string }[];
    const title = translations.find((item) => item.locale === "vi")?.title ?? translations[0]?.title ?? "";
    return { id: row.id, code: row.code, type: row.type, title };
  });
}
