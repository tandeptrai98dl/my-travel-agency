"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { type ResendResult, resendBookingEmail } from "./booking-emails.service";

const resendSchema = z.object({ logId: z.guid(), bookingId: z.guid() });

/** "Gửi lại" on the booking page (4F "resend emails"): sales roles and admin (`bookings.edit`). */
export async function resendEmailAction(input: unknown): Promise<ResendResult | { ok: false; error: "invalid" | "forbidden" }> {
  try {
    // Permission first, then Zod, then the service (which checks again).
    await requirePermission("bookings.edit");
    const parsed = resendSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const result = await resendBookingEmail(parsed.data.logId);
    revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
    return result;
  } catch (caught) {
    if (caught instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw caught;
  }
}
