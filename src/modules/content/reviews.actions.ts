"use server";

import { AccessDeniedError, requirePermission } from "@/lib/auth/require-role";

import { moderateReviewSchema } from "./reviews.schemas";
import { moderateReview, type ModerateResult } from "./reviews.service";

/** Permission first, then Zod, then the service. */
export async function moderateReviewAction(input: unknown): Promise<ModerateResult | { ok: false; error: "forbidden" | "invalid" }> {
  try {
    await requirePermission("content.manage");
    const parsed = moderateReviewSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    return await moderateReview(parsed.data);
  } catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false, error: "forbidden" };
    throw error;
  }
}
