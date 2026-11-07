"use server";

import { headers } from "next/headers";

import { recordConsentSchema, type RecordConsentStatus } from "./consent.schemas";
import { recordConsent } from "./consent.service";

/** The client's IP as Vercel forwards it (first `x-forwarded-for` entry), for the rate limit only. */
async function clientIp(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || null;
  return forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
}

/** Records a cookie choice from the banner or the settings dialog (guest write: Zod, rate limit). */
export async function recordConsentChoice(input: unknown): Promise<{ status: RecordConsentStatus }> {
  const parsed = recordConsentSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  return { status: await recordConsent(parsed.data, await clientIp()) };
}
