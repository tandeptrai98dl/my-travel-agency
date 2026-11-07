import { formatDuration } from "@/modules/inquiry/inquiry-admin.schemas";

type T = (key: "duration.days" | "duration.hours" | "duration.minutes", values: Record<string, number>) => string;

/** "2 ngày 4 giờ", "3 giờ 20 phút" or "45 phút". */
export function durationText(t: T, ms: number): string {
  const { days, hours, minutes } = formatDuration(ms);
  if (days > 0) return t("duration.days", { days, hours });
  if (hours > 0) return t("duration.hours", { hours, minutes });
  return t("duration.minutes", { minutes });
}
