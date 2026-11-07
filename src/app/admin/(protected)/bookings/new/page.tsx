import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AdminMessages } from "@/components/admin/admin-messages";
import { QuoteForm } from "@/components/admin/bookings/quote-form";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, todayInVietnam } from "@/lib/dates";
import { rolesFor } from "@/lib/auth/permissions";
import { quoteTourOptions } from "@/modules/booking/quote.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Tạo báo giá" };

/** New private-trip quote (spec Phase 4 step 13): sales, sales managers and admins. */
export default async function NewQuotePage() {
  await requireAdminAccess(rolesFor("bookings.edit"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Quote.title")}
        description={t("Quote.description")}
        breadcrumbs={[{ label: t("Bookings.title"), href: "/admin/bookings" }, { label: t("Quote.title") }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-4xl" aria-hidden="true" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  await requireAdminAccess(rolesFor("bookings.edit"));
  const tours = await quoteTourOptions();
  return (
    <AdminMessages namespaces={["Quote", "Bookings"]}>
      <QuoteForm tours={tours} defaultDate={addDays(todayInVietnam(), 60)} />
    </AdminMessages>
  );
}
