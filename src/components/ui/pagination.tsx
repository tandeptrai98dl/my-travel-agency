import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./button";

export type PaginationItem = number | "ellipsis";

/**
 * Page numbers to show: always the first and last page, the current page and `siblings` on each
 * side, with gaps collapsed into an ellipsis. A gap of a single page shows that page instead.
 */
export function paginationRange(page: number, pageCount: number, siblings = 1): PaginationItem[] {
  if (pageCount <= 1) return pageCount === 1 ? [1] : [];
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = Math.max(2, current - siblings);
  const end = Math.min(pageCount - 1, current + siblings);
  const items: PaginationItem[] = [1];
  if (start === 3) items.push(2);
  else if (start > 3) items.push("ellipsis");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end === pageCount - 2) items.push(pageCount - 1);
  else if (end < pageCount - 2) items.push("ellipsis");
  items.push(pageCount);
  return items;
}

type Labels = {
  /** Landmark name, e.g. "Pagination" / "Phân trang". */
  nav: string;
  previous: string;
  next: string;
  /** Accessible name of a page link; receives the page number. */
  page: (page: number) => string;
};

type Props = {
  page: number;
  pageCount: number;
  /** Builds the localized URL of a page (filters stay in the URL: `docs/specs/tour-listing.md`). */
  hrefFor: (page: number) => string;
  labels: Labels;
  className?: string;
};

const itemClass = cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-small");

/** Numbered pagination with real links, so every page is crawlable and works without JS. */
function Pagination({ page, pageCount, hrefFor, labels, className }: Props) {
  if (pageCount <= 1) return null;
  const items = paginationRange(page, pageCount);
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);

  return (
    <nav aria-label={labels.nav} className={cn("flex justify-center", className)}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {current > 1 ? (
            <Link href={hrefFor(current - 1)} rel="prev" className={itemClass} aria-label={labels.previous}>
              <ChevronLeft strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ) : (
            <span className={cn(itemClass, "opacity-40")} aria-hidden="true">
              <ChevronLeft strokeWidth={1.5} />
            </span>
          )}
        </li>
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-2 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-label={labels.page(item)}
                aria-current={item === current ? "page" : undefined}
                className={cn(
                  itemClass,
                  item === current && "border border-primary font-semibold hover:bg-transparent",
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        <li>
          {current < pageCount ? (
            <Link href={hrefFor(current + 1)} rel="next" className={itemClass} aria-label={labels.next}>
              <ChevronRight strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ) : (
            <span className={cn(itemClass, "opacity-40")} aria-hidden="true">
              <ChevronRight strokeWidth={1.5} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}

export { Pagination };
