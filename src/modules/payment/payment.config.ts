import "server-only";

import { serverEnv, validatedPublicEnv } from "@/lib/env/server";
import type { IpAllowList } from "@/lib/ip-allowlist";

import type { VnpayConfig } from "./providers/vnpay";

/** VNPay settings, or null when the method is off (no keys): nothing is created or confirmed. */
export function vnpayConfig(): VnpayConfig | null {
  if (!serverEnv.VNPAY_TMN_CODE || !serverEnv.VNPAY_HASH_SECRET) return null;
  const site = validatedPublicEnv.NEXT_PUBLIC_SITE_URL;
  return {
    tmnCode: serverEnv.VNPAY_TMN_CODE,
    hashSecret: serverEnv.VNPAY_HASH_SECRET,
    // CI: the local stand-in for VNPay's page (refused in production by the env schema).
    paymentUrl: vnpayStubEnabled() ? new URL("/api/payments/vnpay/stub", site).toString() : serverEnv.VNPAY_PAYMENT_URL,
    returnUrl: new URL("/api/payments/vnpay/return", site).toString(),
  };
}

export function vnpayStubEnabled(): boolean {
  return serverEnv.VNPAY_STUB && serverEnv.VERCEL_ENV !== "production";
}

export function bankWebhookConfig(): { provider: "sepay" | "casso"; secret: string } | null {
  if (!serverEnv.BANK_WEBHOOK_PROVIDER || !serverEnv.BANK_WEBHOOK_SECRET) return null;
  return { provider: serverEnv.BANK_WEBHOOK_PROVIDER, secret: serverEnv.BANK_WEBHOOK_SECRET };
}

/**
 * The source allow-list of a webhook (docs/specs/phase-6-hardening-launch.md decision 2): off,
 * unrestricted (an accepted exception) or the provider's addresses; validated by the env schema.
 */
export function webhookAllowList(webhook: "vnpay" | "bank"): IpAllowList {
  return webhook === "vnpay" ? serverEnv.VNPAY_IPN_ALLOWED_IPS : serverEnv.BANK_WEBHOOK_ALLOWED_IPS;
}
