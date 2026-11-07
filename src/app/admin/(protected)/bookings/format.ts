import type { getFormatter } from "next-intl/server";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** Dates and times in the admin, always in Vietnam time. */
export function adminDate(format: Formatter, date: string): string {
  return format.dateTime(new Date(`${date}T00:00:00+07:00`), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function adminDateTime(format: Formatter, value: string): string {
  return format.dateTime(new Date(value), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
