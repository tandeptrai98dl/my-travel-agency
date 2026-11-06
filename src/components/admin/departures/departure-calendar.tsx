import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { DepartureListItem } from "@/modules/catalog/departures/departures.service";

type Labels = {
  caption: string;
  weekdays: string[];
  dayLabel: (date: string) => string;
  status: (status: DepartureListItem["status"]) => string;
  seats: (item: DepartureListItem) => string;
  seatsLabel: (item: DepartureListItem) => string;
  empty: string;
};

type Props = {
  weeks: (string | null)[][];
  byDate: Record<string, DepartureListItem[]>;
  today: string;
  /** Edit links for operators and admins; other roles read only. */
  editHref?: (id: string) => string;
  labels: Labels;
};

const linkClass =
  "font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Entry({ item, editHref, labels }: { item: DepartureListItem; editHref?: (id: string) => string; labels: Labels }) {
  const name = (
    <>
      <code>{item.tourCode}</code>
      <span className="sr-only"> {item.tourTitle}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-2 text-small">
      {editHref ? (
        <Link href={editHref(item.id)} className={linkClass}>
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge kind="departure" status={item.status} label={labels.status(item.status)} />
        <span className="tabular-nums text-muted-foreground" aria-hidden="true">
          {labels.seats(item)}
        </span>
        <span className="sr-only">{labels.seatsLabel(item)}</span>
      </span>
    </div>
  );
}

/**
 * One month of departures (spec Phase 2 step 14): a Monday-first grid from `md` up, and the same
 * departures as a list of days below it, where seven columns do not fit.
 */
export function DepartureCalendar({ weeks, byDate, today, editHref, labels }: Props) {
  const days = weeks.flat().filter((day): day is string => day !== null && Boolean(byDate[day]?.length));
  return (
    <>
      <table className="hidden w-full table-fixed border-collapse md:table">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr>
            {labels.weekdays.map((day) => (
              <th key={day} scope="col" className="pb-2 text-left text-small font-semibold text-muted-foreground">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={week.find(Boolean) ?? index}>
              {week.map((day, column) =>
                day ? (
                  <td
                    key={day}
                    className={cn(
                      "h-28 border border-border bg-card p-2 align-top",
                      day === today && "outline outline-2 -outline-offset-2 outline-ring",
                    )}
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-small tabular-nums" aria-current={day === today ? "date" : undefined}>
                        <span aria-hidden="true">{Number(day.slice(8))}</span>
                        <span className="sr-only">{labels.dayLabel(day)}</span>
                      </span>
                      {byDate[day]?.map((item) => (
                        <Entry key={item.id} item={item} editHref={editHref} labels={labels} />
                      ))}
                    </div>
                  </td>
                ) : (
                  <td key={`empty-${column}`} className="border border-border bg-muted" />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="md:hidden">
        {days.length === 0 ? (
          <p className="text-muted-foreground">{labels.empty}</p>
        ) : (
          <ol className="flex flex-col gap-4" aria-label={labels.caption}>
            {days.map((day) => (
              <li key={day} className="flex flex-col gap-2">
                <h3 className="text-small font-semibold" aria-current={day === today ? "date" : undefined}>
                  {labels.dayLabel(day)}
                </h3>
                {byDate[day]?.map((item) => (
                  <Entry key={item.id} item={item} editHref={editHref} labels={labels} />
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
