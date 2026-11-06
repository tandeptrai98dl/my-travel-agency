import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import type { SortDirection } from "@/lib/admin/list-params";
import { cn } from "@/lib/utils";

export type DataTableColumn<Row> = {
  key: string;
  header: string;
  /** Sort key sent in `?sort=`; omit for columns that cannot be sorted. */
  sortKey?: string;
  className?: string;
  cell: (row: Row) => React.ReactNode;
};

type Labels = {
  caption: string;
  empty: string;
  /** Screen-reader hint after a sortable header: what clicking does. */
  sortAscending: string;
  sortDescending: string;
  pagination: { nav: string; previous: string; next: string; page: (page: number) => string };
  total: string;
};

type Props<Row> = {
  rows: Row[];
  /** Server components may pass `cell` render functions; this component never runs in the browser. */
  columns: DataTableColumn<Row>[];
  rowKey: (row: Row) => string;
  sort: { key: string; dir: SortDirection };
  page: number;
  pageCount: number;
  /** Builds the URL for a sort or page change (keeps the other list params). */
  hrefFor: (overrides: Record<string, string | number | null>) => string;
  labels: Labels;
  /** Shown instead of the table when there are no rows (e.g. with a "clear filters" action). */
  emptyAction?: React.ReactNode;
  /** Rows exist, but not on this page (an old link past the end): offer the last page. */
  outOfRange?: { message: string; lastPageLabel: string };
};

/**
 * Server-rendered admin table. Sorting and paging are links, so the list state lives in the URL
 * and works without JavaScript; the page reads it with `parseListParams()`.
 */
export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  sort,
  page,
  pageCount,
  hrefFor,
  labels,
  emptyAction,
  outOfRange,
}: Props<Row>) {
  if (rows.length === 0 && outOfRange) {
    return (
      <EmptyState
        headingLevel={2}
        title={outOfRange.message}
        description={labels.total}
        action={
          <Link href={hrefFor({ page: pageCount })} className="text-small underline underline-offset-4">
            {outOfRange.lastPageLabel}
          </Link>
        }
        className="py-12"
      />
    );
  }
  if (rows.length === 0) {
    return <EmptyState headingLevel={2} title={labels.empty} action={emptyAction} className="py-12" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Wide tables scroll sideways on narrow screens; a focusable region keeps that reachable by keyboard. */}
      <div
        className="overflow-x-auto rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        tabIndex={0}
        role="region"
        aria-label={labels.caption}
      >
        <table className="w-full min-w-[40rem] border-collapse text-left text-small">
          <caption className="sr-only">{labels.caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => {
                const active = column.sortKey !== undefined && column.sortKey === sort.key;
                const nextDir: SortDirection = active && sort.dir === "asc" ? "desc" : "asc";
                const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("px-4 py-3 font-semibold", column.className)}
                  >
                    {column.sortKey ? (
                      <Link
                        href={hrefFor({ sort: column.sortKey, dir: nextDir, page: null })}
                        className="inline-flex min-h-11 items-center gap-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {column.header}
                        <span className="sr-only">
                          , {nextDir === "asc" ? labels.sortAscending : labels.sortDescending}
                        </span>
                        <Icon
                          className={cn("h-4 w-4", !active && "text-muted-foreground")}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </Link>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0 align-top">
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-small text-muted-foreground">{labels.total}</p>
        <Pagination
          page={page}
          pageCount={pageCount}
          hrefFor={(p) => hrefFor({ page: p })}
          labels={labels.pagination}
        />
      </div>
    </div>
  );
}
