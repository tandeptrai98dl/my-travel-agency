import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { DepartureEditor } from "@/components/admin/departures/departure-editor";
import { ExportPassengersButton } from "@/components/admin/operations/export-passengers-button";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, rolesFor } from "@/lib/auth/permissions";
import { getDepartureEditor } from "@/modules/catalog/departures/departures.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Sửa ngày khởi hành" };

type Props = { params: Promise<{ id: string }> };

/** Departure editor (spec Phase 2 step 16): operators and admins. */
export default async function EditDeparturePage({ params }: Props) {
  await requireAdminAccess(rolesFor("departures.edit"));
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-4xl" aria-hidden="true" />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: Props) {
  const id = z.uuid().safeParse((await params).id).data;
  if (!id) notFound();
  const user = await requireAdminAccess(rolesFor("departures.edit"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  const format = await getFormatter({ locale: "vi" });
  const data = await getDepartureEditor(id);
  if (!data) notFound();
  const title = `${data.tour.code} · ${format.dateTime(new Date(`${data.startDate}T00:00:00`), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}`;
  return (
    <>
      <PageHeader
        title={title}
        description={t("Departures.editDescription")}
        breadcrumbs={[{ label: t("Departures.title"), href: "/admin/departures" }, { label: title }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge kind="departure" status={data.values.status} label={t(`Departures.statuses.${data.values.status}`)} />
            <AdminMessages namespaces={["Operations"]}>
              <ExportPassengersButton departureId={id} />
            </AdminMessages>
          </div>
        }
      />
      <AdminMessages namespaces={["Departures", "Taxonomy", "Form", "Shell"]}>
        <DepartureEditor
          data={data}
          tourHref={can(user.role, "tours.edit_content") ? `/admin/tours/${data.tour.id}` : undefined}
        />
      </AdminMessages>
    </>
  );
}
