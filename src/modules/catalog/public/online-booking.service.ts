import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { features } from "@/lib/features";
import { bookingEnabled } from "@/modules/booking/checkout.service";
import { availableMethods } from "@/modules/payment/payment.service";
import { SETTINGS_TAG } from "@/modules/settings/settings.service";

/**
 * Whether the site may promise online booking and payment (Phase 3 spec decision 19: real data
 * only). True only when the master switch `features.booking` is on, the checkout can run
 * (`bookingEnabled()`: its cookie key exists) and at least one payment method is configured
 * (`availableMethods()`: VNPay keys, or a complete receiving account in settings). Otherwise the
 * trust bar leaves the payment item out and the tour page keeps its contact call to action.
 * Cached with the `settings` tag, which the bank account form refreshes; an error counts as off.
 */
export async function onlineBookingAvailable(): Promise<boolean> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");
  if (!features.booking || !bookingEnabled()) return false;
  try {
    return (await availableMethods()).length > 0;
  } catch (error) {
    console.error("onlineBookingAvailable failed", error instanceof Error ? error.message : error);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return false;
  }
}
