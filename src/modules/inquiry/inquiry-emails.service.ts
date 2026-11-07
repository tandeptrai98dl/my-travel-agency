import "server-only";

import { after } from "next/server";
import { z } from "zod";

import { loadMessages } from "@/i18n/messages";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";
import type { BuildContext } from "@/modules/booking/booking-emails";
import { type SendResult, sendEmail } from "@/modules/notification/email.service";
import { renderEmail } from "@/modules/notification/render";
import { getPublicSettings } from "@/modules/settings/settings.service";

import { buildInquiryEmails, type EmailInquiry } from "./inquiry-emails";
import * as repo from "./inquiry-emails.repository";

/**
 * Inquiry emails (spec Phase 5 decision 9, ADR-036): the customer's acknowledgement with the
 * inquiry code and the team alert to `settings.contact.email`. Every inquiry source calls
 * `sendInquiryEmails()` once its write has committed (the contact form, the tailor-made wizard,
 * the private-tour form); the emails go out after the response, each at most once.
 */

/** Only inquiries this recent are mailed, so a late or repeated call never sends old news. */
const RECENT_MS = 48 * 3_600_000;
const CODE = /^INQ-\d{4}-\d{4,}$/;

export type InquiryEmailOutcome = Record<"inquiry_received" | "inquiry_alert", SendResult | "no_address" | null>;

async function buildContext(): Promise<BuildContext & { staffEmail: string | null }> {
  const [settings, vi, en] = await Promise.all([getPublicSettings(), loadMessages("vi"), loadMessages("en")]);
  const metadata = vi.Metadata;
  const siteName = metadata && typeof metadata === "object" && typeof metadata.siteName === "string" ? metadata.siteName : "";
  return {
    brand: { name: settings.company?.name ?? siteName, email: settings.contact?.email ?? null, phone: settings.contact?.phone ?? null },
    siteUrl,
    messages: { vi, en },
    staffEmail: settings.contact?.email ?? null,
  };
}

function reference(inquiry: string): { id: string } | { code: string } | null {
  if (z.guid().safeParse(inquiry).success) return { id: inquiry };
  const code = inquiry.trim().toUpperCase();
  return CODE.test(code) ? { code } : null;
}

/**
 * Sends both emails now (awaitable; `sendInquiryEmails()` is the fire-and-forget form). Returns
 * what happened to each, or null when the inquiry was not found, too old, or could not be read.
 * Never throws: a failed email is logged and recorded in `email_logs`, never undoes the inquiry.
 */
export async function deliverInquiryEmails(inquiry: string, now = Date.now()): Promise<InquiryEmailOutcome | null> {
  try {
    const ref = reference(inquiry);
    if (!ref) {
      logger.warn("inquiry.email_bad_reference", {});
      return null;
    }
    const { data, error } = await repo.findInquiryForEmail(ref);
    if (error || !data) {
      logger.error("inquiry.email_load_failed", { code: error?.code ?? "not_found" });
      return null;
    }
    if (now - new Date(data.created_at).getTime() > RECENT_MS) {
      logger.warn("inquiry.email_too_old", { inquiry: data.code });
      return null;
    }
    const ids = (data.destination_ids ?? []).filter((id) => typeof id === "string");
    let destinations: EmailInquiry["destinations"] = [];
    if (ids.length > 0) {
      const { data: names, error: namesError } = await repo.destinationNames(ids);
      if (namesError) logger.warn("inquiry.email_destinations_failed", { code: namesError.code ?? null });
      destinations = ids.map((id) => (names ?? []).filter((row) => row.destination_id === id));
    }
    const one = <T>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
    const row: EmailInquiry = { ...data, tour: one(data.tour), style: one(data.style), destinations } as EmailInquiry;
    const context = await buildContext();

    const outcome: InquiryEmailOutcome = { inquiry_received: null, inquiry_alert: null };
    for (const planned of buildInquiryEmails(row, context)) {
      const to = planned.built.to === "customer" ? row.email : context.staffEmail;
      if (!to) {
        logger.warn("inquiry.email_no_staff_address", { inquiry: row.code });
        outcome[planned.template] = "no_address";
        continue;
      }
      try {
        const { html, text } = await renderEmail(planned.built.element);
        outcome[planned.template] = await sendEmail({
          to,
          subject: planned.built.subject,
          html,
          text,
          template: planned.template,
          dedupeKey: planned.key,
          inquiryId: row.id,
        });
      } catch (caught) {
        logger.error("inquiry.email_failed", { template: planned.template, inquiry: row.code, error: caught instanceof Error ? caught.name : "Error" });
        outcome[planned.template] = "failed";
      }
    }
    return outcome;
  } catch (caught) {
    logger.error("inquiry.email_failed", { error: caught instanceof Error ? caught.name : "Error" });
    return null;
  }
}

/**
 * Call after an inquiry's write has committed, with the inquiry's id (or its `INQ-…` code). The
 * emails are sent after the response (Next.js `after()`; outside a request, in the background),
 * so the visitor never waits on Resend. Without Resend both are `skipped` rows in `email_logs`.
 */
export function sendInquiryEmails(inquiry: string): void {
  const task = () => deliverInquiryEmails(inquiry);
  try {
    after(task);
  } catch {
    void task();
  }
}
