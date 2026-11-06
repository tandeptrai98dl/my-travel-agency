import { Badge, type BadgeProps } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import type { Locale } from "@/modules/catalog/public/types";

import { FEW_SEATS_THRESHOLD } from "./tour-card";

export type DepartureRow = {
  id: string;
  startDate: string;
  endDate: string;
  status: "open" | "guaranteed" | "closed" | "cancelled";
  priceAdult: number;
  seatsLeft: number;
  bookable: boolean;
  note: string | null;
};

export type DepartureLabels = {
  dates: string;
  status: string;
  seats: string;
  price: string;
  none: string;
  seatsLeft: (count: number) => string;
  states: Record<DepartureState, string>;
};

export type DepartureState = "open" | "few" | "guaranteed" | "closed" | "soldOut" | "cutoff";

const VARIANT: Record<DepartureState, NonNullable<BadgeProps["variant"]>> = {
  open: "success",
  few: "warning",
  guaranteed: "default",
  closed: "outline",
  soldOut: "outline",
  cutoff: "outline",
};

/** What a customer can do with a departure, in the order the checks matter. */
export function departureState(row: Pick<DepartureRow, "status" | "seatsLeft" | "bookable">): DepartureState {
  if (row.status === "closed" || row.status === "cancelled") return "closed";
  if (row.seatsLeft <= 0) return "soldOut";
  if (!row.bookable) return "cutoff";
  if (row.seatsLeft <= FEW_SEATS_THRESHOLD) return "few";
  return row.status === "guaranteed" ? "guaranteed" : "open";
}

/** Live departures: a table from `md`, one card per departure below (Phase 3 spec PR H step 4). */
export function DepartureTable({ rows, locale, labels }: { rows: DepartureRow[]; locale: Locale; labels: DepartureLabels }) {
  const items = rows.map((row) => {
    const state = departureState(row);
    const open = state === "open" || state === "few" || state === "guaranteed";
    return {
      row,
      state,
      open,
      dates: formatDateRange(row.startDate, row.endDate, locale),
      seats: open ? labels.seatsLeft(row.seatsLeft) : labels.none,
      price: formatVnd(row.priceAdult, locale),
    };
  });

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse border border-border bg-card text-left">
          <thead>
            <tr className="border-b border-border text-eyebrow font-semibold uppercase text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-semibold">{labels.dates}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{labels.status}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{labels.seats}</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">{labels.price}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.row.id} className={"border-b border-border last:border-b-0 " + (item.open ? "" : "text-muted-foreground")}>
                <td className="px-4 py-4 tabular-nums">
                  {item.dates}
                  {item.row.note && <span className="block text-small text-muted-foreground">{item.row.note}</span>}
                </td>
                <td className="px-4 py-4">
                  <Badge variant={VARIANT[item.state]}>{labels.states[item.state]}</Badge>
                </td>
                <td className="px-4 py-4 tabular-nums">{item.seats}</td>
                <td className={"px-4 py-4 text-right tabular-nums " + (item.open ? "font-semibold" : "")}>{item.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li
            key={item.row.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-4"
          >
            <span className="font-semibold tabular-nums">{item.dates}</span>
            <span className={"tabular-nums " + (item.open ? "font-semibold" : "text-muted-foreground")}>
              <span className="sr-only">{labels.price}: </span>
              {item.price}
            </span>
            <span>
              <Badge variant={VARIANT[item.state]}>{labels.states[item.state]}</Badge>
            </span>
            <span className="text-small text-muted-foreground">{item.open ? item.seats : null}</span>
            {item.row.note && <span className="col-span-2 text-small text-muted-foreground">{item.row.note}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
