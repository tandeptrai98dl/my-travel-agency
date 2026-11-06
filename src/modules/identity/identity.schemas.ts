import { z } from "zod";

export const verifyTotpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "must be a 6-digit code"),
  factorId: z.uuid().optional(),
});

export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;
