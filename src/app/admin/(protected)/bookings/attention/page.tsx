import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, rolesFor } from "@/lib/auth/permissions";
import { formatVnd } from "@/lib/money";
import { attentionQueue } from "@/modules/booking/booking-admin.service";
import { unmatchedTransferCount } from "@/modules/payment/payment-admin.service";

import { requireAdminAccess } from "../../../admin-gate";
import { adminDate, adminDateTime } from "../format";

export const metadata: Metadata = { title: "Cần xử lý" };

/** The "needs attention" queue (spec Phase 4 step 18), oldest first. */
export default async function AttentionPage() {
  await requireAdminAccess(rolesFor("bookings.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Attention.title")}
        description={t("Attention.description")}
        breadcrumbs={[{ label: t("Bookings.title"), href: "/admin/bookings" }, { label: t("Attention.title") }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" aria-hidden="true" />}>
        <Queue />
      </Suspense>
    </div>
  );
}

async function Queue() {
  const user = await requireAdminAccess(rolesFor("bookings.read"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const [items, unmatched] = await Promise.all([attentionQueue(), unmatchedTransferCount(user.role)]);
  return (
    <div className="flex flex-col gap-6">
      {can(user.role, "payments.record") && unmatched > 0 && (
        <p className="rounded-lg border border-warning/40 bg-card p-4 text-small">
          {t("Work.unmatched", { count: unmatched })}{" "}
          <Link href="/admin/payments#unmatched" className="font-medium underline underline-offset-4">
            {t("Attention.unmatchedLink")}
          </Link>
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t("Attention.empty")} />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t("Attention.title")}>
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/bookings/${item.id}`} className="font-medium underline underline-offset-4">
                    {t("Attention.open", { code: item.code })}
                  </Link>
                  <Badge variant={item.resolvable ? "warning" : "secondary"}>{t(`Bookings.reasons.${item.reason}`)}</Badge>
                </div>
                {!item.resolvable && <p className="text-small">{t("BookingDetail.attentionDerived")}</p>}
                <p className="text-small text-muted-foreground">
                  <code>{item.tourCode}</code> · {adminDate(format, item.startDate)} · {item.contactName} ·{" "}
                  {formatVnd(item.amountPaid, "vi")} / {formatVnd(item.total, "vi")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-small">
                <StatusBadge kind="booking" status={item.status} label={t(`Bookings.statuses.${item.status}`)} />
                <span className="text-muted-foreground">
                  {t("Attention.since")} <time dateTime={item.since}>{item.since.length === 10 ? adminDate(format, item.since) : adminDateTime(format, item.since)}</time>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
