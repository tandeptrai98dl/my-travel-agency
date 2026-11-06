import { z } from "zod";

/**
 * Review moderation (docs/specs/phase-2-catalog-admin.md step 19). Staff change only the status
 * and the featured flag; the text and the verified flag are the customer's and the system's
 * (supabase/migrations/*_review_rules.sql).
 */
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEWS_PAGE_SIZE = 20;
export const REVIEW_SORTS = ["created_at", "rating"] as const;
export const reviewListFilters = { status: REVIEW_STATUSES, verified: ["yes", "no"] } as const;

export const moderateReviewSchema = z.discriminatedUnion("action", [
  z.object({ id: z.uuid(), action: z.literal("approve") }),
  z.object({ id: z.uuid(), action: z.literal("reject") }),
  z.object({ id: z.uuid(), action: z.literal("feature"), featured: z.boolean() }),
]);
export type ModerateReviewInput = z.input<typeof moderateReviewSchema>;
