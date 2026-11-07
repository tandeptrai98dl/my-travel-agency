import { z } from "zod";

import { isConsentId } from "@/lib/consent";

export const CONSENT_ACTIONS = ["accept_all", "essential_only", "custom", "withdraw"] as const;

/**
 * One cookie choice as the banner or the settings dialog sends it (ADR-039). The id is the
 * pseudonymous record id from the `consent` cookie; the banner version is computed on the server
 * from the texts of that language, never taken from the browser.
 */
export const recordConsentSchema = z
  .object({
    id: z.string().refine(isConsentId),
    action: z.enum(CONSENT_ACTIONS),
    analytics: z.boolean(),
    marketing: z.boolean(),
    locale: z.enum(["vi", "en"]),
  })
  .strict()
  .refine(
    (value) =>
      value.action === "custom" ||
      (value.action === "accept_all" ? value.analytics && value.marketing : !value.analytics && !value.marketing),
    { message: "action does not match the choices" },
  );

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
export type RecordConsentStatus = "recorded" | "invalid" | "rateLimited" | "unavailable" | "failed";
