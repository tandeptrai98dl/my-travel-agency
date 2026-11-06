import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { AdminMessages } from "@/components/admin/admin-messages";
import { DepartureBulkCreator } from "@/components/admin/departures/departure-bulk-creator";
import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { can, rolesFor } from "@/lib/auth/permissions";
import { tourOptions } from "@/modules/catalog/departures/departures.service";

import { requireAdminAccess } from "../../../admin-gate";

export const metadata: Metadata = { title: "Thêm ngày khởi hành" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Bulk creation (spec Phase 2 step 15): operators and admins; only admins set prices (ADR-016). */
export default async function NewDeparturesPage({ searchParams }: Props) {
  await requireAdminAccess(rolesFor("departures.edit"));
  const t = await getTranslations({ locale: "vi", namespace: "Admin" });
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-8">
      <PageHeader
        title={t("Departures.newDepartures")}
        description={t("Departures.newDescription")}
        breadcrumbs={[{ label: t("Departures.title"), href: "/admin/departures" }, { label: t("Departures.newDepartures") }]}
        breadcrumbLabel={t("Shell.breadcrumb")}
      />
      {/* Reads the URL (`?tour=`), so it streams in its own boundary (Cache Components). */}
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-4xl" aria-hidden="true" />}>
        <Creator searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Creator({ searchParams }: Props) {
  const raw = (await searchParams).tour;
  const user = await requireAdminAccess(rolesFor("departures.edit"));
  const tours = (await tourOptions()).filter((tour) => tour.type === "group" && tour.status !== "archived");
  const initial = z.uuid().safeParse(Array.isArray(raw) ? raw[0] : raw).data;
  return (
    <AdminMessages namespaces={["Departures", "Taxonomy", "Form", "Shell"]}>
      <DepartureBulkCreator
        tours={tours}
        initialTourId={tours.some((tour) => tour.id === initial) ? initial : undefined}
        canEditPrices={can(user.role, "prices.edit")}
      />
    </AdminMessages>
  );
}
