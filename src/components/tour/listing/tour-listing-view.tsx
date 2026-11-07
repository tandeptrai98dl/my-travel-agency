import { X } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/layout/section";
import { Eyebrow } from "@/components/typography/eyebrow";
import { buttonVariants } from "@/components/ui/button-variants";
import { Pagination } from "@/components/ui/pagination";
import { localizedPath } from "@/i18n/paths";
import { formatMonth } from "@/lib/dates";
import { features } from "@/lib/features";
import { formatVnd } from "@/lib/money";
import type { FilterDestination, TourFilterOptions } from "@/modules/catalog/public/tour-listing.mapping";
import type { Locale, TourCardItem } from "@/modules/catalog/public/types";
import { listingHref } from "@/modules/catalog/tour-listing-href";
import {
  DEFAULT_TOUR_SORT,
  EMPTY_TOUR_SEARCH,
  TOUR_SORTS,
  type TourSearchCriteria,
  countActiveFilters,
  serializeTourSearchParams,
} from "@/modules/catalog/tour-search-params";

import { FilterColumn, FilterSheet } from "./filter-panel";
import { FilterSheetButton } from "./filter-sheet";
import { TourGrid } from "./tour-grid";
import { TourListingForm } from "./tour-listing-form";
import { TourResults } from "./tour-results";
import { TourSearchInput } from "./tour-search-input";

type Props = {
  locale: Locale;
  criteria: TourSearchCriteria;
  options: TourFilterOptions;
  months: string[];
  items: TourCardItem[];
  total: number;
  totalPages: number;
  /** Featured tours for the empty state. */
  suggestions: TourCardItem[];
};

function findName(nodes: FilterDestination[], key: string): string | null {
  for (const node of nodes) {
    if (node.key === key) return node.name;
    const found = findName(node.children, key);
    if (found) return found;
  }
  return null;
}

const chipClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3.5 pr-2.5 text-small text-foreground hover:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The listing below the page header (docs/specs/tour-listing.md §2.1): toolbar, chips, filter
 * column, results, pagination. Chips and page links are plain links built from the URL.
 */
export async function TourListingView({ locale, criteria, options, months, items, total, totalPages, suggestions }: Props) {
  const t = await getTranslations({ locale, namespace: "TourListing" });
  const href = (change: Partial<TourSearchCriteria>) => listingHref(locale, { ...criteria, page: 1, ...change });
  const activeCount = countActiveFilters(criteria);
  const filtersLabel = activeCount ? t("filtersCount", { count: activeCount }) : t("filters");
  const money = (amount: number) => formatVnd(amount, locale);
  const query = serializeTourSearchParams(criteria);

  const chips: { key: string; label: string; href: string }[] = [
    ...(criteria.q ? [{ key: "q", label: t("searchChip", { q: criteria.q }), href: href({ q: null }) }] : []),
    ...criteria.scopes.map((scope) => ({ key: `scope-${scope}`, label: t(`scopes.${scope}`), href: href({ scopes: criteria.scopes.filter((s) => s !== scope) }) })),
    ...criteria.dest.map((key) => ({ key: `dest-${key}`, label: findName(options.destinations, key) ?? key, href: href({ dest: criteria.dest.filter((d) => d !== key) }) })),
    ...criteria.style.map((key) => ({ key: `style-${key}`, label: options.styles.find((s) => s.key === key)?.name ?? key, href: href({ style: criteria.style.filter((s) => s !== key) }) })),
    ...(criteria.priceMin !== null || criteria.priceMax !== null
      ? [
          {
            key: "price",
            label:
              criteria.priceMin === null
                ? t("priceUnder", { max: money(criteria.priceMax!) })
                : criteria.priceMax === null
                  ? t("priceOver", { min: money(criteria.priceMin) })
                  : t("priceBetween", { min: money(criteria.priceMin), max: money(criteria.priceMax) }),
            href: href({ priceMin: null, priceMax: null }),
          },
        ]
      : []),
    ...criteria.months.map((month) => ({ key: `month-${month}`, label: formatMonth(month, locale), href: href({ months: criteria.months.filter((m) => m !== month) }) })),
    ...criteria.durations.map((duration) => ({ key: `duration-${duration}`, label: t(`durations.${duration}`), href: href({ durations: criteria.durations.filter((d) => d !== duration) }) })),
  ];
  const clearFiltersHref = listingHref(locale, { q: null, sort: criteria.sort });
  const contactHref = localizedPath(locale, features.inquiry ? "/tailor-made" : "/contact");
  const countText = t("count", { count: total });
  const action = localizedPath(locale, "/tours");
  const filterProps = { locale, criteria, options, months };

  return (
    <TourListingForm action={action} sheet={<FilterSheet key={query} action={action} {...filterProps} />} className="flex flex-col gap-10">
      <div className="sticky top-[4.5rem] z-20 -mx-4 flex flex-col gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:flex-row md:items-center md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <TourSearchInput defaultValue={criteria.q ?? ""} label={t("search")} placeholder={t("searchPlaceholder")} clearLabel={t("clearSearch")} />
        <div className="flex items-center gap-3 md:ml-auto">
          <p className="hidden text-small text-muted-foreground md:block" aria-hidden="true">
            {countText}
          </p>
          <FilterSheetButton label={filtersLabel} />
          <label htmlFor="tour-sort" className="sr-only">
            {t("sort")}
          </label>
          <select
            id="tour-sort"
            name="sort"
            defaultValue={criteria.sort === DEFAULT_TOUR_SORT ? "" : criteria.sort}
            key={criteria.sort}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-small text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-none"
          >
            {TOUR_SORTS.map((sort) => (
              <option key={sort} value={sort === DEFAULT_TOUR_SORT ? "" : sort}>
                {t(`sorts.${sort}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {chips.length > 0 && (
        <nav aria-label={t("activeFilters")} className="-mt-4">
          <ul className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                <NextLink href={chip.href} scroll={false} className={chipClass} aria-label={t("removeFilter", { label: chip.label })}>
                  {chip.label}
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                </NextLink>
              </li>
            ))}
            <li>
              <NextLink href={listingHref(locale, EMPTY_TOUR_SEARCH)} scroll={false} className={buttonVariants({ variant: "link", size: "sm" })}>
                {t("clearAll")}
              </NextLink>
            </li>
          </ul>
        </nav>
      )}

      <div className="grid gap-10 lg:grid-cols-[264px_1fr] xl:grid-cols-[280px_1fr]">
        <div className="max-lg:contents lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
          <FilterColumn key={query} {...filterProps} />
        </div>

        <TourResults count={countText} heading={t("results")} updating={t("updating")} page={criteria.page}>
          {items.length > 0 ? (
            <div className="flex flex-col gap-14">
              <TourGrid tours={items} locale={locale} />
              <Pagination
                page={criteria.page}
                pageCount={totalPages}
                hrefFor={(page) => listingHref(locale, { ...criteria, page }) + "#tour-results-heading"}
                labels={{ nav: t("pagination"), previous: t("previous"), next: t("next"), page: (page) => t("page", { page }) }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-10 border-y border-border py-12">
              <div className="flex max-w-xl flex-col gap-4">
                <h3 className="font-serif text-h3 font-semibold">{t("emptyTitle")}</h3>
                <p className="text-body text-muted-foreground">{t("emptyText")}</p>
                <div className="flex flex-wrap gap-3">
                  {(activeCount > 0 || criteria.q) && (
                    <NextLink href={clearFiltersHref} scroll={false} className={buttonVariants({})}>
                      {t("clearFilters")}
                    </NextLink>
                  )}
                  <NextLink href={contactHref} className={buttonVariants({ variant: "outline" })}>
                    {features.inquiry ? t("ctaButtonTailorMade") : t("ctaButton")}
                  </NextLink>
                </div>
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-col gap-6">
                  <Eyebrow>{t("suggestions")}</Eyebrow>
                  <TourGrid tours={suggestions} locale={locale} headingLevel={3} />
                </div>
              )}
            </div>
          )}
        </TourResults>
      </div>
    </TourListingForm>
  );
}

/** The navy band at the end of the listing (§2.1 item 7). */
export async function TourListingCta({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "TourListing" });
  return (
    <Section tone="navy" aria-labelledby="tour-listing-cta">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 id="tour-listing-cta" className="font-serif text-h2 font-medium md:text-h2-lg">
            {t("ctaTitle")}
          </h2>
          <p className="text-body-lg text-muted-foreground">{t("ctaText")}</p>
        </div>
        <NextLink href={localizedPath(locale, features.inquiry ? "/tailor-made" : "/contact")} className={buttonVariants({ variant: "gold", size: "lg" })}>
          {features.inquiry ? t("ctaButtonTailorMade") : t("ctaButton")}
        </NextLink>
      </div>
    </Section>
  );
}

/** The "no tours in this language" state: no filters, contact links (§2.5). */
export async function TourListingNone({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "TourListing" });
  return (
    <div className="flex max-w-xl flex-col gap-4 border-y border-border py-12">
      <h2 className="font-serif text-h3 font-semibold">{t("noToursTitle")}</h2>
      <p className="text-body text-muted-foreground">{t("noToursText")}</p>
      <NextLink href={localizedPath(locale, "/contact")} className={buttonVariants({ variant: "outline", className: "self-start" })}>
        {t("ctaButton")}
      </NextLink>
    </div>
  );
}
