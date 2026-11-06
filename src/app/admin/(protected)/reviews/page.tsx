import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { ReviewActions } from "@/components/admin/content/review-actions";
import { FilterBar } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentQuery, listHref, parseListParams } from "@/lib/admin/list-params";
import { rolesFor } from "@/lib/auth/permissions";
import { REVIEW_SORTS, REVIEW_STATUSES, reviewListFilters, REVIEWS_PAGE_SIZE } from "@/modules/content/reviews.schemas";
import { listReviews } from "@/modules/content/reviews.service";

import { requireAdminAccess } from "../../admin-gate";

export const metadata: Metadata = { title: "Đánh giá" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/admin/reviews";
const DEFAULTS = { sort: "created_at", dir: "desc" } as const;

/** Review moderation (spec Phase 2 step 19): editors and admins. */
export default async function ReviewsPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("content.manage"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin.Content.reviews" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-hidden="true" />}>
        <ReviewList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReviewList({ searchParams }: Props) {
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const params = parseListParams(await searchParams, {
    sortable: REVIEW_SORTS,
    defaultSort: DEFAULTS.sort,
    defaultDir: DEFAULTS.dir,
    pageSize: REVIEWS_PAGE_SIZE,
    filters: reviewListFilters,
  });
  const query = currentQuery(params, DEFAULTS);
  const { items, total, pageCount } = await listReviews(params);
  const filtered = Boolean(Object.keys(params.filters).length);
  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        action={BASE}
        selects={[
          {
            name: "status",
            label: t("Content.reviews.status"),
            value: params.filters.status,
            allLabel: t("Content.allStatuses"),
            options: REVIEW_STATUSES.map((value) => ({ value, label: t(`Content.reviews.statuses.${value}`) })),
          },
          {
            name: "verified",
            label: t("Content.reviews.verifiedFilter"),
            value: params.filters.verified,
            allLabel: t("Content.reviews.allReviews"),
            options: [
              { value: "yes", label: t("Content.reviews.verified") },
              { value: "no", label: t("Content.reviews.unverified") },
            ],
          },
          {
            name: "sort",
            label: t("Content.reviews.sort"),
            value: params.sort === DEFAULTS.sort ? undefined : params.sort,
            allLabel: t("Content.reviews.newest"),
            options: [{ value: "rating", label: t("Content.reviews.byRating") }],
          },
        ]}
        labels={{ apply: t("Table.apply"), clear: t("Table.clearFilters") }}
        active={filtered}
      />
      <p className="text-small text-muted-foreground">{t("Table.total", { count: total })}</p>
      {items.length === 0 ? (
        <EmptyState title={filtered ? t("Table.emptyFiltered") : t("Content.reviews.empty")} />
      ) : (
        <AdminMessages namespaces={["Content", "Taxonomy"]}>
          <ol className="flex flex-col gap-4" aria-label={t("Content.reviews.title")}>
            {items.map((review) => (
              <li key={review.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5" data-testid="review">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="font-medium">
                    {review.authorName}
                    {review.authorCountry && <span className="text-muted-foreground"> · {review.authorCountry}</span>}
                  </p>
                  <p className="text-small tabular-nums">
                    <span aria-hidden="true">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                    <span className="sr-only">{t("Content.reviews.rating", { rating: review.rating })}</span>
                  </p>
                  <StatusBadge kind="review" status={review.status} label={t(`Content.reviews.statuses.${review.status}`)} />
                  {review.isFeatured && <Badge variant="gold">{t("Content.reviews.featuredBadge")}</Badge>}
                  {/* Read-only: set by the system from a completed booking (P1). */}
                  {review.isVerified ? (
                    <Badge variant="success" className="gap-1">
                      <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      {t("Content.reviews.verified")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("Content.reviews.unverified")}</Badge>
                  )}
                </div>
                <p className="text-small text-muted-foreground">
                  {[
                    review.tourCode,
                    t(`Form.${review.locale}`),
                    review.travelDate &&
                      t("Content.reviews.travelled", {
                        date: format.dateTime(new Date(`${review.travelDate}T00:00:00`), { month: "2-digit", year: "numeric" }),
                      }),
                    format.dateTime(new Date(review.createdAt), { day: "2-digit", month: "2-digit", year: "numeric" }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {review.title && <p className="font-semibold">{review.title}</p>}
                <p className="whitespace-pre-line">{review.content}</p>
                <ReviewActions id={review.id} status={review.status} featured={review.isFeatured} author={review.authorName} />
              </li>
            ))}
          </ol>
        </AdminMessages>
      )}
      {pageCount > 1 && (
        <Pagination
          page={params.page}
          pageCount={pageCount}
          hrefFor={(page) => listHref(BASE, query, { page })}
          labels={{
            nav: t("Table.pagination"),
            previous: t("Table.previous"),
            next: t("Table.next"),
            page: (page) => t("Table.page", { page }),
          }}
        />
      )}
    </div>
  );
}
