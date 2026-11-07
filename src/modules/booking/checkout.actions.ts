"use server";

import { headers } from "next/headers";
import type { z } from "zod";

import { getPathname } from "@/i18n/navigation";

import { checkoutDraftSchema, quoteInputSchema, startCheckoutPaymentSchema } from "./booking.schemas";
import {
  checkoutStatus,
  createCheckoutBooking,
  loadCheckout,
  openEmailLink,
  quoteForForm,
  redeemPaymentLink,
  type StatusView,
  startCheckoutPayment,
} from "./checkout.service";

/** The client's IP as Vercel forwards it (first `x-forwarded-for` entry). */
async function requestMeta() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || null;
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: list.get("user-agent")?.slice(0, 500) ?? null };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

/** A price for the current choices (every step; never trusted from the browser). */
export async function quoteAction(input: unknown) {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return quoteForForm(parsed.data);
}

/** Guest write (ARCHITECTURE.md "Data flow"): Zod, then Turnstile and the rate limit in the service. */
export async function createBookingAction(input: unknown) {
  const parsed = checkoutDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const, fields: fieldErrors(parsed.error) };
  return createCheckoutBooking(parsed.data, await requestMeta());
}

export async function startPaymentAction(input: unknown) {
  const parsed = startCheckoutPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const view = await loadCheckout(parsed.data.code);
  if (!view) return { ok: false as const, error: "not_found" as const };
  return startCheckoutPayment(view, parsed.data.provider, await requestMeta());
}

/** The result page's poll: status only, for a booking this browser may open. */
export async function checkoutStatusAction(code: unknown): Promise<StatusView | null> {
  if (typeof code !== "string" || !/^PTA-\d{4}-\d{4,}$/.test(code)) return null;
  return checkoutStatus(code);
}

/** "Continue to payment" on a payment link: a button, so mail scanners never use the link up. */
export async function redeemLinkAction(token: unknown) {
  if (typeof token !== "string") return { ok: false as const, error: "invalid" as const };
  const result = await redeemPaymentLink(token);
  if (!result.ok) return result;
  return {
    ok: true as const,
    path: getPathname({ locale: result.locale, href: { pathname: "/checkout/[code]/payment", params: { code: result.code } } }),
  };
}

/** "Open my booking" on a checkout link from an email (4E): a button, so scanners never act. */
export async function openEmailLinkAction(code: unknown, token: unknown) {
  if (typeof code !== "string" || typeof token !== "string" || token.length > 80) return { ok: false as const };
  const result = await openEmailLink(code, token);
  if (!result.ok) return result;
  return { ok: true as const, path: getPathname({ locale: result.locale, href: { pathname: "/checkout/[code]", params: { code: result.code } } }) };
}
