import "server-only";

import { updateTag } from "next/cache";

import { requirePermission } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { tourTag } from "@/modules/catalog/tours/tours.service";

import * as repo from "./reviews.repository";
import { type ModerateReviewInput, REVIEWS_PAGE_SIZE, type ReviewStatus } from "./reviews.schemas";

/** Cache tag for public review reads (decision 9); a tour's own reviews also refresh its page. */
export const REVIEWS_TAG = "reviews";

export type ReviewListItem = {
  id: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  title: string | null;
  content: string;
  locale: "vi" | "en";
  travelDate: string | null;
  isVerified: boolean;
  status: ReviewStatus;
  isFeatured: boolean;
  tourCode: string | null;
  createdAt: string;
};

export async function listReviews(params: {
  filters: Record<string, string>;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}): Promise<{ items: ReviewListItem[]; total: number; pageCount: number }> {
  await requirePermission("content.manage");
  const from = (params.page - 1) * REVIEWS_PAGE_SIZE;
  const { data, error, count } = await repo.listReviewRows({
    status: params.filters.status as ReviewStatus | undefined,
    verified: params.filters.verified ? params.filters.verified === "yes" : undefined,
    sort: params.sort,
    ascending: params.dir === "asc",
    range: [from, from + REVIEWS_PAGE_SIZE - 1],
  });
  if (error) throw new Error(`reviews query failed: ${error.message}`);
  const items = (data ?? []).map((row) => ({
    id: row.id,
    authorName: row.author_name,
    authorCountry: row.author_country,
    rating: row.rating,
    title: row.title,
    content: row.content,
    locale: row.locale,
    travelDate: row.travel_date,
    isVerified: row.is_verified,
    status: row.status,
    isFeatured: row.is_featured,
    tourCode: row.tours?.code ?? null,
    createdAt: row.created_at,
  }));
  const total = count ?? items.length;
  return { items, total, pageCount: Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE)) };
}

export type ModerateResult = { ok: true } | { ok: false; error: "not_found" | "featureNeedsApproved" | "failed" };

/**
 * Approve, reject, feature or unfeature. Rejecting a featured review unfeatures it in the same
 * write (the database refuses a featured review that is not approved).
 */
export async function moderateReview(input: ModerateReviewInput): Promise<ModerateResult> {
  await requirePermission("content.manage");
  const { data: review, error: readError } = await repo.findReview(input.id);
  if (readError) throw new Error(`review query failed: ${readError.message}`);
  if (!review) return { ok: false, error: "not_found" };
  let row: { status?: ReviewStatus; is_featured?: boolean };
  if (input.action === "approve") row = { status: "approved" };
  else if (input.action === "reject") row = { status: "rejected", is_featured: false };
  else {
    if (input.featured && review.status !== "approved") return { ok: false, error: "featureNeedsApproved" };
    row = { is_featured: input.featured };
  }
  const { data, error } = await repo.updateReview(review.id, row);
  if (error) {
    if (error.code === "23514") return { ok: false, error: "featureNeedsApproved" };
    logger.error("reviews.write_failed", { code: error.code, message: error.message });
    return { ok: false, error: "failed" };
  }
  if (!data) return { ok: false, error: "not_found" };
  updateTag(REVIEWS_TAG);
  if (review.tour_id) updateTag(tourTag(review.tour_id));
  return { ok: true };
}
