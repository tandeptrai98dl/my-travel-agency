import type { EmailLocale, EmailT } from "./components/booking";
import { type DetailRow, Details, type EmailBrand, EmailLayout, Eyebrow, Heading, Text } from "./components/layout";

export type CronAlertFacts = {
  kind: "failed" | "missed";
  job: string;
  /** Vietnam time of the failed run or of the last success, already formatted; null: never. */
  at: string | null;
  /** pg_cron's return message of a failed run (our alert jobs raise counts only). */
  message: string | null;
};

export type StaffCronProps = { locale: EmailLocale; t: EmailT; brand: EmailBrand; alert: CronAlertFacts };

/**
 * The health-check alert to `settings.contact.email` (docs/specs/phase-6-hardening-launch.md
 * decision 3), always in Vietnamese (ADR-006): a scheduled database job failed or missed its
 * schedule. Sent once per failed run or per gap; the runbook is in the README.
 */
export function StaffCronEmail({ locale, t, brand, alert }: StaffCronProps) {
  const failed = alert.kind === "failed";
  const rows: DetailRow[] = [
    { label: t("staffCron.job"), value: alert.job },
    { label: failed ? t("staffCron.failedAt") : t("staffCron.lastSuccess"), value: alert.at ?? t("staffCron.never") },
    ...(failed && alert.message ? [{ label: t("staffCron.message"), value: alert.message }] : []),
  ];
  return (
    <EmailLayout lang={locale} preview={t("staffCron.preview", { kind: alert.kind, job: alert.job })} brand={brand} reason={t("common.staffReason")}>
      <Eyebrow>{t("staffCron.eyebrow")}</Eyebrow>
      <Heading>{failed ? t("staffCron.headingFailed", { job: alert.job }) : t("staffCron.headingMissed", { job: alert.job })}</Heading>
      <Text>{failed ? t("staffCron.introFailed") : t("staffCron.introMissed")}</Text>
      <Details rows={rows} />
      <Text muted>{t("staffCron.runbook")}</Text>
    </EmailLayout>
  );
}
