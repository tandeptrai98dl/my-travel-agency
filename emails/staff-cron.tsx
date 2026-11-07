import type { EmailLocale, EmailT } from "./components/booking";
import { type DetailRow, Details, type EmailBrand, EmailLayout, Eyebrow, Heading, Text } from "./components/layout";

export type CronAlertFacts = {
  job: string;
  /** Vietnam times of the failed runs this email reports, already formatted, oldest first. */
  failedRuns: string[];
  /** Failed runs reported by this email beyond the listed ones. */
  moreRuns: number;
  /** pg_cron's return message of the latest failed run (our alert jobs raise counts only). */
  message: string | null;
  /** Set when the job also missed its schedule: its last success (formatted), or null for never. */
  missed: { lastSuccess: string | null } | null;
};

export type StaffCronProps = { locale: EmailLocale; t: EmailT; brand: EmailBrand; alert: CronAlertFacts };

/**
 * The health-check alert to `settings.contact.email` (docs/specs/phase-6-hardening-launch.md
 * decision 3), always in Vietnamese (ADR-006): a scheduled database job failed or missed its
 * schedule. One email per job per check, listing every run not reported before; the runbook is in
 * the README.
 */
export function StaffCronEmail({ locale, t, brand, alert }: StaffCronProps) {
  const failed = alert.failedRuns.length > 0;
  const kind = failed ? "failed" : "missed";
  const runs = [...alert.failedRuns, ...(alert.moreRuns > 0 ? [t("staffCron.more", { count: alert.moreRuns })] : [])];
  const rows: DetailRow[] = [
    { label: t("staffCron.job"), value: alert.job },
    ...(failed ? [{ label: t("staffCron.failedAt"), value: runs.join(", ") }] : []),
    ...(failed && alert.message ? [{ label: t("staffCron.message"), value: alert.message }] : []),
    ...(alert.missed ? [{ label: t("staffCron.lastSuccess"), value: alert.missed.lastSuccess ?? t("staffCron.never") }] : []),
  ];
  return (
    <EmailLayout lang={locale} preview={t("staffCron.preview", { kind, job: alert.job })} brand={brand} reason={t("common.staffReason")}>
      <Eyebrow>{t("staffCron.eyebrow")}</Eyebrow>
      <Heading>{failed ? t("staffCron.headingFailed", { job: alert.job }) : t("staffCron.headingMissed", { job: alert.job })}</Heading>
      <Text>{failed ? t("staffCron.introFailed") : t("staffCron.introMissed")}</Text>
      <Details rows={rows} />
      <Text muted>{t("staffCron.runbook")}</Text>
    </EmailLayout>
  );
}
